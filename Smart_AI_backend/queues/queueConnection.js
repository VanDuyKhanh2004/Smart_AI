const logger = require('../utils/logger');
const { isShuttingDown, calculateReconnectDelay } = require('../configs/redis');

const retryStrategy = (times) => {
  if (isShuttingDown()) {
    logger.warn('BullMQ Redis reconnect stopped — shutting down');
    return null;
  }
  const delayMs = calculateReconnectDelay(times - 1);
  logger.info({ attempt: times, delayMs }, 'BullMQ Redis reconnect scheduled');
  return delayMs;
};

const getBullMQConnection = () => {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL environment variable is required for BullMQ');
  }
  return { url, retryStrategy };
};

const getBullMQConfig = () => {
  const enabled = process.env.BULLMQ_ENABLED !== 'false';
  const prefix = process.env.BULLMQ_PREFIX || 'smart-ai';
  const defaultAttempts = parseInt(process.env.BULLMQ_DEFAULT_ATTEMPTS, 10) || 3;
  const defaultConcurrency = parseInt(process.env.BULLMQ_DEFAULT_CONCURRENCY, 10) || 2;

  return { enabled, prefix, defaultAttempts, defaultConcurrency };
};

const getSanitizedInfo = () => {
  const { enabled, prefix } = getBullMQConfig();
  return { enabled, prefix, host: '[REDACTED]' };
};

const initBullMQConnection = () => {
  const { enabled, prefix } = getBullMQConfig();
  logger.info({ enabled, prefix }, 'BullMQ configuration');
  return { enabled, prefix };
};

module.exports = {
  getBullMQConnection,
  getBullMQConfig,
  getSanitizedInfo,
  initBullMQConnection,
};
