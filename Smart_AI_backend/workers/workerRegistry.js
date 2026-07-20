const logger = require('../utils/logger');

const workers = new Map();

const register = (name, worker) => {
  if (workers.has(name)) {
    logger.warn({ queueName: name }, 'Overwriting existing worker in registry');
  }
  workers.set(name, worker);
};

const get = (name) => workers.get(name);

const getAll = () => Array.from(workers.entries());

const isInitialized = () => workers.size > 0;

const closeAll = async () => {
  if (workers.size === 0) return;

  const entries = Array.from(workers.entries());
  logger.info({ count: entries.length }, 'Closing all BullMQ workers');

  for (const [name, worker] of entries) {
    if (typeof worker.safeClose === 'function') {
      await worker.safeClose();
    } else {
      try {
        await worker.close();
      } catch (err) {
        logger.error({ err, queueName: name }, 'Error closing worker');
      }
    }
  }

  workers.clear();
};

module.exports = {
  register,
  get,
  getAll,
  isInitialized,
  closeAll,
};
