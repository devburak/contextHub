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
    const result = isWebhookSubscribed({ isActive: true, events: ['*'] }, event);
    expect(result).toBe(true);
  });

  it('returns true when webhook explicitly subscribes to the event type', () => {
    const result = isWebhookSubscribed({ isActive: true, events: ['content.created'] }, event);
    expect(result).toBe(true);
  });

  it('returns false for inactive or misconfigured webhooks', () => {
    expect(isWebhookSubscribed({ isActive: false, events: ['*'] }, event)).toBe(false);
    expect(isWebhookSubscribed({ isActive: true, events: [] }, event)).toBe(false);
    expect(isWebhookSubscribed({ isActive: true }, event)).toBe(false);
  });

  it('returns false if event type is not listed', () => {
    const result = isWebhookSubscribed({ isActive: true, events: ['content.updated'] }, event);
    expect(result).toBe(false);
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
      { _id: 'hook1', isActive: true, events: ['*'] },
      { _id: 'hook2', isActive: true, events: ['content.updated'] },
      { _id: 'hook3', isActive: false, events: ['content.created'] }
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

  it('clones the payload to avoid accidental mutation', () => {
    const hooks = [{ _id: 'hook1', isActive: true, events: ['*'] }];
    const event = { ...baseEvent, payload: { nested: { value: 1 } } };

    const jobs = buildWebhookOutboxJobs(event, hooks);

    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload).not.toBe(event);
    expect(jobs[0].payload).toEqual(event);

    // mutate original event and ensure job payload stays intact
    event.payload.nested.value = 99;
    expect(jobs[0].payload.payload.nested.value).toBe(1);
  });
});
