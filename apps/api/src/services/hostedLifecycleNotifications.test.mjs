import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  User, Membership, Tenant, BillingAccount, ActivityLog, ApiToken, WebhookOutbox,
} = require('@contexthub/common');
const bcrypt = require('bcryptjs');
const AuthService = require('./authService');
const userService = require('./userService');
const tenantLifecycle = require('./tenantLifecycleService');
const { mailService } = require('./mailService');
const roleService = require('./roleService');
const invitationPolicyService = require('./invitationPolicyService');
const limitCheckerService = require('./limitCheckerService');
const quotaAlertService = require('./quotaAlertService');
const edgeGatewaySyncService = require('./edgeGatewaySyncService');
const billingCancellationService = require('./billing/billingCancellationService');

describe('hosted lifecycle notification integration', () => {
  let sendMail;
  beforeEach(() => {
    vi.stubEnv('HOSTED_OPERATIONS_NOTIFICATIONS_ENABLED', 'true');
    vi.stubEnv('HOSTED_OPERATIONS_NOTIFICATION_RECIPIENT', 'iletisim@ikon-x.com.tr');
    sendMail = vi.spyOn(mailService, 'sendMail').mockResolvedValue({ messageId: 'ops-test' });
    vi.spyOn(ActivityLog, 'create').mockResolvedValue({});
    vi.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function registration() {
    const auth = new AuthService({});
    vi.spyOn(auth, 'logActivity').mockResolvedValue();
    vi.spyOn(User, 'findOne').mockResolvedValue(null);
    vi.spyOn(User.prototype, 'save').mockImplementation(async function () { return this; });
    vi.spyOn(mailService, 'sendEmailVerificationEmail').mockResolvedValue(true);
    return auth;
  }

  it('notifies after registration without leaking passwords or verification tokens', async () => {
    const auth = registration();
    const result = await auth.register({
      email: 'new@example.test', password: 'never-email-this-password',
      firstName: '<script>unsafe</script>', lastName: 'User',
    });
    expect(result.user.email).toBe('new@example.test');
    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe('iletisim@ikon-x.com.tr');
    expect(message.subject).toContain('Yeni kullanıcı oluşturuldu');
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).not.toContain('<script>');
    const verificationToken = mailService.sendEmailVerificationEmail.mock.calls[0][2];
    expect(JSON.stringify(message)).not.toContain(verificationToken);
    expect(JSON.stringify(message)).not.toContain('never-email-this-password');
  });

  it('does not report a user creation if persistence fails', async () => {
    const auth = registration();
    User.prototype.save.mockRejectedValue(new Error('save failed'));
    await expect(auth.register({ email: 'new@example.test', password: 'example-password' })).rejects.toThrow('save failed');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('keeps registration successful when the operations SMTP request fails', async () => {
    const auth = registration();
    sendMail.mockRejectedValue(new Error('smtp unavailable'));
    await expect(auth.register({ email: 'new@example.test', password: 'example-password' }))
      .resolves.toMatchObject({ emailVerificationRequired: true });
    expect(mailService.sendEmailVerificationEmail).toHaveBeenCalled();
  });

  it('notifies for a newly invited account but not an existing account joining a tenant', async () => {
    const auth = registration();
    const tenantId = '507f1f77bcf86cd799439011';
    vi.spyOn(invitationPolicyService, 'assertInvitationsAllowed').mockResolvedValue();
    vi.spyOn(roleService, 'resolveRole').mockResolvedValue({ _id: '507f1f77bcf86cd799439012', key: 'viewer' });
    vi.spyOn(limitCheckerService, 'checkUserLimit').mockResolvedValue({ allowed: true, limit: 5 });
    vi.spyOn(quotaAlertService, 'recordThresholds').mockResolvedValue();
    vi.spyOn(Membership.prototype, 'save').mockImplementation(async function () { return this; });
    vi.spyOn(auth, 'issueInvitation').mockResolvedValue({});
    await auth.inviteUser('invited@example.test', tenantId, 'viewer');
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].text).toContain('hesap kurulumu bekleniyor');

    sendMail.mockClear();
    User.findOne.mockResolvedValue({ _id: '507f1f77bcf86cd799439013', status: 'active' });
    vi.spyOn(Membership, 'findOne').mockReturnValueOnce({ select: vi.fn().mockResolvedValue(null) }).mockResolvedValueOnce(null);
    await auth.inviteUser('existing@example.test', tenantId, 'viewer');
    expect(sendMail).not.toHaveBeenCalled();
  });

  function accountDeletion() {
    const user = {
      _id: '507f1f77bcf86cd799439013', email: 'original@example.test', password: 'hashed-password',
      firstName: 'Original', lastName: 'User', save: vi.fn().mockResolvedValue(),
    };
    vi.spyOn(User, 'findById').mockResolvedValue(user);
    vi.spyOn(userService, 'getAccountDeletionPreflight').mockResolvedValue({
      canDelete: true, accountTransfers: [], membershipsToRevoke: 0,
    });
    vi.spyOn(BillingAccount, 'find').mockResolvedValue([]);
    vi.spyOn(Membership, 'updateMany').mockResolvedValue({});
    return user;
  }

  it('notifies account deletion using the original address only after anonymization succeeds', async () => {
    const user = accountDeletion();
    const result = await userService.deleteOwnAccount(user._id, {
      currentPassword: 'verified-password', confirmation: user.email,
    });
    expect(user.status).toBe('deleted');
    expect(user.email).toContain('@users.invalid');
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      to: 'iletisim@ikon-x.com.tr', subject: '[ContextHub] Kullanıcı hesabı silindi',
      text: expect.stringContaining('original@example.test'),
    });
    expect(sendMail.mock.calls[0][0].text).toContain(result.deletionRequestId);
    expect(sendMail.mock.invocationCallOrder[0]).toBeGreaterThan(user.save.mock.invocationCallOrder[0]);
  });

  it('does not emit deletion mail when the account deletion is refused', async () => {
    const user = accountDeletion();
    userService.getAccountDeletionPreflight.mockResolvedValue({ canDelete: false, blockingTenants: [{ name: 'Acme' }] });
    await expect(userService.deleteOwnAccount(user._id, {
      currentPassword: 'verified-password', confirmation: user.email,
    })).rejects.toMatchObject({ code: 'LastOwnerRestriction' });
    expect(sendMail).not.toHaveBeenCalled();
  });

  function tenantDeletion() {
    const user = { _id: '507f1f77bcf86cd799439013', email: 'owner@example.test', status: 'active', password: 'hashed' };
    const tenant = { _id: '507f1f77bcf86cd799439011', name: 'Acme', slug: 'acme', status: 'active', save: vi.fn().mockResolvedValue() };
    vi.spyOn(User, 'findById').mockResolvedValue(user);
    vi.spyOn(Tenant, 'findById').mockResolvedValue(tenant);
    vi.spyOn(Membership, 'findOne').mockResolvedValue({ role: 'owner' });
    vi.spyOn(edgeGatewaySyncService, 'syncTenantBundle').mockResolvedValue();
    vi.spyOn(ApiToken, 'find').mockReturnValue({ select: vi.fn().mockResolvedValue([]) });
    vi.spyOn(ApiToken, 'updateMany').mockResolvedValue({});
    vi.spyOn(WebhookOutbox, 'updateMany').mockResolvedValue({});
    vi.spyOn(billingCancellationService, 'requestTenantCancellation').mockResolvedValue({ status: 'not_required' });
    return { tenant, user };
  }

  it('notifies a completed tenant deletion once and skips an already-deleted tenant', async () => {
    const { tenant, user } = tenantDeletion();
    const payload = { currentPassword: 'verified-password', confirmation: 'acme' };
    const result = await tenantLifecycle.deleteTenant(tenant._id, user._id, payload);
    expect(result.status).toBe('deleted');
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      subject: '[ContextHub] Tenant silindi: acme', text: expect.stringContaining(result.deletionRequestId),
    });
    await expect(tenantLifecycle.deleteTenant(tenant._id, user._id, payload)).resolves.toMatchObject({ duplicate: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('keeps deletion successful if the operations notification cannot be sent', async () => {
    const { tenant, user } = tenantDeletion();
    sendMail.mockRejectedValue(new Error('smtp unavailable'));
    await expect(tenantLifecycle.deleteTenant(tenant._id, user._id, {
      currentPassword: 'verified-password', confirmation: 'acme',
    })).resolves.toMatchObject({ status: 'deleted' });
  });
});
