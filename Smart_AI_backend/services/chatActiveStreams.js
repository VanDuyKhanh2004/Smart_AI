/**
 * Process-local registry of live chat streams for "Stop AI generation".
 *
 * A stream is registered when a live generation starts (right before the first
 * provider call) and is aborted via an AbortController threaded through the
 * provider SDKs. `stopGeneration` looks up the entry by the SAME identity used
 * everywhere else in the chat pipeline: { userId, sessionId, clientMessageId }.
 *
 * Storage:
 *   active:    Map<key, { controller, socketId, registeredAt }>
 *   completed: Map<key, { completedAt }>   (bounded, for already_completed acks)
 *
 * Key: <userId>:<sessionId>:<clientMessageId> — userId is ALWAYS the trusted
 * socket identity, never a client-supplied value. Message content is never
 * stored in keys, values, or logs.
 *
 * Single-instance only: this is process-local, exactly like the dedup service's
 * Redis-unavailable fallback. Cross-instance stop requires a shared store and is
 * intentionally out of scope.
 *
 * Lifecycle:
 *   - register()   when a live stream begins
 *   - abort()      when the user (or a disconnect) stops it — aborts once, then
 *                  removes the entry
 *   - markCompleted() when the stream finishes normally — moves the entry from
 *                  active to a bounded completed set so a late stopGeneration
 *                  acks 'already_completed' instead of 'not_found'
 *   - remove()     defensive cleanup (e.g. failure paths)
 *   - removeForSocket()  disconnect sweep — aborts + removes every entry owned
 *                  by a disconnected socket
 */

const STREAM_TTL_MS = parseInt(process.env.CHAT_STREAM_TTL_MS, 10) || 30 * 60 * 1000;
const COMPLETED_TTL_MS = parseInt(process.env.CHAT_COMPLETED_TTL_MS, 10) || 15 * 60 * 1000;
const COMPLETED_MAX = parseInt(process.env.CHAT_COMPLETED_MAX, 10) || 2000;

const active = new Map();
const completed = new Map();
// Logical-turn live guard: key is (user, session, logical clientMessageId),
// value is the generationId currently claiming that logical turn. Guards
// against double-click Retry/Regenerate producing two pipelines for one turn,
// even when a fresh generationId is minted per regenerate attempt.
const logical = new Map();

function buildKey(userId, sessionId, id) {
  return `${userId}:${sessionId}:${id}`;
}

// Resolve the generation identity for a registry operation. When a caller
// provides an explicit generationId (regenerate) it is authoritative; otherwise
// the logical clientMessageId IS the generation identity (ordinary send/retry
// default, backward compatible).
function identityId(identity) {
  if (identity && identity.generationId) return identity.generationId;
  return identity.clientMessageId;
}

function sweep() {
  const t = Date.now();
  for (const [key, entry] of active) {
    if (entry.registeredAt + STREAM_TTL_MS <= t) {
      // An expired ACTIVE generation must be stopped, not just forgotten:
      // abort its controller before deleting so any in-flight provider call
      // surfaces STREAM_CANCELLED instead of running to completion orphaned.
      active.delete(key);
      if (!entry.controller.signal.aborted) {
        entry.controller.abort();
      }
    }
  }
  for (const [key, mark] of completed) {
    if (mark.completedAt + COMPLETED_TTL_MS <= t) completed.delete(key);
  }
  while (completed.size > COMPLETED_MAX) {
    const oldest = completed.keys().next().value;
    if (oldest === undefined) break;
    completed.delete(oldest);
  }
}

/**
 * Register a live stream. `controller` is the AbortController the generation
 * should observe; aborting it must be the ONLY way a stream is cancelled.
 *
 * Identity for the registry is the GENERATION identity (generationId, falling
 * back to clientMessageId for ordinary send/retry). A caller that intends to
 * key on a fresh regenerate attempt passes generationId.
 */
function register({ userId, sessionId, clientMessageId, generationId, controller, socketId }) {
  if (!controller || typeof controller.abort !== 'function') {
    throw new Error('chatActiveStreams.register requires an AbortController');
  }
  const id = identityId({ userId, sessionId, clientMessageId, generationId });
  const key = buildKey(userId, sessionId, id);
  // Exactly one registration per key. If the same identity is
  // somehow already live (a collision that must never happen because the dedup
  // claim is held by a single writer), abort the stale entry before replacing
  // it so an orphaned controller can never outlive its generation.
  const existing = active.get(key);
  if (existing && !existing.controller.signal.aborted) {
    existing.controller.abort();
  }
  active.set(key, { controller, socketId, registeredAt: Date.now() });
  completed.delete(key); // a restarted generation supersedes a stale completed mark
  sweep();
}

/** Return the active entry (controller, socketId) or null. */
function get({ userId, sessionId, clientMessageId, generationId }) {
  const id = identityId({ userId, sessionId, clientMessageId, generationId });
  return active.get(buildKey(userId, sessionId, id)) || null;
}

/**
 * Abort a live stream. Returns { found: boolean }. Aborts the controller at
 * most once and removes the entry so a second stopGeneration acks 'not_found'.
 */
function abort({ userId, sessionId, clientMessageId, generationId }) {
  const id = identityId({ userId, sessionId, clientMessageId, generationId });
  const key = buildKey(userId, sessionId, id);
  const entry = active.get(key);
  if (!entry) return { found: false };
  active.delete(key);
  if (!entry.controller.signal.aborted) {
    entry.controller.abort();
  }
  return { found: true };
}

/** A stream finished normally: drop it from active, remember it completed. */
function markCompleted({ userId, sessionId, clientMessageId, generationId }) {
  const id = identityId({ userId, sessionId, clientMessageId, generationId });
  const key = buildKey(userId, sessionId, id);
  active.delete(key);
  completed.set(key, { completedAt: Date.now() });
  sweep();
}

/** Defensive cleanup only (never aborts). */
function remove({ userId, sessionId, clientMessageId, generationId }) {
  const id = identityId({ userId, sessionId, clientMessageId, generationId });
  active.delete(buildKey(userId, sessionId, id));
}

/** Disconnect sweep: abort + remove every live stream owned by a socket. */
function removeForSocket(socketId) {
  if (!socketId) return;
  for (const [key, entry] of active) {
    if (entry.socketId === socketId) {
      active.delete(key);
      if (!entry.controller.signal.aborted) {
        entry.controller.abort();
      }
    }
  }
}

/**
 * True if [Ident] finished (late stopGeneration acks 'already_completed').
 */
function isCompleted({ userId, sessionId, clientMessageId, generationId }) {
  const id = identityId({ userId, sessionId, clientMessageId, generationId });
  return completed.has(buildKey(userId, sessionId, id));
}

/**
 * Logical-turn live guard. Retry/Regenerate must not start a second pipeline
 * for a logical turn that already has an active generation (regenerate mints a
 * fresh generationId per attempt, so the generation-aware registry alone cannot
 * see the collision — this per-logical-turn map closes that gap).
 */
function claimLogical({ userId, sessionId, clientMessageId, generationId }) {
  if (!clientMessageId || !generationId) return false;
  const key = buildKey(userId, sessionId, clientMessageId);
  const existing = logical.get(key);
  if (existing && existing !== generationId) return false; // another attempt is live
  logical.set(key, generationId);
  return true;
}

/** Release the logical-turn guard (must match the generation that claimed it). */
function releaseLogical({ userId, sessionId, clientMessageId, generationId }) {
  if (!clientMessageId) return;
  const key = buildKey(userId, sessionId, clientMessageId);
  if (logical.get(key) === generationId) {
    logical.delete(key);
  }
}

/** True if any attempt of this logical turn is currently active. */
function isLogicalActive({ userId, sessionId, clientMessageId }) {
  if (!clientMessageId) return false;
  return logical.has(buildKey(userId, sessionId, clientMessageId));
}

function clear() {
  active.clear();
  completed.clear();
  logical.clear();
}

module.exports = {
  register,
  get,
  abort,
  markCompleted,
  remove,
  removeForSocket,
  isCompleted,
  claimLogical,
  releaseLogical,
  isLogicalActive,
  clear,
  STREAM_TTL_MS,
  COMPLETED_TTL_MS,
  COMPLETED_MAX,
  // test helpers
  _getActiveSize: () => active.size,
  _getCompletedSize: () => completed.size,
  _getLogicalSize: () => logical.size,
  _resetLocal: () => {
    active.clear();
    completed.clear();
    logical.clear();
  },
  _forceExpireActive: () => {
    for (const [key, entry] of active) {
      active.set(key, { ...entry, registeredAt: Date.now() - STREAM_TTL_MS - 1 });
    }
  },
  _forceExpireCompleted: () => {
    for (const [key, mark] of completed) {
      completed.set(key, { completedAt: Date.now() - COMPLETED_TTL_MS - 1 });
    }
  },
};
