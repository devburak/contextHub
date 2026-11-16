import { beforeAll, afterAll, it, describe, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mongoose, Content, ApiToken, Membership, Role, Tenant, database } = require('@contexthub/common');
const contentService = require('./contentService');
const tenantService = require('./tenantService');
const roleService = require('./roleService');
const uri = process.env.MONGODB_TEST_URI;
describe.skipIf(!uri)('Database optimizations with isolated MongoDB', () => {
  beforeAll(async () => {
    const url = new URL(uri);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/ctxhub_test_')) throw new Error('Disposable local DB required');
    // Different database from MFA integration tests, which may run concurrently.
    url.pathname += '_indexes';
    await mongoose.connect(url.toString(), { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
    await database.initializeIndexes();
  });
  afterAll(async () => { if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  it('uses the deployment indexes for global token and user-membership lookups', async () => {
    const tokenIndex = (await ApiToken.collection.indexes()).find((item) => item.name === 'hash_1');
    expect(tokenIndex.unique).toBe(true);
    const tenantId = new mongoose.Types.ObjectId(), userId = new mongoose.Types.ObjectId();
    await ApiToken.collection.insertOne({ tenantId, hash: 'a'.repeat(64), revokedAt: null });
    await expect(ApiToken.collection.insertOne({ tenantId: new mongoose.Types.ObjectId(), hash: 'a'.repeat(64) })).rejects.toMatchObject({ code: 11000 });
    await Membership.collection.insertOne({ tenantId, userId, status: 'active' });
    const tokenPlan = await ApiToken.collection.find({ hash: 'a'.repeat(64), revokedAt: null }).explain();
    const memberPlan = await Membership.collection.find({ userId, status: { $in: ['active', 'pending'] } }).explain();
    expect(JSON.stringify(tokenPlan.queryPlanner.winningPlan)).toContain('hash_1');
    expect(JSON.stringify(memberPlan.queryPlanner.winningPlan)).toContain('userId_1_status_1');
  });
  it('groups archive months in Mongo while preserving tenant/status/total/date-boundary behavior', async () => {
    const tenantId = new mongoose.Types.ObjectId(), other = new mongoose.Types.ObjectId();
    await Content.collection.insertMany([
      { tenantId, status: 'published', publishedAt: new Date('2026-01-31T23:30:00Z') },
      { tenantId, status: 'published', publishedAt: new Date('2025-12-15T12:00:00Z') },
      { tenantId, status: 'published', publishedAt: null },
      { tenantId, status: 'draft', publishedAt: new Date('2026-01-31T23:30:00Z') },
      { tenantId: other, status: 'published', publishedAt: new Date('2026-01-31T23:30:00Z') },
    ]);
    const sourceDate = new Date('2026-01-31T23:30:00Z');
    const result = await contentService.getArchiveStatistics({ tenantId: tenantId.toString() });
    expect(result).toEqual({ total: 3, archives: [
      { year: sourceDate.getFullYear(), month: String(sourceDate.getMonth() + 1).padStart(2, '0'), count: 1 },
      { year: 2025, month: '12', count: 1 },
    ] });
    expect((await contentService.getArchiveStatistics({ tenantId, status: 'draft' })).total).toBe(1);
    expect(await contentService.getArchiveStatistics({ tenantId: new mongoose.Types.ObjectId() })).toEqual({ total: 0, archives: [] });
  });
  it('batches role resolution and owner counts, preserving per-tenant roles and hidden tenants', async () => {
    const userId = new mongoose.Types.ObjectId();
    const first = new mongoose.Types.ObjectId(), second = new mongoose.Types.ObjectId(), hidden = new mongoose.Types.ObjectId();
    const systemRole = new mongoose.Types.ObjectId(), customRole = new mongoose.Types.ObjectId();
    await Tenant.collection.insertMany([{ _id: first, name: 'One', slug: 'one', status: 'active' }, { _id: second, name: 'Two', slug: 'two', status: 'active' }, { _id: hidden, status: 'deleted' }]);
    await Role.collection.insertMany([{ _id: systemRole, tenantId: null, key: 'viewer', permissions: ['content.read'] }, { _id: customRole, tenantId: second, key: 'custom', permissions: ['content.write'] }]);
    await Membership.collection.insertMany([
      { userId, tenantId: first, role: 'viewer', roleId: systemRole, status: 'active', permissions: ['media.read'] },
      { userId, tenantId: second, role: 'custom', roleId: customRole, status: 'pending' },
      { userId, tenantId: hidden, role: 'viewer', roleId: systemRole, status: 'active' },
      { userId: new mongoose.Types.ObjectId(), tenantId: second, role: 'owner', status: 'active' },
      { userId: new mongoose.Types.ObjectId(), tenantId: second, role: 'owner', status: 'inactive' },
    ]);
    const roleFind = vi.spyOn(Role, 'find');
    const perOwner = vi.spyOn(Membership, 'countDocuments');
    const perRole = vi.spyOn(roleService, 'ensureRoleReference');
    const result = await tenantService.listUserTenants(userId);
    expect(result).toHaveLength(2);
    expect(result.find((item) => item.tenantId === first.toString())).toMatchObject({ role: 'viewer', ownerCount: 0, permissions: ['content.read', 'media.read'] });
    expect(result.find((item) => item.tenantId === second.toString())).toMatchObject({ role: 'custom', ownerCount: 1, permissions: ['content.write'] });
    expect(roleFind).toHaveBeenCalledTimes(1); expect(perOwner).not.toHaveBeenCalled(); expect(perRole).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
