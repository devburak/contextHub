import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { BillingAccount, Tenant } = require('@contexthub/common');

describe('tenant provisioning security contract', () => {
  it('does not accept a plan in the public tenant creation contract', () => {
    const source = fs.readFileSync(new URL('../routes/tenants.js', import.meta.url), 'utf8');
    const createRoute = source.slice(source.indexOf("fastify.post('/tenants'"), source.indexOf("fastify.get('/tenants'"));
    const requestContract = createRoute.slice(0, createRoute.indexOf('response:'));

    expect(requestContract).toContain('additionalProperties: false');
    expect(requestContract).not.toMatch(/plan:\s*\{\s*type:/);
    expect(createRoute).not.toMatch(/createTenant\(\{[^}]*plan/);
  });

  it('does not provision tenants from unauthenticated registration payloads', () => {
    const routeSource = fs.readFileSync(new URL('../routes/auth.js', import.meta.url), 'utf8');
    const registerRoute = routeSource.slice(
      routeSource.indexOf("fastify.post('/auth/register'"),
      routeSource.indexOf("fastify.post('/auth/refresh'")
    );
    const serviceSource = fs.readFileSync(new URL('./authService.js', import.meta.url), 'utf8');
    const registerService = serviceSource.slice(
      serviceSource.indexOf('async register('),
      serviceSource.indexOf('async refreshToken(')
    );

    expect(registerRoute).toContain('additionalProperties: false');
    expect(registerRoute).not.toMatch(/tenantName:\s*\{/);
    expect(registerRoute).not.toMatch(/tenantSlug:\s*\{/);
    expect(registerService).not.toContain('new Tenant(');
  });

  it('enforces one public self-service bootstrap tenant per creator at database level', () => {
    const index = Tenant.schema.indexes().find(([, options]) => (
      options.unique && options.partialFilterExpression?.provisioningChannel === 'self_service'
    ));

    expect(index?.[0]).toEqual({ createdBy: 1, provisioningChannel: 1 });
  });

  it('removes direct plan mutation even from the platform custom-limit route', () => {
    const source = fs.readFileSync(new URL('../routes/subscriptionPlans.js', import.meta.url), 'utf8');
    const route = source.slice(source.indexOf("fastify.put('/tenants/:tenantId/subscription'"));

    expect(route).not.toMatch(/planSlug:\s*\{\s*type:/);
    expect(route).not.toContain('applyPlanToTenant(tenant, planSlug)');
    expect(route).toContain("required: ['customLimits']");
  });

  it('stores auditable agreement and payment assurance independently', () => {
    expect(BillingAccount.schema.path('serviceAgreementAcceptedAt')).toBeTruthy();
    expect(BillingAccount.schema.path('serviceAgreementAcceptedBy')).toBeTruthy();
    expect(BillingAccount.schema.path('billingProfileStatus')?.options.enum).toContain('legacy_enterprise');
    expect(BillingAccount.schema.path('paymentMethodStatus')?.options.enum).toEqual([
      'none',
      'provider_verified',
      'enterprise_contract',
    ]);
  });
});
