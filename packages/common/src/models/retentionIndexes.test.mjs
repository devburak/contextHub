import { describe, expect, it } from 'vitest';

import models from './index.js';

const RETENTION_SECONDS = 180 * 24 * 60 * 60;

const ttlForCreatedAt = (model) =>
  model.schema
    .indexes()
    .find(
      ([fields]) => Object.keys(fields).length === 1 && fields.createdAt === 1
    )?.[1]?.expireAfterSeconds;

describe('retention indexes', () => {
  it('retains activity logs for 180 days', () => {
    expect(ttlForCreatedAt(models.ActivityLog)).toBe(RETENTION_SECONDS);
  });

  it('targets the live WebhookOutbox collection for 180-day retention', () => {
    expect(models.WebhookOutbox.collection.collectionName).toBe(
      'WebhookOutbox'
    );
    expect(ttlForCreatedAt(models.WebhookOutbox)).toBe(RETENTION_SECONDS);
  });

  it('targets the live DomainEvents collection for 180-day retention', () => {
    expect(models.DomainEvent.collection.collectionName).toBe('DomainEvents');
    expect(ttlForCreatedAt(models.DomainEvent)).toBe(RETENTION_SECONDS);
  });
});
