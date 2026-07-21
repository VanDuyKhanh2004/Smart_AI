const logger = require('../utils/logger');
const { initBullMQConnection } = require('../queues/queueConnection');
const { createQueue } = require('../queues/queueFactory');
const { createWorker } = require('../workers/workerFactory');
const queueRegistry = require('../queues/queueRegistry');
const workerRegistry = require('../workers/workerRegistry');
const { systemPing } = require('../jobs/systemJob');
const { processJob } = require('../jobs/emailJobs');

let started = false;

const startBullMQ = async () => {
  const { enabled } = initBullMQConnection();

  if (!enabled) {
    started = true;
    logger.info('BullMQ is disabled, skipping queue infrastructure');
    return;
  }

  const systemQueue = createQueue('systemQueue');
  queueRegistry.register('systemQueue', systemQueue);

  const systemWorker = createWorker('systemQueue', systemPing);
  workerRegistry.register('systemQueue', systemWorker);

  const emailConcurrency = parseInt(process.env.EMAIL_QUEUE_CONCURRENCY, 10) || 2;
  const emailQueue = createQueue('emailQueue');
  queueRegistry.register('emailQueue', emailQueue);

  const emailWorker = createWorker('emailQueue', processJob, { concurrency: emailConcurrency });
  workerRegistry.register('emailQueue', emailWorker);

  started = true;
  logger.info('BullMQ system queue and worker initialized');
  logger.info({ concurrency: emailConcurrency }, 'BullMQ email queue and worker initialized');
};

const stopBullMQ = async () => {
  if (!started) return;

  await workerRegistry.closeAll();
  await queueRegistry.closeAll();
  started = false;
};

const getBullMQHealth = () => {
  return {
    enabled: process.env.BULLMQ_ENABLED !== 'false',
    initialized: started && queueRegistry.isInitialized(),
    emailQueueEnabled: process.env.EMAIL_QUEUE_ENABLED !== 'false',
    emailQueueInitialized: started && queueRegistry.get('emailQueue') != null,
  };
};

module.exports = {
  startBullMQ,
  stopBullMQ,
  getBullMQHealth,
};
