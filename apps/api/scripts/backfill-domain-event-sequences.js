#!/usr/bin/env node

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { database, mongoose } = require('@contexthub/common');

const EVENT_COLLECTION = 'DomainEvents';
const COUNTER_COLLECTION = 'DomainEventCounters';
const COUNTER_ID = 'domainEvents';
const DEFAULT_BATCH_SIZE = 500;

const apply = process.argv.includes('--apply');
const maintenanceConfirmed = process.argv.includes('--maintenance-confirmed');
const batchArg = process.argv.find((arg) => arg.startsWith('--batch-size='));
const requestedBatchSize = batchArg ? Number(batchArg.split('=')[1]) : null;
const batchSize =
  Number.isSafeInteger(requestedBatchSize) && requestedBatchSize > 0
    ? requestedBatchSize
    : DEFAULT_BATCH_SIZE;

async function getSequenceState(events, counters) {
  const [missing, sequenced, counter, maximum] = await Promise.all([
    events.countDocuments({ sequence: { $exists: false } }),
    events.countDocuments({ sequence: { $type: 'number' } }),
    counters.findOne({ _id: COUNTER_ID }),
    events
      .aggregate([
        { $match: { sequence: { $type: 'number' } } },
        { $group: { _id: null, sequence: { $max: '$sequence' } } }
      ])
      .next()
  ]);

  return {
    missing,
    sequenced,
    counterSequence: counter?.sequence || 0,
    maximumSequence: maximum?.sequence || 0
  };
}

async function assertNoDuplicateSequences(events) {
  const duplicate = await events
    .aggregate([
      { $match: { sequence: { $type: 'number' } } },
      { $group: { _id: '$sequence', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 }
    ])
    .next();

  if (duplicate) {
    throw new Error(`Duplicate DomainEvent sequence detected: ${duplicate._id}`);
  }
}

async function persistCounter(counters, sequence, now) {
  await counters.updateOne(
    { _id: COUNTER_ID },
    {
      $max: { sequence },
      $set: { updatedAt: now },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );
}

async function backfill(events, counters, initialSequence) {
  let sequence = initialSequence;
  let updated = 0;
  let operations = [];

  const flush = async () => {
    if (!operations.length) return;

    const result = await events.bulkWrite(operations, { ordered: true });
    if (result.modifiedCount !== operations.length) {
      throw new Error(
        'DomainEvents changed during backfill. Keep producers stopped and rerun the command.'
      );
    }

    await persistCounter(counters, sequence, new Date());
    updated += result.modifiedCount;
    console.log('[domain-event-sequence] Progress', { updated, sequence });
    operations = [];
  };

  const cursor = events
    .find(
      { sequence: { $exists: false } },
      { projection: { _id: 1, createdAt: 1 } }
    )
    .sort({ createdAt: 1, _id: 1 });

  for await (const event of cursor) {
    sequence += 1;
    if (!Number.isSafeInteger(sequence)) {
      throw new Error('DomainEvent sequence exceeded Number.MAX_SAFE_INTEGER');
    }

    operations.push({
      updateOne: {
        filter: { _id: event._id, sequence: { $exists: false } },
        update: { $set: { sequence } }
      }
    });

    if (operations.length >= batchSize) {
      await flush();
    }
  }

  await flush();
  await persistCounter(counters, sequence, new Date());
  return { updated, sequence };
}

async function main() {
  if (apply && !maintenanceConfirmed) {
    throw new Error(
      '--apply requires --maintenance-confirmed because all DomainEvent producers must be stopped'
    );
  }

  await database.connectDB();
  const db = mongoose.connection.db;
  const events = db.collection(EVENT_COLLECTION);
  const counters = db.collection(COUNTER_COLLECTION);

  await assertNoDuplicateSequences(events);
  const before = await getSequenceState(events, counters);
  console.log('[domain-event-sequence] Current state', before);

  if (!apply) {
    console.log(
      '[domain-event-sequence] Dry run only. Stop event producers, then rerun with --apply --maintenance-confirmed.'
    );
    return;
  }

  const initialSequence = Math.max(
    before.maximumSequence,
    before.counterSequence
  );
  const result = await backfill(events, counters, initialSequence);
  const after = await getSequenceState(events, counters);

  if (after.missing !== 0 || after.counterSequence < after.maximumSequence) {
    throw new Error('DomainEvent sequence backfill verification failed');
  }

  console.log('[domain-event-sequence] Backfill complete', { result, after });
}

main()
  .catch((error) => {
    console.error('[domain-event-sequence] Failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await database.disconnectDB();
    }
  });
