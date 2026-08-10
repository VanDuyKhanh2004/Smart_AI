const { createClient } = require('redis');

const logger = require('../utils/logger');
const {
  logReconnectAttempt,
  logThrottledWarn,
  logThrottledError,
} = require('../utils/reconnectLogger');

let redisClient = null;
let shuttingDown = false;
let status = 'disconnected';
let connectPromise = null;

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
  logReconnectAttempt('Redis reconnect scheduled', retries + 1, delayMs);
  return delayMs;
};

const getRedisClient = () => {
  return redisClient;
};

const connectRedis = async () => {
  if (redisClient?.isOpen || connectPromise) {
    return;
  }

  if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL environment variable is required.');
  }

  redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: { reconnectStrategy },
    // Do not buffer commands in memory while reconnecting: with the waiters on
    // isReady they would otherwise sit in the offline queue and hang requests
    // indefinitely. Fail fast instead and let each caller apply its failure
    // policy (fail-open cache, local fallback, or fail-closed 503).
    disableOfflineQueue: true,
  });

  redisClient.on('connect', () => {
    status = 'connecting';
    logger.info('Redis connecting...');
  });

  redisClient.on('ready', () => {
    status = 'connected';
    logger.info('Redis connected successfully');
  });

  redisClient.on('reconnecting', () => {
    status = 'reconnecting';
    logThrottledWarn('redis:client:reconnecting', 'Redis reconnecting...');
  });

  redisClient.on('end', () => {
    status = 'disconnected';
    logger.warn('Redis connection closed');
  });

  redisClient.on('error', (error) => {
    logThrottledError(
      'redis:client:error',
      'Redis connection error',
      { err: { message: error && error.message } },
    );
  });

  // Kick off the connection in the background and return immediately.
  // node-redis keeps retrying internally based on `reconnectStrategy` and its
  // `connect()` promise only resolves once connected (or rejects when a
  // strategy returns an Error, e.g. during shutdown). Awaiting that promise
  // here would stall server startup while Redis is unreachable, so degrade.
  status = 'connecting';
  const connectOp = redisClient.connect();
  connectPromise = connectOp
    .then(() => {
      connectPromise = null;
      return undefined;
    })
    .catch((error) => {
      connectPromise = null;
      if (!shuttingDown) {
        logger.warn(
          { err: { message: error.message } },
          'Redis initial connect failed — running in degraded mode',
        );
      }
      return undefined;
    });

  logger.info(
    'Redis connection started in background (non-blocking); server will start even if Redis is unavailable',
  );

  return undefined;
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
