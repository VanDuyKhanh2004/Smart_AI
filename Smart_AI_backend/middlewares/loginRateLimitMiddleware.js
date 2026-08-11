const { getRedisClient } = require("../configs/redis");
const logger = require("../utils/logger");

const LOGIN_IP_MAX_ATTEMPTS = Number(process.env.LOGIN_IP_MAX_ATTEMPTS || 20);
const LOGIN_IP_WINDOW_MINUTES = Number(process.env.LOGIN_IP_WINDOW_MINUTES || 15);

const positiveSeconds = (minutes, fallback) => {
  const seconds = Math.floor((Number(minutes) || fallback) * 60);
  return seconds > 0 ? seconds : fallback * 60;
};

// One fixed window (documented as "20 attempts per 15-minute window per IP" in
// docs/API_OVERVIEW.md). The counter lives in a single key whose TTL is set at
// creation and never refreshed per failed attempt. Once an IP exceeds MAX
// attempts inside the window, it is blocked for the remainder of that fixed
// window (the key is left to expire); there is no separate block timer.
const WINDOW_SECONDS = positiveSeconds(LOGIN_IP_WINDOW_MINUTES, 15);
const TTL_SECONDS = WINDOW_SECONDS;

// Atomic rate-limit check. The whole read-modify-write happens inside one Lua
// script, so Redis serializes it: INCR is never lost to a concurrent GET/SET
// and the EXPIRE is applied on the same script that creates the key (no window
// where a permanent key could be left behind). Replies:
//   [0, count]          — request allowed, count = attempt number in window
//   [1, remainingTtlMs] — blocked, remainingTtlMs = ms until the window ends
const LOGIN_RATE_LIMIT_SCRIPT = `
local existing = tonumber(redis.call('GET', KEYS[1]) or '0')
if existing > tonumber(ARGV[2]) then
  local ttlMs = redis.call('PTTL', KEYS[1])
  if ttlMs <= 0 then ttlMs = tonumber(ARGV[1]) * 1000 end
  return { 1, ttlMs }
end
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
if count > tonumber(ARGV[2]) then
  local ttlMs = redis.call('PTTL', KEYS[1])
  if ttlMs <= 0 then ttlMs = tonumber(ARGV[1]) * 1000 end
  return { 1, ttlMs }
end
return { 0, count }
`;

const getClientIp = (req) => req.ip || req.connection?.remoteAddress || 'unknown';

// node-redis keeps `isOpen` true across reconnect attempts and would otherwise
// buffer this command in the offline queue, so only issue the script when the
// client is ready right now; otherwise fail open below.
const isClientReady = (client) => {
  return Boolean(client) && client.isOpen === true && client.isReady === true;
};

const runLoginLimitCheck = async (client, key) => {
  const result = await client.eval(LOGIN_RATE_LIMIT_SCRIPT, {
    keys: [key],
    arguments: [String(TTL_SECONDS), String(LOGIN_IP_MAX_ATTEMPTS)],
  });

  const blocked = Number(result[0]) === 1;
  const value = Number(result[1]);

  return {
    blocked,
    attempts: blocked ? null : value,
    retryAfterSeconds: blocked ? Math.max(1, Math.ceil(value / 1000)) : null,
  };
};

const loginRateLimit = async (req, res, next) => {
  try {
    const clientIp = getClientIp(req);
    const key = `ratelimit:login:ip:${clientIp}`;
    const client = getRedisClient();

    if (!isClientReady(client)) {
      // Redis is unavailable or not ready: fail open, the same as before.
      return next();
    }

    const outcome = await runLoginLimitCheck(client, key);

    if (!outcome.blocked) {
      return next();
    }

    res.setHeader('Retry-After', String(outcome.retryAfterSeconds));
    return res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Ban da vuot qua gioi han dang nhap. Vui long thu lai sau.'
      }
    });
  } catch (error) {
    // Never leak a raw Redis error to the client; fail open instead.
    logger.error({ err: { message: error.message }, requestId: req.requestId }, 'Login rate limit error');
    return next();
  }
};

module.exports = {
  loginRateLimit,
  runLoginLimitCheck,
  LOGIN_RATE_LIMIT_SCRIPT,
  TTL_SECONDS,
  LOGIN_IP_MAX_ATTEMPTS,
};