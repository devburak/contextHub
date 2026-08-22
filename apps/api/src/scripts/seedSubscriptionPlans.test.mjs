import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildPlanPriceUpdate } = require('./seedSubscriptionPlans');

describe('subscription plan seed safety', () => {
  const price = {
    envKey: 'PADDLE_PRICE_PRO_MONTH',
    provider: 'paddle',
    interval: 'month',
    currency: 'USD',
    amountMinor: 1200,
  };

  it('does not erase an existing provider price ID when the env value is absent', () => {
    const update = buildPlanPriceUpdate(price, 'plan-id', {});

    expect(update).not.toHaveProperty('externalPriceId');
  });

  it('sets a trimmed provider price ID when it is configured', () => {
    const update = buildPlanPriceUpdate(price, 'plan-id', {
      PADDLE_PRICE_PRO_MONTH: ' pri_live_123 ',
    });

    expect(update.externalPriceId).toBe('pri_live_123');
  });
});
