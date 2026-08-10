/**
 * Throttled reconnect / worker-error logging.
 *
 * During a Redis or BullMQ outage each connection emits one retry/error per
 * backoff step. With several BullMQ workers and the shared node-redis client
 * that is many repeated log lines for a single underlying incident.
 *
 * `logReconnectAttempt` logs the first attempt per delay value and never logs
 * the same delay more than once per `intervalMs`, so a fresh delay (new
 * exponential step) still emits a line while a down-server's repeat attempts do
 * not flood the logs.
 *
 * `logWorkerError` collapses repeated Worker 'error' events from the same scrub
 * to one line per interval so a broker outage surfaces as bounded noise without
 * suppressing real errors forever (every interval a message still appears).
 *
 * The throttles are process-local and intentionally shared across the whole
 * process: the same underlying outage is logged once, not once per connection.
 */

const logger = require('./logger');

const RECONNECT_INTERVAL_MS = 15000;
const WORKER_ERROR_INTERVAL_MS = 5000;

const lastLogged = new Map();
function shouldLog(key, intervalMs) {
  const now = Date.now();
  const prev = lastLogged.get(key) || 0;
  if (now - prev >= intervalMs) {
    lastLogged.set(key, now);
    return true;
  }
  return false;
}

/**
 * Log a "reconnect scheduled" line (info), but only when this delay value has
 * not been logged within the interval. Passing the same message with a new
 * delay is treated as a distinct event and always logs.
 */
function logReconnectAttempt(message, attempt, delayMs) {
  const key = `${message}:${delayMs}`;
  if (shouldLog(key, RECONNECT_INTERVAL_MS)) {
    logger.info({ attempt, delayMs }, message);
  }
}

/**
 * Log a Worker connection 'error' event at most once per interval per scope.
 */
function logWorkerError(scope, err) {
  const key = `worker-error:${scope}`;
  if (shouldLog(key, WORKER_ERROR_INTERVAL_MS)) {
    logger.error(
      { queueName: scope, err: { message: err && err.message ? err.message : 'unknown' } },
      'BullMQ worker error',
    );
  }
}

/**
 * Generic throttled warn/error for node-redis client events ('reconnecting',
 * 'error') that otherwise fire once per backoff step during an outage.
 */
function logThrottledWarn(key, message, data = {}) {
  if (shouldLog(key, RECONNECT_INTERVAL_MS)) {
    logger.warn(data, message);
  }
}

function logThrottledError(key, message, data = {}) {
  if (shouldLog(key, RECONNECT_INTERVAL_MS)) {
    logger.error(data, message);
  }
}

// test hook to reset throttle state
function _resetLogThrottle() {
  lastLogged.clear();
}

module.exports = {
  logReconnectAttempt,
  logWorkerError,
  logThrottledWarn,
  logThrottledError,
  _resetLogThrottle,
  RECONNECT_INTERVAL_MS,
  WORKER_ERROR_INTERVAL_MS,
};