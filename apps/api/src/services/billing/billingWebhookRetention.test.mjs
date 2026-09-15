import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  billingEventPayloadRetentionDays,
  minimizeIyzicoPayload,
  minimizePaddlePayload,
  payloadExpiresAt,
} = require('./billingWebhookService');

describe('billing webhook payload minimization and retention', () => {
  it('keeps reconciliation fields but drops Paddle personal and payment data', () => {
    const minimized = minimizePaddlePayload({
      event_id: 'evt_1',
      event_type: 'transaction.completed',
      occurred_at: '2026-08-22T10:00:00Z',
      data: {
        id: 'txn_1',
        customer_id: 'ctm_1',
        customer: { email: 'secret@example.com', name: 'Secret' },
        custom_data: { tenant_id: 'tenant-1', account_id: 'account-1', arbitrary: 'drop-me' },
        details: { totals: { subtotal: '1000', tax: '200', total: '1200' }, line_items: ['drop-me'] },
        payments: [{ captured_at: '2026-08-22T10:00:00Z', method_details: { card: { last4: '4242' } } }],
      },
    });

    expect(minimized.data.id).toBe('txn_1');
    expect(minimized.data.custom_data).toEqual({ tenant_id: 'tenant-1', account_id: 'account-1' });
    expect(minimized.data.details.totals.total).toBe('1200');
    expect(minimized.data.customer).toBeUndefined();
    expect(minimized.data.payments[0].method_details).toBeUndefined();
    expect(JSON.stringify(minimized)).not.toContain('secret@example.com');
    expect(JSON.stringify(minimized)).not.toContain('4242');
  });

  it('stores only the iyzico event identifiers required for reconciliation', () => {
    const minimized = minimizeIyzicoPayload({
      iyziReferenceCode: 'event-1',
      iyziEventType: 'subscription.order.success',
      iyziEventTime: 1787392800000,
      customerReferenceCode: 'customer-1',
      subscriptionReferenceCode: 'subscription-1',
      email: 'drop@example.com',
      paymentCard: { cardNumber: '5528790000000008' },
    });
    expect(minimized).toEqual({
      iyziReferenceCode: 'event-1',
      iyziEventType: 'subscription.order.success',
      iyziEventTime: 1787392800000,
      customerReferenceCode: 'customer-1',
      subscriptionReferenceCode: 'subscription-1',
    });
  });

  it('uses a bounded configurable retention period', () => {
    vi.stubEnv('BILLING_EVENT_PAYLOAD_RETENTION_DAYS', '14');
    expect(billingEventPayloadRetentionDays()).toBe(14);
    expect(payloadExpiresAt(new Date('2026-08-01T00:00:00Z')).toISOString()).toBe('2026-08-15T00:00:00.000Z');
    vi.stubEnv('BILLING_EVENT_PAYLOAD_RETENTION_DAYS', '900');
    expect(billingEventPayloadRetentionDays()).toBe(365);
    vi.unstubAllEnvs();
  });
});
