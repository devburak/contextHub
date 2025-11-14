const mongoose = require('mongoose');

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

const buildMongoOptions = () => {
  const options = {
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
    
    // Create indexes after connection
    await createIndexes();
    
    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const createIndexes = async () => {
  try {
    const models = require('./models');
    
    // Her model için indexleri oluştur
    const modelNames = Object.keys(models).filter(key => key !== 'mongoose');
    
    for (const modelName of modelNames) {
      const model = models[modelName];
      if (model.createIndexes) {
        await model.createIndexes();
        console.log(`Indexes created for ${modelName}`);
      }
    }
    
    console.log('All database indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
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

module.exports = {
  connectDB,
  disconnectDB,
  createIndexes
};
