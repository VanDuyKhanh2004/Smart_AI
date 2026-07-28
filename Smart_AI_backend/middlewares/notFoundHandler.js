const logger = require('../utils/logger');

const notFoundHandler = (req, res, next) => {
  const log = req.logger || logger;
  const qIndex = req.originalUrl.indexOf('?');
  const pathname = qIndex === -1 ? req.originalUrl : req.originalUrl.slice(0, qIndex);

  log.warn(
    { requestId: req.requestId, method: req.method, path: pathname },
    'Route not found: %s %s',
    req.method,
    pathname,
  );

  res.status(404).json({
    success: false,
    error: {
      message: `Route ${pathname} not found`,
      code: 'NOT_FOUND',
    },
  });
};

module.exports = notFoundHandler;
