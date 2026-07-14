const cache = require("../services/cacheService");

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

const loginRateLimit = async (req, res, next) => {
  try {
    const clientIp = getClientIp(req);
    const key = `ratelimit:login:ip:${clientIp}`;
    const now = Date.now();
    let record = await cache.get(key);

    if (!record) {
      await cache.set(key, { attempts: 1, firstAttemptAt: now, blockUntil: null }, Math.ceil(WINDOW_MS / 1000));
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
      await cache.set(key, { attempts: 1, firstAttemptAt: now, blockUntil: null }, Math.ceil(WINDOW_MS / 1000));
      return next();
    }

    record.attempts += 1;

    if (record.attempts > LOGIN_IP_MAX_ATTEMPTS) {
      record.blockUntil = now + BLOCK_MS;
      await cache.set(key, record, Math.ceil(BLOCK_MS / 1000));
      res.setHeader('Retry-After', Math.ceil(BLOCK_MS / 1000).toString());
      return res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Ban da vuot qua gioi han dang nhap. Vui long thu lai sau.'
        }
      });
    }

    const remainingMs = record.firstAttemptAt + WINDOW_MS - now;
    await cache.set(key, record, Math.ceil(remainingMs / 1000));
    return next();
  } catch (error) {
    console.error('Login rate limit error:', error.message);
    return next();
  }
};

module.exports = {
  loginRateLimit
};
