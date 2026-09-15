import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { resolveTargetPlanSlug } = require('./backfillTenantSubscriptions');

describe('backfillTenantSubscriptions plan resolution', () => {
  it('prefers an explicit plan over stored tenant state', () => {
    expect(resolveTargetPlanSlug({
      plan: 'free',
      currentPlan: { slug: 'enterprise' },
    }, 'pro')).toBe('pro');
  });

  it('prefers the canonical currentPlan over a stale legacy plan string', () => {
    expect(resolveTargetPlanSlug({
      plan: 'free',
      currentPlan: { slug: 'enterprise' },
    })).toBe('enterprise');
  });

  it('falls back to the legacy plan when no reference exists', () => {
    expect(resolveTargetPlanSlug({ plan: 'promax', currentPlan: null })).toBe('promax');
  });
});
