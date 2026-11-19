import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { FormUpload, Tenant } = require('@contexthub/common');
const storage = require('./formUploadStorage');
const sessions = require('./formUploadSession');
const entitlement = require('./formUploadEntitlement');
const turnstileService = require('./turnstileService');
const tenantSettingsService = require('./tenantSettingsService');
const limitCheckerService = require('./limitCheckerService');
const service = require('./formUploadService');

const tenantId = '64b000000000000000000001';
const form = {
  _id: '64b0000000000000000000f1',
  fields: [
    { id: 'name-id', name: 'fullName', type: 'text' },
    { id: 'cv-id', name: 'cv', type: 'file', required: true, validation: { fileTypes: ['.pdf'], maxFiles: 2 } }
  ]
};
const PDF = Buffer.from('%PDF-1.7\nbody', 'latin1');
let token;
let sessionId;

beforeEach(() => {
  process.env.FORM_UPLOAD_SESSION_SECRET = 'test-session-secret';
  const session = sessions.createSession({ tenantId, formId: form._id });
  token = session.token;
  sessionId = session.sessionId;

  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(storage, 'isConfigured').mockReturnValue(true);
  vi.spyOn(storage, 'getBucket').mockReturnValue('private-bucket');
  vi.spyOn(storage, 'presignUpload').mockResolvedValue({ url: 'https://r2.example/put', expiresAt: new Date(Date.now() + 300000) });
  vi.spyOn(storage, 'deleteObject').mockResolvedValue();
  vi.spyOn(entitlement, 'isAllowed').mockResolvedValue(true);
  vi.spyOn(limitCheckerService, 'checkStorageLimit').mockResolvedValue({ allowed: true });
  vi.spyOn(limitCheckerService, 'clearStorageUsageCache').mockResolvedValue(true);
  vi.spyOn(Tenant, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({ slug: 'acme' }) }) });
  vi.spyOn(FormUpload, 'countDocuments').mockResolvedValue(0);
  vi.spyOn(FormUpload, 'create').mockImplementation(async (doc) => doc);
  vi.spyOn(FormUpload, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.FORM_UPLOAD_SESSION_SECRET;
});

describe('createSession', () => {
  beforeEach(() => {
    vi.spyOn(tenantSettingsService, 'getTurnstileCredentials').mockResolvedValue({ siteKey: 'site', secretKey: 'secret' });
    vi.spyOn(turnstileService, 'verifyToken').mockResolvedValue({ success: true, errorCodes: [] });
  });

  it('issues a session after Turnstile passes and describes the file fields', async () => {
    const result = await service.createSession({ tenantId, form, turnstileToken: 'tok', ip: '203.0.113.9' });
    expect(turnstileService.verifyToken).toHaveBeenCalledWith({ secretKey: 'secret', token: 'tok', remoteIp: '203.0.113.9' });
    expect(sessions.verifySession({ token: result.uploadSession, tenantId, formId: form._id }).sessionId).toBeTruthy();
    expect(result.fields).toEqual([{ name: 'cv', maxBytes: 20 * 1024 * 1024, maxFiles: 2, allowedExtensions: ['pdf'] }]);
  });

  it('is unavailable without a private bucket', async () => {
    storage.isConfigured.mockReturnValue(false);
    await expect(service.createSession({ tenantId, form, turnstileToken: 'tok' }))
      .rejects.toMatchObject({ code: 'FormUploadsUnavailable', statusCode: 503 });
    expect(turnstileService.verifyToken).not.toHaveBeenCalled();
  });

  it('is refused when the plan does not include the feature', async () => {
    entitlement.isAllowed.mockResolvedValue(false);
    await expect(service.createSession({ tenantId, form, turnstileToken: 'tok' }))
      .rejects.toMatchObject({ code: 'FeatureNotAvailable', statusCode: 403 });
  });

  it('requires Turnstile to be configured and to pass', async () => {
    tenantSettingsService.getTurnstileCredentials.mockResolvedValueOnce(null);
    await expect(service.createSession({ tenantId, form, turnstileToken: 'tok' }))
      .rejects.toMatchObject({ code: 'TurnstileNotConfigured', statusCode: 409 });

    turnstileService.verifyToken.mockResolvedValueOnce({ success: false, errorCodes: ['invalid-input-response'] });
    await expect(service.createSession({ tenantId, form, turnstileToken: 'bad' }))
      .rejects.toMatchObject({ code: 'TurnstileFailed', statusCode: 403 });

    turnstileService.verifyToken.mockResolvedValueOnce({ success: false, errorCodes: [], unavailable: true });
    await expect(service.createSession({ tenantId, form, turnstileToken: 'tok' }))
      .rejects.toMatchObject({ code: 'TurnstileUnavailable', statusCode: 503 });
  });

  it('rejects forms without a file field', async () => {
    await expect(service.createSession({ tenantId, form: { ...form, fields: [form.fields[0]] }, turnstileToken: 'tok' }))
      .rejects.toMatchObject({ code: 'FormHasNoFileField' });
  });
});

describe('presignUpload', () => {
  const args = (overrides = {}) => ({
    tenantId, form, sessionToken: token, fieldName: 'cv', filename: 'cv.pdf', size: 1234, ip: '203.0.113.9', ...overrides
  });

  it('creates a pending upload under the tenant prefix in the private bucket', async () => {
    const result = await service.presignUpload(args());
    const created = FormUpload.create.mock.calls[0][0];

    expect(created).toMatchObject({
      tenantId, formId: form._id, fieldId: 'cv-id', sessionId, bucket: 'private-bucket',
      originalName: 'cv.pdf', mimeType: 'application/pdf', declaredSize: 1234, status: 'pending'
    });
    expect(created.key).toMatch(new RegExp(`^acme/forms/${form._id}/\\d{4}/\\d{2}/${created.uploadId}\\.pdf$`));
    expect(created.ipHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storage.presignUpload).toHaveBeenCalledWith({ key: created.key, contentType: 'application/pdf', contentLength: 1234 });
    expect(result).toMatchObject({
      uploadId: created.uploadId, uploadUrl: 'https://r2.example/put', method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' }
    });
    expect(limitCheckerService.clearStorageUsageCache).toHaveBeenCalledWith(tenantId);
  });

  it('requires a session for this form', async () => {
    await expect(service.presignUpload(args({ sessionToken: undefined })))
      .rejects.toMatchObject({ code: 'UploadSessionRequired', statusCode: 401 });
    const other = sessions.createSession({ tenantId, formId: '64b0000000000000000000f2' }).token;
    await expect(service.presignUpload(args({ sessionToken: other })))
      .rejects.toMatchObject({ code: 'UploadSessionInvalid' });
    expect(FormUpload.create).not.toHaveBeenCalled();
  });

  it('enforces the field policy before anything is stored', async () => {
    await expect(service.presignUpload(args({ filename: 'cv.docx' }))).rejects.toMatchObject({ code: 'FileTypeNotAllowed' });
    await expect(service.presignUpload(args({ size: 21 * 1024 * 1024 }))).rejects.toMatchObject({ code: 'FileTooLarge' });
    await expect(service.presignUpload(args({ fieldName: 'fullName' }))).rejects.toMatchObject({ code: 'FileFieldNotFound' });
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });

  it('limits files per field and attempts per session', async () => {
    FormUpload.countDocuments.mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    await expect(service.presignUpload(args())).rejects.toMatchObject({ code: 'TooManyFiles' });

    FormUpload.countDocuments.mockResolvedValueOnce(service.MAX_UPLOAD_ATTEMPTS_PER_SESSION).mockResolvedValueOnce(0);
    await expect(service.presignUpload(args())).rejects.toMatchObject({ code: 'TooManyUploads', statusCode: 429 });
  });

  it('stops at the storage quota', async () => {
    limitCheckerService.checkStorageLimit.mockResolvedValue({ allowed: false });
    await expect(service.presignUpload(args())).rejects.toMatchObject({ code: 'StorageLimitExceeded', statusCode: 409 });
    expect(limitCheckerService.checkStorageLimit).toHaveBeenCalledWith(tenantId, 1234);
    expect(FormUpload.create).not.toHaveBeenCalled();
  });
});

describe('completeUpload', () => {
  const pending = () => ({
    _id: 'u1', uploadId: 'up-1', tenantId, fieldId: 'cv-id', key: 'acme/forms/f/2026/11/up-1.pdf',
    originalName: 'cv.pdf', extension: 'pdf', mimeType: 'application/pdf', declaredSize: PDF.length, status: 'pending'
  });

  beforeEach(() => {
    vi.spyOn(FormUpload, 'findOne').mockImplementation(async () => pending());
    vi.spyOn(FormUpload, 'findOneAndUpdate').mockImplementation(async (_filter, update) => ({ ...pending(), ...update.$set }));
    vi.spyOn(storage, 'readObject').mockResolvedValue({ tooLarge: false, size: PDF.length, buffer: PDF });
  });

  it('looks the upload up within the caller session only', async () => {
    await service.completeUpload({ tenantId, form, sessionToken: token, uploadId: 'up-1' });
    expect(FormUpload.findOne).toHaveBeenCalledWith({ uploadId: 'up-1', tenantId, formId: form._id, sessionId });
  });

  it('marks verified content as completed with its real size and hash', async () => {
    const result = await service.completeUpload({ tenantId, form, sessionToken: token, uploadId: 'up-1' });
    const [filter, update] = FormUpload.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: 'u1', status: 'pending' });
    expect(update.$set).toMatchObject({ status: 'completed', size: PDF.length });
    expect(update.$set.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result).toEqual({ uploadId: 'up-1', filename: 'cv.pdf', size: PDF.length, mimeType: 'application/pdf', status: 'completed' });
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('deletes and rejects a file whose content does not match its type', async () => {
    storage.readObject.mockResolvedValue({ tooLarge: false, size: 4, buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00]) });
    await expect(service.completeUpload({ tenantId, form, sessionToken: token, uploadId: 'up-1' }))
      .rejects.toMatchObject({ code: 'FileContentMismatch', statusCode: 422 });
    expect(storage.deleteObject).toHaveBeenCalledWith('acme/forms/f/2026/11/up-1.pdf');
    expect(FormUpload.updateOne.mock.calls[0][1].$set).toMatchObject({ status: 'rejected', rejectReason: 'content-mismatch:executable' });
    expect(FormUpload.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('deletes and rejects oversized or empty objects', async () => {
    storage.readObject.mockResolvedValueOnce({ tooLarge: true, size: 99999999, buffer: null });
    await expect(service.completeUpload({ tenantId, form, sessionToken: token, uploadId: 'up-1' }))
      .rejects.toMatchObject({ code: 'FileTooLarge' });
    storage.readObject.mockResolvedValueOnce({ tooLarge: false, size: 0, buffer: Buffer.alloc(0) });
    await expect(service.completeUpload({ tenantId, form, sessionToken: token, uploadId: 'up-1' }))
      .rejects.toMatchObject({ code: 'FileEmpty' });
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
  });

  it('reports a missing object without rejecting the upload', async () => {
    storage.readObject.mockResolvedValue(null);
    await expect(service.completeUpload({ tenantId, form, sessionToken: token, uploadId: 'up-1' }))
      .rejects.toMatchObject({ code: 'UploadNotReceived', statusCode: 409 });
    expect(FormUpload.updateOne).not.toHaveBeenCalled();
  });

  it('is idempotent for completed uploads and refuses finished ones', async () => {
    FormUpload.findOne.mockResolvedValueOnce({ ...pending(), status: 'completed', size: 5 });
    await expect(service.completeUpload({ tenantId, form, sessionToken: token, uploadId: 'up-1' }))
      .resolves.toMatchObject({ status: 'completed', size: 5 });
    expect(storage.readObject).not.toHaveBeenCalled();

    FormUpload.findOne.mockResolvedValueOnce({ ...pending(), status: 'attached' });
    await expect(service.completeUpload({ tenantId, form, sessionToken: token, uploadId: 'up-1' }))
      .rejects.toMatchObject({ code: 'UploadNotAvailable' });

    FormUpload.findOne.mockResolvedValueOnce(null);
    await expect(service.completeUpload({ tenantId, form, sessionToken: token, uploadId: 'nope' }))
      .rejects.toMatchObject({ code: 'UploadNotFound', statusCode: 404 });
  });
});

describe('discardUpload', () => {
  it('removes the object and marks the upload deleted', async () => {
    vi.spyOn(FormUpload, 'findOne').mockResolvedValue({ _id: 'u1', uploadId: 'up-1', key: 'k', status: 'completed' });
    await expect(service.discardUpload({ tenantId, form, sessionToken: token, uploadId: 'up-1' }))
      .resolves.toEqual({ uploadId: 'up-1', status: 'deleted' });
    expect(FormUpload.updateOne.mock.calls[0][0]).toMatchObject({ _id: 'u1', responseId: null });
    expect(storage.deleteObject).toHaveBeenCalledWith('k');
  });

  it('does not touch a file that already belongs to a response', async () => {
    vi.spyOn(FormUpload, 'findOne').mockResolvedValue({ _id: 'u1', uploadId: 'up-1', key: 'k', status: 'attached' });
    await expect(service.discardUpload({ tenantId, form, sessionToken: token, uploadId: 'up-1' }))
      .rejects.toMatchObject({ code: 'UploadNotAvailable' });
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});

describe('resolveSubmissionFiles', () => {
  const completed = (uploadId) => ({
    _id: `id-${uploadId}`, uploadId, fieldName: 'cv', originalName: `${uploadId}.pdf`, size: 10, mimeType: 'application/pdf'
  });

  it('leaves forms without file fields untouched', async () => {
    const data = { fullName: 'A' };
    const result = await service.resolveSubmissionFiles({ tenantId, form: { ...form, fields: [form.fields[0]] }, data });
    expect(result).toEqual({ data, uploads: [], files: [] });
  });

  it('replaces upload references with verified file metadata, in the submitted order', async () => {
    vi.spyOn(FormUpload, 'find').mockResolvedValue([completed('b'), completed('a')]);
    const result = await service.resolveSubmissionFiles({
      tenantId, form, sessionToken: token, data: { fullName: 'A', cv: [{ uploadId: 'a' }, 'b'] }
    });

    expect(FormUpload.find).toHaveBeenCalledWith({
      tenantId, formId: form._id, fieldId: 'cv-id', sessionId,
      uploadId: { $in: ['a', 'b'] }, status: 'completed', responseId: null
    });
    expect(result.data).toEqual({
      fullName: 'A',
      cv: [
        { uploadId: 'a', filename: 'a.pdf', size: 10, mimeType: 'application/pdf' },
        { uploadId: 'b', filename: 'b.pdf', size: 10, mimeType: 'application/pdf' }
      ]
    });
    expect(result.files.map((file) => [file.fieldId, file.uploadId])).toEqual([['cv-id', 'a'], ['cv-id', 'b']]);
    expect(result.uploads).toHaveLength(2);
  });

  it('fails validation when a required file is missing or a reference is unknown', async () => {
    await expect(service.resolveSubmissionFiles({ tenantId, form, sessionToken: token, data: { cv: [] } }))
      .rejects.toMatchObject({ code: 'ValidationFailed', details: [{ field: 'cv', message: 'Field "cv" is required' }] });

    vi.spyOn(FormUpload, 'find').mockResolvedValue([completed('a')]);
    await expect(service.resolveSubmissionFiles({ tenantId, form, sessionToken: token, data: { cv: ['a', 'ghost'] } }))
      .rejects.toMatchObject({ code: 'ValidationFailed' });
  });

  it('rejects client-supplied file metadata, duplicates and too many files', async () => {
    const find = vi.spyOn(FormUpload, 'find').mockResolvedValue([]);
    await expect(service.resolveSubmissionFiles({
      tenantId, form, sessionToken: token, data: { cv: { mediaId: 'x', filename: 'x.pdf', url: 'https://evil.example/x' } }
    })).rejects.toMatchObject({ code: 'ValidationFailed' });
    await expect(service.resolveSubmissionFiles({ tenantId, form, sessionToken: token, data: { cv: ['a', 'a'] } }))
      .rejects.toMatchObject({ code: 'ValidationFailed' });
    await expect(service.resolveSubmissionFiles({ tenantId, form, sessionToken: token, data: { cv: ['a', 'b', 'c'] } }))
      .rejects.toMatchObject({ code: 'ValidationFailed' });
    expect(find).not.toHaveBeenCalled();
  });

  it('needs the upload session when files are referenced', async () => {
    await expect(service.resolveSubmissionFiles({ tenantId, form, data: { cv: ['a'] } }))
      .rejects.toMatchObject({ code: 'UploadSessionRequired' });
  });
});

describe('attachUploads', () => {
  it('claims each upload once and undoes a partial claim', async () => {
    const uploads = [{ _id: 'u1', fieldName: 'cv' }, { _id: 'u2', fieldName: 'cv' }];
    const updateMany = vi.spyOn(FormUpload, 'updateMany').mockResolvedValueOnce({ modifiedCount: 2 });
    await service.attachUploads({ tenantId, responseId: 'r1', uploads });
    expect(updateMany.mock.calls[0][0]).toEqual({ _id: { $in: ['u1', 'u2'] }, tenantId, status: 'completed', responseId: null });
    expect(updateMany.mock.calls[0][1].$set).toMatchObject({ status: 'attached', responseId: 'r1' });
    const { attachedAt, retainUntil } = updateMany.mock.calls[0][1].$set;
    expect(retainUntil.getTime() - attachedAt.getTime()).toBe(180 * 24 * 60 * 60 * 1000);

    updateMany.mockResolvedValueOnce({ modifiedCount: 1 }).mockResolvedValueOnce({ modifiedCount: 1 });
    await expect(service.attachUploads({ tenantId, responseId: 'r2', uploads }))
      .rejects.toMatchObject({ code: 'ValidationFailed' });
    expect(updateMany.mock.calls[2][0]).toEqual({ tenantId, responseId: 'r2', status: 'attached' });
    expect(updateMany.mock.calls[2][1].$set).toEqual({ status: 'completed', responseId: null });
  });
});

describe('getDownloadLink', () => {
  it('only serves files attached to that response of that tenant', async () => {
    const findOne = vi.spyOn(FormUpload, 'findOne').mockResolvedValue({
      uploadId: 'up-1', key: 'k', originalName: 'cv.pdf', size: 10, mimeType: 'application/pdf', scanStatus: 'not_scanned'
    });
    vi.spyOn(storage, 'presignDownload').mockResolvedValue({ url: 'https://r2.example/get', expiresAt: new Date() });

    const file = await service.getDownloadLink({ tenantId, formId: form._id, responseId: 'r1', uploadId: 'up-1' });
    expect(findOne).toHaveBeenCalledWith({ uploadId: 'up-1', tenantId, formId: form._id, responseId: 'r1', status: 'attached' });
    expect(storage.presignDownload).toHaveBeenCalledWith({ key: 'k', filename: 'cv.pdf', contentType: 'application/pdf' });
    expect(file).toMatchObject({ url: 'https://r2.example/get', filename: 'cv.pdf', scanStatus: 'not_scanned' });

    findOne.mockResolvedValue(null);
    await expect(service.getDownloadLink({ tenantId, formId: form._id, responseId: 'r1', uploadId: 'other' }))
      .rejects.toMatchObject({ code: 'UploadNotFound', statusCode: 404 });
  });
});

describe('removing stored objects', () => {
  const lean = (value) => ({ select: () => ({ limit: () => ({ lean: async () => value }) }) });
  const uploads = [
    { _id: 'u1', uploadId: 'up-1', tenantId, formId: form._id, key: 'k1' },
    { _id: 'u2', uploadId: 'up-2', tenantId, formId: form._id, key: 'k2' }
  ];

  it('confirms a deletion only when the object is really gone', async () => {
    storage.deleteObject.mockResolvedValueOnce().mockRejectedValueOnce(new Error('r2 down'));
    const result = await service.purgeObjects(uploads);

    expect(result).toEqual({ removed: 1, failed: 1 });
    expect(FormUpload.updateOne).toHaveBeenCalledTimes(1);
    expect(FormUpload.updateOne.mock.calls[0][0]).toEqual({ _id: 'u1' });
    expect(FormUpload.updateOne.mock.calls[0][1].$set.deletedAt).toBeInstanceOf(Date);
  });

  it('leaves everything for a later retry when the private bucket is not configured', async () => {
    storage.isConfigured.mockReturnValue(false);
    await expect(service.purgeObjects(uploads)).resolves.toEqual({ removed: 0, failed: 2 });
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('marks uploads before deleting their objects', async () => {
    vi.spyOn(FormUpload, 'find').mockReturnValueOnce(lean(uploads));
    const updateMany = vi.spyOn(FormUpload, 'updateMany').mockResolvedValue({ modifiedCount: 2 });

    const summary = await service.deleteResponseUploads({ tenantId, responseId: 'r1' });

    expect(FormUpload.find).toHaveBeenCalledWith({ tenantId, responseId: 'r1', status: 'attached' });
    expect(updateMany.mock.calls[0]).toEqual([
      { _id: { $in: ['u1', 'u2'] } },
      { $set: { status: 'deleted', deleteReason: 'response-deleted' } }
    ]);
    expect(updateMany.mock.invocationCallOrder[0]).toBeLessThan(storage.deleteObject.mock.invocationCallOrder[0]);
    expect(summary).toMatchObject({ matched: 2, removed: 2, failed: 0 });
    expect(summary.items.map((item) => item.uploadId)).toEqual(['up-1', 'up-2']);
  });

  it('removes every active file of a deleted form', async () => {
    const find = vi.spyOn(FormUpload, 'find').mockReturnValueOnce(lean([]));
    await service.deleteFormUploads({ tenantId, formId: form._id });
    expect(find).toHaveBeenCalledWith({ tenantId, formId: form._id, status: { $in: ['pending', 'completed', 'attached'] } });
  });
});

describe('purgeTenantUploads', () => {
  const lean = (value) => ({ select: () => ({ limit: () => ({ lean: async () => value }) }) });

  it('deletes the objects and then the records', async () => {
    vi.spyOn(FormUpload, 'find')
      .mockReturnValueOnce(lean([{ _id: 'u1', tenantId, key: 'k1' }]))
      .mockReturnValueOnce(lean([]));
    const deleteMany = vi.spyOn(FormUpload, 'deleteMany').mockResolvedValue({ deletedCount: 4 });

    await expect(service.purgeTenantUploads({ tenantId })).resolves.toEqual({ deleted: 4, objectsDeleted: 1 });
    expect(FormUpload.find.mock.calls[0][0]).toEqual({ tenantId, deletedAt: null });
    expect(storage.deleteObject).toHaveBeenCalledWith('k1');
    expect(deleteMany).toHaveBeenCalledWith({ tenantId });
  });

  it('keeps the records when an object could not be removed, so the purge is retried', async () => {
    vi.spyOn(FormUpload, 'find').mockReturnValueOnce(lean([{ _id: 'u1', tenantId, key: 'k1' }]));
    const deleteMany = vi.spyOn(FormUpload, 'deleteMany');
    storage.deleteObject.mockRejectedValue(new Error('r2 down'));

    await expect(service.purgeTenantUploads({ tenantId })).rejects.toThrow(/could not be removed/);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('retention and file state', () => {
  it('recomputes the deletion date of received files from their submission date', async () => {
    const updateMany = vi.spyOn(FormUpload, 'updateMany').mockResolvedValue({ modifiedCount: 3 });
    await expect(service.applyRetentionChange({ tenantId, formId: form._id, retentionDays: 30 }))
      .resolves.toEqual({ updated: 3 });
    expect(updateMany.mock.calls[0]).toEqual([
      { tenantId, formId: form._id, status: 'attached' },
      [{ $set: { retainUntil: { $add: ['$attachedAt', 30 * 24 * 60 * 60 * 1000] } } }]
    ]);
  });

  it('reports the state of each file on a response', async () => {
    vi.spyOn(FormUpload, 'find').mockReturnValue({ select: () => ({ lean: async () => [
      { uploadId: 'up-1', status: 'attached', scanStatus: 'not_scanned', retainUntil: new Date(5) },
      { uploadId: 'up-2', status: 'expired', scanStatus: 'not_scanned', deleteReason: 'retention' }
    ] }) });
    const states = await service.getResponseFileStates({ tenantId, responseId: 'r1' });
    expect(states.get('up-1')).toMatchObject({ status: 'attached', deleteReason: null, mediaId: null });
    expect(states.get('up-2')).toMatchObject({ status: 'expired', deleteReason: 'retention', retainUntil: null });
  });
});

describe('getCapabilities', () => {
  beforeEach(() => {
    vi.spyOn(tenantSettingsService, 'getTurnstileCredentials').mockResolvedValue({ siteKey: 's', secretKey: 'x' });
  });

  it('is ready only when bucket, plan and Turnstile are all in place', async () => {
    const ready = await service.getCapabilities({ tenantId });
    expect(ready).toMatchObject({ ready: true, configured: true, planAllowed: true, turnstileConfigured: true });
    expect(ready.limits).toEqual({ maxFileBytes: 20 * 1024 * 1024, maxFilesPerField: 5 });
    expect(ready.retention).toEqual({ defaultDays: 180, minDays: 30, maxDays: 730 });
    expect(ready.allowedTypes.find((type) => type.extension === 'pdf'))
      .toEqual({ extension: 'pdf', mimeType: 'application/pdf', category: 'document', promotableWithoutScan: true });
    expect(ready.allowedTypes.map((type) => type.extension)).not.toContain('svg');

    tenantSettingsService.getTurnstileCredentials.mockResolvedValueOnce(null);
    await expect(service.getCapabilities({ tenantId })).resolves.toMatchObject({ ready: false, turnstileConfigured: false });
    entitlement.isAllowed.mockResolvedValueOnce(false);
    await expect(service.getCapabilities({ tenantId })).resolves.toMatchObject({ ready: false, planAllowed: false });
    storage.isConfigured.mockReturnValue(false);
    await expect(service.getCapabilities({ tenantId })).resolves.toMatchObject({ ready: false, configured: false });
  });
});

describe('promoteUpload', () => {
  const mediaService = { importBuffer: vi.fn() };
  const attached = (overrides = {}) => ({
    _id: 'u1', uploadId: 'up-1', tenantId, key: 'acme/forms/f/2026/11/up-1.pdf', originalName: 'Broşür.pdf',
    extension: 'pdf', mimeType: 'application/pdf', status: 'attached', scanStatus: 'not_scanned', ...overrides
  });
  const args = { tenantId, formId: form._id, responseId: 'r1', uploadId: 'up-1', userId: 'admin-1' };
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

  beforeEach(() => {
    const mediaPath = require.resolve('./mediaService');
    require.cache[mediaPath] = { id: mediaPath, filename: mediaPath, loaded: true, exports: mediaService };
    mediaService.importBuffer.mockReset().mockResolvedValue({ _id: 'media-1', url: 'https://cdn.example/acme/x.pdf' });
    vi.spyOn(FormUpload, 'findOne').mockResolvedValue(attached());
    vi.spyOn(FormUpload, 'findOneAndUpdate').mockImplementation(async (_f, update) => ({ ...attached(), ...update.$set }));
    vi.spyOn(storage, 'readObject').mockResolvedValue({ tooLarge: false, size: PDF.length, buffer: PDF });
  });

  afterEach(() => {
    delete require.cache[require.resolve('./mediaService')];
  });

  it('creates the media item under the admin, then removes the private copy', async () => {
    const result = await service.promoteUpload(args);

    expect(FormUpload.findOne).toHaveBeenCalledWith({ uploadId: 'up-1', tenantId, formId: form._id, responseId: 'r1', status: 'attached' });
    const [claimFilter, claim] = FormUpload.findOneAndUpdate.mock.calls[0];
    expect(claimFilter).toEqual({ _id: 'u1', status: 'attached' });
    expect(claim.$set).toMatchObject({ status: 'promoted', promotedBy: 'admin-1' });
    expect(FormUpload.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(mediaService.importBuffer.mock.invocationCallOrder[0]);

    expect(mediaService.importBuffer).toHaveBeenCalledWith({
      tenantId, userId: 'admin-1', buffer: PDF, originalName: 'Broşür.pdf', contentType: 'application/pdf', tags: ['form-upload']
    });
    expect(FormUpload.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { mediaId: 'media-1' } });
    expect(storage.deleteObject).toHaveBeenCalledWith('acme/forms/f/2026/11/up-1.pdf');
    expect(result).toEqual({ uploadId: 'up-1', filename: 'Broşür.pdf', mediaId: 'media-1', url: 'https://cdn.example/acme/x.pdf' });
  });

  it('accepts images without a scan', async () => {
    FormUpload.findOne.mockResolvedValue(attached({ extension: 'png', mimeType: 'image/png', key: 'k.png' }));
    storage.readObject.mockResolvedValue({ tooLarge: false, size: PNG.length, buffer: PNG });
    await expect(service.promoteUpload(args)).resolves.toMatchObject({ mediaId: 'media-1' });
  });

  it('keeps Office documents until they are scanned, and refuses infected files', async () => {
    FormUpload.findOne.mockResolvedValueOnce(attached({ extension: 'docx' }));
    await expect(service.promoteUpload(args)).rejects.toMatchObject({ code: 'PromotionRequiresScan', statusCode: 409 });
    FormUpload.findOne.mockResolvedValueOnce(attached({ scanStatus: 'infected' }));
    await expect(service.promoteUpload(args)).rejects.toMatchObject({ code: 'FileInfected' });
    expect(storage.readObject).not.toHaveBeenCalled();
    expect(mediaService.importBuffer).not.toHaveBeenCalled();
  });

  it('lets a scanned Office document through', async () => {
    const docx = Buffer.from('ignored');
    FormUpload.findOne.mockResolvedValue(attached({ extension: 'docx', scanStatus: 'clean' }));
    storage.readObject.mockResolvedValue({ tooLarge: false, size: docx.length, buffer: docx });
    // Content verification still applies to scanned files.
    await expect(service.promoteUpload(args)).rejects.toMatchObject({ code: 'FileContentMismatch' });
  });

  it('refuses a PDF with active content and leaves the file in place', async () => {
    const evil = Buffer.from('%PDF-1.7\n<< /OpenAction << /S /JavaScript /JS (x) >> >>', 'latin1');
    storage.readObject.mockResolvedValue({ tooLarge: false, size: evil.length, buffer: evil });

    await expect(service.promoteUpload(args)).rejects.toMatchObject({
      code: 'PdfActiveContent', statusCode: 422, details: { markers: ['JavaScript', 'JS'] }
    });
    expect(FormUpload.findOneAndUpdate).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('rolls back and keeps the private copy when the media library rejects the file', async () => {
    mediaService.importBuffer.mockRejectedValue(Object.assign(new Error('Storage limit reached'), { code: 'StorageLimitExceeded' }));

    await expect(service.promoteUpload(args)).rejects.toMatchObject({ code: 'StorageLimitExceeded', statusCode: 409 });
    expect(FormUpload.updateOne).toHaveBeenCalledWith(
      { _id: 'u1', status: 'promoted', mediaId: null },
      { $set: { status: 'attached' }, $unset: { promotedBy: '', promotedAt: '' } }
    );
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('moves a file only once', async () => {
    FormUpload.findOneAndUpdate.mockResolvedValue(null);
    await expect(service.promoteUpload(args)).rejects.toMatchObject({ code: 'UploadNotAvailable' });
    expect(mediaService.importBuffer).not.toHaveBeenCalled();
  });

  it('reports files that are not attached to this response', async () => {
    FormUpload.findOne.mockResolvedValue(null);
    await expect(service.promoteUpload(args)).rejects.toMatchObject({ code: 'UploadNotFound', statusCode: 404 });
  });
});
