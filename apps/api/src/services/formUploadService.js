/**
 * Private file uploads for public forms.
 *
 * Flow: session (Turnstile) -> presign -> browser PUTs to the private bucket ->
 * complete (content verified) -> the upload is attached when the form is submitted.
 * A file only becomes part of a response after its content has been verified.
 */
const crypto = require('crypto');
const { FormUpload, Tenant } = require('@contexthub/common');
const policy = require('./formUploadPolicy');
const storage = require('./formUploadStorage');
const sessions = require('./formUploadSession');
const entitlement = require('./formUploadEntitlement');
const turnstileService = require('./turnstileService');
const tenantSettingsService = require('./tenantSettingsService');
const limitCheckerService = require('./limitCheckerService');

// Upper bound on presign calls in one session, including rejected and discarded
// uploads, so a single Turnstile pass cannot be turned into unlimited writes.
const MAX_UPLOAD_ATTEMPTS_PER_SESSION = 40;

const REMOVE_BATCH_SIZE = 200;
const REMOVE_MAX_BATCHES = 50;
const DAY_MS = 24 * 60 * 60 * 1000;
// Statuses in which a file is still in use and counts toward the quota.
const ACTIVE_STATUSES = ['pending', 'completed', 'attached'];

class FormUploadError extends Error {
  constructor(code, message, statusCode = 400, details = undefined) {
    super(message);
    this.name = 'FormUploadError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function validationError(field, message) {
  const error = new Error(message);
  error.code = 'ValidationFailed';
  error.details = [{ field, message }];
  return error;
}

function getFileFields(form) {
  return (form?.fields || []).filter((field) => field.type === 'file' && !field.disabled);
}

function findFileField(form, fieldName) {
  return getFileFields(form).find((field) => field.name === fieldName || field.id === fieldName) || null;
}

function hashIp(ip) {
  return ip ? crypto.createHash('sha256').update(String(ip)).digest('hex') : null;
}

function activeUploadFilter(now = new Date()) {
  return {
    $or: [
      { status: 'completed' },
      { status: 'pending', expiresAt: { $gt: now } }
    ]
  };
}

async function clearStorageCache(tenantId) {
  try {
    await limitCheckerService.clearStorageUsageCache(tenantId);
  } catch (error) {
    console.error('[FormUpload] Failed to clear storage usage cache:', error.message);
  }
}

/**
 * Remove the stored objects of uploads that have already left the active
 * states. `deletedAt` is written only when the object is confirmed gone, so a
 * failed delete is picked up again by the cleanup job instead of being lost.
 */
async function purgeObjects(uploads) {
  const result = { removed: 0, failed: 0 };
  if (!uploads.length) return result;
  if (!storage.isConfigured()) {
    result.failed = uploads.length;
    return result;
  }

  const tenants = new Set();
  for (const upload of uploads) {
    try {
      await storage.deleteObject(upload.key);
      await FormUpload.updateOne({ _id: upload._id }, { $set: { deletedAt: new Date() } });
      result.removed += 1;
      tenants.add(String(upload.tenantId));
    } catch (error) {
      result.failed += 1;
      console.error('[FormUpload] Failed to delete object:', error.message);
    }
  }
  for (const tenantId of tenants) {
    await clearStorageCache(tenantId);
  }
  return result;
}

/**
 * Move every upload matching `filter` to a terminal status and remove its
 * object. Works in batches; the filter must stop matching once the status changes.
 */
async function removeUploads(filter, { status = 'deleted', reason, maxBatches = REMOVE_MAX_BATCHES } = {}) {
  const summary = { matched: 0, removed: 0, failed: 0, items: [] };
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const uploads = await FormUpload.find(filter)
      .select('_id uploadId tenantId formId key')
      .limit(REMOVE_BATCH_SIZE)
      .lean();
    if (!uploads.length) break;

    await FormUpload.updateMany(
      { _id: { $in: uploads.map((upload) => upload._id) } },
      { $set: { status, deleteReason: reason } }
    );
    const purged = await purgeObjects(uploads);

    summary.matched += uploads.length;
    summary.removed += purged.removed;
    summary.failed += purged.failed;
    uploads.forEach((upload) => summary.items.push({
      tenantId: String(upload.tenantId),
      formId: String(upload.formId),
      uploadId: upload.uploadId
    }));
    if (uploads.length < REMOVE_BATCH_SIZE) break;
  }
  return summary;
}

/**
 * Uploads need a private bucket, a form with a file field, and the plan
 * feature when the deployment requires one.
 */
async function assertAvailable({ tenantId, form }) {
  if (!storage.isConfigured()) {
    throw new FormUploadError('FormUploadsUnavailable', 'File uploads are not configured on this server', 503);
  }
  if (!getFileFields(form).length) {
    throw new FormUploadError('FormHasNoFileField', 'This form does not accept files', 400);
  }
  if (!(await entitlement.isAllowed(tenantId))) {
    throw new FormUploadError('FeatureNotAvailable', 'File uploads are not included in the current plan', 403);
  }
}

function describeFields(form) {
  return getFileFields(form).map((field) => {
    const fieldPolicy = policy.resolveFieldPolicy(field);
    return {
      name: field.name,
      maxBytes: fieldPolicy.maxBytes,
      maxFiles: fieldPolicy.maxFiles,
      allowedExtensions: fieldPolicy.allowedExtensions
    };
  });
}

async function createSession({ tenantId, form, turnstileToken, ip }) {
  await assertAvailable({ tenantId, form });

  const credentials = await tenantSettingsService.getTurnstileCredentials(tenantId);
  if (!credentials) {
    throw new FormUploadError('TurnstileNotConfigured', 'Turnstile must be configured before this form can accept files', 409);
  }

  const verification = await turnstileService.verifyToken({
    secretKey: credentials.secretKey,
    token: turnstileToken,
    remoteIp: ip
  });
  if (!verification.success) {
    if (verification.unavailable) {
      throw new FormUploadError('TurnstileUnavailable', 'Verification is temporarily unavailable, please try again', 503);
    }
    throw new FormUploadError('TurnstileFailed', 'Verification failed, please try again', 403, {
      errorCodes: verification.errorCodes
    });
  }

  const session = sessions.createSession({ tenantId, formId: form._id });
  return {
    uploadSession: session.token,
    expiresAt: session.expiresAt,
    fields: describeFields(form)
  };
}

async function presignUpload({ tenantId, form, sessionToken, fieldName, filename, size, ip }) {
  await assertAvailable({ tenantId, form });
  const session = sessions.verifySession({ token: sessionToken, tenantId, formId: form._id });

  const field = findFileField(form, fieldName);
  if (!field) {
    throw new FormUploadError('FileFieldNotFound', 'This form has no such file field', 400);
  }

  const declaration = policy.validateDeclaration({ field, filename, size });
  const bytes = Number(size);
  const now = new Date();

  const [attempts, activeInField] = await Promise.all([
    FormUpload.countDocuments({ tenantId, sessionId: session.sessionId }),
    FormUpload.countDocuments({
      tenantId,
      sessionId: session.sessionId,
      fieldId: field.id,
      ...activeUploadFilter(now)
    })
  ]);
  if (attempts >= MAX_UPLOAD_ATTEMPTS_PER_SESSION) {
    throw new FormUploadError('TooManyUploads', 'Too many uploads in this session', 429);
  }
  if (activeInField >= declaration.policy.maxFiles) {
    throw new FormUploadError('TooManyFiles', `This field accepts at most ${declaration.policy.maxFiles} file(s)`, 400, {
      maxFiles: declaration.policy.maxFiles
    });
  }

  const quota = await limitCheckerService.checkStorageLimit(tenantId, bytes);
  if (!quota.allowed) {
    throw new FormUploadError('StorageLimitExceeded', 'Storage limit reached', 409);
  }

  const tenant = await Tenant.findById(tenantId).select('slug').lean();
  if (!tenant?.slug) {
    throw new FormUploadError('TenantNotFound', 'Tenant not found', 404);
  }

  const uploadId = crypto.randomUUID();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const key = `${tenant.slug}/forms/${form._id}/${year}/${month}/${uploadId}.${declaration.extension}`;

  const signed = await storage.presignUpload({
    key,
    contentType: declaration.mimeType,
    contentLength: bytes
  });

  await FormUpload.create({
    uploadId,
    tenantId,
    formId: form._id,
    fieldId: field.id,
    fieldName: field.name,
    sessionId: session.sessionId,
    bucket: storage.getBucket(),
    key,
    originalName: declaration.filename,
    extension: declaration.extension,
    mimeType: declaration.mimeType,
    declaredSize: bytes,
    status: 'pending',
    ipHash: hashIp(ip),
    expiresAt: signed.expiresAt
  });
  await clearStorageCache(tenantId);

  return {
    uploadId,
    uploadUrl: signed.url,
    method: 'PUT',
    // The link is signed for exactly these headers; the browser must send them as is.
    headers: { 'Content-Type': declaration.mimeType },
    expiresAt: signed.expiresAt
  };
}

function serializeUpload(upload) {
  return {
    uploadId: upload.uploadId,
    filename: upload.originalName,
    size: upload.size ?? upload.declaredSize,
    mimeType: upload.mimeType,
    status: upload.status
  };
}

async function findSessionUpload({ tenantId, form, sessionToken, uploadId }) {
  const session = sessions.verifySession({ token: sessionToken, tenantId, formId: form._id });
  const upload = await FormUpload.findOne({
    uploadId: String(uploadId || ''),
    tenantId,
    formId: form._id,
    sessionId: session.sessionId
  });
  if (!upload) {
    throw new FormUploadError('UploadNotFound', 'Upload not found', 404);
  }
  return upload;
}

async function rejectUpload(upload, reason) {
  await FormUpload.updateOne(
    { _id: upload._id, status: 'pending' },
    { $set: { status: 'rejected', rejectReason: reason, deleteReason: 'rejected' } }
  );
  await purgeObjects([upload]);
  await clearStorageCache(upload.tenantId);
}

/**
 * Called by the client after the PUT succeeds. Reads the object back from the
 * private bucket and verifies its real size and content before it can be used.
 */
async function completeUpload({ tenantId, form, sessionToken, uploadId }) {
  const upload = await findSessionUpload({ tenantId, form, sessionToken, uploadId });

  if (upload.status === 'completed') {
    return serializeUpload(upload);
  }
  if (upload.status !== 'pending') {
    throw new FormUploadError('UploadNotAvailable', 'This upload can no longer be completed', 409);
  }

  const field = getFileFields(form).find((item) => item.id === upload.fieldId);
  if (!field) {
    await rejectUpload(upload, 'field-removed');
    throw new FormUploadError('FileFieldNotFound', 'This form no longer accepts this file', 400);
  }
  const fieldPolicy = policy.resolveFieldPolicy(field);

  const object = await storage.readObject({ key: upload.key, maxBytes: fieldPolicy.maxBytes });
  if (!object) {
    throw new FormUploadError('UploadNotReceived', 'The file has not been uploaded yet', 409);
  }
  if (object.tooLarge) {
    await rejectUpload(upload, 'too-large');
    throw new FormUploadError('FileTooLarge', 'File exceeds the size limit', 400);
  }
  if (object.size === 0) {
    await rejectUpload(upload, 'empty');
    throw new FormUploadError('FileEmpty', 'The uploaded file is empty', 400);
  }

  const verification = policy.verifyContent({ buffer: object.buffer, extension: upload.extension });
  if (!verification.ok) {
    await rejectUpload(upload, `content-mismatch:${verification.kind}`);
    throw new FormUploadError('FileContentMismatch', 'The file content does not match its type', 422);
  }

  const sha256 = crypto.createHash('sha256').update(object.buffer).digest('hex');
  const completed = await FormUpload.findOneAndUpdate(
    { _id: upload._id, status: 'pending' },
    { $set: { status: 'completed', size: object.size, sha256, completedAt: new Date() } },
    { new: true }
  );
  await clearStorageCache(tenantId);

  return serializeUpload(completed || upload);
}

/**
 * Let the visitor remove a file they picked before submitting the form.
 */
async function discardUpload({ tenantId, form, sessionToken, uploadId }) {
  const upload = await findSessionUpload({ tenantId, form, sessionToken, uploadId });
  if (!['pending', 'completed'].includes(upload.status)) {
    throw new FormUploadError('UploadNotAvailable', 'This upload can no longer be removed', 409);
  }

  const result = await FormUpload.updateOne(
    { _id: upload._id, status: { $in: ['pending', 'completed'] }, responseId: null },
    { $set: { status: 'deleted', deleteReason: 'discarded' } }
  );
  if (result.modifiedCount === 0) {
    throw new FormUploadError('UploadNotAvailable', 'This upload can no longer be removed', 409);
  }
  await purgeObjects([upload]);
  await clearStorageCache(tenantId);
  return { uploadId: upload.uploadId, status: 'deleted' };
}

function normalizeUploadRefs(field, value) {
  if (value === undefined || value === null || value === '') return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => {
    const id = typeof item === 'string' ? item : item?.uploadId;
    if (typeof id !== 'string' || !id.trim()) {
      throw validationError(field.name, `Field "${field.name}" must reference uploaded files by uploadId`);
    }
    return id.trim();
  });
}

/**
 * Turn the upload references in a submission into verified file records.
 * Returns the submission data with file fields replaced by file metadata, plus
 * the upload documents that must be attached to the new response.
 */
async function resolveSubmissionFiles({ tenantId, form, data, sessionToken }) {
  const fileFields = getFileFields(form);
  if (!fileFields.length) {
    return { data, uploads: [], files: [] };
  }

  const nextData = { ...data };
  const uploads = [];
  const files = [];
  let session = null;

  for (const field of fileFields) {
    const ids = normalizeUploadRefs(field, data?.[field.name]);
    if (!ids.length) {
      if (field.required) {
        throw validationError(field.name, `Field "${field.name}" is required`);
      }
      delete nextData[field.name];
      continue;
    }

    const fieldPolicy = policy.resolveFieldPolicy(field);
    if (new Set(ids).size !== ids.length) {
      throw validationError(field.name, `Field "${field.name}" lists the same file more than once`);
    }
    if (ids.length > fieldPolicy.maxFiles) {
      throw validationError(field.name, `Field "${field.name}" accepts at most ${fieldPolicy.maxFiles} file(s)`);
    }

    if (!session) {
      session = sessions.verifySession({ token: sessionToken, tenantId, formId: form._id });
    }

    const found = await FormUpload.find({
      tenantId,
      formId: form._id,
      fieldId: field.id,
      sessionId: session.sessionId,
      uploadId: { $in: ids },
      status: 'completed',
      responseId: null
    });
    if (found.length !== ids.length) {
      throw validationError(field.name, `One or more files for "${field.name}" are missing, expired or not completed`);
    }

    const ordered = ids.map((id) => found.find((upload) => upload.uploadId === id));
    nextData[field.name] = ordered.map((upload) => ({
      uploadId: upload.uploadId,
      filename: upload.originalName,
      size: upload.size,
      mimeType: upload.mimeType
    }));
    ordered.forEach((upload) => {
      uploads.push(upload);
      files.push({
        fieldId: field.id,
        uploadId: upload.uploadId,
        filename: upload.originalName,
        size: upload.size,
        mimeType: upload.mimeType
      });
    });
  }

  return { data: nextData, uploads, files };
}

/**
 * Claim verified uploads for a response. Each upload can be claimed once; if
 * any is already taken the whole claim is undone.
 */
async function attachUploads({ tenantId, responseId, uploads, retentionDays = policy.DEFAULT_RETENTION_DAYS }) {
  if (!uploads.length) return;
  const now = new Date();
  const result = await FormUpload.updateMany(
    { _id: { $in: uploads.map((upload) => upload._id) }, tenantId, status: 'completed', responseId: null },
    {
      $set: {
        status: 'attached',
        responseId,
        attachedAt: now,
        retainUntil: new Date(now.getTime() + retentionDays * DAY_MS)
      }
    }
  );
  if (result.modifiedCount !== uploads.length) {
    await releaseUploads({ tenantId, responseId });
    throw validationError(uploads[0].fieldName, 'One or more files were already used in another submission');
  }
}

async function releaseUploads({ tenantId, responseId }) {
  await FormUpload.updateMany(
    { tenantId, responseId, status: 'attached' },
    { $set: { status: 'completed', responseId: null }, $unset: { attachedAt: '', retainUntil: '' } }
  );
}

/**
 * A response was permanently deleted: its files go with it. Files already
 * moved to the media library are media now and are left alone.
 */
async function deleteResponseUploads({ tenantId, responseId }) {
  return removeUploads({ tenantId, responseId, status: 'attached' }, { reason: 'response-deleted' });
}

/**
 * A form was permanently deleted, together with all of its responses.
 */
async function deleteFormUploads({ tenantId, formId }) {
  return removeUploads({ tenantId, formId, status: { $in: ACTIVE_STATUSES } }, { reason: 'form-deleted' });
}

/**
 * Tenant purge: remove every stored object, then the records. Throws when an
 * object could not be removed so the purge is retried rather than leaving
 * files behind with no record pointing at them.
 */
async function purgeTenantUploads({ tenantId }) {
  // Every object still in the private bucket, including the private copy of
  // promoted files; the media copies are removed by the media purge.
  const remaining = { tenantId, deletedAt: null };
  let objectsDeleted = 0;

  for (let batch = 0; batch < REMOVE_MAX_BATCHES; batch += 1) {
    const uploads = await FormUpload.find(remaining).select('_id tenantId key').limit(REMOVE_BATCH_SIZE).lean();
    if (!uploads.length) break;
    const purged = await purgeObjects(uploads);
    objectsDeleted += purged.removed;
    if (purged.failed > 0) {
      throw new Error(`Form uploads of tenant ${tenantId} could not be removed from storage (${purged.failed} failed)`);
    }
  }
  if (await FormUpload.countDocuments(remaining) > 0) {
    throw new Error(`Form uploads of tenant ${tenantId} are not fully removed from storage yet`);
  }

  const result = await FormUpload.deleteMany({ tenantId });
  await clearStorageCache(tenantId);
  return { deleted: result.deletedCount || 0, objectsDeleted };
}

/**
 * The form's retention period changed: files already received follow the new
 * period, counted from the day each one was submitted.
 */
async function applyRetentionChange({ tenantId, formId, retentionDays }) {
  const result = await FormUpload.updateMany(
    { tenantId, formId, status: 'attached' },
    [{ $set: { retainUntil: { $add: ['$attachedAt', retentionDays * DAY_MS] } } }]
  );
  return { updated: result.modifiedCount || 0 };
}

/**
 * Current state of the files on a response, keyed by uploadId, so the admin
 * side can show whether a file is still available.
 */
async function getResponseFileStates({ tenantId, responseId }) {
  const uploads = await FormUpload.find({ tenantId, responseId })
    .select('uploadId status scanStatus retainUntil deleteReason mediaId')
    .lean();
  return new Map(uploads.map((upload) => [upload.uploadId, {
    status: upload.status,
    scanStatus: upload.scanStatus,
    retainUntil: upload.retainUntil || null,
    deleteReason: upload.deleteReason || null,
    mediaId: upload.mediaId ? String(upload.mediaId) : null
  }]));
}

/**
 * Short-lived download link for a file attached to a response (admin side).
 */
async function getDownloadLink({ tenantId, formId, responseId, uploadId }) {
  if (!storage.isConfigured()) {
    throw new FormUploadError('FormUploadsUnavailable', 'File uploads are not configured on this server', 503);
  }
  const upload = await FormUpload.findOne({
    uploadId: String(uploadId || ''),
    tenantId,
    formId,
    responseId,
    status: 'attached'
  });
  if (!upload) {
    throw new FormUploadError('UploadNotFound', 'File not found', 404);
  }

  const signed = await storage.presignDownload({
    key: upload.key,
    filename: upload.originalName,
    contentType: upload.mimeType
  });
  return {
    url: signed.url,
    expiresAt: signed.expiresAt,
    uploadId: upload.uploadId,
    filename: upload.originalName,
    size: upload.size,
    mimeType: upload.mimeType,
    scanStatus: upload.scanStatus
  };
}

/**
 * What the admin side needs to know before offering file fields: whether this
 * server and this tenant can take files, and the limits that apply.
 */
async function getCapabilities({ tenantId }) {
  const configured = storage.isConfigured();
  const [planAllowed, turnstile] = await Promise.all([
    entitlement.isAllowed(tenantId),
    tenantSettingsService.getTurnstileCredentials(tenantId).catch(() => null)
  ]);
  const turnstileConfigured = Boolean(turnstile?.secretKey);

  return {
    ready: configured && planAllowed && turnstileConfigured,
    configured,
    planAllowed,
    turnstileConfigured,
    limits: {
      maxFileBytes: policy.PLATFORM_MAX_FILE_BYTES,
      maxFilesPerField: policy.PLATFORM_MAX_FILES_PER_FIELD
    },
    retention: {
      defaultDays: policy.DEFAULT_RETENTION_DAYS,
      minDays: policy.MIN_RETENTION_DAYS,
      maxDays: policy.MAX_RETENTION_DAYS
    },
    allowedTypes: policy.ALLOWED_EXTENSIONS.map((extension) => ({
      extension,
      mimeType: policy.ALLOWED_TYPES[extension].mime,
      category: policy.ALLOWED_TYPES[extension].category,
      promotableWithoutScan: policy.isPromotableWithoutScan(extension)
    }))
  };
}

/**
 * Move a submitted file to the public media library. The media item is created
 * on behalf of the person moving it, and the private copy is removed.
 */
async function promoteUpload({ tenantId, formId, responseId, uploadId, userId }) {
  if (!storage.isConfigured()) {
    throw new FormUploadError('FormUploadsUnavailable', 'File uploads are not configured on this server', 503);
  }

  const upload = await FormUpload.findOne({
    uploadId: String(uploadId || ''),
    tenantId,
    formId,
    responseId,
    status: 'attached'
  });
  if (!upload) {
    throw new FormUploadError('UploadNotFound', 'File not found', 404);
  }
  if (upload.scanStatus === 'infected') {
    throw new FormUploadError('FileInfected', 'This file was flagged by the scanner and cannot be published', 409);
  }
  const scanned = upload.scanStatus === 'clean';
  if (!scanned && !policy.isPromotableWithoutScan(upload.extension)) {
    throw new FormUploadError('PromotionRequiresScan', 'This file type can be published only after it has been scanned', 409);
  }

  const object = await storage.readObject({ key: upload.key, maxBytes: policy.PLATFORM_MAX_FILE_BYTES });
  if (!object || object.tooLarge || !object.buffer) {
    throw new FormUploadError('UploadNotAvailable', 'The stored file could not be read', 409);
  }
  if (!policy.verifyContent({ buffer: object.buffer, extension: upload.extension }).ok) {
    throw new FormUploadError('FileContentMismatch', 'The file content does not match its type', 422);
  }
  if (upload.extension === 'pdf' && !scanned) {
    const markers = policy.findPdfActiveContent(object.buffer);
    if (markers.length) {
      throw new FormUploadError('PdfActiveContent', 'This PDF contains active content and cannot be published before it is scanned', 422, { markers });
    }
  }

  // Claim first, so the file is moved once and is not counted twice toward the quota.
  const claimed = await FormUpload.findOneAndUpdate(
    { _id: upload._id, status: 'attached' },
    { $set: { status: 'promoted', promotedBy: userId || null, promotedAt: new Date() } },
    { new: true }
  );
  if (!claimed) {
    throw new FormUploadError('UploadNotAvailable', 'This file is no longer available', 409);
  }

  let media;
  try {
    // Loaded lazily: the media service requires the public bucket configuration.
    const mediaService = require('./mediaService');
    media = await mediaService.importBuffer({
      tenantId,
      userId,
      buffer: object.buffer,
      originalName: upload.originalName,
      contentType: upload.mimeType,
      tags: ['form-upload']
    });
  } catch (error) {
    await FormUpload.updateOne(
      { _id: upload._id, status: 'promoted', mediaId: null },
      { $set: { status: 'attached' }, $unset: { promotedBy: '', promotedAt: '' } }
    );
    await clearStorageCache(tenantId);
    if (error?.code === 'StorageLimitExceeded') {
      throw new FormUploadError('StorageLimitExceeded', 'Storage limit reached', 409);
    }
    throw error;
  }

  await FormUpload.updateOne({ _id: upload._id }, { $set: { mediaId: media._id } });
  // If this fails the cleanup job removes the private copy later.
  await purgeObjects([upload]);

  return {
    uploadId: upload.uploadId,
    filename: upload.originalName,
    mediaId: String(media._id),
    url: media.url || null
  };
}

module.exports = {
  MAX_UPLOAD_ATTEMPTS_PER_SESSION,
  FormUploadError,
  getFileFields,
  describeFields,
  assertAvailable,
  createSession,
  presignUpload,
  completeUpload,
  discardUpload,
  resolveSubmissionFiles,
  attachUploads,
  releaseUploads,
  purgeObjects,
  removeUploads,
  deleteResponseUploads,
  deleteFormUploads,
  purgeTenantUploads,
  applyRetentionChange,
  getResponseFileStates,
  getCapabilities,
  promoteUpload,
  getDownloadLink
};
