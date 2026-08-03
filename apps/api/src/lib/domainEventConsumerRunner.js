const crypto = require('node:crypto');
const {
  domainEventConsumerRegistry
} = require('./domainEventConsumerRegistry');
const {
  DomainEventConsumerLeaseLostError,
  createDomainEventConsumerStore
} = require('./domainEventConsumerStore');

class DomainEventConsumerRunnerError extends Error {
  constructor(message, code = 'DOMAIN_EVENT_CONSUMER_RUNNER_ERROR') {
    super(message);
    this.name = 'DomainEventConsumerRunnerError';
    this.code = code;
  }
}

function serializeError(error) {
  const message = String(error?.message || error || 'Domain event consumer failed');
  return {
    name: String(error?.name || 'Error').slice(0, 200),
    message: message.slice(0, 4000),
    code: error?.code ? String(error.code).slice(0, 200) : null,
    retryable:
      typeof error?.retryable === 'boolean' ? error.retryable : null
  };
}

function calculateRetryDelay(retry, attempt) {
  const exponent = Math.max(0, attempt - 1);
  const candidate = retry.baseDelayMs * retry.multiplier ** exponent;
  return Math.min(retry.maxDelayMs, Math.round(candidate));
}

function createDomainEventConsumerRunner(options = {}) {
  const registry = options.registry || domainEventConsumerRegistry;
  const store = options.store || createDomainEventConsumerStore(options.storeOptions);
  const clock = options.clock || (() => new Date());
  const ownerId = String(options.ownerId || crypto.randomUUID()).trim();
  const logger = options.logger || console;

  if (!ownerId) {
    throw new DomainEventConsumerRunnerError(
      'runner ownerId is required',
      'DOMAIN_EVENT_CONSUMER_OWNER_REQUIRED'
    );
  }

  const now = () => {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new DomainEventConsumerRunnerError('clock returned an invalid date');
    }
    return date;
  };

  async function runPartition(consumerName, tenantId) {
    const registration = registry.get(consumerName);
    if (!registration) {
      throw new DomainEventConsumerRunnerError(
        `domain event consumer is not registered: ${consumerName}`,
        'DOMAIN_EVENT_CONSUMER_NOT_REGISTERED'
      );
    }

    let cursor = await store.initializeCursor(registration, tenantId);
    if (!cursor.active) {
      return { status: 'inactive', consumer: registration.name, tenantId };
    }
    if (cursor.backfillStatus === 'pending') {
      return {
        status: 'backfill-required',
        consumer: registration.name,
        tenantId,
        highWatermark: cursor.highWatermark
      };
    }

    const leasedCursor = await store.acquireLease(
      registration,
      tenantId,
      ownerId
    );
    if (!leasedCursor) {
      cursor = await store.getCursor(registration.name, tenantId);
      if (cursor?.nextAttemptAt && new Date(cursor.nextAttemptAt) > now()) {
        return {
          status: 'backoff',
          consumer: registration.name,
          tenantId,
          nextAttemptAt: cursor.nextAttemptAt
        };
      }
      return { status: 'busy', consumer: registration.name, tenantId };
    }

    const expectedLastSequence = leasedCursor.lastSequence;
    const events = await store.readEvents(
      registration,
      tenantId,
      expectedLastSequence
    );

    if (events.length === 0) {
      const released = await store.releaseLease(leasedCursor, ownerId);
      if (!released) {
        throw new DomainEventConsumerLeaseLostError(
          'consumer lease was lost before idle release'
        );
      }
      return {
        status: 'idle',
        consumer: registration.name,
        tenantId,
        lastSequence: expectedLastSequence
      };
    }

    const deadLetterSequences = await store.readDeadLetterSequences(
      registration,
      leasedCursor,
      events.map((event) => event.sequence)
    );
    let handled = 0;
    for (const event of events) {
      if (deadLetterSequences.has(event.sequence)) {
        await store.advanceCursor(
          leasedCursor,
          ownerId,
          expectedLastSequence,
          event.sequence
        );
        return {
          status: 'dead-letter-recovered',
          consumer: registration.name,
          tenantId,
          eventId: event.id,
          eventSequence: event.sequence,
          handledBeforeRecovery: handled
        };
      }

      await store.renewLease(leasedCursor, ownerId, expectedLastSequence);
      const attempt =
        leasedCursor.failureSequence === event.sequence
          ? leasedCursor.attempt + 1
          : 1;

      try {
        // One-element arrays isolate poison events while preserving the public
        // batch-shaped handler contract and at-least-once replay semantics.
        await registration.handle([event],
          Object.freeze({
            consumer: registration.name,
            partition: leasedCursor.partition,
            tenantId,
            attempt,
            ownerId
          })
        );
        handled += 1;
      } catch (error) {
        const normalizedError = serializeError(error);
        if (attempt < registration.maxAttempts) {
          const delayMs = calculateRetryDelay(registration.retry, attempt);
          const nextAttemptAt = new Date(now().getTime() + delayMs);
          await store.scheduleRetry({
            cursor: leasedCursor,
            ownerId,
            expectedLastSequence,
            eventSequence: event.sequence,
            attempt,
            nextAttemptAt,
            error: normalizedError
          });
          return {
            status: 'retry-scheduled',
            consumer: registration.name,
            tenantId,
            eventId: event.id,
            eventSequence: event.sequence,
            attempt,
            nextAttemptAt,
            handledBeforeFailure: handled
          };
        }

        // DLQ is persisted first. If cursor advancement crashes, the unique DLQ
        // key makes the replay idempotent and the event cannot be silently lost.
        await store.persistDeadLetter({
          registration,
          cursor: leasedCursor,
          tenantId,
          event,
          attempt,
          error: normalizedError
        });
        await store.advanceCursor(
          leasedCursor,
          ownerId,
          expectedLastSequence,
          event.sequence
        );
        return {
          status: 'dead-lettered',
          consumer: registration.name,
          tenantId,
          eventId: event.id,
          eventSequence: event.sequence,
          attempt,
          handledBeforeFailure: handled
        };
      }
    }

    const lastEvent = events.at(-1);
    await store.advanceCursor(
      leasedCursor,
      ownerId,
      expectedLastSequence,
      lastEvent.sequence
    );
    return {
      status: 'processed',
      consumer: registration.name,
      tenantId,
      processed: handled,
      fromSequence: expectedLastSequence,
      toSequence: lastEvent.sequence
    };
  }

  async function runTenant(tenantId) {
    const results = [];
    for (const registration of registry.list()) {
      try {
        results.push(await runPartition(registration.name, tenantId));
      } catch (error) {
        logger.error('[domainEventConsumerRunner] Consumer failed', {
          consumer: registration.name,
          tenantId,
          error: serializeError(error)
        });
        results.push({
          status: 'failed',
          consumer: registration.name,
          tenantId,
          error: serializeError(error)
        });
      }
    }
    return results;
  }

  async function completeBackfill(consumerName, tenantId, highWatermark) {
    const registration = registry.get(consumerName);
    if (!registration) {
      throw new DomainEventConsumerRunnerError(
        `domain event consumer is not registered: ${consumerName}`,
        'DOMAIN_EVENT_CONSUMER_NOT_REGISTERED'
      );
    }
    await store.completeBackfill(registration, tenantId, highWatermark);
  }

  return Object.freeze({ completeBackfill, ownerId, runPartition, runTenant });
}

module.exports = {
  DomainEventConsumerRunnerError,
  calculateRetryDelay,
  createDomainEventConsumerRunner,
  serializeError
};
