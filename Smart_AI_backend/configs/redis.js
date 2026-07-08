const { createClient } = require('redis');

let redisClient = null;

const getRedisClient = () => {
  return redisClient;
};

const connectRedis = async () => {
  if (redisClient?.isOpen) {
    return;
  }

  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL environment variable is required.');
  }

  redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
      reconnectStrategy: false,
    },
  });

  redisClient.on('connect', () => {
    console.log('Redis connecting...');
  });

  redisClient.on('ready', () => {
    console.log('Redis connected successfully');
  });

  redisClient.on('reconnecting', () => {
    console.log('Redis reconnecting...');
  });

  redisClient.on('end', () => {
    console.log('Redis connection closed');
  });

  redisClient.on('error', (error) => {
    console.error('Redis connection error:', error.message);
  });

  await redisClient.connect();
};

const disconnectRedis = async () => {
  try {
    if (redisClient?.isOpen) {
      await redisClient.quit();
      console.log('Redis connection closed');
    }
  } catch (error) {
    console.error('Error closing Redis connection:', error);
  }
};

module.exports = {
  getRedisClient,
  connectRedis,
  disconnectRedis,
};
