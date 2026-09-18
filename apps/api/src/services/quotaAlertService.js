const { Membership, QuotaAlert, Tenant, User } = require('@contexthub/common');
const { sendNotificationEmail } = require('../utils/mailUtils');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeTenantText(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSubjectText(value) {
  return normalizeTenantText(value).replace(/[<>]/g, '');
}

const COPY = {
  tr: {
    labels: {
      users: 'kullanıcı',
      owners: 'tenant sahibi',
      storage: 'depolama',
      requests: 'aylık API isteği',
    },
    subject: ({ tenantLabel, threshold }) => `ContextHub kota uyarısı: ${tenantLabel} · %${threshold}`,
    tenant: ({ name, slug }) => `<p><strong>Tenant:</strong> ${name}<br><strong>Slug:</strong> ${slug}</p>`,
    message: ({ label, usage, limit }) => `<p><strong>${label}</strong> kullanımınız ${usage}/${limit} seviyesine ulaştı.</p><p>Kesinti yaşamamak için faturalandırma ekranından paket ve limitlerinizi inceleyin.</p>`,
  },
  en: {
    labels: {
      users: 'user',
      owners: 'tenant owner',
      storage: 'storage',
      requests: 'monthly API request',
    },
    subject: ({ tenantLabel, threshold }) => `ContextHub quota alert: ${tenantLabel} · ${threshold}%`,
    tenant: ({ name, slug }) => `<p><strong>Tenant:</strong> ${name}<br><strong>Slug:</strong> ${slug}</p>`,
    message: ({ label, usage, limit }) => `<p>Your <strong>${label}</strong> usage has reached ${usage}/${limit}.</p><p>Review your plan and limits on the billing page to avoid an interruption.</p>`,
  },
};

function normalizeLocale(value) {
  return String(value || '').toLowerCase().startsWith('en') ? 'en' : 'tr';
}

function buildQuotaEmail(alert, locale = 'tr', tenant) {
  const copy = COPY[normalizeLocale(locale)];
  const label = copy.labels[alert.metric] || alert.metric;
  const tenantName = normalizeTenantText(tenant?.name);
  const tenantSlug = normalizeTenantText(tenant?.slug);
  if (!tenantName || !tenantSlug) throw new Error('Tenant name and slug are required for quota notifications');
  const tenantLabel = `${normalizeSubjectText(tenantName)} (${normalizeSubjectText(tenantSlug)})`;
  return {
    subject: copy.subject({ tenantLabel, threshold: alert.threshold }),
    message: copy.tenant({ name: escapeHtml(tenantName), slug: escapeHtml(tenantSlug) })
      + copy.message({ label, usage: alert.usage, limit: alert.limit }),
  };
}

function summarizeNotificationResults(results) {
  const failures = results
    .filter((result) => result.status === 'rejected')
    .map((result) => String(result.reason?.message || result.reason || 'Unknown delivery error'));
  const recipients = results.length;
  const succeeded = recipients - failures.length;
  return {
    recipients,
    succeeded,
    failed: failures.length,
    failures,
    status: recipients === 0
      ? 'no_recipients'
      : (failures.length === 0 ? 'sent' : (succeeded > 0 ? 'partial' : 'failed')),
  };
}

function currentMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function notifyOwners(tenantId, alert) {
  const [tenant, memberships] = await Promise.all([
    Tenant.findById(tenantId).select('name slug').lean(),
    Membership.find({ tenantId, role: 'owner', status: 'active' }).select('userId').lean(),
  ]);
  if (!tenant) throw new Error(`Tenant not found for quota notification: ${tenantId}`);
  const recipients = await User.find({ _id: { $in: memberships.map((item) => item.userId) } })
    .select('email language')
    .lean();
  const deliverable = recipients.filter((item) => item.email);
  const results = await Promise.allSettled(deliverable.map((item) => {
    const { subject, message } = buildQuotaEmail(alert, item.language, tenant);
    return sendNotificationEmail(item.email, subject, message, tenantId);
  }));
  return summarizeNotificationResults(results);
}

async function dispatchOwnerNotification(alert) {
  const staleSendingBefore = new Date(Date.now() - 10 * 60 * 1000);
  const claimed = await QuotaAlert.findOneAndUpdate({
    _id: alert._id,
    notifiedAt: null,
    $or: [
      { notificationStatus: { $in: [null, 'pending'] } },
      { notificationStatus: { $in: ['failed', 'no_recipients'] }, updatedAt: { $lte: staleSendingBefore } },
      { notificationStatus: 'sending', updatedAt: { $lte: staleSendingBefore } },
    ],
  }, {
    $set: { notificationStatus: 'sending', lastNotificationError: '' },
    $inc: { notificationAttempts: 1 },
  }, { new: true });
  if (!claimed) return null;

  try {
    const delivery = await notifyOwners(claimed.tenantId, claimed);
    const allDelivered = delivery.recipients > 0 && delivery.failed === 0;
    const status = delivery.status;
    await QuotaAlert.updateOne({ _id: claimed._id }, {
      $set: {
        notificationStatus: status,
        notificationRecipientCount: delivery.recipients,
        notificationSuccessCount: delivery.succeeded,
        lastNotificationError: delivery.failures.join('; ').slice(0, 1000),
        notifiedAt: allDelivered ? new Date() : null,
      },
    });
    return { ...delivery, status };
  } catch (error) {
    await QuotaAlert.updateOne({ _id: claimed._id }, {
      $set: {
        notificationStatus: 'failed',
        lastNotificationError: String(error?.message || error).slice(0, 1000),
        notifiedAt: null,
      },
    });
    throw error;
  }
}

function queueOwnerNotification(alert) {
  dispatchOwnerNotification(alert)
    .catch((error) => console.error('[QuotaAlert] Owner notification failed:', error.message));
}

async function recordThresholds({ tenantId, metric, usage, limit, periodKey }) {
  if (!tenantId || !Number.isFinite(limit) || limit <= 0 || limit === -1) return [];
  const percentage = (Number(usage || 0) / limit) * 100;
  const reached = [80, 90, 100].filter((threshold) => percentage >= threshold);
  const created = [];
  for (const threshold of reached) {
    try {
      const alert = await QuotaAlert.create({
        tenantId,
        metric,
        periodKey: periodKey || (metric === 'requests' ? currentMonthKey() : 'current'),
        threshold,
        usage: Math.max(0, usage),
        limit,
      });
      created.push(alert);
      queueOwnerNotification(alert);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const existing = await QuotaAlert.findOne({
        tenantId,
        metric,
        periodKey: periodKey || (metric === 'requests' ? currentMonthKey() : 'current'),
        threshold,
        notifiedAt: null,
      });
      if (existing) queueOwnerNotification(existing);
    }
  }
  return created;
}

module.exports = {
  buildQuotaEmail,
  currentMonthKey,
  dispatchOwnerNotification,
  notifyOwners,
  recordThresholds,
  summarizeNotificationResults,
};
