import { describe, expect, it } from 'vitest';

import models from './index.js';

const findIndex = (model, fields) =>
  model.schema
    .indexes()
    .find(([candidate]) => JSON.stringify(candidate) === JSON.stringify(fields));

describe('domain event delivery models', () => {
  it('defines monotonic sequence indexes without requiring legacy rows to have a sequence', () => {
    const globalSequence = findIndex(models.DomainEvent, { sequence: 1 });
    const tenantSequence = findIndex(models.DomainEvent, {
      tenantId: 1,
      sequence: 1
    });
    const tenantTypeSequence = findIndex(models.DomainEvent, {
      tenantId: 1,
      type: 1,
      sequence: 1
    });

    expect(globalSequence?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { sequence: { $type: 'number' } }
    });
    expect(tenantSequence?.[1]).toMatchObject({
      partialFilterExpression: { sequence: { $type: 'number' } }
    });
    expect(tenantTypeSequence?.[1]).toMatchObject({
      partialFilterExpression: { sequence: { $type: 'number' } }
    });
    expect(models.DomainEvent.schema.path('sequence').isRequired).toBeFalsy();
  });

  it('keeps one cursor per consumer partition', () => {
    expect(models.DomainEventCursor.collection.collectionName).toBe(
      'DomainEventCursors'
    );
    expect(
      findIndex(models.DomainEventCursor, { consumer: 1, partition: 1 })?.[1]
    ).toMatchObject({ unique: true });
    expect(models.DomainEventCursor.schema.path('backfillStatus').enumValues).toEqual(
      ['pending', 'completed', 'failed']
    );
  });

  it('deduplicates dead letters by consumer partition and event sequence', () => {
    expect(models.DomainEventDeadLetter.collection.collectionName).toBe(
      'DomainEventDeadLetters'
    );
    expect(
      findIndex(models.DomainEventDeadLetter, {
        consumer: 1,
        partition: 1,
        eventSequence: 1
      })?.[1]
    ).toMatchObject({ unique: true });
  });
});
