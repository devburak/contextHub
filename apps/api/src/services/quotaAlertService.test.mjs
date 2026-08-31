import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildQuotaEmail, summarizeNotificationResults } = require('./quotaAlertService');

const alert = { metric: 'requests', threshold: 90, usage: 900, limit: 1000 };

describe('quota alert localization', () => {
  it('builds Turkish quota messages by default', () => {
    const message = buildQuotaEmail(alert);
    expect(message.subject).toBe('ContextHub kota uyarısı: %90');
    expect(message.message).toContain('aylık API isteği');
    expect(message.message).toContain('900/1000');
  });

  it('builds English quota messages for English profiles', () => {
    const message = buildQuotaEmail(alert, 'en-US');
    expect(message.subject).toBe('ContextHub quota alert: 90%');
    expect(message.message).toContain('monthly API request');
    expect(message.message).toContain('900/1000');
  });

  it('does not classify partial or failed delivery as sent', () => {
    expect(summarizeNotificationResults([
      { status: 'fulfilled', value: {} },
      { status: 'rejected', reason: new Error('SMTP unavailable') },
    ])).toMatchObject({ status: 'partial', recipients: 2, succeeded: 1, failed: 1 });
    expect(summarizeNotificationResults([
      { status: 'rejected', reason: new Error('SMTP unavailable') },
    ])).toMatchObject({ status: 'failed', succeeded: 0, failed: 1 });
  });
});
