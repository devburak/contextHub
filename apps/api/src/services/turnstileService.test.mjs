import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { verifyToken, SITEVERIFY_URL } = require('./turnstileService');

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

describe('turnstile verification', () => {
  it('posts the secret, token and client IP to siteverify', async () => {
    const fetchImpl = vi.fn(async () => ok({ success: true, hostname: 'example.com' }));
    const result = await verifyToken({ secretKey: 'secret', token: 'tok', remoteIp: '203.0.113.9', fetchImpl });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(SITEVERIFY_URL);
    expect(options.method).toBe('POST');
    expect(Object.fromEntries(options.body)).toEqual({ secret: 'secret', response: 'tok', remoteip: '203.0.113.9' });
    expect(result).toEqual({ success: true, errorCodes: [], hostname: 'example.com' });
  });

  it('reports a failed challenge with its error codes', async () => {
    const fetchImpl = vi.fn(async () => ok({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
    await expect(verifyToken({ secretKey: 'secret', token: 'tok', fetchImpl }))
      .resolves.toMatchObject({ success: false, errorCodes: ['timeout-or-duplicate'] });
  });

  it('never calls out without a secret or a usable token', async () => {
    const fetchImpl = vi.fn();
    expect((await verifyToken({ secretKey: '', token: 'tok', fetchImpl })).success).toBe(false);
    expect((await verifyToken({ secretKey: 'secret', token: '', fetchImpl })).success).toBe(false);
    expect((await verifyToken({ secretKey: 'secret', token: 'x'.repeat(3000), fetchImpl })).success).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed when Turnstile cannot be reached', async () => {
    const down = vi.fn(async () => { throw new Error('network'); });
    const serverError = vi.fn(async () => ({ ok: false, status: 502 }));
    await expect(verifyToken({ secretKey: 'secret', token: 'tok', fetchImpl: down }))
      .resolves.toMatchObject({ success: false, unavailable: true });
    await expect(verifyToken({ secretKey: 'secret', token: 'tok', fetchImpl: serverError }))
      .resolves.toMatchObject({ success: false, unavailable: true });
  });
});
