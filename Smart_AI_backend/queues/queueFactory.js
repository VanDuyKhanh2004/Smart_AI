const { Queue } = require('bullmq');
const logger = require('../utils/logger');
const { getBullMQConnection, getBullMQConfig } = require('./queueConnection');
const { mergeJobOptions } = require('./jobOptions');

const createQueue = (name, options = {}) => {
  const { prefix } = getBullMQConfig();
  const connection = getBullMQConnection();
  const defaultJobOptions = mergeJobOptions(options.defaultJobOptions);

  const queue = new Queue(name, {
    connection,
    prefix,
    defaultJobOptions,
    ...options.bullOptions,
  });

  logger.info({ queueName: name, prefix }, 'BullMQ queue created');

  const safeClose = async () => {
    try {
      logger.info({ queueName: name }, 'Closing BullMQ queue');
      await queue.close();
    } catch (err) {
      logger.error({ err, queueName: name }, 'Error closing BullMQ queue');
    }
  };

  queue.safeClose = safeClose;

  return queue;
};

module.exports = { createQueue };
