import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const database = require('../packages/common/src/database');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const log = (message) => console.log(`[create-indexes] ${message}`);

log('Starting index creation process...');

const run = async () => {
  const start = Date.now();
  try {
    process.env.MONGODB_AUTO_CREATE_INDEXES = 'false';
    await database.connectDB();
    log('Connected to MongoDB');

    await database.createIndexes();
    log('Indexes created successfully');
  } finally {
    await database.disconnectDB();
    const duration = Date.now() - start;
    log(`Finished in ${duration}ms`);
  }
};

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[create-indexes] Failed:', error);
    process.exit(1);
  });
