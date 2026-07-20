const logger = require('../utils/logger');

const systemPing = async (job) => {
  const { correlationId, requestId } = job.data || {};
  const cid = correlationId || requestId || null;

  logger.info(
    { jobId: job.id, jobName: job.name, correlationId: cid },
    'Processing system.ping',
  );

  return {
    pong: true,
    processedAt: new Date().toISOString(),
    correlationId: cid,
  };
};

module.exports = { systemPing };
