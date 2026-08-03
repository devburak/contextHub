import { describe, expect, it, vi } from 'vitest'

import { __testables } from './domainEvents'

const { allocateDomainEventSequence, recordDomainEvent } = __testables

function createDb({ counterResult = { value: { sequence: 1 } } } = {}) {
  const counters = {
    findOneAndUpdate: vi.fn().mockResolvedValue(counterResult)
  }
  const events = {
    insertOne: vi.fn().mockResolvedValue({ acknowledged: true })
  }
  const collection = vi.fn((name) => {
    if (name === 'DomainEventCounters') return counters
    if (name === 'DomainEvents') return events
    throw new Error(`Unexpected collection: ${name}`)
  })

  return { db: { collection }, counters, events, collection }
}

describe('domain event sequences', () => {
  it('allocates the global sequence atomically', async () => {
    const { db, counters } = createDb({
      counterResult: { value: { sequence: 42 } }
    })
    const now = new Date('2026-08-03T10:00:00.000Z')

    await expect(allocateDomainEventSequence(db, now)).resolves.toBe(42)
    expect(counters.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'domainEvents' },
      {
        $inc: { sequence: 1 },
        $set: { updatedAt: now },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true, returnDocument: 'after' }
    )
  })

  it('supports the newer driver document return shape', async () => {
    const { db } = createDb({ counterResult: { sequence: 7 } })

    await expect(allocateDomainEventSequence(db)).resolves.toBe(7)
  })

  it('rejects an invalid counter result instead of inserting an unordered event', async () => {
    const { db } = createDb({ counterResult: { value: null } })

    await expect(allocateDomainEventSequence(db)).rejects.toThrow(
      'Failed to allocate a valid event sequence'
    )
  })

  it('writes the allocated sequence into the event before returning its id', async () => {
    const { db, events } = createDb({
      counterResult: { value: { sequence: 11 } }
    })
    const now = new Date('2026-08-03T12:30:00.000Z')

    const eventId = await recordDomainEvent(
      'tenant-a',
      'content.published',
      { contentId: 'content-1' },
      { source: 'test' },
      {
        db,
        randomUUID: () => 'event-1',
        now: () => now
      }
    )

    expect(eventId).toBe('event-1')
    expect(events.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'event-1',
        id: 'event-1',
        sequence: 11,
        tenantId: 'tenant-a',
        type: 'content.published',
        occurredAt: now.toISOString()
      })
    )
  })

  it('does not allocate a sequence for invalid events', async () => {
    const { db, counters, events } = createDb()

    await expect(
      recordDomainEvent(null, 'content.published', {}, null, { db })
    ).resolves.toBeNull()
    await expect(
      recordDomainEvent('tenant-a', 'unknown.event', {}, null, { db })
    ).resolves.toBeNull()

    expect(counters.findOneAndUpdate).not.toHaveBeenCalled()
    expect(events.insertOne).not.toHaveBeenCalled()
  })
})
