/**
 * Complaint flow service — confirmation-gated persistence.
 *
 * Core business feature must not depend on an LLM provider being available:
 * a complaint is only ever persisted AFTER the user explicitly confirms it.
 * This service owns the "awaiting confirmation" state between chat turns.
 *
 * Production:   Uses Redis (via cacheService). Redis failure → pending state
 *               is treated as absent (a complaint is simply re-asked next
 *               turn; nothing is ever persisted without confirmation).
 * Test/dev:     In-memory fallback only when
 *               COMPLAINT_CONFIRM_MEMORY_FALLBACK_ENABLED=true or NODE_ENV=test.
 *
 * Keys: complaint:pending:user:<userId>:<sessionId>
 * TTL:  configurable via COMPLAINT_CONFIRM_TTL_SECONDS (default 1800 = 30 min)
 */

const cache = require('./cacheService');
const logger = require('../utils/logger');

const TTL_SECONDS = parseInt(process.env.COMPLAINT_CONFIRM_TTL_SECONDS, 10) || 1800;
const KEY_PREFIX = 'complaint:pending:';

const MEMORY_FALLBACK_ENABLED =
  process.env.COMPLAINT_CONFIRM_MEMORY_FALLBACK_ENABLED === 'true' ||
  process.env.NODE_ENV === 'test';

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

function buildKey(userId, sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return null;
  if (userId && typeof userId === 'string') {
    return `${KEY_PREFIX}user:${userId}:${sessionId}`;
  }
  return `${KEY_PREFIX}anon:${sessionId}`;
}

/** Mark this user+session as awaiting complaint confirmation. */
async function setPending(userId, sessionId, data) {
  const key = buildKey(userId, sessionId);
  if (!key) return false;

  const safe = {
    state: 'awaiting_confirmation',
    createdAt: new Date().toISOString(),
    ...(data || {}),
  };

  try {
    await cache.set(key, safe, TTL_SECONDS);
    return true;
  } catch (err) {
    logger.warn({ err, key }, 'Complaint confirmation state set failed (Redis)');
  }

  if (memorySet(key, safe)) return true;
  return false;
}

/** Return the pending confirmation state, or null when absent/expired. */
async function getPending(userId, sessionId) {
  const key = buildKey(userId, sessionId);
  if (!key) return null;

  try {
    const value = await cache.get(key);
    if (value != null) return value;
  } catch (err) {
    logger.warn({ err, key }, 'Complaint confirmation state get failed (Redis)');
  }

  return memoryGet(key);
}

/** Clear the pending confirmation state (after create, decline, or expiry). */
async function clearPending(userId, sessionId) {
  const key = buildKey(userId, sessionId);
  if (!key) return;

  try {
    await cache.del(key);
  } catch (err) {
    logger.warn({ err, key }, 'Complaint confirmation state del failed (Redis)');
  }

  memoryDelete(key);
}

const normalizePhrase = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:\-–—"''‘’“”]+$/, '')
    .trim();
};

const AFFIRM_EXACT = new Set([
  'có', 'vâng', 'dạ', 'dạ vâng', 'dạ có', 'vâng có',
  'đồng ý', 'tôi đồng ý', 'mình đồng ý', 'em đồng ý',
  'ok', 'oke', 'okay', 'okiii', 'được', 'được rồi', 'ừ', 'ừm',
  'gửi', 'gửi đi', 'gửi nhé', 'gửi khiếu nại', 'tôi muốn gửi',
  'hãy gửi', 'xác nhận', 'tôi xác nhận', 'đúng', 'đúng vậy',
]);

const DECLINE_EXACT = new Set([
  'không', 'không cần', 'không đâu', 'không phải', 'không muốn',
  'không gửi', 'không gửi khiếu nại', 'thôi', 'thôi bỏ', 'thôi khỏi',
  'thôi không gửi', 'bỏ', 'bỏ đi', 'bỏ qua', 'hủy', 'hủy bỏ',
  'đừng', 'đừng gửi', 'kệ', 'kệ đi', 'thôi không cần',
]);

const CONTACT_RE = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(0|\+84)[\s.]?\d{9,10})/;

/**
 * Interpret a reply in a pending complaint confirmation.
 *
 *   'confirmed' — user explicitly agrees / provided contact info
 *   'declined'  — user explicitly says no
 *   'ambiguous' — neither (e.g. a continued description or unrelated topic)
 *
 * Deterministic on purpose: confirmation works with no LLM provider available.
 */
function classifyComplaintConfirmation(message) {
  const normalized = normalizePhrase(message);
  if (!normalized) return 'ambiguous';

  if (AFFIRM_EXACT.has(normalized)) return 'confirmed';
  if (DECLINE_EXACT.has(normalized)) return 'declined';

  // A message that provides contact info is explicit engagement in the complaint.
  if (CONTACT_RE.test(normalized) && !/không|không\s+gửi|thôi/.test(normalized)) {
    return 'confirmed';
  }

  // Continuations like "gửi giúp em" / "anh gửi" / "tôi gửi khiếu nại nhé".
  if (/^(gửi|tôi\s+gửi|mình\s+gửi|em\s+gửi|gửi\s+giúp|hãy\s+gửi)/.test(normalized) && !/gì|không|chưa|sao|nào|bao\s+nhiêu/.test(normalized)) {
    return 'confirmed';
  }

  if (/^(không|đừng|thôi|hủy)/.test(normalized) &&
      normalized.length <= 20 &&
      !/(lỗi|hỏng|hư|vỡ|thiếu|sai|hàng|sản\s*phẩm|điện\s*thoại|máy|mô\s*tả|nhận|giao|khiếu|phàn)/.test(normalized)) {
    return 'declined';
  }

  return 'ambiguous';
}

/** Test helper. */
function _clearMemoryStore() {
  if (memoryStore) memoryStore.clear();
}

module.exports = {
  setPending,
  getPending,
  clearPending,
  buildKey,
  classifyComplaintConfirmation,
  AFFIRM_EXACT,
  DECLINE_EXACT,
  _clearMemoryStore,
};