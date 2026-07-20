const mongoose = require('mongoose');
require('dotenv').config();

const logger = require('../utils/logger');

const connectDatabase = async () => {
  try {
    if (!process.env.MONGO_CONNECTION_STRING) {
      throw new Error('MONGO_CONNECTION_STRING không được định nghĩa trong file .env');
    }

    const connectionOptions = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 30000,
    };

    const connection = await mongoose.connect(process.env.MONGO_CONNECTION_STRING, connectionOptions);

    logger.info({
      host: connection.connection.host,
      database: connection.connection.name,
    }, 'MongoDB connected');

    mongoose.connection.on('error', (error) => {
      logger.error({ err: error }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    return connection;
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection failed');
    process.exit(1);
  }
};

const disconnectDatabase = async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error({ err: error }, 'Error closing MongoDB connection');
  }
};

module.exports = {
  connectDatabase,
  disconnectDatabase
};
