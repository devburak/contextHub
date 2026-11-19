import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Fastify = require('fastify')
const auth = require('../middleware/auth')
const auditService = require('../services/auditService')
const formUploadService = require('../services/formUploadService')
const routePath = require.resolve('./forms')

const tenantId = '64b000000000000000000001'
const base = '/forms/64b0000000000000000000f1/responses/64b0000000000000000000a1/files/up-1'
const { FormUploadError } = formUploadService
let app

const call = (method, url, role = 'admin') => app.inject({ method, url, headers: { 'x-test-role': role } })

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(auth, 'tenantContext').mockImplementation(async (request) => {
    request.tenantId = tenantId
  })
  // The real role guards (requireEditor / requireAdmin) run against this role.
  vi.spyOn(auth, 'authenticate').mockImplementation(async (request) => {
    request.user = { _id: 'user-1' }
    request.userRole = request.headers['x-test-role']
  })
  vi.spyOn(auditService, 'logSecurityEvent').mockResolvedValue({})

  delete require.cache[routePath]
  app = Fastify()
  await app.register(require(routePath))
})

afterEach(async () => {
  await app.close()
  vi.restoreAllMocks()
  delete require.cache[routePath]
})

describe('admin form file routes', () => {
  it('reports upload availability to any member', async () => {
    vi.spyOn(formUploadService, 'getCapabilities').mockResolvedValue({ ready: false, configured: true })
    const response = await call('GET', '/forms/uploads/status', 'viewer')

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: { ready: false, configured: true } })
    expect(formUploadService.getCapabilities).toHaveBeenCalledWith({ tenantId })
  })

  it('lets editors download but not publish files', async () => {
    vi.spyOn(formUploadService, 'getDownloadLink').mockResolvedValue({ url: 'https://r2.example/get', uploadId: 'up-1', filename: 'cv.pdf' })
    const promote = vi.spyOn(formUploadService, 'promoteUpload')

    const download = await call('GET', `${base}/download`, 'editor')
    const publish = await call('POST', `${base}/promote`, 'editor')
    const viewerDownload = await call('GET', `${base}/download`, 'viewer')

    expect(download.statusCode).toBe(200)
    expect(download.headers['cache-control']).toBe('no-store')
    expect(publish.statusCode).toBe(403)
    expect(viewerDownload.statusCode).toBe(403)
    expect(promote).not.toHaveBeenCalled()
  })

  it('publishes for admins and records who did it', async () => {
    vi.spyOn(formUploadService, 'promoteUpload').mockResolvedValue({
      uploadId: 'up-1', filename: 'cv.pdf', mediaId: 'media-1', url: 'https://cdn.example/x.pdf',
    })

    const response = await call('POST', `${base}/promote`, 'admin')

    expect(response.statusCode).toBe(200)
    expect(response.json().media).toMatchObject({ mediaId: 'media-1' })
    expect(formUploadService.promoteUpload).toHaveBeenCalledWith({
      tenantId,
      formId: '64b0000000000000000000f1',
      responseId: '64b0000000000000000000a1',
      uploadId: 'up-1',
      userId: 'user-1',
    })
    expect(auditService.logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'form.file.promote',
      userId: 'user-1',
      tenantId,
      metadata: expect.objectContaining({ uploadId: 'up-1', mediaId: 'media-1' }),
    }))
  })

  it('returns the reason a file cannot be published', async () => {
    vi.spyOn(formUploadService, 'promoteUpload').mockRejectedValue(
      new FormUploadError('PromotionRequiresScan', 'This file type can be published only after it has been scanned', 409)
    )
    const response = await call('POST', `${base}/promote`, 'owner')

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ error: 'PromotionRequiresScan' })
    expect(auditService.logSecurityEvent).not.toHaveBeenCalled()
  })
})
