import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'

let sendTestWebhook
let setWebhookDeps
let Webhook

beforeAll(async () => {
  const webhookService = await import('./webhookService')
  sendTestWebhook = webhookService.sendTestWebhook
  setWebhookDeps = webhookService.__setWebhookServiceDeps
  ;({ Webhook } = await import('@contexthub/common'))
})

describe('sendTestWebhook', () => {
  let findOneSpy
  let mockFetch
  let mockSignPayload

  beforeEach(() => {
    mockFetch = vi.fn()
    mockSignPayload = vi.fn(() => 'mock-signature')
    setWebhookDeps({ fetch: mockFetch, signPayload: mockSignPayload })

    findOneSpy = vi.spyOn(Webhook, 'findOne').mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: 'hook123',
          tenantId: 'tenant_1',
          url: 'https://example.com/webhook',
          secret: 'topsecret',
          isActive: true
        })
    })
  })

  afterEach(() => {
    setWebhookDeps()
    findOneSpy?.mockRestore()
  })

  it('sends a full domain event payload with correct headers', async () => {
    const okTextMock = vi.fn().mockResolvedValue('OK')
    mockFetch.mockResolvedValue({ ok: true, status: 200, text: okTextMock })

    const result = await sendTestWebhook('tenant_1', 'hook123')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://example.com/webhook')
    expect(options.headers['X-CTXHUB-EVENT']).toBe('webhook.test')
    expect(options.headers['X-CTXHUB-SIGNATURE']).toBe('mock-signature')

    const parsedBody = JSON.parse(options.body)
    expect(parsedBody).toMatchObject({
      tenantId: 'tenant_1',
      type: 'webhook.test',
      status: 'pending',
      retryCount: 0,
      lastError: null,
      metadata: expect.objectContaining({
        test: true,
        webhookId: 'hook123'
      })
    })
    expect(parsedBody).toHaveProperty('_id')
    expect(parsedBody._id).toEqual(parsedBody.id)
    expect(parsedBody.payload).toHaveProperty('message')

    expect(mockSignPayload).toHaveBeenCalledWith('topsecret', options.body)
    expect(result).toEqual({ ok: true, status: 200, responseBody: 'OK' })
    expect(okTextMock).toHaveBeenCalledTimes(1)
  })

  it('throws when the webhook responds with an error', async () => {
    const failTextMock = vi.fn().mockResolvedValue('Nope')
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: failTextMock })

    await expect(sendTestWebhook('tenant_1', 'hook123')).rejects.toThrow(
      'Test webhook failed with HTTP 500'
    )
    expect(failTextMock).toHaveBeenCalledTimes(1)
  })
})
