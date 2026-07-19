import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import edgeCachePurgeService from './edgeCachePurgeService.js';

const originalFetch = globalThis.fetch;
const ENV_KEYS = [
  'CF_EDGE_CACHE_PURGE_ENABLED',
  'CF_ZONE_ID',
  'CF_CACHE_PURGE_API_TOKEN',
  'CF_API_TOKEN',
];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function resetEnv() {
  ENV_KEYS.forEach((key) => {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  });
}

describe('edgeCachePurgeService', () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    resetEnv();
  });

  it('skips when cache purge is disabled', async () => {
    globalThis.fetch = vi.fn();

    const result = await edgeCachePurgeService.purgeTenantCache('tenant-1');

    expect(result).toEqual({ skipped: true, reason: 'edge_cache_purge_disabled' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('purges the tenant Cache-Tag through the Cloudflare zone API', async () => {
    process.env.CF_EDGE_CACHE_PURGE_ENABLED = 'true';
    process.env.CF_ZONE_ID = 'zone-id';
    process.env.CF_CACHE_PURGE_API_TOKEN = 'cf-purge-token';
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const result = await edgeCachePurgeService.purgeTenantCache('tenant-1');

    expect(result).toEqual({
      skipped: false,
      tenantId: 'tenant-1',
      tag: 'ctxhub-tenant-tenant-1',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/zones/zone-id/purge_cache',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer cf-purge-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tags: ['ctxhub-tenant-tenant-1'] }),
      }
    );
  });

  it('invalidates content changes but ignores form submissions', () => {
    expect(edgeCachePurgeService.shouldPurgeForEvent('content.updated')).toBe(true);
    expect(edgeCachePurgeService.shouldPurgeForEvent('menu.deleted')).toBe(true);
    expect(edgeCachePurgeService.shouldPurgeForEvent('form.submitted')).toBe(false);
  });
});
