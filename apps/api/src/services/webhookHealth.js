const { Membership, User } = require('@contexthub/common');
const { mailService } = require('./mailService');

async function notifyDisabledWebhooks(webhooks, tenantId) {
  const query = { notificationPending: true, isActive: false,
    $or: [{ notificationAttemptAt: null }, { notificationAttemptAt: { $lt: new Date(Date.now() - 5 * 60_000) } }] };
  if (tenantId) query.tenantId = tenantId;
  const pending = await webhooks.find(query).limit(10).toArray();
  for (const hook of pending) {
    const attemptedAt = new Date();
    const lock = await webhooks.updateOne({ ...query, _id: hook._id }, { $set: { notificationAttemptAt: attemptedAt } });
    if (!lock.modifiedCount) continue;
    try {
      const memberships = await Membership.find({ tenantId: hook.tenantId, role: 'owner', status: 'active' }).select('userId').lean();
      const users = await User.find({ _id: { $in: memberships.map((item) => item.userId) } }).select('email').lean();
      const recipients = [...new Set(users.map((user) => user.email).filter(Boolean))];
      if (!recipients.length) throw new Error('No owner email available');
      await mailService.sendMail({
        to: recipients.join(', '),
        subject: '[ContextHub] Webhook otomatik devre dışı bırakıldı',
        text: `Tenant: ${hook.tenantId}\nAbonelik: ${hook._id}\nKanal: ${hook.provider || 'webhook'}\nArt arda teslimat hataları nedeniyle abonelik durduruldu. Panelden teslimat günlüğünü inceleyip aboneliği yeniden etkinleştirebilirsiniz.`
      }, hook.tenantId);
      await webhooks.updateOne({ _id: hook._id, disabledAt: hook.disabledAt, notificationAttemptAt: attemptedAt },
        { $set: { notificationPending: false, notificationSentAt: new Date() } });
    } catch {
      // Persisted pending flag allows the worker to retry mail independently of deliveries.
      console.error('[webhookHealth] Owner notification failed', { webhookId: String(hook._id) });
    }
  }
}

async function recordWebhookHealth(webhooks, hook, succeeded, threshold = 10) {
  const filter = { _id: hook._id, tenantId: hook.tenantId, isActive: true };
  if (succeeded) {
    await webhooks.updateOne(filter, { $set: { consecutiveFailures: 0 } });
    return;
  }
  await webhooks.updateOne(filter, { $inc: { consecutiveFailures: 1 } });
  await webhooks.updateOne({ ...filter, consecutiveFailures: { $gte: threshold } }, {
    $set: { isActive: false, disabledAt: new Date(), notificationPending: true, notificationAttemptAt: null, notificationSentAt: null }
  });
}

module.exports = { notifyDisabledWebhooks, recordWebhookHealth };
