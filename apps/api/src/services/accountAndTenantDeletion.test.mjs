import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  ApiToken,
  BillingAccount,
  BillingSubscription,
  Membership,
  Tenant,
  User,
  WebhookOutbox,
} = require('@contexthub/common');

function source(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('account and tenant deletion lifecycle contract', () => {
  it('models deletion as an auditable, recoverable lifecycle', () => {
    expect(Tenant.schema.path('status').options.enum).toEqual(expect.arrayContaining([
      'deletion_pending',
      'deleted',
    ]));
    for (const field of ['deletedAt', 'deletedBy', 'deletionRequestId', 'purgeAfter', 'legalHold', 'purgedAt']) {
      expect(Tenant.schema.path(field), `Tenant.${field}`).toBeTruthy();
    }
    expect(User.schema.path('status').options.enum).toContain('deleted');
    expect(Membership.schema.path('status').options.enum).toContain('revoked');
    expect(WebhookOutbox.schema.path('status').options.enum).toContain('paused');
    expect(ApiToken.schema.path('revokedAt')).toBeTruthy();
  });

  it('requires reauthentication and exact confirmation for destructive routes', () => {
    const tenantRoutes = source('../routes/tenants.js');
    const userRoutes = source('../routes/users.js');
    const tenantDelete = tenantRoutes.slice(
      tenantRoutes.indexOf("fastify.delete('/tenants/:id'"),
      tenantRoutes.indexOf("fastify.post('/tenants/:id/restore'")
    );
    const accountDelete = userRoutes.slice(
      userRoutes.indexOf("fastify.delete('/users/me'"),
      userRoutes.indexOf("fastify.post('/users/invite'")
    );

    expect(tenantDelete).toContain("required: ['currentPassword', 'confirmation']");
    expect(accountDelete).toContain("required: ['currentPassword', 'confirmation']");
    expect(tenantDelete).toContain('additionalProperties: false');
    expect(accountDelete).toContain('additionalProperties: false');
  });

  it('anonymizes an account without deleting its audit identity', () => {
    const userService = source('./userService.js');
    const deletion = userService.slice(
      userService.indexOf('async deleteOwnAccount('),
      userService.indexOf('async leaveMembership(')
    );

    expect(deletion).toContain('getAccountDeletionPreflight');
    expect(deletion).toContain("status: 'revoked'");
    expect(deletion).toContain('@users.invalid');
    expect(deletion).toContain("user.status = 'deleted'");
    expect(deletion).toContain('declarationAcceptanceActor');
    expect(deletion).not.toMatch(/User\.(?:findByIdAndDelete|deleteOne|deleteMany)/);
  });

  it('keeps deleted tenants unreachable while retaining restore data', () => {
    const auth = source('../middleware/auth.js');
    const lifecycle = source('./tenantLifecycleService.js');
    const softDelete = lifecycle.slice(
      lifecycle.indexOf('async function deleteTenant('),
      lifecycle.indexOf('async function restoreTenant(')
    );
    const restore = lifecycle.slice(
      lifecycle.indexOf('async function restoreTenant('),
      lifecycle.indexOf('const PURGE_MODELS')
    );

    expect(auth).toContain("new Set(['deletion_pending', 'deleted'])");
    expect(auth).toContain('revokedAt: null');
    expect(softDelete).toContain("tenant.status = 'deleted'");
    expect(softDelete).toContain('requestTenantCancellation');
    expect(softDelete).toContain('revokeTenantApiTokens');
    expect(softDelete).not.toContain('ExtensionTenantSetting.deleteMany');
    expect(softDelete).not.toContain('ExtensionTenantSecret.deleteMany');
    expect(restore).toContain("applyPlanToTenant(tenant, 'free')");
    expect(restore).toContain("tenant.requestedPlanSlug ? 'pending_payment' : 'active'");
    expect(restore).toContain('apiTokensRestored: false');
    expect(lifecycle).toContain('reconcileDeletedTenantControls');
  });

  it('preserves legal acceptance evidence and makes provider cancellation retryable', () => {
    expect(BillingAccount.schema.path('declarationAcceptanceActor')).toBeTruthy();
    expect(BillingAccount.schema.path('serviceAgreementAcceptanceActor')).toBeTruthy();
    for (const field of [
      'cancellationRequestId',
      'cancellationRequestedAt',
      'cancellationAttempts',
      'cancellationLastError',
    ]) {
      expect(BillingSubscription.schema.path(field), `BillingSubscription.${field}`).toBeTruthy();
    }
    const lifecycle = source('./billing/billingLifecycleService.js');
    expect(lifecycle).toContain('pendingCancellations');
    expect(lifecycle).toContain('requestTenantCancellation');
    const webhook = source('./billing/billingWebhookService.js');
    expect(webhook).toContain("['deletion_pending', 'deleted'].includes(tenant.status)");
    expect(webhook).toContain("effectiveFrom: 'immediately'");
  });
});
