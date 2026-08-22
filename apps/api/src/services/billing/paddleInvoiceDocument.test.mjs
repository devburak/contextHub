import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent, MockAgent, setGlobalDispatcher } from 'undici';

const require = createRequire(import.meta.url);
const paddleProvider = require('./paddleProvider');

describe('Paddle invoice documents', () => {
  let mockAgent;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(async () => {
    await mockAgent.close();
    setGlobalDispatcher(new Agent());
    vi.unstubAllEnvs();
  });

  it('requests a fresh inline PDF URL for a transaction', async () => {
    vi.stubEnv('PADDLE_API_KEY', 'test-key');
    vi.stubEnv('PADDLE_ENV', 'sandbox');
    const pool = mockAgent.get('https://sandbox-api.paddle.com');
    pool.intercept({
      path: '/transactions/txn_123/invoice?disposition=inline',
      method: 'GET',
      headers: { authorization: 'Bearer test-key' },
    }).reply(200, { data: { url: 'https://documents.example/invoice.pdf' } });

    const result = await paddleProvider.getTransactionInvoice({ externalTransactionId: 'txn_123' });

    expect(result).toEqual({ documentUrl: 'https://documents.example/invoice.pdf', expiresInSeconds: 3600 });
    expect(mockAgent.pendingInterceptors()).toHaveLength(0);
  });
});
