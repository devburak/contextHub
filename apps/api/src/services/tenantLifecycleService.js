const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const common = require('@contexthub/common');
const edgeGatewaySyncService = require('./edgeGatewaySyncService');
const { invalidateTenantOriginPolicyCache } = require('./tenantOriginPolicy');
const billingCancellationService = require('./billing/billingCancellationService');
const tenantSubscriptionService = require('./tenantSubscriptionService');
const { hostedOperationsNotificationService } = require('./hostedOperationsNotificationService');

const {
  Tenant,
  User,
  Membership,
  Account,
  BillingAccount,
  BillingSubscription,
  BillingInvoice,
  BillingCheckoutSession,
  ApiToken,
  ActivityLog,
  ApiUsage,
  Domain,
  ContentType,
  Entry,
  EntryRevision,
  Taxonomy,
  Term,
  Tag,
  Navigation,
  Category,
  FormDefinition,
  FormResponse,
  FormVersion,
  Event,
  DailyAgg,
  Product,
  CollectionType,
  CollectionEntry,
  Template,
  Content,
  ContentVersion,
  CustomFieldDefinition,
  ContentCustomFieldIndex,
  TenantSettings,
  Gallery,
  PlacementDefinition,
  PlacementEvent,
  Menu,
  Role,
  Webhook,
  WebhookOutbox,
  DomainEvent,
  DomainEventCursor,
  DomainEventDeadLetter,
  ExtensionTenantSetting,
  ExtensionTenantSecret,
  QuotaAlert,
} = common;

const SOFT_DELETED_STATUSES = new Set(['deletion_pending', 'deleted']);
const TERMINAL_SUBSCRIPTION_STATUSES = new Set(['canceled', 'expired']);

function retentionDays() {
  return Math.max(1, Number(process.env.TENANT_DELETION_RETENTION_DAYS || 30));
}

function lifecycleError(message, code, statusCode = 400, details = null) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

async function requireOwner(tenantId, userId) {
  const membership = await Membership.findOne({
    tenantId,
    userId,
    role: 'owner',
    status: 'active',
  });
  if (!membership) {
    throw lifecycleError('Bu işlem için aktif owner olmanız gerekir', 'TenantOwnerRequired', 403);
  }
  return membership;
}

async function verifyPassword(userId, password) {
  const user = await User.findById(userId);
  if (!user || user.status !== 'active') {
    throw lifecycleError('Aktif kullanıcı bulunamadı', 'UserNotFound', 404);
  }
  if (!password || !await bcrypt.compare(password, user.password)) {
    throw lifecycleError('Şifre hatalı', 'InvalidPassword', 401);
  }
  return user;
}

async function getDeletionPreflight(tenantId, userId) {
  const tenant = await Tenant.findById(tenantId).select(
    'name slug status accountId deletedAt purgeAfter purgedAt legalHold'
  );
  if (!tenant) throw lifecycleError('Varlık bulunamadı', 'TenantNotFound', 404);
  await requireOwner(tenantId, userId);
  const [members, content, media, subscription, openInvoices] = await Promise.all([
    Membership.countDocuments({ tenantId, status: 'active' }),
    Content.countDocuments({ tenantId }),
    common.Media.countDocuments({ tenantId }),
    BillingSubscription.findOne({ tenantId }).select(
      'status provider currentPeriodEnd cancelAtPeriodEnd cancellationRequestedAt cancellationLastError'
    ).lean(),
    BillingInvoice.countDocuments({ tenantId, status: { $in: ['draft', 'open', 'past_due'] } }),
  ]);
  return {
    canDelete: !tenant.purgedAt && !SOFT_DELETED_STATUSES.has(tenant.status),
    tenant: {
      id: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
    },
    impact: { members, content, media, openInvoices },
    subscription: subscription || null,
    retentionDays: retentionDays(),
    purgeAfter: tenant.purgeAfter || null,
    legalHold: Boolean(tenant.legalHold),
    alreadyDeleted: SOFT_DELETED_STATUSES.has(tenant.status),
    purged: Boolean(tenant.purgedAt),
  };
}

async function listRestorableTenants(userId) {
  const memberships = await Membership.find({
    userId,
    role: 'owner',
    status: 'active',
  }).populate({
    path: 'tenantId',
    select: 'name slug status deletedAt purgeAfter purgedAt deletionReason',
    match: { status: { $in: ['deletion_pending', 'deleted'] }, purgedAt: null },
  });
  return memberships
    .filter((membership) => Boolean(membership.tenantId))
    .map((membership) => ({
      tenantId: membership.tenantId._id.toString(),
      name: membership.tenantId.name,
      slug: membership.tenantId.slug,
      status: membership.tenantId.status,
      deletedAt: membership.tenantId.deletedAt,
      purgeAfter: membership.tenantId.purgeAfter,
      deletionReason: membership.tenantId.deletionReason,
      restoreAvailable: !membership.tenantId.purgeAfter || membership.tenantId.purgeAfter > new Date(),
    }));
}

async function revokeTenantApiTokens(tenantId, now) {
  const tokens = await ApiToken.find({ tenantId, revokedAt: null }).select('hash');
  await ApiToken.updateMany(
    { tenantId, revokedAt: null },
    { $set: { revokedAt: now, revokedReason: 'tenant_deleted' } }
  );
  const results = await Promise.allSettled(tokens.map((token) =>
    edgeGatewaySyncService.deleteApiTokenConfig({ hash: token.hash })
  ));
  return results.filter((result) => result.status === 'rejected').map((result) => result.reason?.message);
}

async function deleteTenant(tenantId, userId, payload = {}, request = null) {
  const user = await verifyPassword(userId, payload.currentPassword);
  await requireOwner(tenantId, userId);
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw lifecycleError('Varlık bulunamadı', 'TenantNotFound', 404);
  if (tenant.purgedAt) throw lifecycleError('Fiziksel temizliği tamamlanmış varlık geri alınamaz', 'TenantPurged', 409);
  if (String(payload.confirmation || '').trim() !== tenant.slug) {
    throw lifecycleError('Silme onayı varlık slug değeriyle eşleşmiyor', 'TenantDeletionConfirmationMismatch');
  }
  if (SOFT_DELETED_STATUSES.has(tenant.status)) {
    return {
      status: tenant.status,
      deletionRequestId: tenant.deletionRequestId,
      purgeAfter: tenant.purgeAfter,
      duplicate: true,
    };
  }

  const now = new Date();
  const deletionRequestId = crypto.randomUUID();
  tenant.status = 'deletion_pending';
  tenant.deletedAt = now;
  tenant.deletedBy = userId;
  tenant.deletionReason = String(payload.reason || '').trim();
  tenant.deletionRequestId = deletionRequestId;
  tenant.purgeAfter = new Date(now.getTime() + retentionDays() * 86400000);
  tenant.restoredAt = null;
  tenant.restoredBy = null;
  tenant.lifecycleError = '';
  await tenant.save();
  invalidateTenantOriginPolicyCache();

  const warnings = [];
  try {
    await edgeGatewaySyncService.syncTenantBundle({ tenantId, tenant });
  } catch (error) {
    warnings.push(`edge_sync: ${error.message}`);
  }
  warnings.push(...await revokeTenantApiTokens(tenantId, now));
  await WebhookOutbox.updateMany(
    { tenantId: tenantId.toString(), status: { $in: ['pending', 'processing', 'failed'] } },
    { $set: { status: 'paused', lifecyclePausedAt: now, updatedAt: now } }
  );

  const cancellation = await billingCancellationService.requestTenantCancellation(tenantId, {
    effectiveFrom: payload.cancelAtPeriodEnd ? 'next_billing_period' : 'immediately',
  });
  if (cancellation.error) warnings.push(`billing: ${cancellation.error}`);

  tenant.status = 'deleted';
  tenant.lifecycleError = warnings.join('\n').slice(0, 2000);
  await tenant.save();
  try {
    await edgeGatewaySyncService.syncTenantBundle({ tenantId, tenant });
  } catch (error) {
    warnings.push(`edge_final_sync: ${error.message}`);
    tenant.lifecycleError = warnings.join('\n').slice(0, 2000);
    await tenant.save();
  }

  await ActivityLog.create({
    user: user._id,
    tenant: tenant._id,
    action: 'tenant.delete',
    description: 'Tenant soft-deleted and access revoked',
    metadata: {
      deletionRequestId,
      purgeAfter: tenant.purgeAfter,
      cancellationStatus: cancellation.status,
      requestIp: request?.ip || null,
      warnings,
    },
  });

  try {
    await hostedOperationsNotificationService.notifyTenantDeleted({
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      actorEmail: user.email,
      deletionRequestId,
      purgeAfter: tenant.purgeAfter,
      occurredAt: now,
    });
  } catch (error) {
    console.error('[TenantLifecycleService] Tenant deletion notification failed:', error.message);
  }

  return {
    status: tenant.status,
    deletionRequestId,
    purgeAfter: tenant.purgeAfter,
    cancellation,
    warnings,
    duplicate: false,
  };
}

async function restoreTenant(tenantId, userId, payload = {}, request = null) {
  const user = await verifyPassword(userId, payload.currentPassword);
  await requireOwner(tenantId, userId);
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw lifecycleError('Varlık bulunamadı', 'TenantNotFound', 404);
  if (String(payload.confirmation || '').trim() !== tenant.slug) {
    throw lifecycleError('Geri alma onayı varlık slug değeriyle eşleşmiyor', 'TenantRestoreConfirmationMismatch');
  }
  if (tenant.purgedAt) throw lifecycleError('Fiziksel temizliği tamamlanmış varlık geri alınamaz', 'TenantPurged', 409);
  if (!SOFT_DELETED_STATUSES.has(tenant.status)) {
    throw lifecycleError('Varlık silinmiş durumda değil', 'TenantNotDeleted', 409);
  }
  if (tenant.purgeAfter && tenant.purgeAfter <= new Date()) {
    throw lifecycleError('Geri alma süresi sona erdi', 'TenantRestoreWindowExpired', 409);
  }

  const now = new Date();
  const warnings = [];
  const subscription = await BillingSubscription.findOne({ tenantId });
  const cancellationWasRequested = Boolean(subscription?.cancellationRequestedAt)
    || TERMINAL_SUBSCRIPTION_STATUSES.has(subscription?.status);
  if (cancellationWasRequested) {
    await tenantSubscriptionService.applyPlanToTenant(tenant, 'free');
  }
  // Restoring an abandoned paid signup must not grant a second usable Free tenant.
  tenant.status = tenant.requestedPlanSlug ? 'pending_payment' : 'active';
  tenant.deletedAt = null;
  tenant.deletedBy = null;
  tenant.deletionReason = '';
  tenant.deletionRequestId = null;
  tenant.purgeAfter = null;
  tenant.restoredAt = now;
  tenant.restoredBy = userId;
  tenant.lifecycleError = '';
  await tenant.save();
  await WebhookOutbox.updateMany(
    { tenantId: tenantId.toString(), status: 'paused', lifecyclePausedAt: { $ne: null } },
    {
      $set: { status: 'pending', lifecyclePausedAt: null, nextRetryAt: null, updatedAt: now },
    }
  );
  invalidateTenantOriginPolicyCache();
  try {
    await tenantSubscriptionService.syncEntitlementState(tenantId, {
      reason: cancellationWasRequested ? 'tenant_restored_after_cancellation' : 'tenant_restored',
    });
    await edgeGatewaySyncService.syncTenantBundle({ tenantId, tenant });
  } catch (error) {
    warnings.push(`edge_sync: ${error.message}`);
    tenant.lifecycleError = warnings.join('\n').slice(0, 2000);
    await tenant.save();
  }

  await ActivityLog.create({
    user: user._id,
    tenant: tenant._id,
    action: 'tenant.restore',
    description: 'Tenant restored within the soft-delete retention window',
    metadata: {
      requestIp: request?.ip || null,
      restoredPlan: tenant.plan,
      cancellationWasRequested,
      warnings,
    },
  });
  return {
    status: tenant.status,
    restoredAt: tenant.restoredAt,
    plan: tenant.plan,
    apiTokensRestored: false,
    warnings,
  };
}

const PURGE_MODELS = [
  Membership,
  ApiUsage,
  Domain,
  ContentType,
  Entry,
  EntryRevision,
  Taxonomy,
  Term,
  Tag,
  Navigation,
  Category,
  FormDefinition,
  FormResponse,
  FormVersion,
  Event,
  DailyAgg,
  ApiToken,
  Product,
  CollectionType,
  CollectionEntry,
  Template,
  Content,
  ContentVersion,
  CustomFieldDefinition,
  ContentCustomFieldIndex,
  TenantSettings,
  Gallery,
  PlacementDefinition,
  PlacementEvent,
  Menu,
  Role,
  Webhook,
  WebhookOutbox,
  DomainEvent,
  DomainEventCursor,
  DomainEventDeadLetter,
  ExtensionTenantSetting,
  ExtensionTenantSecret,
  QuotaAlert,
  BillingCheckoutSession,
].filter(Boolean);

async function purgeTenant(tenantId, now = new Date()) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) return { status: 'not_found' };
  if (tenant.purgedAt) return { status: 'already_purged', purgedAt: tenant.purgedAt };
  if (tenant.status !== 'deleted') return { status: 'not_deleted' };
  if (tenant.legalHold) return { status: 'legal_hold' };
  if (!tenant.purgeAfter || tenant.purgeAfter > now) return { status: 'not_due' };

  const [subscription, openInvoices] = await Promise.all([
    BillingSubscription.findOne({ tenantId }),
    BillingInvoice.countDocuments({ tenantId, status: { $in: ['draft', 'open', 'past_due'] } }),
  ]);
  if (subscription && !TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    const cancellation = await billingCancellationService.requestTenantCancellation(tenantId, {
      effectiveFrom: 'immediately',
    });
    if (!TERMINAL_SUBSCRIPTION_STATUSES.has(cancellation.status)) {
      return { status: 'billing_pending', cancellation };
    }
  }
  if (openInvoices > 0) return { status: 'open_invoices', count: openInvoices };

  const mediaService = require('./mediaService');
  const media = await mediaService.purgeTenantMedia({ tenantId });
  const deleted = {};
  const tenantIdString = tenant._id.toString();
  for (const model of PURGE_MODELS) {
    const result = await model.deleteMany({
      tenantId: { $in: [tenant._id, tenantIdString] },
    });
    deleted[model.modelName] = result.deletedCount || 0;
  }

  if (tenant.accountId) {
    await Promise.all([
      Account.updateOne({ _id: tenant.accountId }, { $set: { status: 'closed' } }),
      BillingAccount.updateOne({ accountId: tenant.accountId }, { $set: { status: 'closed' } }),
    ]);
  }
  tenant.purgedAt = now;
  tenant.lifecycleError = '';
  await tenant.save();
  await ActivityLog.create({
    tenant: tenant._id,
    action: 'tenant.purge',
    description: 'Tenant-scoped operational data physically purged',
    metadata: { deleted, media },
  });
  return { status: 'purged', purgedAt: tenant.purgedAt, deleted, media };
}

async function reconcileDeletedTenantControls() {
  const tenants = await Tenant.find({
    status: { $in: ['deletion_pending', 'deleted'] },
    purgedAt: null,
  });
  const results = [];

  for (const tenant of tenants) {
    const warnings = [];
    try {
      await edgeGatewaySyncService.syncTenantBundle({ tenantId: tenant._id, tenant });
    } catch (error) {
      warnings.push(`edge_sync: ${error.message}`);
    }

    const revokedTokens = await ApiToken.find({
      tenantId: tenant._id,
      revokedAt: { $ne: null },
      revokedReason: 'tenant_deleted',
    }).select('hash');
    const tokenResults = await Promise.allSettled(revokedTokens.map((token) =>
      edgeGatewaySyncService.deleteApiTokenConfig({ hash: token.hash })
    ));
    warnings.push(...tokenResults
      .filter((result) => result.status === 'rejected')
      .map((result) => `edge_token: ${result.reason?.message || 'unknown error'}`));

    const subscription = await BillingSubscription.findOne({ tenantId: tenant._id });
    if (subscription?.cancellationRequestedAt
        && !TERMINAL_SUBSCRIPTION_STATUSES.has(subscription.status)
        && !subscription.cancelAtPeriodEnd) {
      const cancellation = await billingCancellationService.requestTenantCancellation(tenant._id, {
        effectiveFrom: 'immediately',
      });
      if (cancellation.error) warnings.push(`billing: ${cancellation.error}`);
    }

    tenant.lifecycleError = warnings.join('\n').slice(0, 2000);
    await tenant.save();
    results.push({ tenantId: tenant._id.toString(), warnings });
  }
  return results;
}

async function purgeDueTenants(now = new Date()) {
  const tenants = await Tenant.find({
    status: 'deleted',
    purgedAt: null,
    legalHold: false,
    purgeAfter: { $ne: null, $lte: now },
  }).select('_id');
  const results = [];
  for (const tenant of tenants) {
    results.push({ tenantId: tenant._id.toString(), ...(await purgeTenant(tenant._id, now)) });
  }
  return results;
}

module.exports = {
  deleteTenant,
  getDeletionPreflight,
  listRestorableTenants,
  purgeDueTenants,
  purgeTenant,
  reconcileDeletedTenantControls,
  restoreTenant,
};
