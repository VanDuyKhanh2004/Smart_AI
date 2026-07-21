const sanitizeUrl = require('../utils/sanitizeUrl');

const requestLogger = (req, res, next) => {
  const start = Date.now();
  const sanitized = sanitizeUrl(req.originalUrl);

  res.on('finish', () => {
    const logData = {
      requestId: req.requestId,
      method: req.method,
      url: sanitized,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    };

    if (req.ip) logData.ip = req.ip;
    if (req.headers['user-agent']) logData.userAgent = req.headers['user-agent'];
    if (req.user?._id) logData.userId = req.user._id.toString();
    if (res.getHeader('content-length')) {
      logData.contentLength = Number(res.getHeader('content-length'));
    }

    const level =
      res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    req.logger[level](logData, '%s %s %d', req.method, sanitized, res.statusCode);
  });

  next();
};

module.exports = requestLogger;
