const { Membership, QuotaAlert, User } = require('@contexthub/common');
const { sendNotificationEmail } = require('../utils/mailUtils');

const LABELS = {
  users: 'kullanıcı',
  owners: 'owner',
  storage: 'depolama',
  requests: 'aylık API isteği',
};

function currentMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function notifyOwners(tenantId, alert) {
  const memberships = await Membership.find({ tenantId, role: 'owner', status: 'active' }).select('userId').lean();
  const recipients = await User.find({ _id: { $in: memberships.map((item) => item.userId) } }).select('email').lean();
  const label = LABELS[alert.metric] || alert.metric;
  const subject = `ContextHub kota uyarısı: %${alert.threshold}`;
  const message = `<p><strong>${label}</strong> kullanımınız ${alert.usage}/${alert.limit} seviyesine ulaştı.</p><p>Kesinti yaşamamak için faturalandırma ekranından paket ve limitlerinizi inceleyin.</p>`;
  await Promise.allSettled(recipients.filter((item) => item.email).map((item) => (
    sendNotificationEmail(item.email, subject, message, tenantId)
  )));
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
      notifyOwners(tenantId, alert)
        .then(() => QuotaAlert.updateOne({ _id: alert._id }, { $set: { notifiedAt: new Date() } }))
        .catch((error) => console.error('[QuotaAlert] Owner notification failed:', error.message));
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  return created;
}

module.exports = { currentMonthKey, recordThresholds };
