#!/usr/bin/env node

// Housekeeping for files submitted through forms: removes abandoned uploads,
// deletes files past their retention period and retries failed deletions.
// Schedule it hourly (pnpm cron:form-uploads).

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const { database } = require('@contexthub/common');
const formUploadCleanupService = require('../services/formUploadCleanupService');

async function main() {
  await database.connectDB();
  const result = await formUploadCleanupService.runCleanup({ now: new Date() });
  console.log(JSON.stringify(result, null, 2));

  const failed = (result.retried?.failed || 0) + (result.abandoned?.failed || 0) + (result.retention?.failed || 0);
  if (failed > 0) {
    // Failed deletions are retried on the next run; a non-zero exit makes them visible.
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error('[form-upload-cleanup] Fatal error', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.disconnectDB().catch(() => {});
  });
