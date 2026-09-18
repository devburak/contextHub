const { mailService } = require('../mailService');
const { formatAmount } = require('../hostedOperationsNotificationService');

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function recipientAddress(value) {
  const address = String(value || '').trim().toLowerCase();
  // Exactly one billing mailbox; never accept a recipient list or mail headers.
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(address)) {
    throw new Error('Customer payment notification requires a valid billing email');
  }
  return address;
}

function paymentMessage(data) {
  const amount = formatAmount(data.amountMinor, data.currency);
  const paidAt = new Date(data.occurredAt);
  if (!data.tenantName || !data.planName || !Number.isFinite(paidAt.getTime()) || data.amountMinor <= 0) {
    throw new Error('Customer payment notification data is incomplete');
  }
  const change = data.paymentKind === 'plan_change';
  const timestamp = new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Istanbul',
  }).format(paidAt);
  const fields = [
    ['Tenant', data.tenantName],
    ['Paket', data.planName],
    ['İşlem', change ? 'Paket geçişi — tek seferlik, kalan süreye göre orantılı fark' : 'Abonelik ödemesi'],
    ...(data.interval === 'month' || data.interval === 'year'
      ? [['Abonelik dönemi', data.interval === 'year' ? 'Yıllık' : 'Aylık']] : []),
    ['Tahsil edilen tutar', amount],
    ['Ödeme tarihi (Türkiye saati)', timestamp],
  ];
  // Only include renewal terms captured by the verified plan-change workflow.
  if (change && data.recurringAmountMinor && data.nextBillingAt) {
    const nextDate = new Date(data.nextBillingAt);
    if (!Number.isFinite(nextDate.getTime())) throw new Error('Invalid renewal date');
    fields.push(['Sonraki abonelik tutarı', formatAmount(data.recurringAmountMinor, data.currency)]);
    fields.push(['Sonraki yenileme tarihi', new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'long', timeZone: 'Europe/Istanbul',
    }).format(nextDate)]);
  }
  const note = change
    ? 'Bu tahsilat yalnızca paket geçiş farkıdır; yeni ve ayrı bir abonelik değildir.'
    : 'Abonelik durumunuzu ContextHub içindeki Faturalandırma sayfasından görüntüleyebilirsiniz.';
  const disclaimer = 'Bu e-posta ödeme bilgilendirmesidir; fatura veya e-Arşiv fatura değildir.';
  return {
    subject: change ? 'ContextHub — Paket geçişi ödemeniz alındı' : 'ContextHub — Abonelik ödemeniz alındı',
    text: ['Merhaba,', '', 'ContextHub ödemeniz başarıyla alınmıştır.', '',
      ...fields.map(([label, value]) => `${label}: ${value}`), '', note, '', disclaimer, '', 'ContextHub Ekibi'].join('\n'),
    html: `<!doctype html><html lang="tr"><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;line-height:1.6"><h2>Ödemeniz alındı</h2><p>Merhaba,</p><p>ContextHub ödemeniz başarıyla alınmıştır.</p><dl>${fields.map(([label, value]) => `<dt><strong>${escapeHtml(label)}</strong></dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl><p>${escapeHtml(note)}</p><p>${escapeHtml(disclaimer)}</p><p>ContextHub Ekibi</p></body></html>`,
  };
}

async function sendCustomerPaymentNotification(data, { mail = mailService } = {}) {
  const to = recipientAddress(data.billingEmail);
  const result = await mail.sendMail({ to, ...paymentMessage(data) });
  if (Array.isArray(result?.accepted) && !result.accepted.some((address) => String(address).toLowerCase() === to)) {
    throw new Error('Customer payment notification was not accepted by SMTP');
  }
  if (!result?.messageId) throw new Error('Customer payment notification SMTP acknowledgement is missing');
  return { sent: true, messageId: result.messageId };
}

module.exports = { paymentMessage, recipientAddress, sendCustomerPaymentNotification };
