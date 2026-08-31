import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { parseSignatureHeader, verifyWebhook } = require('./paddleProvider');

function sign(body, timestamp, secret) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}:${body}`).digest('hex');
}

describe('Paddle webhook verification', () => {
  it('parses multiple v1 signatures', () => {
    expect(parseSignatureHeader('ts=100;h1=abc;h1=def')).toEqual({
      timestamp: '100',
      signatures: ['abc', 'def'],
    });
  });

  it('verifies the exact raw body and returns its JSON payload', () => {
    const secret = 'webhook-secret';
    const timestamp = 1_700_000_000;
    const body = '{"event_id":"evt_1", "event_type":"subscription.updated"}';
    const signature = sign(body, timestamp, secret);
    expect(verifyWebhook(Buffer.from(body), `ts=${timestamp};h1=${signature}`, {
      secret,
      nowSeconds: timestamp,
      toleranceSeconds: 5,
    })).toMatchObject({ event_id: 'evt_1' });
  });

  it('rejects modified bodies and stale timestamps', () => {
    const secret = 'webhook-secret';
    const timestamp = 1_700_000_000;
    const body = '{"event_id":"evt_1"}';
    const signature = sign(body, timestamp, secret);
    expect(() => verifyWebhook(`${body} `, `ts=${timestamp};h1=${signature}`, {
      secret,
      nowSeconds: timestamp,
      toleranceSeconds: 5,
    })).toThrow('signature mismatch');
    expect(() => verifyWebhook(body, `ts=${timestamp};h1=${signature}`, {
      secret,
      nowSeconds: timestamp + 6,
      toleranceSeconds: 5,
    })).toThrow('outside the allowed tolerance');
  });
});
