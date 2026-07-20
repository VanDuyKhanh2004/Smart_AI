const logger = require('./logger');

const shutdownStep = async (label, fn, timeoutMs = 5000) => {
  logger.info({ resource: label }, `Shutdown: closing ${label}`);

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      logger.warn({ resource: label, timeoutMs }, `Shutdown timeout: ${label}`);
      resolve();
    }, timeoutMs);
  });

  try {
    await Promise.race([
      (async () => {
        try {
          await fn();
        } catch (err) {
          logger.error({ err, resource: label }, `Shutdown error: ${label}`);
        }
      })(),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }

  logger.info({ resource: label }, `Shutdown: ${label} closed`);
};

module.exports = { shutdownStep };
