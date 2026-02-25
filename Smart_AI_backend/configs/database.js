const mongoose = require('mongoose');
require('dotenv').config();


const connectDatabase = async () => {
  try {
    if (!process.env.MONGO_CONNECTION_STRING) {
      throw new Error('MONGO_CONNECTION_STRING không được định nghĩa trong file .env');
    }

    const connectionOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout sau 5s nếu không kết nối được
      socketTimeoutMS: 45000, // Đóng kết nối sau 45s không hoạt động
      maxPoolSize: 10, // Tối đa 10 kết nối trong pool
      minPoolSize: 0, // Tối thiểu 0 kết nối
      maxIdleTimeMS: 30000, // Đóng kết nối không hoạt động sau 30s
    };

    const connection = await mongoose.connect(
      process.env.MONGO_CONNECTION_STRING,
      connectionOptions
    );

    console.log(`MongoDB Connected: ${connection.connection.host}`);
    console.log(`Database Name: ${connection.connection.name}`);
    
    mongoose.connection.on('error', (error) => {
      console.error('MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

    return connection;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    
    if (process.env.NODE_ENV === 'development') {
      console.error('Error details:', error);
    }
    
    process.exit(1);
  }
};

const disconnectDatabase = async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
  }
};

module.exports = {
  connectDatabase,
  disconnectDatabase
};
