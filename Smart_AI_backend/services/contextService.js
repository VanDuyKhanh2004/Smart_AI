/**
 * Context storage service for multi-turn shopping memory.
 *
 * Production:   Uses Redis (via cacheService). Redis failure → stateless.
 *               No in-memory fallback (unsafe under horizontal scaling).
 * Test/dev:     In-memory fallback only when
 *               CHAT_CONTEXT_MEMORY_FALLBACK_ENABLED=true or NODE_ENV=test.
 *
 * Keys:
 *   Authenticated  -> chat:context:user:<userId>:<sessionId>
 *   Anonymous      -> chat:context:anon:<sessionId>
 *
 * Legacy: pre-ownership deployments only ever wrote `chat:context:anon:<sessionId>`
 * (and very old `user:`-prefixed identities via the old buildKey). After this fix
 * authenticated callers always scope by trusted userId, so they never read those
 * legacy anonymous keys. Legacy anon keys are simply ignored going forward; no
 * migration of ownership is performed and no ownership is guessed.
 * TTL:  configurable via CHAT_CONTEXT_TTL_SECONDS (default 1800 = 30 min)
 */

const cache = require('./cacheService');
const logger = require('../utils/logger');

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const ENABLED = process.env.CHAT_CONTEXT_ENABLED !== 'false';
const TTL_SECONDS = parseInt(process.env.CHAT_CONTEXT_TTL_SECONDS, 10) || 1800;
const MAX_TURNS = parseInt(process.env.CHAT_CONTEXT_MAX_TURNS, 10) || 20;
const KEY_PREFIX = 'chat:context:';

/**
 * In-memory fallback is ONLY active when explicitly enabled.
 * Default: false — production deployments use Redis exclusively.
 */
const MEMORY_FALLBACK_ENABLED =
  process.env.CHAT_CONTEXT_MEMORY_FALLBACK_ENABLED === 'true' ||
  process.env.NODE_ENV === 'test';

/* ------------------------------------------------------------------ */
/*  In-memory store (guarded)                                          */
/* ------------------------------------------------------------------ */

const memoryStore = MEMORY_FALLBACK_ENABLED ? new Map() : null;

function memorySet(key, data) {
  if (!MEMORY_FALLBACK_ENABLED || !memoryStore) return false;
  try {
    memoryStore.set(key, { data, expiresAt: Date.now() + TTL_SECONDS * 1000 });
    return true;
  } catch {
    return false;
  }
}

function memoryGet(key) {
  if (!MEMORY_FALLBACK_ENABLED || !memoryStore) return null;
  try {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt > Date.now()) return entry.data;
    memoryStore.delete(key);
    return null;
  } catch {
    return null;
  }
}

function memoryDelete(key) {
  if (!MEMORY_FALLBACK_ENABLED || !memoryStore) return;
  try {
    memoryStore.delete(key);
  } catch {
    // ignore
  }
}

function memoryHas(key) {
  if (!MEMORY_FALLBACK_ENABLED || !memoryStore) return false;
  try {
    return memoryStore.has(key);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Key helpers                                                        */
/* ------------------------------------------------------------------ */

function buildKey(userId, sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return null;
  if (userId && typeof userId === 'string') {
    return `${KEY_PREFIX}user:${userId}:${sessionId}`;
  }
  return `${KEY_PREFIX}anon:${sessionId}`;
}

function isEnabled() {
  return ENABLED;
}

/* ------------------------------------------------------------------ */
/*  Storage operations                                                 */
/* ------------------------------------------------------------------ */

/**
 * Save conversation context scoped to a user.
 *
 * Authenticated callers pass the trusted userId; when userId is null/empty the
 * context is stored under an anonymous session key (preserving the existing
 * anonymous/local UX path).
 *
 * Production:   Writes to Redis via cacheService. Failure → log + return false.
 *               Never falls back to memory.
 * Test:         Same, unless MEMORY_FALLBACK is enabled.
 *
 * Returns true if saved successfully, false otherwise.
 */
async function saveContext(userId, sessionId, context) {
  if (!isEnabled() || !sessionId || !context) return false;

  const key = buildKey(userId, sessionId);
  if (!key) return false;

  const safe = { ...context };
  if (safe.turnCount && safe.turnCount > MAX_TURNS) {
    safe.turnCount = MAX_TURNS;
  }
  safe.updatedAt = new Date().toISOString();

  // Try cacheService (Redis)
  try {
    await cache.set(key, safe, TTL_SECONDS);
    return true;
  } catch (err) {
    // Redis failure — log safely and fall through to memory if allowed
    logger.warn({ err, key }, 'Context cache set failed');
  }

  // In-memory fallback (only in test/dev when explicitly enabled)
  if (memorySet(key, safe)) {
    return true;
  }

  return false;
}

/**
 * Load conversation context scoped to a user.
 *
 * Production:   Reads from Redis via cacheService. Failure/not-found → null.
 *               No fallback to memory.
 * Test:         Same, unless MEMORY_FALLBACK is enabled.
 */
async function loadContext(userId, sessionId) {
  if (!isEnabled() || !sessionId) return null;

  const key = buildKey(userId, sessionId);
  if (!key) return null;

  // Try cacheService (Redis)
  try {
    const value = await cache.get(key);
    if (value != null) return value;
  } catch (err) {
    logger.warn({ err, key }, 'Context cache get failed');
  }

  // In-memory fallback (only in test/dev when explicitly enabled)
  const mem = memoryGet(key);
  if (mem != null) return mem;

  return null;
}

/**
 * Delete conversation context scoped to a user.
 */
async function deleteContext(userId, sessionId) {
  if (!sessionId) return;

  const key = buildKey(userId, sessionId);
  if (!key) return;

  try {
    await cache.del(key);
  } catch (err) {
    logger.warn({ err, key }, 'Context cache del failed');
  }

  memoryDelete(key);
}

/**
 * Check if context exists (primarily for testing).
 */
async function contextExists(userId, sessionId) {
  if (!sessionId) return false;

  const key = buildKey(userId, sessionId);
  if (!key) return false;

  try {
    const exists = await cache.exists(key);
    if (exists) return true;
  } catch {
    // fall through
  }

  return memoryHas(key);
}

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

function _clearMemoryStore() {
  if (memoryStore) memoryStore.clear();
}

module.exports = {
  saveContext,
  loadContext,
  deleteContext,
  contextExists,
  buildKey,
  isEnabled,
  _clearMemoryStore,
};
