import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { paymentMessage, recipientAddress, sendCustomerPaymentNotification } = require('./customerPaymentNotificationService');
const data = {
  billingEmail: 'Customer@example.test', tenantName: 'Acme <script>alert(1)</script>', planName: 'Pro',
  amountMinor: 49900, currency: 'TRY', interval: 'month', occurredAt: '2026-09-18T19:00:26Z',
};

describe('customer payment notification', () => {
  it('uses the billing address, global mail service, and separate HTML/plain text', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'receipt-1', accepted: ['customer@example.test'] });
    await expect(sendCustomerPaymentNotification(data, { mail: { sendMail } })).resolves.toEqual({ sent: true, messageId: 'receipt-1' });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'customer@example.test', text: expect.stringContaining('499.00 TRY'),
      html: expect.stringContaining('&lt;script&gt;'),
    }));
    const message = sendMail.mock.calls[0][0];
    expect(message.html).not.toContain('<script>');
    expect(message.text).toContain('fatura veya e-Arşiv fatura değildir');
    expect(message.text).toContain('22:00');
    expect(message.cc).toBeUndefined();
    expect(message.bcc).toBeUndefined();
    expect(sendMail.mock.calls[0]).toHaveLength(1);
  });
  it('distinguishes prorated one-time payment from future recurring charges', () => {
    const message = paymentMessage({ ...data, paymentKind: 'plan_change', planName: 'Pro Max', amountMinor: 50000,
      recurringAmountMinor: 149900, nextBillingAt: '2026-10-18T19:00:26Z' });
    expect(message.text).toContain('tek seferlik');
    expect(message.text).toContain('500.00 TRY');
    expect(message.text).toContain('1499.00 TRY');
    expect(message.text).toContain('yeni ve ayrı bir abonelik değildir');
    expect(message.subject).toContain('Paket geçişi');
  });
  it.each(['', 'a@example.test,b@example.test', 'a@example.test\r\nBcc: b@example.test', 'Display <a@example.test>'])('rejects invalid/multiple recipients: %s', (address) => {
    expect(() => recipientAddress(address)).toThrow('valid billing email');
  });
  it('does not claim delivery when SMTP rejects the address', async () => {
    await expect(sendCustomerPaymentNotification(data, { mail: { sendMail: vi.fn().mockResolvedValue({ messageId: 'id', accepted: [], rejected: ['customer@example.test'] }) } })).rejects.toThrow('not accepted');
  });
  it.each([{ amountMinor: -1 }, { amountMinor: 1.5 }, { occurredAt: 'invalid' }])('rejects incomplete/unverified amount or timestamp', (invalid) => {
    expect(() => paymentMessage({ ...data, ...invalid })).toThrow();
  });
});
