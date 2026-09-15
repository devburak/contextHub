import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  createHostedOperationsNotificationService,
  paymentReceivedMessage,
  tenantCreatedMessage,
} = require('./hostedOperationsNotificationService');

const fixedDate = new Date('2026-08-31T20:00:00.000Z');

describe('hosted operations notifications', () => {
  it('fails closed when hosted notifications are disabled', async () => {
    const sendMail = vi.fn();
    const service = createHostedOperationsNotificationService({ mail: { sendMail }, env: {} });

    await expect(service.notifyTenantCreated({})).resolves.toEqual({ sent: false, disabled: true });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends tenant creation details to the configured operations mailbox', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'message-1' });
    const service = createHostedOperationsNotificationService({
      mail: { sendMail },
      env: {
        HOSTED_OPERATIONS_NOTIFICATIONS_ENABLED: 'true',
        HOSTED_OPERATIONS_NOTIFICATION_RECIPIENT: 'iletisim@ikon-x.com.tr',
      },
      clock: () => fixedDate,
    });

    await service.notifyTenantCreated({
      tenantName: 'Acme <Test>',
      tenantSlug: 'acme-test',
      ownerEmail: 'owner@example.test',
      plan: 'free',
    });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'iletisim@ikon-x.com.tr',
      subject: '[ContextHub] Yeni tenant oluşturuldu: acme-test',
      text: expect.stringContaining('Açan kullanıcı: owner@example.test'),
      html: expect.not.stringContaining('Acme <Test>'),
    }));
  });

  it('formats verified payment amount, plan and tenant slug', () => {
    const message = paymentReceivedMessage({
      tenantName: 'Acme',
      tenantSlug: 'acme',
      ownerEmail: 'owner@example.test',
      plan: 'pro',
      amountMinor: 49900,
      currency: 'TRY',
    }, fixedDate);

    expect(message.subject).toContain('499.00 TRY');
    expect(message.text).toContain('Paket: pro');
    expect(message.text).toContain('Tenant slug: acme');
    expect(message.text).toContain('Ödeme miktarı: 499.00 TRY');
  });

  it('rejects malformed notification data before sending', () => {
    expect(() => tenantCreatedMessage({ tenantName: 'Acme' }, fixedDate)).toThrow(/tenantSlug/);
    expect(() => paymentReceivedMessage({
      tenantName: 'Acme',
      tenantSlug: 'acme',
      ownerEmail: 'owner@example.test',
      plan: 'pro',
      amountMinor: 1.5,
      currency: 'TRY',
    }, fixedDate)).toThrow(/minor-unit/);
  });
});
