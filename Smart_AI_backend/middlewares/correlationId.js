const crypto = require('node:crypto');
const logger = require('../utils/logger');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const correlationId = (req, res, next) => {
  const incomingId = req.headers['x-request-id'];
  const requestId =
    incomingId && typeof incomingId === 'string' && UUID_REGEX.test(incomingId)
      ? incomingId
      : crypto.randomUUID();

  req.requestId = requestId;
  req.logger = logger.child({ requestId });
  res.setHeader('X-Request-ID', requestId);
  next();
};

module.exports = correlationId;
