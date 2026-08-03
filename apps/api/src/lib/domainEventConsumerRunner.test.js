import { describe, expect, it, vi } from 'vitest'

import { createDomainEventConsumerRegistry } from './domainEventConsumerRegistry'
import {
  calculateRetryDelay,
  createDomainEventConsumerRunner
} from './domainEventConsumerRunner'

const NOW = new Date('2026-08-03T15:00:00.000Z')

function event(sequence) {
  return {
    _id: `event-${sequence}`,
    id: `event-${sequence}`,
    sequence,
    tenantId: 'tenant-a',
    type: 'content.updated',
    occurredAt: NOW.toISOString(),
    payload: {}
  }
}

function setup({
  handle = vi.fn().mockResolvedValue(undefined),
  maxAttempts = 3,
  cursor = {}
} = {}) {
  const registry = createDomainEventConsumerRegistry()
  registry.register('test-consumer', {
    types: ['content.updated'],
    batchSize: 10,
    maxAttempts,
    retry: { baseDelayMs: 1000, maxDelayMs: 10000, multiplier: 2 },
    initialPosition: 'earliest',
    handle
  })
  const storedCursor = {
    _id: 'cursor-1',
    consumer: 'test-consumer',
    partition: 'tenant:tenant-a',
    active: true,
    initialPosition: 'earliest',
    lastSequence: 0,
    failureSequence: null,
    attempt: 0,
    nextAttemptAt: null,
    backfillStatus: null,
    ...cursor
  }
  const store = {
    initializeCursor: vi.fn().mockResolvedValue(storedCursor),
    acquireLease: vi.fn().mockResolvedValue(storedCursor),
    getCursor: vi.fn().mockResolvedValue(storedCursor),
    readEvents: vi.fn().mockResolvedValue([]),
    readDeadLetterSequences: vi.fn().mockResolvedValue(new Set()),
    renewLease: vi.fn().mockResolvedValue(new Date(NOW.getTime() + 30000)),
    releaseLease: vi.fn().mockResolvedValue(true),
    scheduleRetry: vi.fn().mockResolvedValue(undefined),
    persistDeadLetter: vi.fn().mockResolvedValue(undefined),
    advanceCursor: vi.fn().mockResolvedValue(undefined),
    completeBackfill: vi.fn().mockResolvedValue(undefined)
  }
  const logger = { error: vi.fn() }
  const runner = createDomainEventConsumerRunner({
    registry,
    store,
    ownerId: 'runner-1',
    clock: () => NOW,
    logger
  })
  return { handle, logger, registry, runner, store, storedCursor }
}

describe('domain event consumer runner', () => {
  it('delivers tenant events in sequence and advances only after all succeed', async () => {
    const context = setup()
    context.store.readEvents.mockResolvedValue([event(2), event(5)])

    await expect(
      context.runner.runPartition('test-consumer', 'tenant-a')
    ).resolves.toMatchObject({
      status: 'processed',
      processed: 2,
      fromSequence: 0,
      toSequence: 5
    })
    expect(context.handle).toHaveBeenNthCalledWith(
      1,
      [expect.objectContaining({ sequence: 2 })],
      expect.objectContaining({ partition: 'tenant:tenant-a', attempt: 1 })
    )
    expect(context.handle).toHaveBeenNthCalledWith(
      2,
      [expect.objectContaining({ sequence: 5 })],
      expect.any(Object)
    )
    expect(context.store.advanceCursor).toHaveBeenCalledOnce()
    expect(context.store.advanceCursor).toHaveBeenCalledWith(
      context.storedCursor,
      'runner-1',
      0,
      5
    )
  })

  it('schedules exponential retry without moving the cursor', async () => {
    const handle = vi.fn().mockRejectedValue(new Error('temporary'))
    const context = setup({ handle })
    context.store.readEvents.mockResolvedValue([event(1), event(2)])

    await expect(
      context.runner.runPartition('test-consumer', 'tenant-a')
    ).resolves.toMatchObject({
      status: 'retry-scheduled',
      eventSequence: 1,
      attempt: 1,
      nextAttemptAt: new Date('2026-08-03T15:00:01.000Z')
    })
    expect(context.store.scheduleRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedLastSequence: 0,
        eventSequence: 1,
        attempt: 1,
        nextAttemptAt: new Date('2026-08-03T15:00:01.000Z')
      })
    )
    expect(context.store.advanceCursor).not.toHaveBeenCalled()
    expect(handle).toHaveBeenCalledOnce()
  })

  it('persists DLQ before advancing past a poison event at max attempts', async () => {
    const handle = vi.fn().mockRejectedValue(new Error('poison'))
    const context = setup({
      handle,
      maxAttempts: 3,
      cursor: { failureSequence: 7, attempt: 2 }
    })
    context.store.readEvents.mockResolvedValue([event(7), event(8)])

    await expect(
      context.runner.runPartition('test-consumer', 'tenant-a')
    ).resolves.toMatchObject({
      status: 'dead-lettered',
      eventSequence: 7,
      attempt: 3
    })
    expect(context.store.persistDeadLetter).toHaveBeenCalledOnce()
    expect(context.store.advanceCursor).toHaveBeenCalledWith(
      context.storedCursor,
      'runner-1',
      0,
      7
    )
    expect(
      context.store.persistDeadLetter.mock.invocationCallOrder[0]
    ).toBeLessThan(context.store.advanceCursor.mock.invocationCallOrder[0])
    expect(handle).toHaveBeenCalledOnce()
  })

  it('recovers a DLQ-first crash without invoking the handler again', async () => {
    const context = setup()
    context.store.readEvents.mockResolvedValue([event(4)])
    context.store.readDeadLetterSequences.mockResolvedValue(new Set([4]))

    await expect(
      context.runner.runPartition('test-consumer', 'tenant-a')
    ).resolves.toMatchObject({
      status: 'dead-letter-recovered',
      eventSequence: 4
    })
    expect(context.handle).not.toHaveBeenCalled()
    expect(context.store.advanceCursor).toHaveBeenCalledWith(
      context.storedCursor,
      'runner-1',
      0,
      4
    )
  })

  it('replays when handling succeeded but cursor advancement crashed', async () => {
    const context = setup()
    context.store.readEvents.mockResolvedValue([event(1)])
    context.store.advanceCursor
      .mockRejectedValueOnce(new Error('crash before cursor'))
      .mockResolvedValueOnce(undefined)

    await expect(
      context.runner.runPartition('test-consumer', 'tenant-a')
    ).rejects.toThrow('crash before cursor')
    await expect(
      context.runner.runPartition('test-consumer', 'tenant-a')
    ).resolves.toMatchObject({ status: 'processed', toSequence: 1 })
    expect(context.handle).toHaveBeenCalledTimes(2)
  })

  it('does not acquire a backfill cursor until snapshot completion', async () => {
    const context = setup({
      cursor: { backfillStatus: 'pending', highWatermark: 33 }
    })

    await expect(
      context.runner.runPartition('test-consumer', 'tenant-a')
    ).resolves.toMatchObject({
      status: 'backfill-required',
      highWatermark: 33
    })
    expect(context.store.acquireLease).not.toHaveBeenCalled()
  })

  it('returns busy when another runner owns the tenant partition lease', async () => {
    const context = setup()
    context.store.acquireLease.mockResolvedValue(null)
    context.store.getCursor.mockResolvedValue({
      ...context.storedCursor,
      leaseOwner: 'runner-2',
      leaseUntil: new Date('2026-08-03T15:01:00.000Z')
    })

    await expect(
      context.runner.runPartition('test-consumer', 'tenant-a')
    ).resolves.toMatchObject({ status: 'busy', consumer: 'test-consumer' })
    expect(context.handle).not.toHaveBeenCalled()
    expect(context.store.readEvents).not.toHaveBeenCalled()
  })

  it('honors persisted retry backoff before claiming a new lease', async () => {
    const context = setup()
    const nextAttemptAt = new Date('2026-08-03T15:00:30.000Z')
    context.store.acquireLease.mockResolvedValue(null)
    context.store.getCursor.mockResolvedValue({
      ...context.storedCursor,
      nextAttemptAt
    })

    await expect(
      context.runner.runPartition('test-consumer', 'tenant-a')
    ).resolves.toMatchObject({ status: 'backoff', nextAttemptAt })
    expect(context.handle).not.toHaveBeenCalled()
  })

  it('isolates one consumer failure from other registered consumers', async () => {
    const context = setup()
    context.registry.register('second-consumer', {
      types: ['content.updated'],
      batchSize: 10,
      maxAttempts: 3,
      initialPosition: 'earliest',
      handle: vi.fn()
    })
    context.store.initializeCursor
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce(context.storedCursor)
    context.store.readEvents.mockResolvedValue([])

    await expect(context.runner.runTenant('tenant-a')).resolves.toEqual([
      expect.objectContaining({ status: 'failed', consumer: 'test-consumer' }),
      expect.objectContaining({ status: 'idle', consumer: 'second-consumer' })
    ])
    expect(context.logger.error).toHaveBeenCalledOnce()
  })

  it('caps exponential retry delay at the configured maximum', () => {
    expect(
      calculateRetryDelay(
        { baseDelayMs: 1000, maxDelayMs: 5000, multiplier: 2 },
        10
      )
    ).toBe(5000)
  })
})
