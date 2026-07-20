const logger = require('../utils/logger');

const queues = new Map();

const register = (name, queue) => {
  if (queues.has(name)) {
    logger.warn({ queueName: name }, 'Overwriting existing queue in registry');
  }
  queues.set(name, queue);
};

const get = (name) => queues.get(name);

const getAll = () => Array.from(queues.entries());

const isInitialized = () => queues.size > 0;

const closeAll = async () => {
  if (queues.size === 0) return;

  const entries = Array.from(queues.entries());
  logger.info({ count: entries.length }, 'Closing all BullMQ queues');

  for (const [name, queue] of entries) {
    if (typeof queue.safeClose === 'function') {
      await queue.safeClose();
    } else {
      try {
        await queue.close();
      } catch (err) {
        logger.error({ err, queueName: name }, 'Error closing queue');
      }
    }
  }

  queues.clear();
};

module.exports = {
  register,
  get,
  getAll,
  isInitialized,
  closeAll,
};
