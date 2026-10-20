import { describe, it, expect } from 'vitest';
import webhooksLib from './webhooks';

const { buildWebhookOutboxJobs, isWebhookSubscribed } = webhooksLib;

describe('isWebhookSubscribed', () => {
  const event = {
    id: 'evt_1',
    tenantId: 'tenant_a',
    type: 'content.created',
    occurredAt: new Date().toISOString(),
    payload: {},
    metadata: null
  };

  it('returns true when webhook listens to all events', () => {
    const result = isWebhookSubscribed({ tenantId: 'tenant_a', isActive: true, events: ['*'] }, event);
    expect(result).toBe(true);
  });

  it('returns true when webhook explicitly subscribes to the event type', () => {
    const result = isWebhookSubscribed({ tenantId: 'tenant_a', isActive: true, events: ['content.created'] }, event);
    expect(result).toBe(true);
  });

  it('returns false for inactive or misconfigured webhooks', () => {
    expect(isWebhookSubscribed({ tenantId: 'tenant_a', isActive: false, events: ['*'] }, event)).toBe(false);
    expect(isWebhookSubscribed({ tenantId: 'tenant_a', isActive: true, events: [] }, event)).toBe(false);
    expect(isWebhookSubscribed({ tenantId: 'tenant_a', isActive: true }, event)).toBe(false);
  });

  it('returns false if event type is not listed', () => {
    const result = isWebhookSubscribed({ tenantId: 'tenant_a', isActive: true, events: ['content.updated'] }, event);
    expect(result).toBe(false);
  });
  it('combines locale, environment and collection filters even for wildcard subscriptions', () => {
    const hook = { tenantId: 'tenant_a', isActive: true, events: ['*'], filters: { locales: ['tr'], environments: ['production'], collectionKeys: ['news'] } };
    const filtered = { ...event, type: 'collection.entry.updated', payload: { locale: 'tr', collectionKey: 'news' }, metadata: { environment: 'production' } };
    expect(isWebhookSubscribed(hook, filtered)).toBe(true);
    expect(isWebhookSubscribed(hook, { ...filtered, metadata: { environment: 'development' } })).toBe(false);
    expect(isWebhookSubscribed(hook, { ...filtered, payload: {} })).toBe(false);
  });
});

describe('buildWebhookOutboxJobs', () => {
  const baseEvent = {
    id: 'evt_1',
    tenantId: 'tenant_a',
    type: 'content.created',
    occurredAt: new Date().toISOString(),
    payload: { foo: 'bar' },
    metadata: { triggeredBy: 'user' }
  };

  it('creates jobs for matching webhooks only', () => {
    const hooks = [
      { _id: 'hook1', tenantId: 'tenant_a', isActive: true, events: ['*'] },
      { _id: 'hook2', tenantId: 'tenant_a', isActive: true, events: ['content.updated'] },
      { _id: 'hook3', tenantId: 'tenant_a', isActive: false, events: ['content.created'] }
    ];

    const jobs = buildWebhookOutboxJobs(baseEvent, hooks);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      tenantId: 'tenant_a',
      webhookId: 'hook1',
      eventId: 'evt_1',
      type: 'content.created',
      status: 'pending'
    });
  });

  it('never fans out to another tenant, even for wildcard hooks', () => {
    const jobs = buildWebhookOutboxJobs(baseEvent, [
      { _id: 'ours', tenantId: 'tenant_a', isActive: true, events: ['*'] },
      { _id: 'foreign', tenantId: 'tenant_b', isActive: true, events: ['*'] },
      { _id: 'unscoped', isActive: true, events: ['*'] }
    ]);
    expect(jobs.map((job) => job.webhookId)).toEqual(['ours']);
    expect(buildWebhookOutboxJobs({ ...baseEvent, tenantId: null }, [{ _id: 'unscoped', isActive: true, events: ['*'] }])).toEqual([]);
  });

  it('clones the payload to avoid accidental mutation', () => {
    const hooks = [{ _id: 'hook1', tenantId: 'tenant_a', isActive: true, events: ['*'] }];
    const event = { ...baseEvent, payload: { nested: { value: 1 } } };

    const jobs = buildWebhookOutboxJobs(event, hooks);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload).not.toBe(event);
    expect(jobs[0].payload).toEqual(event);

    // mutate original event and ensure job payload stays intact
    event.payload.nested.value = 99;
    expect(jobs[0].payload.payload.nested.value).toBe(1);
  });
  it('removes form answers and personal data from identifiers-only deliveries', () => {
    const event = { ...baseEvent, type: 'form.submitted', payload: { formId: 'form', response: { responseId: 'response', userEmail: 'private@example.com', data: { private: true } } } };
    const jobs = buildWebhookOutboxJobs(event, [{ _id: 'hook', tenantId: 'tenant_a', isActive: true, events: ['*'], payloadMode: 'ids' }]);
    expect(jobs[0].payload.payload).toEqual({ formId: 'form', responseId: 'response' });
    expect(JSON.stringify(jobs[0])).not.toContain('private');
    expect(jobs[0].dedupeKey).toBe('tenant_a:hook:evt_1');
  });
});
