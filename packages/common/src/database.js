const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/contexthub';
    
    const conn = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

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
