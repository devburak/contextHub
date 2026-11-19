import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { FormUpload, Tenant } = require('@contexthub/common');
const ActivityLog = require('@contexthub/common/src/models/ActivityLog');
const storage = require('./formUploadStorage');
const formUploadService = require('./formUploadService');
const fileScanService = require('./fileScanService');
const cleanup = require('./formUploadCleanupService');

const now = new Date('2026-11-18T12:00:00Z');
const none = { matched: 0, removed: 0, failed: 0, items: [] };
let removeUploads;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(storage, 'isConfigured').mockReturnValue(true);
  vi.spyOn(FormUpload, 'find').mockReturnValue({ select: () => ({ limit: () => ({ lean: async () => [] }) }) });
  vi.spyOn(Tenant, 'find').mockReturnValue({ select: () => ({ lean: async () => [] }) });
  vi.spyOn(ActivityLog, 'create').mockResolvedValue({});
  vi.spyOn(formUploadService, 'purgeObjects').mockResolvedValue({ removed: 0, failed: 0 });
  removeUploads = vi.spyOn(formUploadService, 'removeUploads').mockResolvedValue(none);
});

afterEach(() => {
  vi.restoreAllMocks();
  fileScanService.registerScanner(null);
});

describe('form upload cleanup', () => {
  it('does nothing without a private bucket', async () => {
    storage.isConfigured.mockReturnValue(false);
    await expect(cleanup.runCleanup({ now })).resolves.toEqual({ skipped: 'private-bucket-not-configured' });
    expect(removeUploads).not.toHaveBeenCalled();
  });

  it('retries deletions that failed earlier', async () => {
    const stuck = [{ _id: 'u9', tenantId: 't1', key: 'k9' }];
    FormUpload.find.mockReturnValue({ select: () => ({ limit: () => ({ lean: async () => stuck }) }) });
    formUploadService.purgeObjects.mockResolvedValue({ removed: 1, failed: 0 });

    const result = await cleanup.runCleanup({ now });

    expect(FormUpload.find).toHaveBeenCalledWith({
      deletedAt: null,
      $or: [
        { status: { $in: ['deleted', 'expired', 'rejected'] } },
        { status: 'promoted', mediaId: { $ne: null } }
      ]
    });
    expect(formUploadService.purgeObjects).toHaveBeenCalledWith(stuck);
    expect(result.retried).toEqual({ removed: 1, failed: 0 });
  });

  it('expires uploads that never reached a response, after a one hour grace period', async () => {
    await cleanup.runCleanup({ now });
    const [filter, options] = removeUploads.mock.calls[0];
    const cutoff = new Date(now.getTime() - 60 * 60 * 1000);

    expect(filter).toEqual({
      $or: [
        { status: 'pending', expiresAt: { $lt: cutoff } },
        { status: 'completed', responseId: null, completedAt: { $lt: cutoff } }
      ]
    });
    expect(options).toEqual({ status: 'expired', reason: 'abandoned' });
  });

  it('deletes files past their retention date and records it per form', async () => {
    removeUploads.mockResolvedValueOnce(none).mockResolvedValueOnce({
      matched: 3, removed: 3, failed: 0,
      items: [
        { tenantId: 't1', formId: 'f1', uploadId: 'a' },
        { tenantId: 't1', formId: 'f1', uploadId: 'b' },
        { tenantId: 't2', formId: 'f2', uploadId: 'c' }
      ]
    });

    const result = await cleanup.runCleanup({ now });

    expect(removeUploads.mock.calls[1]).toEqual([
      { status: 'attached', retainUntil: { $lte: now } },
      { status: 'expired', reason: 'retention' }
    ]);
    expect(result.retention).toEqual({ matched: 3, removed: 3, failed: 0 });
    expect(ActivityLog.create).toHaveBeenCalledTimes(2);
    expect(ActivityLog.create.mock.calls[0][0]).toMatchObject({
      tenant: 't1',
      action: 'form.file.retention_delete',
      metadata: { formId: 'f1', count: 2, uploadIds: ['a', 'b'] }
    });
    expect(ActivityLog.schema.path('action').enumValues).toContain('form.file.retention_delete');
  });

  it('does not delete retained files of tenants under legal hold', async () => {
    Tenant.find.mockReturnValue({ select: () => ({ lean: async () => [{ _id: 'held-1' }] }) });
    await cleanup.runCleanup({ now });

    expect(Tenant.find).toHaveBeenCalledWith({ legalHold: true });
    expect(removeUploads.mock.calls[1][0]).toEqual({
      status: 'attached', retainUntil: { $lte: now }, tenantId: { $nin: ['held-1'] }
    });
    expect(removeUploads.mock.calls[0][0].tenantId).toBeUndefined();
  });

  it('still reports the run when the activity log cannot be written', async () => {
    removeUploads.mockResolvedValueOnce(none).mockResolvedValueOnce({
      matched: 1, removed: 1, failed: 0, items: [{ tenantId: 't1', formId: 'f1', uploadId: 'a' }]
    });
    ActivityLog.create.mockRejectedValue(new Error('db'));
    await expect(cleanup.runCleanup({ now })).resolves.toMatchObject({ retention: { removed: 1 } });
  });
});

describe('file scan connection point', () => {
  const uploads = [{ _id: 'u1', uploadId: 'up-1' }, { _id: 'u2', uploadId: 'up-2' }];

  it('does nothing until a scanner is registered', async () => {
    const updateOne = vi.spyOn(FormUpload, 'updateOne');
    expect(fileScanService.isEnabled()).toBe(false);
    await expect(fileScanService.requestScan(uploads)).resolves.toEqual({ requested: 0 });
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('hands uploads to the registered scanner and never throws', async () => {
    const updateOne = vi.spyOn(FormUpload, 'updateOne').mockResolvedValue({});
    const scanner = vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(new Error('scanner down'));
    fileScanService.registerScanner(scanner);

    await expect(fileScanService.requestScan(uploads)).resolves.toEqual({ requested: 1 });
    expect(scanner).toHaveBeenCalledTimes(2);
    expect(updateOne.mock.calls).toEqual([[{ _id: 'u1', scanStatus: 'not_scanned' }, { $set: { scanStatus: 'pending' } }]]);
    expect(() => fileScanService.registerScanner('nope')).toThrow(TypeError);
  });
});
