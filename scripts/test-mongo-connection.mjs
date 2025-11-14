import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const redacted = (uri) => {
  if (!uri) return '';
  return uri.replace(/\/\/[a-zA-Z0-9._-]+:[^@]+@/, (match) => {
    const [credentials] = match.match(/:[^@]+@/g) || [];
    if (!credentials) return match;
    const [user] = match.split(':');
    return `${user}:****@`;
  });
};

const getIntFromEnv = (key, defaultValue, { allowZero = false } = {}) => {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) return defaultValue;
  if (!allowZero && parsed <= 0) return defaultValue;
  return parsed;
};

const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!mongoURI) {
  console.error('Missing MONGODB_URI (or fallback MONGO_URI) in your .env file.');
  process.exit(1);
}

const options = {
  maxPoolSize: getIntFromEnv('MONGODB_MAX_POOL_SIZE', 50),
  minPoolSize: getIntFromEnv('MONGODB_MIN_POOL_SIZE', 5, { allowZero: true }),
  maxIdleTimeMS: getIntFromEnv('MONGODB_MAX_IDLE_TIME_MS', 30000),
  serverSelectionTimeoutMS: getIntFromEnv('MONGODB_SERVER_SELECTION_TIMEOUT_MS', 8000),
  socketTimeoutMS: getIntFromEnv('MONGODB_SOCKET_TIMEOUT_MS', 30000),
  waitQueueTimeoutMS: getIntFromEnv('MONGODB_WAIT_QUEUE_TIMEOUT_MS', 2000),
  useNewUrlParser: true,
  useUnifiedTopology: true,
};

const startTime = Date.now();
console.log('Attempting MongoDB connection with URI:', redacted(mongoURI));
console.table(options);

try {
  const connection = await mongoose.connect(mongoURI, options);
  const duration = Date.now() - startTime;
  console.log(`✅ MongoDB connected in ${duration}ms`);
  console.log('Replica set name:', connection.connection.client.s.options.rsName || '(not reported)');
  console.log('Topology description:', connection.connection.client.topology?.description?.type || 'unknown');

  // Force a ping to validate the primary is reachable
  await connection.connection.db.command({ ping: 1 });
  console.log('Ping command succeeded.');

  await mongoose.disconnect();
  console.log('Connection closed cleanly.');
  process.exit(0);
} catch (error) {
  const duration = Date.now() - startTime;
  console.error(`❌ MongoDB connection failed after ${duration}ms`);
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    if (disconnectError) {
      console.error('Error during cleanup disconnect:', disconnectError);
    }
  }
  process.exit(1);
}
