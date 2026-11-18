import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { FormDefinition, FormResponse } = require('@contexthub/common');
const domainEvents = require('../lib/domainEvents');
const webhookTrigger = require('../lib/webhookTrigger');
const formUploadService = require('./formUploadService');
const formServicePath = require.resolve('./formService');

const tenantId = '64b000000000000000000001';
const formId = '64b0000000000000000000f1';
const form = {
  _id: formId,
  version: 3,
  title: { tr: 'Başvuru' },
  settings: {},
  fields: [
    { id: 'name-id', name: 'fullName', type: 'text', required: true },
    { id: 'cv-id', name: 'cv', type: 'file', required: true }
  ]
};
const fileMeta = { uploadId: 'up-1', filename: 'cv.pdf', size: 10, mimeType: 'application/pdf' };
let formService;
let emitted;
let saved;

beforeEach(() => {
  emitted = [];
  saved = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // formService binds these at load time, so they are replaced before it loads.
  vi.spyOn(domainEvents, 'emitDomainEvent').mockImplementation(async (_tenant, type, payload) => {
    emitted.push({ type, payload });
    return 'event-1';
  });
  vi.spyOn(webhookTrigger, 'triggerWebhooksForTenant').mockImplementation(() => {});
  delete require.cache[formServicePath];
  formService = require('./formService');

  vi.spyOn(FormDefinition, 'findOne').mockResolvedValue(form);
  vi.spyOn(FormDefinition, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
  vi.spyOn(FormResponse, 'findById').mockReturnValue({ lean: async () => ({ notificationSent: false }) });
  vi.spyOn(FormResponse.prototype, 'save').mockImplementation(async function save() {
    saved.push(this.toObject());
    return this;
  });
  vi.spyOn(formUploadService, 'resolveSubmissionFiles').mockImplementation(async ({ data }) => ({
    data: { ...data, cv: [fileMeta] },
    uploads: [{ _id: 'u1', fieldName: 'cv' }],
    files: [{ fieldId: 'cv-id', ...fileMeta }]
  }));
  vi.spyOn(formUploadService, 'attachUploads').mockResolvedValue();
  vi.spyOn(formUploadService, 'releaseUploads').mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete require.cache[formServicePath];
});

describe('submitResponse with file fields', () => {
  const submit = (overrides = {}) => formService.submitResponse({
    tenantId, formId, data: { fullName: 'Ada', cv: { uploadId: 'up-1' } }, metadata: { source: 'api' },
    uploadSession: 'session-token', ...overrides
  });

  it('stores verified file metadata on the response and claims the uploads first', async () => {
    const response = await submit();

    expect(formUploadService.resolveSubmissionFiles).toHaveBeenCalledWith({
      tenantId, form, data: { fullName: 'Ada', cv: { uploadId: 'up-1' } }, sessionToken: 'session-token'
    });
    expect(formUploadService.attachUploads).toHaveBeenCalledWith({
      tenantId, responseId: response._id, uploads: [{ _id: 'u1', fieldName: 'cv' }], retentionDays: 180
    });
    expect(formUploadService.attachUploads.mock.invocationCallOrder[0])
      .toBeLessThan(FormResponse.prototype.save.mock.invocationCallOrder[0]);

    expect(saved[0].data).toEqual({ fullName: 'Ada', cv: [fileMeta] });
    expect(saved[0].files).toEqual([{ fieldId: 'cv-id', ...fileMeta }]);
    expect(saved[0].files[0].url).toBeUndefined();
  });

  it('sends file names but no links in the webhook payload', async () => {
    await submit();
    const event = emitted.find((item) => item.type === 'form.submitted');
    expect(event.payload.response.data.cv).toEqual([fileMeta]);
    expect(JSON.stringify(event.payload)).not.toMatch(/https?:\/\//);
  });

  it('releases the uploads when the response cannot be saved', async () => {
    FormResponse.prototype.save.mockRejectedValueOnce(new Error('db down'));
    await expect(submit()).rejects.toThrow('db down');
    expect(formUploadService.releaseUploads).toHaveBeenCalledTimes(1);
    expect(formUploadService.releaseUploads.mock.calls[0][0].tenantId).toBe(tenantId);
  });

  it('does not save anything when the uploads are rejected or already used', async () => {
    const invalid = Object.assign(new Error('files missing'), { code: 'ValidationFailed' });
    formUploadService.resolveSubmissionFiles.mockRejectedValueOnce(invalid);
    await expect(submit()).rejects.toBe(invalid);

    formUploadService.attachUploads.mockRejectedValueOnce(invalid);
    await expect(submit()).rejects.toBe(invalid);

    expect(FormResponse.prototype.save).not.toHaveBeenCalled();
    expect(FormDefinition.updateOne).not.toHaveBeenCalled();
  });

  it('uses the retention period configured on the form', async () => {
    FormDefinition.findOne.mockResolvedValueOnce({ ...form, settings: { fileRetentionDays: 30 } });
    await submit();
    expect(formUploadService.attachUploads.mock.calls[0][0].retentionDays).toBe(30);
  });

  it('still requires a required file field', async () => {
    await expect(submit({ data: { fullName: 'Ada' } })).rejects.toThrow('Field "cv" is required');
    expect(formUploadService.resolveSubmissionFiles).not.toHaveBeenCalled();
  });
});

describe('files follow the lifecycle of their response and form', () => {
  const responseId = '64b0000000000000000000a1';

  it('removes the files when a response is permanently deleted, before the record goes', async () => {
    vi.spyOn(FormResponse, 'findOne').mockResolvedValue({ _id: responseId });
    const deleteOne = vi.spyOn(FormResponse, 'deleteOne').mockResolvedValue({ deletedCount: 1 });
    const removeFiles = vi.spyOn(formUploadService, 'deleteResponseUploads').mockResolvedValue({ matched: 1, removed: 1, failed: 0 });

    await formService.hardDeleteResponse({ tenantId, formId, responseId });

    expect(removeFiles).toHaveBeenCalledWith({ tenantId, responseId });
    expect(removeFiles.mock.invocationCallOrder[0]).toBeLessThan(deleteOne.mock.invocationCallOrder[0]);
  });

  it('keeps the files when a response is only moved to the trash', async () => {
    const save = vi.fn(async () => {});
    vi.spyOn(FormResponse, 'findOne').mockResolvedValue({ _id: responseId, status: 'pending', save });
    const removeFiles = vi.spyOn(formUploadService, 'deleteResponseUploads');

    const trashed = await formService.deleteResponse({ tenantId, formId, responseId });

    expect(trashed.status).toBe('deleted');
    expect(save).toHaveBeenCalled();
    expect(removeFiles).not.toHaveBeenCalled();
  });

  it('removes every file of a form that is permanently deleted', async () => {
    const { FormVersion } = require('@contexthub/common');
    vi.spyOn(FormVersion, 'deleteMany').mockResolvedValue({});
    const deleteResponses = vi.spyOn(FormResponse, 'deleteMany').mockResolvedValue({});
    vi.spyOn(FormDefinition, 'deleteOne').mockResolvedValue({});
    const removeFiles = vi.spyOn(formUploadService, 'deleteFormUploads').mockResolvedValue({});

    await formService.hardDelete({ tenantId, formId });

    expect(removeFiles).toHaveBeenCalledWith({ tenantId, formId });
    expect(removeFiles.mock.invocationCallOrder[0]).toBeLessThan(deleteResponses.mock.invocationCallOrder[0]);
  });

  it('shows on the response whether each file is still available', async () => {
    const populate = { populate: () => populate, then: (resolve) => resolve({
      _id: responseId,
      toObject: () => ({ _id: responseId, data: {}, files: [
        { fieldId: 'cv-id', uploadId: 'up-1', filename: 'cv.pdf' },
        { fieldId: 'cv-id', uploadId: 'gone', filename: 'old.pdf' },
        { fieldId: 'legacy', filename: 'legacy.png' }
      ] })
    }) };
    vi.spyOn(FormResponse, 'findOne').mockReturnValue(populate);
    vi.spyOn(formUploadService, 'getResponseFileStates').mockResolvedValue(new Map([
      ['up-1', { status: 'expired', scanStatus: 'not_scanned', deleteReason: 'retention' }]
    ]));

    const response = await formService.getResponseById({ tenantId, formId, responseId });

    expect(response.files[0]).toMatchObject({ uploadId: 'up-1', status: 'expired', deleteReason: 'retention' });
    expect(response.files[1]).toMatchObject({ uploadId: 'gone', status: 'deleted' });
    expect(response.files[2]).toEqual({ fieldId: 'legacy', filename: 'legacy.png' });
  });
});

describe('changing the retention period of a form', () => {
  const formDoc = (settings) => ({
    _id: formId,
    version: 3,
    status: 'draft',
    title: { tr: 'Başvuru' },
    fields: [],
    settings,
    markModified: () => {},
    save: vi.fn(async () => {})
  });

  beforeEach(() => {
    const { FormVersion } = require('@contexthub/common');
    vi.spyOn(FormDefinition, 'findById').mockResolvedValue({ version: 3 });
    vi.spyOn(FormVersion, 'findOne').mockResolvedValue({ _id: 'version-1' });
    vi.spyOn(formUploadService, 'applyRetentionChange').mockResolvedValue({ updated: 2 });
  });

  it('applies the new period to files already received', async () => {
    const doc = formDoc({ fileRetentionDays: 180 });
    FormDefinition.findOne.mockResolvedValue(doc);

    await formService.update({ tenantId, formId, data: { settings: { fileRetentionDays: 30 } }, userId: 'user-1' });

    expect(doc.settings.fileRetentionDays).toBe(30);
    expect(formUploadService.applyRetentionChange).toHaveBeenCalledWith({ tenantId, formId, retentionDays: 30 });
    expect(doc.save.mock.invocationCallOrder[0])
      .toBeLessThan(formUploadService.applyRetentionChange.mock.invocationCallOrder[0]);
  });

  it('leaves existing files alone when the period did not change', async () => {
    FormDefinition.findOne.mockResolvedValue(formDoc({ fileRetentionDays: 180 }));
    await formService.update({ tenantId, formId, data: { settings: { redirectUrl: 'https://example.com' } }, userId: 'user-1' });
    await formService.update({ tenantId, formId, data: { settings: { fileRetentionDays: 180 } }, userId: 'user-1' });
    expect(formUploadService.applyRetentionChange).not.toHaveBeenCalled();
  });
});
