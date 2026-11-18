import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Fastify = require('fastify')
const auth = require('../middleware/auth')
const limitGuard = require('../middleware/requestLimitGuard')
const redis = require('../lib/localRedis')
const formService = require('../services/formService')
const formUploadService = require('../services/formUploadService')
const publicForms = require('./publicForms')
const routePath = require.resolve('./publicFormUploads')

const tenantId = '64b000000000000000000001'
const formId = '64b0000000000000000000f1'
const form = { _id: formId, status: 'published', fields: [{ id: 'cv-id', name: 'cv', type: 'file' }] }
const { FormUploadError } = formUploadService
let app

function call(method, url, { payload, headers = {} } = {}) {
  return app.inject({
    method,
    url,
    headers: { authorization: 'Bearer ctx_test', 'cf-connecting-ip': '203.0.113.1', ...headers },
    payload,
  })
}

beforeEach(async () => {
  vi.spyOn(auth, 'tenantContext').mockImplementation(async () => {})
  vi.spyOn(limitGuard, 'checkRequestLimit').mockImplementation(async () => {})
  vi.spyOn(redis, 'isEnabled').mockReturnValue(false)
  vi.spyOn(publicForms, 'validateApiKey').mockImplementation(async (request, reply) => {
    if (request.headers.authorization !== 'Bearer ctx_test') {
      return reply.code(401).send({ error: 'ApiKeyRequired', message: 'API key is required' })
    }
    request.tenantId = tenantId
  })
  vi.spyOn(formService, 'getById').mockResolvedValue(form)

  // A fresh module instance picks up the stubs above and starts with empty rate-limit buckets.
  delete require.cache[routePath]
  app = Fastify()
  await app.register(require(routePath))
})

afterEach(async () => {
  await app.close()
  vi.restoreAllMocks()
})

describe('public form upload routes', () => {
  it('requires a write API key on every endpoint', async () => {
    const createSession = vi.spyOn(formUploadService, 'createSession')
    const headers = { authorization: '' }
    const responses = await Promise.all([
      call('POST', `/public/forms/${formId}/uploads/session`, { payload: { turnstileToken: 't' }, headers }),
      call('POST', `/public/forms/${formId}/uploads/presign`, { payload: { field: 'cv', filename: 'a.pdf', size: 1 }, headers }),
      call('POST', `/public/forms/${formId}/uploads/up-1/complete`, { payload: {}, headers }),
      call('DELETE', `/public/forms/${formId}/uploads/up-1`, { headers }),
    ])
    expect(responses.map((response) => response.statusCode)).toEqual([401, 401, 401, 401])
    expect(createSession).not.toHaveBeenCalled()
    expect(formService.getById).not.toHaveBeenCalled()
  })

  it('creates a session for a published form', async () => {
    const createSession = vi.spyOn(formUploadService, 'createSession')
      .mockResolvedValue({ uploadSession: 'session', expiresAt: new Date(0), fields: [] })
    const response = await call('POST', `/public/forms/${formId}/uploads/session`, { payload: { turnstileToken: 'tok' } })

    expect(response.statusCode).toBe(201)
    expect(response.json().uploadSession).toBe('session')
    expect(formService.getById).toHaveBeenCalledWith({ tenantId, formId })
    expect(createSession).toHaveBeenCalledWith({ tenantId, form, turnstileToken: 'tok', ip: '203.0.113.1' })
  })

  it('hides unpublished and unknown forms', async () => {
    const createSession = vi.spyOn(formUploadService, 'createSession')
    formService.getById.mockResolvedValueOnce({ ...form, status: 'draft' })
    const draft = await call('POST', `/public/forms/${formId}/uploads/session`, { payload: { turnstileToken: 'tok' } })
    formService.getById.mockRejectedValueOnce(new Error('Form not found'))
    const missing = await call('POST', `/public/forms/${formId}/uploads/session`, { payload: { turnstileToken: 'tok' } })

    expect([draft.statusCode, missing.statusCode]).toEqual([404, 404])
    expect(createSession).not.toHaveBeenCalled()
  })

  it('passes the session from the body or the header to presign, complete and discard', async () => {
    const presign = vi.spyOn(formUploadService, 'presignUpload').mockResolvedValue({ uploadId: 'up-1', uploadUrl: 'https://r2.example/put' })
    const complete = vi.spyOn(formUploadService, 'completeUpload').mockResolvedValue({ uploadId: 'up-1', status: 'completed' })
    const discard = vi.spyOn(formUploadService, 'discardUpload').mockResolvedValue({ uploadId: 'up-1', status: 'deleted' })

    const presigned = await call('POST', `/public/forms/${formId}/uploads/presign`, {
      payload: { uploadSession: 'body-session', field: 'cv', filename: 'cv.pdf', size: 1234 },
    })
    const completed = await call('POST', `/public/forms/${formId}/uploads/up-1/complete`, {
      payload: {}, headers: { 'x-upload-session': 'header-session' },
    })
    const discarded = await call('DELETE', `/public/forms/${formId}/uploads/up-1`, {
      headers: { 'x-upload-session': 'header-session' },
    })

    expect([presigned.statusCode, completed.statusCode, discarded.statusCode]).toEqual([201, 200, 200])
    expect(presign).toHaveBeenCalledWith({
      tenantId, form, sessionToken: 'body-session', fieldName: 'cv', filename: 'cv.pdf', size: 1234, ip: '203.0.113.1',
    })
    expect(complete).toHaveBeenCalledWith({ tenantId, form, sessionToken: 'header-session', uploadId: 'up-1' })
    expect(discard).toHaveBeenCalledWith({ tenantId, form, sessionToken: 'header-session', uploadId: 'up-1' })
    expect(completed.json()).toEqual({ upload: { uploadId: 'up-1', status: 'completed' } })
  })

  it('validates the presign body', async () => {
    const presign = vi.spyOn(formUploadService, 'presignUpload')
    const missing = await call('POST', `/public/forms/${formId}/uploads/presign`, { payload: { field: 'cv', filename: 'cv.pdf' } })
    const negative = await call('POST', `/public/forms/${formId}/uploads/presign`, { payload: { field: 'cv', filename: 'cv.pdf', size: 0 } })
    expect([missing.statusCode, negative.statusCode]).toEqual([400, 400])
    expect(presign).not.toHaveBeenCalled()
  })

  it('maps upload errors to their status codes and hides unexpected ones', async () => {
    vi.spyOn(formUploadService, 'presignUpload')
      .mockRejectedValueOnce(new FormUploadError('StorageLimitExceeded', 'Storage limit reached', 409))
      .mockRejectedValueOnce(new Error('secret internal detail'))
    const payload = { uploadSession: 's', field: 'cv', filename: 'cv.pdf', size: 1 }

    const quota = await call('POST', `/public/forms/${formId}/uploads/presign`, { payload })
    const crash = await call('POST', `/public/forms/${formId}/uploads/presign`, { payload })

    expect(quota.statusCode).toBe(409)
    expect(quota.json()).toMatchObject({ error: 'StorageLimitExceeded', message: 'Storage limit reached' })
    expect(crash.statusCode).toBe(500)
    expect(crash.body).not.toContain('secret internal detail')
  })

  it('rate limits session creation per client IP', async () => {
    vi.spyOn(formUploadService, 'createSession').mockResolvedValue({ uploadSession: 's', expiresAt: new Date(0), fields: [] })
    const send = (ip) => call('POST', `/public/forms/${formId}/uploads/session`, {
      payload: { turnstileToken: 'tok' }, headers: { 'cf-connecting-ip': ip },
    })

    const statuses = []
    for (let i = 0; i < 11; i += 1) statuses.push((await send('203.0.113.7')).statusCode)
    const otherClient = await send('203.0.113.8')

    expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true)
    expect(statuses[10]).toBe(429)
    expect(otherClient.statusCode).toBe(201)
    expect(formUploadService.createSession).toHaveBeenCalledTimes(11)
  })
})
