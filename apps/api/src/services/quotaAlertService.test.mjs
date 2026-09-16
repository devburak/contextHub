import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildQuotaEmail, summarizeNotificationResults } = require('./quotaAlertService');

const alert = { metric: 'requests', threshold: 90, usage: 900, limit: 1000 };
const tenant = { name: 'ContextHub Demo', slug: 'contexthub-demo' };

describe('quota alert localization', () => {
  it('builds Turkish quota messages by default', () => {
    const message = buildQuotaEmail(alert, 'tr', tenant);
    expect(message.subject).toBe('ContextHub kota uyarısı: ContextHub Demo (contexthub-demo) · %90');
    expect(message.message).toContain('<strong>Tenant:</strong> ContextHub Demo');
    expect(message.message).toContain('<strong>Slug:</strong> contexthub-demo');
    expect(message.message).toContain('aylık API isteği');
    expect(message.message).toContain('900/1000');
  });

  it('builds English quota messages for English profiles', () => {
    const message = buildQuotaEmail(alert, 'en-US', tenant);
    expect(message.subject).toBe('ContextHub quota alert: ContextHub Demo (contexthub-demo) · 90%');
    expect(message.message).toContain('monthly API request');
    expect(message.message).toContain('900/1000');
  });

  it('escapes tenant details in HTML and strips line breaks from the subject', () => {
    const message = buildQuotaEmail(alert, 'tr', {
      name: 'Demo <Tenant>\nInjected',
      slug: 'demo&tenant',
    });
    expect(message.subject).toBe('ContextHub kota uyarısı: Demo Tenant Injected (demo&tenant) · %90');
    expect(message.message).toContain('Demo &lt;Tenant&gt; Injected');
    expect(message.message).toContain('demo&amp;tenant');
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
