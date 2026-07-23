/**
 * Context storage service for multi-turn shopping memory.
 *
 * Production:   Uses Redis (via cacheService). Redis failure → stateless.
 *               No in-memory fallback (unsafe under horizontal scaling).
 * Test/dev:     In-memory fallback only when
 *               CHAT_CONTEXT_MEMORY_FALLBACK_ENABLED=true or NODE_ENV=test.
 *
 * Keys: chat:context:anon:<sessionId>
 * TTL:  configurable via CHAT_CONTEXT_TTL_SECONDS (default 1800 = 30 min)
 */

const cache = require('./cacheService');

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

function buildKey(identity) {
  if (!identity || typeof identity !== 'string') return null;
  if (identity.startsWith('user:')) return `${KEY_PREFIX}${identity}`;
  return `${KEY_PREFIX}anon:${identity}`;
}

function isEnabled() {
  return ENABLED;
}

/* ------------------------------------------------------------------ */
/*  Storage operations                                                 */
/* ------------------------------------------------------------------ */

/**
 * Save conversation context.
 *
 * Production:   Writes to Redis via cacheService. Failure → log + return false.
 *               Never falls back to memory.
 * Test:         Same, unless MEMORY_FALLBACK is enabled.
 *
 * Returns true if saved successfully, false otherwise.
 */
async function saveContext(identity, context) {
  if (!isEnabled() || !identity || !context) return false;

  const key = buildKey(identity);
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
    console.log(`[Context] cache.set failed for ${key}: ${err.message}`);
  }

  // In-memory fallback (only in test/dev when explicitly enabled)
  if (memorySet(key, safe)) {
    return true;
  }

  return false;
}

/**
 * Load conversation context.
 *
 * Production:   Reads from Redis via cacheService. Failure/not-found → null.
 *               No fallback to memory.
 * Test:         Same, unless MEMORY_FALLBACK is enabled.
 */
async function loadContext(identity) {
  if (!isEnabled() || !identity) return null;

  const key = buildKey(identity);
  if (!key) return null;

  // Try cacheService (Redis)
  try {
    const value = await cache.get(key);
    if (value != null) return value;
  } catch (err) {
    console.log(`[Context] cache.get failed for ${key}: ${err.message}`);
  }

  // In-memory fallback (only in test/dev when explicitly enabled)
  const mem = memoryGet(key);
  if (mem != null) return mem;

  return null;
}

/**
 * Delete conversation context.
 */
async function deleteContext(identity) {
  if (!identity) return;

  const key = buildKey(identity);
  if (!key) return;

  try {
    await cache.del(key);
  } catch (err) {
    console.log(`[Context] cache.del failed for ${key}: ${err.message}`);
  }

  memoryDelete(key);
}

/**
 * Check if context exists (primarily for testing).
 */
async function contextExists(identity) {
  if (!identity) return false;

  const key = buildKey(identity);
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
