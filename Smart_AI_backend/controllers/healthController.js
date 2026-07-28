const logger = require('../utils/logger');
const healthService = require('../services/healthService');
const asyncHandler = require('../utils/asyncHandler');

const live = (req, res) => {
  res.json(healthService.getLivenessData(req));
};

const health = async (req, res) => {
  const data = await healthService.getHealthData(req);
  res.status(data.success ? 200 : 503).json(data);
};

const ready = async (req, res) => {
  const data = await healthService.getReadinessData(req);
  const status = data.success ? 200 : 503;

  if (!data.success) {
    const log = req.logger || logger;
    log.warn(
      {
        requestId: req.requestId,
        dependencies: data.dependencies,
        totalDurationMs: data.totalDurationMs,
      },
      'Readiness check failed',
    );
  }

  res.status(status).json(data);
};

module.exports = { live, health: asyncHandler(health), ready: asyncHandler(ready) };
