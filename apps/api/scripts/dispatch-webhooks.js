#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { database } = require('@contexthub/common');
const { dispatchWebhookOutboxBatch } = require('../src/lib/webhookDispatcher');

async function main() {
  try {
    await database.connectDB();
    const limit = process.env.WEBHOOK_DISPATCH_LIMIT
      ? Number(process.env.WEBHOOK_DISPATCH_LIMIT)
      : undefined;

    const result = await dispatchWebhookOutboxBatch({ limit });
    console.log('[ctxhub] webhook dispatch result:', result);
    await database.disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('[ctxhub] webhook dispatch error:', error);
    try {
      await database.disconnectDB();
    } catch (disconnectError) {
      console.error('[ctxhub] failed to close Mongo connection:', disconnectError);
    }
    process.exit(1);
  }
}

main();
