const { createClient } = require('redis');

const logger = require('../utils/logger');

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
    logger.info('Redis connecting...');
  });

  redisClient.on('ready', () => {
    logger.info('Redis connected successfully');
  });

  redisClient.on('reconnecting', () => {
    logger.warn('Redis reconnecting...');
  });

  redisClient.on('end', () => {
    logger.warn('Redis connection closed');
  });

  redisClient.on('error', (error) => {
    logger.error({ err: error }, 'Redis connection error');
  });

  await redisClient.connect();
};

const disconnectRedis = async () => {
  try {
    if (redisClient?.isOpen) {
      await redisClient.quit();
      logger.info('Redis connection closed');
    }
  } catch (error) {
    logger.error({ err: error }, 'Error closing Redis connection');
  }
};

module.exports = {
  getRedisClient,
  connectRedis,
  disconnectRedis,
};
