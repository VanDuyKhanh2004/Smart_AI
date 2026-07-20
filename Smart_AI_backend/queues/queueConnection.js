const logger = require('../utils/logger');

const getBullMQConnection = () => {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL environment variable is required for BullMQ');
  }
  return { url };
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
