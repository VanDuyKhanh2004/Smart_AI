const { createClient } = require('redis');

const logger = require('../utils/logger');

let redisClient = null;
let shuttingDown = false;
let status = 'disconnected';

const calculateReconnectDelay = (attemptIndex) => {
  return Math.min(500 * Math.pow(2, attemptIndex), 30000);
};

const setShuttingDown = () => {
  shuttingDown = true;
  status = 'disconnected';
};

const getRedisStatus = () => status;

const reconnectStrategy = (retries) => {
  if (shuttingDown) {
    logger.warn('Redis reconnect stopped — shutting down');
    return new Error('SHUTTING_DOWN');
  }
  const delayMs = calculateReconnectDelay(retries);
  logger.info({ attempt: retries + 1, delayMs }, 'Redis reconnect scheduled');
  return delayMs;
};

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
    socket: { reconnectStrategy },
  });

  redisClient.on('connect', () => {
    logger.info('Redis connecting...');
  });

  redisClient.on('ready', () => {
    status = 'connected';
    logger.info('Redis connected successfully');
  });

  redisClient.on('reconnecting', () => {
    status = 'reconnecting';
    logger.warn('Redis reconnecting...');
  });

  redisClient.on('end', () => {
    status = 'disconnected';
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
  setShuttingDown,
  getRedisStatus,
  reconnectStrategy,
  isShuttingDown: () => shuttingDown,
  calculateReconnectDelay,
};
