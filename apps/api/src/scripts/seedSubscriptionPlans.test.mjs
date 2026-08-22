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

  it('skips optional local prices until a TRY amount is explicitly configured', () => {
    const localPrice = {
      key: 'pro.iyzico.month.try',
      envKey: 'IYZICO_PLAN_PRO_MONTH',
      amountEnvKey: 'IYZICO_AMOUNT_PRO_MONTH_MINOR',
      provider: 'iyzico',
      interval: 'month',
      currency: 'TRY',
      optional: true,
    };

    expect(buildPlanPriceUpdate(localPrice, 'plan-id', {})).toBeNull();
    expect(buildPlanPriceUpdate(localPrice, 'plan-id', {
      IYZICO_PLAN_PRO_MONTH: 'plan-ref',
      IYZICO_AMOUNT_PRO_MONTH_MINOR: '49900',
    })).toMatchObject({ provider: 'iyzico', currency: 'TRY', amountMinor: 49900, externalPriceId: 'plan-ref' });
  });
});
