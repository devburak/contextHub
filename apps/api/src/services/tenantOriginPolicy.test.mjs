import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Domain, Tenant, TenantSettings } = require('@contexthub/common');
const originPolicy = require('./tenantOriginPolicy');

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  AUTH_TRUSTED_ORIGINS: process.env.AUTH_TRUSTED_ORIGINS,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  ADMIN_URL: process.env.ADMIN_URL,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function mockPolicyData() {
  vi.spyOn(Tenant, 'find').mockReturnValue({
    select: () => ({
      lean: () => Promise.resolve([{ _id: { toString: () => 'tenant-1' } }]),
    }),
  });
  vi.spyOn(TenantSettings, 'find').mockReturnValue({
    select: () => ({
      lean: () => Promise.resolve([{
        tenantId: { toString: () => 'tenant-1' },
        edgeGateway: {
          allowLocalhost: false,
          allowedOrigins: ['https://site.example.com', 'https://*.tenant.example'],
        },
      }]),
    }),
  });
  vi.spyOn(Domain, 'find').mockReturnValue({
    select: () => ({
      lean: () => Promise.resolve([{
        tenantId: { toString: () => 'tenant-1' },
        host: 'verified.example.net',
        status: 'verified',
      }]),
    }),
  });
  originPolicy.invalidateTenantOriginPolicyCache();
}

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
  originPolicy.invalidateTenantOriginPolicyCache();
});

describe('tenantOriginPolicy', () => {
  it('matches exact origins and wildcard subdomains without matching the apex', () => {
    const policy = {
      allowLocalhost: false,
      allowedOrigins: ['https://site.example.com', 'https://*.tenant.example'],
    };

    expect(originPolicy.originMatchesPolicy('https://site.example.com', policy)).toBe(true);
    expect(originPolicy.originMatchesPolicy('https://app.tenant.example', policy)).toBe(true);
    expect(originPolicy.originMatchesPolicy('https://tenant.example', policy)).toBe(false);
    expect(originPolicy.originMatchesPolicy('https://attacker.example', policy)).toBe(false);
  });

  it('allows central admin origins with credentials', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_TRUSTED_ORIGINS = 'https://admin.ctxhub.example';
    process.env.CORS_ORIGIN = 'https://legacy-public.example';

    const options = await originPolicy.resolveCorsOptions({
      headers: { origin: 'https://admin.ctxhub.example' },
      query: {},
    });

    expect(options.origin).toBe('https://admin.ctxhub.example');
    expect(options.credentials).toBe(true);
  });

  it('allows tenant website origins without enabling session credentials', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_TRUSTED_ORIGINS = 'https://admin.ctxhub.example';
    mockPolicyData();

    const options = await originPolicy.resolveCorsOptions({
      headers: { origin: 'https://verified.example.net' },
      query: { tenantId: 'tenant-1' },
    });

    expect(options.origin).toBe('https://verified.example.net');
    expect(options.credentials).toBe(false);
  });

  it('rejects a tenant origin when it is used with another tenant id', async () => {
    process.env.NODE_ENV = 'production';
    mockPolicyData();

    const options = await originPolicy.resolveCorsOptions({
      headers: { origin: 'https://site.example.com' },
      query: { tenantId: 'tenant-2' },
    });

    expect(options.origin).toBe(false);
    expect(options.credentials).toBe(false);
  });
});
