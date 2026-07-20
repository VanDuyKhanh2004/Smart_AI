const { Worker } = require('bullmq');
const logger = require('../utils/logger');
const { getBullMQConnection, getBullMQConfig } = require('../queues/queueConnection');

const createWorker = (name, processor, options = {}) => {
  const { prefix, defaultConcurrency } = getBullMQConfig();
  const connection = getBullMQConnection();
  const concurrency = options.concurrency || defaultConcurrency;
  const lockDuration = options.lockDuration || 30000;

  const worker = new Worker(name, processor, {
    connection,
    prefix,
    concurrency,
    lockDuration,
    ...options.bullOptions,
  });

  worker.on('completed', (job) => {
    logger.info(
      {
        queueName: name,
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
        durationMs: Date.now() - job.timestamp,
      },
      'BullMQ job completed',
    );
  });

  worker.on('failed', (job, err) => {
    logger.warn(
      {
        queueName: name,
        jobId: job?.id,
        jobName: job?.name,
        attemptsMade: job?.attemptsMade,
        err: { message: err?.message },
      },
      'BullMQ job failed',
    );
  });

  worker.on('error', (err) => {
    logger.error(
      {
        queueName: name,
        err: { message: err?.message },
      },
      'BullMQ worker error',
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn(
      {
        queueName: name,
        jobId,
      },
      'BullMQ job stalled',
    );
  });

  logger.info({ queueName: name, concurrency, lockDuration }, 'BullMQ worker created');

  const safeClose = async () => {
    try {
      logger.info({ queueName: name }, 'Closing BullMQ worker');
      await worker.close();
    } catch (err) {
      logger.error({ err, queueName: name }, 'Error closing BullMQ worker');
    }
  };

  worker.safeClose = safeClose;

  return worker;
};

module.exports = { createWorker };
