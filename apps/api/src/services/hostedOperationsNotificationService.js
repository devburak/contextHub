const { mailService } = require('./mailService');

function isEnabled(env = process.env) {
  return String(env.HOSTED_OPERATIONS_NOTIFICATIONS_ENABLED || '').trim().toLowerCase() === 'true';
}

function notificationRecipient(env = process.env) {
  const recipient = String(env.HOSTED_OPERATIONS_NOTIFICATION_RECIPIENT || '').trim().toLowerCase();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error('HOSTED_OPERATIONS_NOTIFICATION_RECIPIENT must be a valid email address');
  }
  return recipient;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatAmount(amountMinor, currency) {
  const amount = Number(amountMinor);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('payment amount must be a non-negative minor-unit integer');
  const normalizedCurrency = String(currency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) throw new Error('payment currency must be a three-letter code');
  return `${(amount / 100).toFixed(2)} ${normalizedCurrency}`;
}

function required(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function tenantCreatedMessage(data, occurredAt = new Date()) {
  const tenantName = required(data.tenantName, 'tenantName');
  const tenantSlug = required(data.tenantSlug, 'tenantSlug');
  const ownerEmail = required(data.ownerEmail, 'ownerEmail').toLowerCase();
  const plan = required(data.plan, 'plan');
  const timestamp = occurredAt.toISOString();
  return {
    subject: `[ContextHub] Yeni tenant oluşturuldu: ${tenantSlug}`,
    text: [
      'Yeni tenant oluşturuldu.',
      `Tenant: ${tenantName}`,
      `Tenant slug: ${tenantSlug}`,
      `Açan kullanıcı: ${ownerEmail}`,
      `Paket: ${plan}`,
      `Tarih: ${timestamp}`,
    ].join('\n'),
    html: `<h2>Yeni tenant oluşturuldu</h2><dl><dt>Tenant</dt><dd>${escapeHtml(tenantName)}</dd><dt>Tenant slug</dt><dd>${escapeHtml(tenantSlug)}</dd><dt>Açan kullanıcı</dt><dd>${escapeHtml(ownerEmail)}</dd><dt>Paket</dt><dd>${escapeHtml(plan)}</dd><dt>Tarih</dt><dd>${escapeHtml(timestamp)}</dd></dl>`,
  };
}

function paymentReceivedMessage(data, occurredAt = new Date()) {
  const tenantName = required(data.tenantName, 'tenantName');
  const tenantSlug = required(data.tenantSlug, 'tenantSlug');
  const ownerEmail = required(data.ownerEmail, 'ownerEmail').toLowerCase();
  const plan = required(data.plan, 'plan');
  const amount = formatAmount(data.amountMinor, data.currency);
  const timestamp = occurredAt.toISOString();
  return {
    subject: `[ContextHub] Ödeme alındı: ${tenantSlug} · ${amount}`,
    text: [
      'Ödeme alındı.',
      `Tenant: ${tenantName}`,
      `Tenant slug: ${tenantSlug}`,
      `Tenantı açan kullanıcı: ${ownerEmail}`,
      `Paket: ${plan}`,
      `Ödeme miktarı: ${amount}`,
      `Tarih: ${timestamp}`,
    ].join('\n'),
    html: `<h2>Ödeme alındı</h2><dl><dt>Tenant</dt><dd>${escapeHtml(tenantName)}</dd><dt>Tenant slug</dt><dd>${escapeHtml(tenantSlug)}</dd><dt>Tenantı açan kullanıcı</dt><dd>${escapeHtml(ownerEmail)}</dd><dt>Paket</dt><dd>${escapeHtml(plan)}</dd><dt>Ödeme miktarı</dt><dd>${escapeHtml(amount)}</dd><dt>Tarih</dt><dd>${escapeHtml(timestamp)}</dd></dl>`,
  };
}

function createHostedOperationsNotificationService({
  mail = mailService,
  env = process.env,
  clock = () => new Date(),
} = {}) {
  async function send(buildMessage, data) {
    if (!isEnabled(env)) return { sent: false, disabled: true };
    const recipient = notificationRecipient(env);
    const occurredAt = data?.occurredAt ? new Date(data.occurredAt) : clock();
    if (Number.isNaN(occurredAt.getTime())) throw new Error('notification occurredAt must be a valid date');
    const message = buildMessage(data, occurredAt);
    const result = await mail.sendMail({ to: recipient, ...message });
    return { sent: true, messageId: result?.messageId || null };
  }

  return Object.freeze({
    notifyTenantCreated: (data) => send(tenantCreatedMessage, data),
    notifyPaymentReceived: (data) => send(paymentReceivedMessage, data),
  });
}

module.exports = {
  createHostedOperationsNotificationService,
  formatAmount,
  hostedOperationsNotificationService: createHostedOperationsNotificationService(),
  isEnabled,
  notificationRecipient,
  paymentReceivedMessage,
  tenantCreatedMessage,
};
