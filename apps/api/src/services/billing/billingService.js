const {
  Account,
  BillingAccount,
  BillingCheckoutSession,
  BillingInvoice,
  BillingSubscription,
  Media,
  Membership,
  PlanPrice,
  QuotaAlert,
  SubscriptionPlan,
  Tenant,
} = require('@contexthub/common');
const crypto = require('crypto');
const { isAccountBillingEnabled, isBillingProviderEnabled } = require('../../lib/billingConfig');
const paddleProvider = require('./paddleProvider');
const iyzicoProvider = require('./iyzicoProvider');
const { decryptBillingPii, encryptBillingPii } = require('./billingPiiCrypto');
const {
  DECLARATION_VERSION,
  SERVICE_AGREEMENT_VERSION,
  maskTaxId,
  normalizeCountry,
  normalizeDigits,
  normalizeBillingPhone,
  paymentMethodsForCountry,
  resolveBillingProvider,
  validateBillingProfile,
} = require('./billingRouting');
const tenantSubscriptionService = require('../tenantSubscriptionService');
const apiUsageService = require('../apiUsageService');

const BYTES_PER_GB = 1024 ** 3;
const CATALOG_CURRENCY = 'USD';

function hasCurrentServiceAgreement(billingAccount) {
  if (!billingAccount?.serviceAgreementAcceptedAt) return false;
  if (billingAccount.paymentMethodStatus === 'enterprise_contract') return true;
  return billingAccount.serviceAgreementVersion === SERVICE_AGREEMENT_VERSION;
}

function toMinorUnits(amountMajor) {
  const amount = Number(amountMajor || 0);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

function calculateUsageEstimate(plan, { storageBytes = 0, requestCount = 0 } = {}) {
  const available = plan?.slug === 'enterprise';
  const storageRateMinor = toMinorUnits(plan?.pricePerGBStorage);
  const requestRateMinor = toMinorUnits(plan?.pricePerThousandRequests);
  const safeStorageBytes = Math.max(0, Number(storageBytes || 0));
  const safeRequestCount = Math.max(0, Number(requestCount || 0));
  const storageAmountMinor = available
    ? Math.round((safeStorageBytes / BYTES_PER_GB) * storageRateMinor)
    : 0;
  const requestAmountMinor = available
    ? Math.round((safeRequestCount / 1000) * requestRateMinor)
    : 0;

  return {
    available,
    informational: true,
    currency: CATALOG_CURRENCY,
    amountMinor: storageAmountMinor + requestAmountMinor,
    lines: available ? [
      {
        metric: 'storage',
        usage: safeStorageBytes,
        unit: 'gb-month',
        unitPriceMinor: storageRateMinor,
        amountMinor: storageAmountMinor,
      },
      {
        metric: 'requests',
        usage: safeRequestCount,
        unit: 'thousand-requests',
        unitPriceMinor: requestRateMinor,
        amountMinor: requestAmountMinor,
      },
    ] : [],
  };
}

function serializeInvoice(invoice) {
  const providerDocumentAvailable = invoice.provider === 'paddle'
    && !['draft', 'void'].includes(invoice.status);
  return {
    id: String(invoice._id),
    number: invoice.invoiceNumber,
    status: invoice.status,
    currency: invoice.currency,
    subtotalMinor: invoice.subtotalMinor,
    taxMinor: invoice.taxMinor,
    totalMinor: invoice.totalMinor,
    billedAt: invoice.billedAt,
    paidAt: invoice.paidAt,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    documentUrl: invoice.documentUrl,
    documentAvailable: Boolean(invoice.documentUrl || providerDocumentAvailable),
  };
}

function serializeBillingAccount(billingAccount) {
  if (!billingAccount) return null;
  const profileValidation = validateBillingProfile(billingAccount);
  const agreementAccepted = hasCurrentServiceAgreement(billingAccount);
  return {
    status: billingAccount.status,
    billingEmail: billingAccount.billingEmail,
    legalName: billingAccount.legalName,
    profileType: billingAccount.profileType,
    contactFirstName: billingAccount.contactFirstName,
    contactLastName: billingAccount.contactLastName,
    phone: billingAccount.phone,
    country: billingAccount.country,
    taxIdMasked: billingAccount.taxIdLast4
      ? `${'*'.repeat(6)}${billingAccount.taxIdLast4}`
      : maskTaxId(billingAccount.taxId),
    hasTaxId: Boolean(billingAccount.taxIdLast4 || billingAccount.taxId),
    taxOffice: billingAccount.taxOffice,
    currency: billingAccount.currency,
    address: billingAccount.address || {},
    declarationAcceptedAt: billingAccount.declarationAcceptedAt,
    declarationVersion: billingAccount.declarationVersion,
    serviceAgreementAcceptedAt: billingAccount.serviceAgreementAcceptedAt,
    serviceAgreementVersion: billingAccount.serviceAgreementVersion,
    profileComplete: profileValidation.complete,
    missingFields: profileValidation.missingFields,
    hasProviderCustomer: Boolean(billingAccount.externalCustomerId),
    commercialReadiness: {
      agreementAccepted,
      billingProfileAccepted: profileValidation.complete || billingAccount.billingProfileStatus === 'legacy_enterprise',
      paymentVerified: ['provider_verified', 'enterprise_contract'].includes(billingAccount.paymentMethodStatus),
    },
  };
}

function serializeSubscription(subscription) {
  if (!subscription) return null;
  return {
    id: String(subscription._id),
    status: subscription.status,
    interval: subscription.interval,
    currency: subscription.currency,
    amountMinor: subscription.amountMinor,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    gracePeriodEndsAt: subscription.gracePeriodEndsAt,
    plan: subscription.planId ? { slug: subscription.planId.slug, name: subscription.planId.name } : null,
  };
}

function buildChargeSummary({ plan, subscription, invoices = [], storageBytes = 0, requestCount = 0 }) {
  const latestInvoice = invoices[0] ? serializeInvoice(invoices[0]) : null;

  return {
    subscription: {
      amountMinor: subscription ? subscription.amountMinor : toMinorUnits(plan?.price),
      currency: subscription?.currency || CATALOG_CURRENCY,
      interval: subscription?.interval || 'month',
      isEstimated: !subscription,
      currentPeriodStart: subscription?.currentPeriodStart || null,
      currentPeriodEnd: subscription?.currentPeriodEnd || null,
    },
    usageEstimate: calculateUsageEstimate(plan, { storageBytes, requestCount }),
    latestInvoice,
  };
}

function getProvider(provider) {
  if (provider === 'paddle') return paddleProvider;
  if (provider === 'iyzico') return iyzicoProvider;
  throw new Error(`Self-service billing provider is not available: ${provider}`);
}

function checkoutTokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function ensureProviderEnabled(provider) {
  if (isBillingProviderEnabled(provider)) return;
  const error = new Error('Fatura ülkeniz için güvenli ödeme altyapısı henüz etkin değil');
  error.code = 'BillingProviderUnavailable';
  throw error;
}

async function getAccountForTenant(tenantId) {
  if (!isAccountBillingEnabled()) {
    const error = new Error('Account billing is not enabled for this environment');
    error.code = 'BillingDisabled';
    throw error;
  }
  const tenant = await Tenant.findById(tenantId).select('_id accountId name slug plan currentPlan customLimits').populate('currentPlan');
  if (!tenant) throw new Error('Tenant not found');
  if (!tenant.accountId) {
    const error = new Error('Billing account migration is required for this tenant');
    error.code = 'AccountMigrationRequired';
    throw error;
  }
  const account = await Account.findById(tenant.accountId);
  if (!account) throw new Error('Account not found');
  return { tenant, account };
}

function serializePrice(price) {
  return {
    id: String(price._id),
    plan: price.planId ? {
      id: String(price.planId._id),
      slug: price.planId.slug,
      name: price.planId.name,
      description: price.planId.description,
      marketing: price.planId.marketing || {},
      capabilities: price.planId.capabilities || [],
      limits: {
        users: price.planId.userLimit,
        owners: price.planId.ownerLimit,
        storage: price.planId.storageLimit,
        requests: price.planId.monthlyRequestLimit,
      },
    } : null,
    interval: price.interval,
    currency: price.currency,
    amountMinor: price.amountMinor,
    checkoutReady: Boolean(price.externalPriceId),
  };
}

function serializeCatalogPlan(plan, prices = [], { selectedProvider = null, providerEnabled = false } = {}) {
  const serializedPrices = ['month', 'year'].map((interval) => {
    const intervalPrices = prices.filter((price) => (
      price.planId && String(price.planId._id || price.planId) === String(plan._id) && price.interval === interval
    ));
    const checkoutPrice = selectedProvider
      ? intervalPrices.find((price) => price.provider === selectedProvider)
      : null;
    const displayPrice = checkoutPrice
      || intervalPrices.find((price) => price.provider === 'paddle')
      || intervalPrices[0];
    if (!displayPrice) return null;
    return {
      id: checkoutPrice ? String(checkoutPrice._id) : null,
      interval,
      currency: displayPrice.currency,
      amountMinor: displayPrice.amountMinor,
      checkoutReady: Boolean(providerEnabled && checkoutPrice?.externalPriceId),
      catalogOnly: !checkoutPrice || !providerEnabled,
    };
  }).filter(Boolean);

  return {
    id: String(plan._id),
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    marketing: plan.marketing || {},
    capabilities: plan.capabilities || [],
    pricingMode: plan.slug === 'enterprise' ? 'contract' : 'fixed',
    catalogMonthlyAmountMinor: toMinorUnits(plan.price),
    catalogCurrency: CATALOG_CURRENCY,
    prices: serializedPrices,
  };
}

async function getOverview(tenantId) {
  const { tenant, account } = await getAccountForTenant(tenantId);
  const effectivePlan = await tenantSubscriptionService.getEffectivePlan(tenant);
  const billingAccount = await BillingAccount.findOne({ accountId: account._id }).select('+taxId').lean();
  const profileValidation = validateBillingProfile(billingAccount || {});
  const selectedProvider = billingAccount?.country ? resolveBillingProvider(billingAccount.country) : null;
  const providerEnabled = selectedProvider ? isBillingProviderEnabled(selectedProvider) : false;
  const [subscription, invoices, catalogPlans, catalogPrices, alerts, limits, userCount, ownerCount, storageRows, requestCount] = await Promise.all([
    BillingSubscription.findOne({ tenantId: tenant._id }).populate('planId planPriceId').lean(),
    BillingInvoice.find({ tenantId: tenant._id }).sort({ billedAt: -1, createdAt: -1 }).limit(24).lean(),
    SubscriptionPlan.find({ isActive: true, slug: { $ne: 'free' } }).sort({ sortOrder: 1, price: 1 }).lean(),
    PlanPrice.find({ active: true }).populate('planId').sort({ amountMinor: 1 }).lean(),
    QuotaAlert.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(12).lean(),
    tenantSubscriptionService.getEffectiveLimits(tenant),
    Membership.countDocuments({ tenantId: tenant._id, status: { $in: ['active', 'pending'] } }),
    Membership.countDocuments({ tenantId: tenant._id, role: 'owner', status: { $in: ['active', 'pending'] } }),
    Media.aggregate([
      { $match: { tenantId: tenant._id, status: { $ne: 'deleted' } } },
      { $project: { total: { $add: [
        { $ifNull: ['$size', 0] },
        { $sum: { $map: { input: { $ifNull: ['$variants', []] }, as: 'variant', in: { $ifNull: ['$$variant.size', 0] } } } },
      ] } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    apiUsageService.getMonthlyUsage(tenant._id).catch(() => 0),
  ]);

  const metric = (usage, limit) => ({
    usage,
    limit,
    unlimited: limit === null || limit === -1,
    percentage: limit === null || limit === -1 || limit <= 0 ? 0 : Math.min(100, Math.round((usage / limit) * 100)),
  });
  const storageBytes = storageRows[0]?.total || 0;
  const monthlyRequests = requestCount || 0;
  const serializedInvoices = invoices.map(serializeInvoice);
  const usage = {
    users: metric(userCount, limits.userLimit),
    owners: metric(ownerCount, limits.ownerLimit),
    storage: metric(storageBytes, limits.storageLimit),
    requests: metric(monthlyRequests, limits.monthlyRequestLimit),
  };

  const agreementAccepted = hasCurrentServiceAgreement(billingAccount);
  return {
    tenant: {
      id: String(tenant._id),
      name: tenant.name,
      slug: tenant.slug,
      plan: {
        slug: effectivePlan?.slug || tenant.plan || 'free',
        name: effectivePlan?.name || (tenant.plan === 'free' ? 'Free' : tenant.plan),
      },
    },
    account: {
      id: String(account._id),
      name: account.name,
      status: account.status,
    },
    billingAccount: serializeBillingAccount(billingAccount),
    paymentRouting: {
      profileComplete: profileValidation.complete,
      agreementAccepted,
      requiredServiceAgreementVersion: SERVICE_AGREEMENT_VERSION,
      checkoutAvailable: profileValidation.complete && agreementAccepted && providerEnabled,
      missingFields: [
        ...profileValidation.missingFields,
        ...(!agreementAccepted ? ['serviceAgreementAccepted'] : []),
      ],
      paymentMethods: paymentMethodsForCountry(billingAccount?.country),
      jurisdictionLocked: Boolean(subscription && ['trialing', 'active', 'past_due', 'paused'].includes(subscription.status)),
    },
    subscription: serializeSubscription(subscription),
    plans: catalogPlans.map((plan) => serializeCatalogPlan(plan, catalogPrices, { selectedProvider, providerEnabled })),
    prices: catalogPrices
      .filter((price) => selectedProvider && price.provider === selectedProvider)
      .map(serializePrice),
    invoices: serializedInvoices,
    quotaAlerts: alerts.map((alert) => ({
      id: String(alert._id),
      metric: alert.metric,
      threshold: alert.threshold,
      usage: alert.usage,
      limit: alert.limit,
      periodKey: alert.periodKey,
      createdAt: alert.createdAt,
      readAt: alert.readAt,
    })),
    usage,
    charges: buildChargeSummary({
      plan: effectivePlan,
      subscription,
      invoices,
      storageBytes,
      requestCount: monthlyRequests,
    }),
  };
}

async function createCheckout(tenantId, priceReference) {
  const { tenant, account } = await getAccountForTenant(tenantId);
  const [activeSubscription, billingAccount] = await Promise.all([
    BillingSubscription.findOne({
      tenantId: tenant._id,
      status: { $in: ['trialing', 'active', 'past_due', 'paused'] },
    }),
    BillingAccount.findOne({ accountId: account._id }).select('+taxId +taxIdEncrypted'),
  ]);
  if (activeSubscription) {
    const error = new Error('Use the customer portal to change an active subscription');
    error.code = 'PortalRequired';
    throw error;
  }
  const profileValidation = validateBillingProfile(billingAccount || {});
  if (!profileValidation.complete) {
    const error = new Error('Checkout öncesinde fatura bilgileri ve beyan tamamlanmalıdır');
    error.code = 'BillingProfileIncomplete';
    error.missingFields = profileValidation.missingFields;
    throw error;
  }
  if (!hasCurrentServiceAgreement(billingAccount)) {
    const error = new Error('Checkout öncesinde ContextHub hizmet sözleşmesi kabul edilmelidir');
    error.code = 'CommercialAgreementRequired';
    throw error;
  }
  const selectedProvider = resolveBillingProvider(billingAccount.country);
  ensureProviderEnabled(selectedProvider);
  const checkoutTaxId = billingAccount.taxIdEncrypted
    ? decryptBillingPii(billingAccount.taxIdEncrypted)
    : billingAccount.taxId;

  const planPrice = /^[a-f0-9]{24}$/i.test(String(priceReference || ''))
    ? await PlanPrice.findOne({ _id: priceReference, active: true }).populate('planId')
    : await PlanPrice.findOne({ key: priceReference, active: true }).populate('planId');
  if (!planPrice || planPrice.provider !== selectedProvider) {
    const error = new Error('Bu fiyat fatura ülkeniz için kullanılamaz');
    error.code = 'PlanPriceUnavailable';
    throw error;
  }
  if (!planPrice.externalPriceId) {
    const error = new Error('This plan price is not configured for checkout');
    error.code = 'CheckoutNotConfigured';
    throw error;
  }

  billingAccount.provider = selectedProvider;
  await billingAccount.save();
  const result = await getProvider(selectedProvider).createCheckout({
    billingAccount: { ...billingAccount.toObject(), taxId: checkoutTaxId },
    tenant,
    account,
    planPrice,
  });

  if (selectedProvider === 'iyzico') {
    const ttlSeconds = Math.max(60, Math.min(3600, Number(result.expiresInSeconds || 1800)));
    await BillingCheckoutSession.findOneAndUpdate(
      { provider: 'iyzico', tokenHash: checkoutTokenHash(result.checkoutToken) },
      { $set: {
        conversationId: result.conversationId,
        accountId: account._id,
        tenantId: tenant._id,
        planPriceId: planPrice._id,
        status: 'initialized',
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  return {
    checkoutUrl: result.checkoutUrl || null,
    checkoutContent: result.checkoutContent || null,
    expiresInSeconds: result.expiresInSeconds || null,
  };
}

async function createPortalSession(tenantId) {
  const { tenant, account } = await getAccountForTenant(tenantId);
  const [billingAccount, subscription] = await Promise.all([
    BillingAccount.findOne({ accountId: account._id }),
    BillingSubscription.findOne({ tenantId: tenant._id }),
  ]);
  if (!subscription?.externalSubscriptionId || !billingAccount) {
    const error = new Error('Customer portal is not available before the first completed checkout');
    error.code = 'PortalUnavailable';
    throw error;
  }
  const selectedProvider = subscription.provider;
  ensureProviderEnabled(selectedProvider);
  const result = await getProvider(selectedProvider).createPortalSession({
    externalCustomerId: billingAccount.externalCustomerId,
    externalSubscriptionId: subscription.externalSubscriptionId,
  });
  return {
    portalUrl: result.portalUrl || null,
    paymentMethodUrl: result.paymentMethodUrl || null,
    paymentMethodContent: result.paymentMethodContent || null,
    cancelUrl: result.cancelUrl || null,
    expiresInSeconds: result.expiresInSeconds || null,
  };
}

async function getInvoiceDocument(tenantId, invoiceId) {
  const { tenant, account } = await getAccountForTenant(tenantId);
  const invoice = await BillingInvoice.findOne({
    _id: invoiceId,
    tenantId: tenant._id,
    accountId: account._id,
  });
  if (!invoice) {
    const error = new Error('Invoice was not found for this tenant');
    error.code = 'InvoiceNotFound';
    error.statusCode = 404;
    throw error;
  }
  if (invoice.documentUrl) {
    const documentUrl = new URL(invoice.documentUrl);
    if (documentUrl.protocol !== 'https:') {
      const error = new Error('Invoice document URL is not secure');
      error.code = 'InvoiceDocumentUnavailable';
      error.statusCode = 409;
      throw error;
    }
    return { documentUrl: documentUrl.toString(), expiresInSeconds: null };
  }
  if (invoice.provider !== 'paddle' || ['draft', 'void'].includes(invoice.status)) {
    const error = new Error('Invoice document is not available yet');
    error.code = 'InvoiceDocumentUnavailable';
    error.statusCode = 409;
    throw error;
  }
  ensureProviderEnabled('paddle');
  return paddleProvider.getTransactionInvoice({
    externalTransactionId: invoice.externalTransactionId,
  });
}

function normalizedBillingProfile(payload, existing = {}, declarationAcceptedBy) {
  const country = normalizeCountry(payload.country);
  const taxId = payload.taxId ? normalizeDigits(payload.taxId) : String(existing.taxId || '');
  return {
    billingEmail: String(payload.billingEmail || '').trim().toLowerCase(),
    legalName: String(payload.legalName || '').trim(),
    profileType: payload.profileType || 'business',
    contactFirstName: String(payload.contactFirstName || '').trim(),
    contactLastName: String(payload.contactLastName || '').trim(),
    phone: normalizeBillingPhone(payload.phone, country) || String(payload.phone || '').trim(),
    country,
    taxId,
    taxOffice: String(payload.taxOffice || '').trim(),
    currency: country === 'TR' ? 'TRY' : 'USD',
    address: {
      line1: String(payload.address?.line1 || '').trim(),
      line2: String(payload.address?.line2 || '').trim(),
      city: String(payload.address?.city || '').trim(),
      district: String(payload.address?.district || '').trim(),
      region: String(payload.address?.region || '').trim(),
      postalCode: String(payload.address?.postalCode || '').trim(),
    },
    declarationVersion: DECLARATION_VERSION,
    declarationAcceptedAt: payload.declarationAccepted === true ? new Date() : null,
    declarationAcceptedBy,
    serviceAgreementVersion: SERVICE_AGREEMENT_VERSION,
    serviceAgreementAcceptedAt: payload.serviceAgreementAccepted === true ? new Date() : null,
    serviceAgreementAcceptedBy: declarationAcceptedBy,
    billingProfileStatus: 'declared',
  };
}

async function updateBillingProfile(tenantId, payload, userId) {
  const { tenant, account } = await getAccountForTenant(tenantId);
  const existing = await BillingAccount.findOne({ accountId: account._id }).select('+taxId +taxIdEncrypted');
  const existingTaxId = existing?.taxIdEncrypted
    ? decryptBillingPii(existing.taxIdEncrypted)
    : existing?.taxId;
  const profile = normalizedBillingProfile(payload, { ...(existing?.toObject() || {}), taxId: existingTaxId }, userId);
  const validation = validateBillingProfile(profile);
  if (!validation.complete) {
    const error = new Error('Fatura bilgilerinde eksik veya geçersiz alanlar var');
    error.code = 'InvalidBillingProfile';
    error.details = { missingFields: validation.missingFields, errors: validation.errors };
    throw error;
  }

  const nextProvider = resolveBillingProvider(profile.country);
  const previousProvider = existing?.country ? resolveBillingProvider(existing.country) : existing?.provider;
  if (previousProvider && previousProvider !== 'manual' && previousProvider !== nextProvider) {
    const [lockedSubscription, openInvoice] = await Promise.all([
      BillingSubscription.exists({
        tenantId: tenant._id,
        status: { $in: ['trialing', 'active', 'past_due', 'paused'] },
      }),
      BillingInvoice.exists({ tenantId: tenant._id, status: { $in: ['draft', 'open', 'past_due'] } }),
    ]);
    if (lockedSubscription || openInvoice) {
      const error = new Error('Aktif abonelik veya açık fatura varken fatura ülkesi değiştirilemez');
      error.code = 'BillingJurisdictionLocked';
      throw error;
    }
  }

  const providerChanged = Boolean(existing && existing.provider !== nextProvider);
  const taxIdEncrypted = profile.taxId ? encryptBillingPii(profile.taxId) : '';
  const taxIdLast4 = profile.taxId ? profile.taxId.slice(-4) : '';
  const profileForStorage = { ...profile, taxIdEncrypted, taxIdLast4 };
  delete profileForStorage.taxId;
  const billingAccount = await BillingAccount.findOneAndUpdate(
    { accountId: account._id },
    { $set: {
      ...profileForStorage,
      provider: nextProvider,
      ...(providerChanged ? {
        externalCustomerId: null,
        status: 'pending',
        paymentMethodStatus: 'none',
      } : {}),
    }, $unset: { taxId: '' }, $setOnInsert: { accountId: account._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).select('+taxId');
  return {
    billingAccount: serializeBillingAccount(billingAccount.toObject()),
    paymentRouting: {
      profileComplete: true,
      agreementAccepted: true,
      checkoutAvailable: isBillingProviderEnabled(nextProvider),
      missingFields: [],
      paymentMethods: paymentMethodsForCountry(profile.country),
      jurisdictionLocked: false,
    },
  };
}

function epochDate(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return new Date(number);
}

async function completeIyzicoCheckout(checkoutToken) {
  const tokenHash = checkoutTokenHash(checkoutToken);
  const session = await BillingCheckoutSession.findOne({ provider: 'iyzico', tokenHash })
    .select('+tokenHash')
    .populate('planPriceId');
  if (!session || session.expiresAt <= new Date()) {
    const error = new Error('Checkout oturumu bulunamadı veya süresi doldu');
    error.code = 'CheckoutSessionExpired';
    throw error;
  }
  if (session.status === 'completed') return { completed: true, duplicate: true };

  try {
    ensureProviderEnabled('iyzico');
    const result = await iyzicoProvider.retrieveCheckout(checkoutToken);
    const data = result.data || {};
    const planPrice = session.planPriceId;
    if (!data.referenceCode || data.pricingPlanReferenceCode !== planPrice.externalPriceId) {
      throw new Error('iyzico checkout sonucu beklenen planla eşleşmiyor');
    }
    const [tenant, billingAccount] = await Promise.all([
      Tenant.findById(session.tenantId),
      BillingAccount.findOne({ accountId: session.accountId }),
    ]);
    if (!tenant || !billingAccount) throw new Error('Checkout hedefi bulunamadı');
    const status = data.subscriptionStatus === 'ACTIVE' ? 'active' : 'pending';
    const subscription = await BillingSubscription.findOneAndUpdate(
      { tenantId: session.tenantId },
      { $set: {
        accountId: session.accountId,
        billingAccountId: billingAccount._id,
        provider: 'iyzico',
        externalSubscriptionId: data.referenceCode,
        planId: planPrice.planId,
        planPriceId: planPrice._id,
        status,
        interval: planPrice.interval,
        currency: planPrice.currency,
        amountMinor: planPrice.amountMinor,
        currentPeriodStart: epochDate(data.startDate) || new Date(),
        currentPeriodEnd: epochDate(data.endDate),
        lastProviderEventAt: null,
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    billingAccount.provider = 'iyzico';
    billingAccount.externalCustomerId = data.customerReferenceCode || billingAccount.externalCustomerId;
    billingAccount.status = 'active';
    billingAccount.paymentMethodStatus = 'provider_verified';
    await billingAccount.save();
    if (status === 'active' && planPrice.planId) {
      const populatedPrice = await PlanPrice.findById(planPrice._id).populate('planId');
      if (populatedPrice?.planId?.slug) {
        await tenantSubscriptionService.applyPlanToTenant(tenant, populatedPrice.planId.slug, {
          source: 'provider_checkout',
        });
      }
      await tenant.save();
      await tenantSubscriptionService.syncEntitlementState(tenant._id, { reason: 'iyzico:checkout.completed' });
    }
    session.status = 'completed';
    session.completedAt = new Date();
    session.externalSubscriptionId = subscription.externalSubscriptionId;
    session.externalCustomerId = billingAccount.externalCustomerId;
    session.lastError = '';
    await session.save();
    return { completed: true, duplicate: false };
  } catch (error) {
    session.status = 'failed';
    session.lastError = String(error.message || error).slice(0, 1000);
    await session.save();
    throw error;
  }
}

module.exports = {
  buildChargeSummary,
  calculateUsageEstimate,
  completeIyzicoCheckout,
  createCheckout,
  createPortalSession,
  getInvoiceDocument,
  getAccountForTenant,
  getOverview,
  serializeBillingAccount,
  serializeCatalogPlan,
  serializeInvoice,
  serializePrice,
  serializeSubscription,
  updateBillingProfile,
  normalizedBillingProfile,
};
