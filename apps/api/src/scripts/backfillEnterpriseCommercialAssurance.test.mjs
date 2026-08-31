import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const backfill = require('./backfillEnterpriseCommercialAssurance');

describe('Enterprise commercial assurance backfill', () => {
  it('is dry-run by default and requires an explicit apply flag', () => {
    expect(backfill.parseArgs([])).toEqual({ apply: false, tenantSlug: null });
    expect(backfill.parseArgs(['--apply', '--tenant-slug=acme'])).toEqual({
      apply: true,
      tenantSlug: 'acme',
    });
  });

  it('records legacy assurance without inventing invoice address or tax data', () => {
    const acceptedAt = new Date('2026-01-02T00:00:00.000Z');
    const update = backfill.buildEnterpriseAssuranceUpdate({
      subscriptionStartDate: acceptedAt,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    }, 'owner-1');

    expect(update).toMatchObject({
      billingProfileStatus: 'legacy_enterprise',
      paymentMethodStatus: 'enterprise_contract',
      serviceAgreementAcceptedAt: acceptedAt,
      serviceAgreementAcceptedBy: 'owner-1',
      status: 'active',
    });
    expect(update).not.toHaveProperty('address');
    expect(update).not.toHaveProperty('taxId');
    expect(update).not.toHaveProperty('declarationAcceptedAt');
  });
});
