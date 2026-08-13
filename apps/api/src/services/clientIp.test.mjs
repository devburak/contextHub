import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { extractTrustedClientIp } = require('./clientIp');

describe('extractTrustedClientIp', () => {
  it('prefers Cloudflare client identity over a forged forwarding chain', () => {
    const request = {
      headers: {
        'cf-connecting-ip': '203.0.113.45',
        'x-forwarded-for': '1.2.3.4, 203.0.113.45',
      },
      ips: ['1.2.3.4', '203.0.113.45'],
      raw: { socket: { remoteAddress: '172.16.0.10' } },
    };

    expect(extractTrustedClientIp(request)).toBe('203.0.113.45');
  });

  it('ignores forwarding headers when Cloudflare identity is absent', () => {
    const request = {
      headers: { 'x-forwarded-for': '1.2.3.4, 198.51.100.10' },
      ips: ['1.2.3.4', '198.51.100.10'],
      raw: { socket: { remoteAddress: '127.0.0.1' } },
    };

    expect(extractTrustedClientIp(request)).toBe('127.0.0.1');
  });
});
