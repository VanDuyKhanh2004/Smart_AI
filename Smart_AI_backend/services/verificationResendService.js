const { getRedisClient } = require('../configs/redis');
const { AppError } = require('../utils/errors');

const COOLDOWN_SECONDS = 60;
const WINDOW_SECONDS = 15 * 60;
const WINDOW_MAX = 5;

const readPositiveInt = (envName, fallback) => {
  const parsed = Number(process.env[envName]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const COOLDOWN_TTL_SECONDS = readPositiveInt('VERIFICATION_RESEND_COOLDOWN_SECONDS', COOLDOWN_SECONDS);
const WINDOW_TTL_SECONDS = readPositiveInt('VERIFICATION_RESEND_WINDOW_SECONDS', WINDOW_SECONDS);
const WINDOW_LIMIT = readPositiveInt('VERIFICATION_RESEND_WINDOW_MAX', WINDOW_MAX);

const PREFIX = 'auth:email-verification:resend';
const cooldownKey = (userId) => `${PREFIX}:cooldown:${userId}`;
const windowKey = (userId) => `${PREFIX}:window:${userId}`;

const UNAVAILABLE_MESSAGE = 'Hệ thống chưa sẵn sàng xử lý gửi lại email. Vui lòng thử lại sau.';
const UNAVAILABLE_CODE = 'VERIFICATION_THROTTLE_UNAVAILABLE';

const throwUnavailable = () => {
  throw new AppError(UNAVAILABLE_MESSAGE, 503, UNAVAILABLE_CODE);
};

// Returns the shared client only when it can actually serve commands.
// node-redis keeps isOpen true across reconnect attempts, so isReady is the
// signal that a live socket exists. Without this gate, commands would pile
// into the offline queue while Redis is down, hanging the request until a
// reconnect — or surfacing a raw node-redis error.
const getOpenClient = () => {
  const client = getRedisClient();
  if (!client || client.isOpen !== true || client.isReady !== true) {
    throwUnavailable();
  }
  return client;
};

// Runs a Redis command against a ready client and converts any transient
// connection/socket error into the deterministic 503 so raw node-redis errors
// never reach the API response. Our own AppError (503) passes through.
const runRedisCommand = async (command) => {
  const client = getOpenClient();
  try {
    return await command(client);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throwUnavailable();
  }
};

const isClientReady = () => {
  const client = getRedisClient();
  return !!(client && client.isOpen === true && client.isReady === true);
};

const getCooldownSeconds = () => COOLDOWN_TTL_SECONDS;

/**
 * Atomically claims the per-account 60-second resend cooldown using SET NX EX.
 * No GET-then-SET is involved, so near-simultaneous requests can never both
 * claim the cooldown for the same account.
 *
 * @returns {Promise<{ allowed: boolean, retryAfterSeconds: number }>}
 */
const claimResendCooldown = async (userId) => {
  const key = cooldownKey(String(userId));

  const result = await runRedisCommand((client) =>
    client.set(key, '1', { NX: true, EX: COOLDOWN_TTL_SECONDS })
  );
  if (result === 'OK' || result === true) {
    return { allowed: true, retryAfterSeconds: COOLDOWN_TTL_SECONDS };
  }

  let remainingMs = COOLDOWN_TTL_SECONDS * 1000;
  try {
    const pttl = await runRedisCommand((client) => client.pTTL(key));
    if (Number.isFinite(pttl) && pttl >= 0) {
      remainingMs = pttl;
    }
  } catch {
    // The cooldown was already claimed above, so a failed TTL probe must not
    // convert this legitimate denial into a 503 — fall back to the full
    // cooldown duration instead.
  }

  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
};

// Start a cooldown without throwing (used by registration, which must never be
// blocked by a stale cooldown key or a temporarily unavailable Redis).
const startResendCooldown = async (userId) => {
  try {
    if (!isClientReady()) {
      return false;
    }
    await getRedisClient().set(cooldownKey(userId), '1', { NX: true, EX: COOLDOWN_TTL_SECONDS });
    return true;
  } catch {
    return false;
  }
};

// Roll back a cooldown that this request alone just claimed. Only the holder of
// the SET NX EX claim reaches the long-window check, so deleting the key cannot
// release another in-flight request's cooldown. A long-window rejection thus
// does not leave an extra 60-second cooldown on top of the 15-minute denial.
const releaseResendCooldown = async (userId) => {
  try {
    if (!isClientReady()) {
      return false;
    }
    await getRedisClient().del(cooldownKey(userId));
    return true;
  } catch {
    return false;
  }
};

const getWindowCount = async (userId) => {
  const value = await runRedisCommand((client) => client.get(windowKey(userId)));
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

const getWindowRemainingSeconds = async (userId) => {
  const ttl = await runRedisCommand((client) => client.ttl(windowKey(userId)));
  return Number.isFinite(ttl) && ttl > 0 ? ttl : WINDOW_TTL_SECONDS;
};

/**
 * Read-only long-window check (5 resends / 15 min per account). The 60-second
 * cooldown serializes claims to at most one per second per account, so this
 * check-then-increment ordering cannot drift past the limit under load.
 *
 * @returns {Promise<{ allowed: boolean }|{ allowed: true }|{ allowed: false, retryAfterSeconds: number }>}
 */
const checkLongWindow = async (userId) => {
  const count = await getWindowCount(userId);
  if (count >= WINDOW_LIMIT) {
    return { allowed: false, retryAfterSeconds: Math.max(1, await getWindowRemainingSeconds(userId)) };
  }
  return { allowed: true };
};

/**
 * Record one successful resend in the 15-minute window. Counts only after the
 * email time-to-live has actually been rotated and the email queued.
 *
 * @returns {Promise<{ count: number }>}
 */
const incrementLongWindow = async (userId) => {
  const key = windowKey(userId);
  const count = await runRedisCommand((client) => client.incr(key));
  if (count === 1) {
    await runRedisCommand((client) => client.expire(key, WINDOW_TTL_SECONDS));
  }
  return { count };
};

module.exports = {
  claimResendCooldown,
  startResendCooldown,
  releaseResendCooldown,
  checkLongWindow,
  incrementLongWindow,
  getCooldownSeconds,
};