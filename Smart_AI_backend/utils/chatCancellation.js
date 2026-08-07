/**
 * Shared cancellation identity for "Stop AI generation".
 *
 * One AbortController per accepted request is created at the socket boundary
 * (socketHandler), registered into chatActiveStreams BEFORE any work begins,
 * and its { signal } is threaded through the whole orchestration
 * (processMessage -> intent -> context -> RAG -> generateResponse ->
 * generateChatResponseStream -> provider wrappers).
 *
 * Every abort surfaces as the SAME error identity so callers can distinguish
 * a user cancellation from a genuine provider failure with a single check:
 *
 *   const error = { aborted: true, cancelled: true, code: "STREAM_CANCELLED" }
 *
 * A cancelled generation is a terminal condition, never a server error, so it
 * is NOT logged with logger.error. The socket boundary maps it to exactly one
 * messageProcessing { status: 'cancelled', reason: 'user_cancelled' } and
 * nothing else.
 */

const STREAM_CANCELLED = "STREAM_CANCELLED";

/** Build the canonical cancellation error (shared identity across layers). */
function cancelledError(message = "Stream aborted") {
  const error = new Error(message);
  error.aborted = true;
  error.cancelled = true;
  error.code = STREAM_CANCELLED;
  return error;
}

/**
 * Guard checkpoint. If the signal has been aborted, throws the canonical
 * STREAM_CANCELLED error immediately so no further work (RAG, provider call,
 * persistence, completion emit) happens after a user stop.
 */
function throwIfCancelled(signal) {
  if (signal && signal.aborted) {
    throw cancelledError();
  }
}

/** True if the error is the canonical user-cancellation identity. */
function isCancellationError(error) {
  return Boolean(
    error &&
    (error.cancelled === true || error.code === STREAM_CANCELLED || error.aborted === true)
  );
}

/**
 * DEV/TEST-ONLY delay hook (CHAT_STREAM_TEST_DELAY_MS). Disabled by default.
 * When set, artificially slows a phase so a human can verify the Stop control
 * across the thinking/streaming window in a local run. It is inert when the
 * delay is unset or 0 and is never used in production paths unless explicitly
 * opted in by the operator. Cancellation still preempts the sleep: if the
 * signal aborts, the delay resolves early and the next checkpoint throws.
 */
function maybeTestDelay(signal) {
  const ms = parseInt(process.env.CHAT_STREAM_TEST_DELAY_MS, 10);
  if (!ms || ms <= 0) return null;
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(cancelledError());
      return;
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(cancelledError());
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

module.exports = { STREAM_CANCELLED, cancelledError, throwIfCancelled, isCancellationError, maybeTestDelay };