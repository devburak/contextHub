import { describe, expect, it, vi } from 'vitest'

import {
  DomainEventConsumerLeaseLostError,
  createDomainEventConsumerStore
} from './domainEventConsumerStore'

const registration = Object.freeze({
  name: 'semantic-search-indexer',
  types: Object.freeze(['content.published', 'content.updated']),
  batchSize: 100,
  initialPosition: 'latest'
})

function createCollections() {
  const events = {
    findOne: vi.fn(),
    find: vi.fn()
  }
  const cursors = {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn()
  }
  const deadLetters = {
    find: vi.fn(),
    updateOne: vi.fn()
  }
  const db = {
    collection: vi.fn((name) => {
      if (name === 'DomainEvents') return events
      if (name === 'DomainEventCursors') return cursors
      if (name === 'DomainEventDeadLetters') return deadLetters
      throw new Error(`Unexpected collection: ${name}`)
    })
  }
  return { db, events, cursors, deadLetters }
}

describe('domain event consumer store', () => {
  it('initializes latest from the tenant inserted-event high watermark', async () => {
    const { db, events, cursors } = createCollections()
    const now = new Date('2026-08-03T14:00:00.000Z')
    const initialized = {
      _id: 'cursor-1',
      consumer: registration.name,
      partition: 'tenant:tenant-a',
      initialPosition: 'latest',
      lastSequence: 17,
      highWatermark: 17
    }
    cursors.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(initialized)
    cursors.updateOne.mockResolvedValue({ matchedCount: 0, upsertedCount: 1 })
    events.findOne.mockResolvedValue({ sequence: 17 })
    const store = createDomainEventConsumerStore({ db, clock: () => now })

    await expect(store.initializeCursor(registration, 'tenant-a')).resolves.toBe(
      initialized
    )
    expect(events.findOne).toHaveBeenCalledWith(
      { tenantId: 'tenant-a', sequence: { $type: 'number' } },
      { sort: { sequence: -1 }, projection: { sequence: 1 } }
    )
    expect(cursors.updateOne).toHaveBeenCalledWith(
      { consumer: registration.name, partition: 'tenant:tenant-a' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          lastSequence: 17,
          highWatermark: 17,
          initialPosition: 'latest'
        })
      }),
      { upsert: true }
    )
  })

  it('fails fast when a persisted cursor start policy drifts', async () => {
    const { db, cursors } = createCollections()
    cursors.findOne.mockResolvedValue({
      consumer: registration.name,
      partition: 'tenant:tenant-a',
      initialPosition: 'earliest'
    })
    const store = createDomainEventConsumerStore({ db })

    await expect(
      store.initializeCursor(registration, 'tenant-a')
    ).rejects.toMatchObject({ code: 'DOMAIN_EVENT_CONSUMER_CONFIG_DRIFT' })
  })

  it('claims a due, expired tenant lease with owner-token CAS', async () => {
    const { db, cursors } = createCollections()
    const now = new Date('2026-08-03T14:00:00.000Z')
    const claimed = { _id: 'cursor-1', leaseOwner: 'runner-1' }
    cursors.findOneAndUpdate.mockResolvedValue({ value: claimed })
    const store = createDomainEventConsumerStore({
      db,
      clock: () => now,
      leaseDurationMs: 30000
    })

    await expect(
      store.acquireLease(registration, 'tenant-a', 'runner-1')
    ).resolves.toBe(claimed)
    expect(cursors.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        consumer: registration.name,
        partition: 'tenant:tenant-a',
        active: true,
        backfillStatus: { $in: [null, 'completed'] },
        $and: expect.any(Array)
      }),
      {
        $set: {
          leaseOwner: 'runner-1',
          leaseUntil: new Date('2026-08-03T14:00:30.000Z'),
          updatedAt: now
        }
      },
      { returnDocument: 'after' }
    )
  })

  it('reads sequence-ordered tenant events without webhook status filtering', async () => {
    const { db, events } = createCollections()
    const toArray = vi.fn().mockResolvedValue([])
    const limit = vi.fn(() => ({ toArray }))
    const sort = vi.fn(() => ({ limit }))
    events.find.mockReturnValue({ sort })
    const store = createDomainEventConsumerStore({ db })

    await store.readEvents(registration, 'tenant-a', 12)

    expect(events.find).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      type: { $in: registration.types },
      sequence: { $gt: 12 }
    })
    expect(sort).toHaveBeenCalledWith({ sequence: 1 })
    expect(limit).toHaveBeenCalledWith(100)
  })

  it('uses owner and expected sequence when advancing the cursor', async () => {
    const { db, cursors } = createCollections()
    cursors.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 })
    const store = createDomainEventConsumerStore({ db })

    await store.advanceCursor(
      { _id: 'cursor-1' },
      'runner-1',
      12,
      15
    )

    expect(cursors.updateOne).toHaveBeenCalledWith(
      {
        _id: 'cursor-1',
        active: true,
        leaseOwner: 'runner-1',
        lastSequence: 12
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          lastSequence: 15,
          leaseOwner: null,
          attempt: 0
        })
      })
    )
  })

  it('rejects stale-owner cursor advancement', async () => {
    const { db, cursors } = createCollections()
    cursors.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 })
    const store = createDomainEventConsumerStore({ db })

    await expect(
      store.advanceCursor({ _id: 'cursor-1' }, 'old-runner', 12, 13)
    ).rejects.toBeInstanceOf(DomainEventConsumerLeaseLostError)
  })

  it('persists an idempotent consumer-specific dead letter', async () => {
    const { db, deadLetters } = createCollections()
    deadLetters.updateOne.mockResolvedValue({ upsertedCount: 1 })
    const store = createDomainEventConsumerStore({ db })
    const event = {
      id: 'event-13',
      sequence: 13,
      tenantId: 'tenant-a',
      type: 'content.updated'
    }

    await store.persistDeadLetter({
      registration,
      cursor: { partition: 'tenant:tenant-a' },
      tenantId: 'tenant-a',
      event,
      attempt: 8,
      error: { name: 'Error', message: 'poison' }
    })

    expect(deadLetters.updateOne).toHaveBeenCalledWith(
      {
        consumer: registration.name,
        partition: 'tenant:tenant-a',
        eventSequence: 13
      },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          eventId: 'event-13',
          eventSequence: 13,
          event
        }),
        $set: expect.objectContaining({ attempts: 8 })
      }),
      { upsert: true }
    )
  })
})
