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
      tenantId, responseId: response._id, uploads: [{ _id: 'u1', fieldName: 'cv' }]
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

  it('still requires a required file field', async () => {
    await expect(submit({ data: { fullName: 'Ada' } })).rejects.toThrow('Field "cv" is required');
    expect(formUploadService.resolveSubmissionFiles).not.toHaveBeenCalled();
  });
});
