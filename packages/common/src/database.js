const mongoose = require('mongoose');
const { ensureModelIndexes, ensureDeploymentIndexes } = require('./indexManagement');

const getIntFromEnv = (key, defaultValue, { allowZero = false } = {}) => {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }

  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return defaultValue;
  }

  if (!allowZero && parsed <= 0) {
    return defaultValue;
  }

  return parsed;
};

const shouldAutoCreateIndexes = () => {
  const raw = process.env.MONGODB_AUTO_CREATE_INDEXES;
  if (raw === undefined || raw === null || raw === '') {
    return false;
  }

  const normalized = String(raw).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const buildMongoOptions = () => {
  const options = {
    // Index creation belongs to the explicit API startup/CLI flow, not model
    // initialization or read-only utilities that share this connection helper.
    autoIndex: false,
    autoCreate: false,
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: getIntFromEnv('MONGODB_MAX_POOL_SIZE', 50),
    minPoolSize: getIntFromEnv('MONGODB_MIN_POOL_SIZE', 5, { allowZero: true }),
    maxIdleTimeMS: getIntFromEnv('MONGODB_MAX_IDLE_TIME_MS', 30000),
    serverSelectionTimeoutMS: getIntFromEnv('MONGODB_SERVER_SELECTION_TIMEOUT_MS', 8000),
    socketTimeoutMS: getIntFromEnv('MONGODB_SOCKET_TIMEOUT_MS', 30000),
    waitQueueTimeoutMS: getIntFromEnv('MONGODB_WAIT_QUEUE_TIMEOUT_MS', 2000),
  };

  return options;
};

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/contexthub';
    
    const conn = await mongoose.connect(mongoURI, buildMongoOptions());

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

const createIndexes = async () => {
  try {
    const models = require('./models');
    
    const modelNames = Object.keys(models).filter(key => key !== 'mongoose');
    
    for (const modelName of modelNames) {
      const model = models[modelName];
      if (model.schema && model.collection) {
        await ensureModelIndexes(model, model.schema.indexes());
        console.log(`Indexes created and verified for ${modelName}`);
      }
    }
    
    console.log('All declared database indexes created and verified successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
    throw error;
  }
};

const initializeIndexes = async () => {
  // Required deployment migrations run even when general schema index creation
  // is disabled. Never drop or rebuild unrelated indexes during startup.
  await ensureDeploymentIndexes(require('./models'));
  console.log('Required deployment indexes verified');
  if (shouldAutoCreateIndexes()) {
    console.log('MONGODB_AUTO_CREATE_INDEXES enabled. Ensuring all schema indexes...');
    await createIndexes();
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
  }
};

const isReady = () => mongoose.connection.readyState === 1;

module.exports = {
  connectDB,
  disconnectDB,
  createIndexes,
  initializeIndexes,
  isReady,
};
