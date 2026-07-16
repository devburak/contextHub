import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import edgeGatewaySyncService from './edgeGatewaySyncService.js';
import { Domain, TenantSettings } from '@contexthub/common';

const originalFetch = globalThis.fetch;
const EDGE_ENV_KEYS = [
  'CF_EDGE_GATEWAY_ENABLED',
  'CF_ACCOUNT_ID',
  'CF_KV_NAMESPACE_ID',
  'CF_API_TOKEN',
  'CF_KV_KEY_PREFIX',
];
const originalEdgeEnv = Object.fromEntries(
  EDGE_ENV_KEYS.map((key) => [key, process.env[key]])
);

function resetEdgeGatewayEnv() {
  EDGE_ENV_KEYS.forEach((key) => {
    if (originalEdgeEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEdgeEnv[key];
    }
  });
}

describe('edgeGatewaySyncService', () => {
  beforeEach(() => {
    resetEdgeGatewayEnv();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-27T20:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    resetEdgeGatewayEnv();
  });

  function mockNoVerifiedDomains() {
    vi.spyOn(Domain, 'find').mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([]),
      }),
    });
  }

  it('builds a normalized tenant payload for the Worker KV config', () => {
    const payload = edgeGatewaySyncService.buildTenantPayload({
      tenant: {
        _id: { toString: () => 'tenant-object-id' },
        status: 'active',
      },
      settings: {
        edgeGateway: {
          publicReadEnabled: false,
          allowLocalhost: true,
          allowedOrigins: [' https://kesk.org.tr ', '', 'https://kesk.org.tr', 'https://www.kesk.org.tr'],
        },
      },
      domains: [
        { host: 'tenant.example.com', status: 'verified' },
        { host: 'pending.example.com', status: 'pending' },
      ],
    });

    expect(payload).toEqual({
      schemaVersion: 1,
      tenantId: 'tenant-object-id',
      status: 'active',
      publicReadEnabled: false,
      allowedOrigins: ['https://kesk.org.tr', 'https://www.kesk.org.tr', 'https://tenant.example.com'],
      allowLocalhost: true,
      updatedAt: '2026-06-27T20:30:00.000Z',
    });
  });

  it('skips sync when Cloudflare KV sync is disabled', async () => {
    globalThis.fetch = vi.fn();

    const result = await edgeGatewaySyncService.syncTenantConfig({
      tenant: {
        _id: { toString: () => 'tenant-object-id' },
        status: 'active',
      },
    });

    expect(result).toEqual({ skipped: true, reason: 'edge_gateway_disabled' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('defaults localhost access on when tenant settings do not override it', () => {
    const payload = edgeGatewaySyncService.buildTenantPayload({
      tenant: {
        _id: { toString: () => 'tenant-object-id' },
        status: 'active',
      },
      settings: null,
    });

    expect(payload.allowLocalhost).toBe(true);
  });

  it('writes tenant config to the configured Cloudflare KV namespace', async () => {
    process.env.CF_EDGE_GATEWAY_ENABLED = 'true';
    process.env.CF_ACCOUNT_ID = 'account-id';
    process.env.CF_KV_NAMESPACE_ID = 'namespace-id';
    process.env.CF_API_TOKEN = 'cf-token';
    process.env.CF_KV_KEY_PREFIX = 'staging:';

    vi.spyOn(TenantSettings, 'findOne').mockReturnValue({
      lean: () => Promise.resolve({
        edgeGateway: {
          publicReadEnabled: true,
          allowLocalhost: false,
          allowedOrigins: ['https://kesk.org.tr'],
        },
      }),
    });
    mockNoVerifiedDomains();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    });

    const result = await edgeGatewaySyncService.syncTenantConfig({
      tenant: {
        _id: { toString: () => 'tenant-object-id' },
        status: 'active',
      },
    });

    expect(result.skipped).toBe(false);
    expect(result.key).toBe('staging:tenant:tenant-object-id');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/account-id/storage/kv/namespaces/namespace-id/values/staging%3Atenant%3Atenant-object-id');
    expect(options.method).toBe('PUT');
    expect(options.headers.Authorization).toBe('Bearer cf-token');
    expect(JSON.parse(options.body)).toMatchObject({
      schemaVersion: 1,
      tenantId: 'tenant-object-id',
      status: 'active',
      publicReadEnabled: true,
      allowedOrigins: ['https://kesk.org.tr'],
      allowLocalhost: false,
    });
  });

  it('writes API token config without storing the raw token', async () => {
    process.env.CF_EDGE_GATEWAY_ENABLED = 'true';
    process.env.CF_ACCOUNT_ID = 'account-id';
    process.env.CF_KV_NAMESPACE_ID = 'namespace-id';
    process.env.CF_API_TOKEN = 'cf-token';

    vi.spyOn(TenantSettings, 'findOne').mockReturnValue({
      lean: () => Promise.resolve({
        edgeGateway: {
          publicReadEnabled: true,
          allowLocalhost: true,
          allowedOrigins: ['https://kesk.org.tr'],
        },
      }),
    });
    mockNoVerifiedDomains();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    });

    const result = await edgeGatewaySyncService.syncApiTokenConfig({
      tenant: {
        _id: { toString: () => 'tenant-object-id' },
        status: 'active',
      },
      apiToken: {
        _id: { toString: () => 'token-id' },
        tenantId: 'tenant-object-id',
        hash: 'token-sha256-hash',
        role: 'viewer',
        scopes: ['read'],
        expiresAt: new Date('2026-07-27T20:30:00.000Z'),
      },
    });

    expect(result.skipped).toBe(false);
    expect(result.key).toBe('apikey:token-sha256-hash');

    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/account-id/storage/kv/namespaces/namespace-id/values/apikey%3Atoken-sha256-hash');
    const body = JSON.parse(options.body);
    expect(JSON.stringify(body)).not.toContain('ctx_');
    expect(body).toMatchObject({
      schemaVersion: 1,
      tenantId: 'tenant-object-id',
      tokenId: 'token-id',
      status: 'active',
      role: 'viewer',
      scopes: ['read'],
      expiresAt: '2026-07-27T20:30:00.000Z',
      allowedOrigins: ['https://kesk.org.tr'],
      allowLocalhost: true,
    });
  });

  it('deletes API token config from Cloudflare KV by hash key', async () => {
    process.env.CF_EDGE_GATEWAY_ENABLED = 'true';
    process.env.CF_ACCOUNT_ID = 'account-id';
    process.env.CF_KV_NAMESPACE_ID = 'namespace-id';
    process.env.CF_API_TOKEN = 'cf-token';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    });

    const result = await edgeGatewaySyncService.deleteApiTokenConfig({ hash: 'token-sha256-hash' });

    expect(result).toEqual({ skipped: false, key: 'apikey:token-sha256-hash' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account-id/storage/kv/namespaces/namespace-id/values/apikey%3Atoken-sha256-hash',
      {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer cf-token',
        },
      }
    );
  });
});
