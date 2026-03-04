const ipLoginAttempts = new Map();

const LOGIN_IP_MAX_ATTEMPTS = Number(process.env.LOGIN_IP_MAX_ATTEMPTS || 20);
const LOGIN_IP_WINDOW_MINUTES = Number(process.env.LOGIN_IP_WINDOW_MINUTES || 15);
const LOGIN_IP_BLOCK_MINUTES = Number(process.env.LOGIN_IP_BLOCK_MINUTES || 15);

const WINDOW_MS = LOGIN_IP_WINDOW_MINUTES * 60 * 1000;
const BLOCK_MS = LOGIN_IP_BLOCK_MINUTES * 60 * 1000;

const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
};

const loginRateLimit = (req, res, next) => {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const record = ipLoginAttempts.get(clientIp);

  if (!record) {
    ipLoginAttempts.set(clientIp, {
      attempts: 1,
      firstAttemptAt: now,
      blockUntil: null
    });
    return next();
  }

  if (record.blockUntil && record.blockUntil > now) {
    const retryAfter = Math.ceil((record.blockUntil - now) / 1000);
    res.setHeader('Retry-After', retryAfter.toString());
    return res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Ban da vuot qua gioi han dang nhap. Vui long thu lai sau.'
      }
    });
  }

  if (record.firstAttemptAt + WINDOW_MS <= now) {
    record.attempts = 1;
    record.firstAttemptAt = now;
    record.blockUntil = null;
    ipLoginAttempts.set(clientIp, record);
    return next();
  }

  record.attempts += 1;

  if (record.attempts > LOGIN_IP_MAX_ATTEMPTS) {
    record.blockUntil = now + BLOCK_MS;
    ipLoginAttempts.set(clientIp, record);
    res.setHeader('Retry-After', Math.ceil(BLOCK_MS / 1000).toString());
    return res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Ban da vuot qua gioi han dang nhap. Vui long thu lai sau.'
      }
    });
  }

  ipLoginAttempts.set(clientIp, record);
  return next();
};

module.exports = {
  loginRateLimit
};
