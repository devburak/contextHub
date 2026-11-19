/**
 * Periodic housekeeping for form uploads in the private bucket:
 *
 *  1. retry object deletions that failed earlier,
 *  2. remove uploads that were started but never made it into a response,
 *  3. remove files whose retention period has ended.
 *
 * Meant to run from cron (see scripts/cleanupFormUploads.js). Safe to run
 * repeatedly and concurrently: every step only acts on what is still pending.
 */
const { FormUpload, Tenant } = require('@contexthub/common');
const ActivityLog = require('@contexthub/common/src/models/ActivityLog');
const storage = require('./formUploadStorage');
const formUploadService = require('./formUploadService');

// An upload session lasts 15 minutes, so an upload still unattached an hour
// later can never be submitted.
const ABANDONED_GRACE_MS = 60 * 60 * 1000;
const RETRY_BATCH_SIZE = 500;
const TERMINAL_STATUSES = ['deleted', 'expired', 'rejected'];
const MAX_LOGGED_UPLOAD_IDS = 50;

async function retryFailedDeletions() {
  const uploads = await FormUpload.find({
    deletedAt: null,
    $or: [
      { status: { $in: TERMINAL_STATUSES } },
      // A promoted upload keeps its private copy until the media item exists;
      // without mediaId the move may still be running or may be rolled back.
      { status: 'promoted', mediaId: { $ne: null } }
    ]
  })
    .select('_id tenantId key')
    .limit(RETRY_BATCH_SIZE)
    .lean();
  return formUploadService.purgeObjects(uploads);
}

async function removeAbandonedUploads(now) {
  const cutoff = new Date(now.getTime() - ABANDONED_GRACE_MS);
  return formUploadService.removeUploads({
    $or: [
      { status: 'pending', expiresAt: { $lt: cutoff } },
      { status: 'completed', responseId: null, completedAt: { $lt: cutoff } }
    ]
  }, { status: 'expired', reason: 'abandoned' });
}

async function logRetentionDeletes(items) {
  const byForm = new Map();
  for (const item of items) {
    const key = `${item.tenantId}:${item.formId}`;
    if (!byForm.has(key)) byForm.set(key, { tenantId: item.tenantId, formId: item.formId, uploadIds: [] });
    byForm.get(key).uploadIds.push(item.uploadId);
  }

  for (const group of byForm.values()) {
    try {
      await ActivityLog.create({
        tenant: group.tenantId,
        action: 'form.file.retention_delete',
        description: 'Form files deleted at the end of their retention period',
        metadata: {
          formId: group.formId,
          count: group.uploadIds.length,
          uploadIds: group.uploadIds.slice(0, MAX_LOGGED_UPLOAD_IDS)
        }
      });
    } catch (error) {
      console.error('[FormUploadCleanup] Failed to write activity log:', error.message);
    }
  }
}

async function removeExpiredRetention(now) {
  // A legal hold freezes deletion for that tenant.
  const held = await Tenant.find({ legalHold: true }).select('_id').lean();
  const filter = { status: 'attached', retainUntil: { $lte: now } };
  if (held.length) {
    filter.tenantId = { $nin: held.map((tenant) => tenant._id) };
  }

  const summary = await formUploadService.removeUploads(filter, { status: 'expired', reason: 'retention' });
  await logRetentionDeletes(summary.items);
  return summary;
}

const counts = ({ matched = 0, removed = 0, failed = 0 }) => ({ matched, removed, failed });

async function runCleanup({ now = new Date() } = {}) {
  if (!storage.isConfigured()) {
    return { skipped: 'private-bucket-not-configured' };
  }

  const retried = await retryFailedDeletions();
  const abandoned = await removeAbandonedUploads(now);
  const retention = await removeExpiredRetention(now);

  return {
    retried: { removed: retried.removed, failed: retried.failed },
    abandoned: counts(abandoned),
    retention: counts(retention)
  };
}

module.exports = {
  ABANDONED_GRACE_MS,
  runCleanup
};
