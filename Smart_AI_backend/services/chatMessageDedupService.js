/**
 * Chat message correlation / duplicate-processing guard.
 *
 * Client sends an immutable `clientMessageId` (UUID) with every `sendMessage`.
 * The server must run the AI pipeline exactly once per (user, session, id) and
 * replay the final response when the same id is delivered again.
 *
 * Storage:
 *   Redis key: chat:message:user:<userId>:<sessionId>:<clientMessageId>
 *   value:     JSON { state: 'processing' | 'completed', payload? }
 *   TTL:       CHAT_MESSAGE_DEDUP_TTL_SECONDS (default 1800s)
 *
 * State machine:
 *   - first delivery   -> SET NX claims 'processing'  -> run pipeline once
 *   - redeliver while processing -> duplicate + status 'processing'
 *   - redeliver after completion -> status 'completed' + queued aiResponse payload
 *   - failure:          -> release() deletes the claim so an explicit resend works
 *
 * Redis-unavailable resilience:
 *   A bounded, process-local LRU-ish Map never blocks the chat. Cross-instance
 *   duplicate guarantees require a shared store (Redis); without it, guarantees
 *   are per-process only.
 *
 * Message content is NEVER included in keys, values, or logs.
 */

const { getRedisClient } = require('../configs/redis');
const logger = require('../utils/logger');

const TTL_SECONDS = parseInt(process.env.CHAT_MESSAGE_DEDUP_TTL_SECONDS, 10) || 1800;
const LOCAL_MAX = parseInt(process.env.CHAT_MESSAGE_DEDUP_LOCAL_MAX, 10) || 1000;
const KEY_PREFIX = 'chat:message:user:';

// Process-local fallback used only when Redis is unavailable. Bounded.
const localStore = new Map();

function now() {
  return Date.now();
}

function buildKey(userId, sessionId, clientMessageId) {
  return `${KEY_PREFIX}${userId}:${sessionId}:${clientMessageId}`;
}

function encode(state, payload) {
  return JSON.stringify(payload ? { state, payload } : { state });
}

function decode(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.state === undefined) return null;
    if (!['processing', 'completed'].includes(parsed.state)) return null;
    return { state: parsed.state, payload: parsed.payload };
  } catch {
    return null;
  }
}

function sweepLocal() {
  if (localStore.size <= LOCAL_MAX) return;
  const t = now();
  for (const [key, entry] of localStore) {
    if (entry.expiresAt <= t) localStore.delete(key);
  }
  while (localStore.size > LOCAL_MAX) {
    const oldest = localStore.keys().next().value;
    if (oldest === undefined) break;
    localStore.delete(oldest);
  }
}

function localClaim(key) {
  if (localStore.has(key)) {
    const entry = localStore.get(key);
    if (entry.expiresAt > now()) {
      return {
        claimed: false,
        duplicate: true,
        state: entry.record.state,
        payload: entry.record.payload,
      };
    }
    localStore.delete(key);
  }
  localStore.set(key, {
    record: { state: 'processing' },
    expiresAt: now() + TTL_SECONDS * 1000,
  });
  sweepLocal();
  return { claimed: true, duplicate: false, state: 'processing' };
}

async function claim(userId, sessionId, clientMessageId) {
  const key = buildKey(userId, sessionId, clientMessageId);
  const client = getRedisClient && getRedisClient();

  if (client && client.isOpen) {
    const claimed = await client.set(key, encode('processing'), { NX: true, EX: TTL_SECONDS });
    if (claimed === 'OK') {
      return { claimed: true, duplicate: false, state: 'processing' };
    }
    const raw = await client.get(key);
    const rec = decode(raw);
    return {
      claimed: false,
      duplicate: true,
      state: rec ? rec.state : 'processing',
      payload: rec ? rec.payload : undefined,
    };
  }

  return localClaim(key);
}

async function markCompleted(userId, sessionId, clientMessageId, payload) {
  const key = buildKey(userId, sessionId, clientMessageId);
  const client = getRedisClient && getRedisClient();
  if (client && client.isOpen) {
    await client.setEx(key, TTL_SECONDS, encode('completed', payload));
    return;
  }
  localStore.set(key, {
    record: { state: 'completed', payload },
    expiresAt: now() + TTL_SECONDS * 1000,
  });
  sweepLocal();
}

/**
 * Remove the claim so an explicit retry of the same id can be processed again.
 * On failure we must NOT leave a permanently-blocking 'completed' state.
 */
async function release(userId, sessionId, clientMessageId) {
  const key = buildKey(userId, sessionId, clientMessageId);
  const client = getRedisClient && getRedisClient();
  if (client && client.isOpen) {
    try {
      await client.del(key);
    } catch (err) {
      logger.warn({ scope: 'chat-message-dedup' }, 'Failed to release dedup key');
    }
    return;
  }
  localStore.delete(key);
}

/** Re-encode a cached replay payload as a fresh live aiResponse object. */
function revivePayload(payload) {
  return payload ? { ...payload } : null;
}

module.exports = {
  claim,
  markCompleted,
  release,
  revivePayload,
  buildKey,
  TTL_SECONDS,
  // test helpers
  _getLocalSize: () => localStore.size,
  _resetLocal: () => localStore.clear(),
  _forceExpireLocal: () => {
    for (const [key, entry] of localStore) {
      localStore.set(key, { ...entry, expiresAt: 0 });
    }
  },
};