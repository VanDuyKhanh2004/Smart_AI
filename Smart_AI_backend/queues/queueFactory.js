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
    const timeoutMs = parseInt(process.env.BULLMQ_CLOSE_TIMEOUT, 10) || 5000;

    logger.info({ queueName: name }, 'Closing BullMQ queue');

    let timer;
    const timeoutPromise = new Promise((resolve) => {
      timer = setTimeout(() => {
        logger.warn(
          { queueName: name, timeoutMs },
          'BullMQ queue close timed out, continuing',
        );
        resolve();
      }, timeoutMs);
    });

    try {
      await Promise.race([
        queue
          .close()
          .then(() => {
            logger.info({ queueName: name }, 'BullMQ queue closed');
          })
          .catch((err) => {
            logger.error({ err, queueName: name }, 'Error closing BullMQ queue');
          }),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  queue.safeClose = safeClose;

  return queue;
};

module.exports = { createQueue };
