/* ------------------------------------------------------------------ */
/*  Chat message dedup / correlation service tests                     */
/*                                                                     */
/*  Verifies claim / markCompleted / release behavior for the chat     */
/*  message duplicate guard. Redis is NOT available in tests, so the   */
/*  bounded process-local fallback is exercised. The real Redis path   */
/*  is surfaced through the same code branch by mocking configs/redis. */
/*                                                                     */
/*  No real Redis, MongoDB, or LLM calls are made.                     */
/* ------------------------------------------------------------------ */

process.env.CHAT_MESSAGE_DEDUP_LOCAL_MAX = '5';

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn(() => undefined),
}));

// Default: configs/redis returns a null client -> local fallback.
jest.mock('../configs/redis', () => ({
  getRedisClient: jest.fn(() => null),
  connectRedis: jest.fn(),
  disconnectRedis: jest.fn(),
}));

const dedup = require('../services/chatMessageDedupService');

const USER = '507f1f77bcf86cd799439011';
const SESSION = '550e8400-e29b-41d4-a716-446655440000';
const CLIENT_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('chatMessageDedupService', () => {
  beforeEach(() => {
    dedup._resetLocal();
    jest.clearAllMocks();
  });

  it('claims a new id once', async () => {
    const result = await dedup.claim(USER, SESSION, CLIENT_ID);
    expect(result).toEqual({
      claimed: true,
      duplicate: false,
      state: 'processing',
    });
  });

  it('reports a duplicate while processing', async () => {
    await dedup.claim(USER, SESSION, CLIENT_ID);
    const dup = await dedup.claim(USER, SESSION, CLIENT_ID);
    expect(dup.claimed).toBe(false);
    expect(dup.duplicate).toBe(true);
    expect(dup.state).toBe('processing');
  });

  it('replays a completed payload on duplicate delivery', async () => {
    const aiPayload = {
      sessionId: SESSION,
      clientMessageId: CLIENT_ID,
      message: 'Xin chào!',
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    await dedup.claim(USER, SESSION, CLIENT_ID);
    await dedup.markCompleted(USER, SESSION, CLIENT_ID, aiPayload);

    const dup = await dedup.claim(USER, SESSION, CLIENT_ID);
    expect(dup.claimed).toBe(false);
    expect(dup.duplicate).toBe(true);
    expect(dup.state).toBe('completed');
    expect(dup.payload).toEqual(aiPayload);
  });

  test('release lets the same id be reprocessed', async () => {
    await dedup.claim(USER, SESSION, CLIENT_ID);
    await dedup.release(USER, SESSION, CLIENT_ID);
    const again = await dedup.claim(USER, SESSION, CLIENT_ID);
    expect(again.claimed).toBe(true);
    expect(again.duplicate).toBe(false);
  });

  test('revivePayload returns a fresh copy', async () => {
    const original = { a: 1, b: 2 };
    const revived = dedup.revivePayload(original);
    expect(revived).toEqual(original);
    expect(revived).not.toBe(original);
  });

  test('revivePayload handles a null payload', () => {
    expect(dedup.revivePayload(null)).toBeNull();
  });

  test('expired local claims can be reclaimed', async () => {
    await dedup.claim(USER, SESSION, CLIENT_ID);
    dedup._forceExpireLocal();
    const again = await dedup.claim(USER, SESSION, CLIENT_ID);
    expect(again.claimed).toBe(true);
    expect(again.duplicate).toBe(false);
  });

  test('local store is bounded by CHAT_MESSAGE_DEDUP_LOCAL_MAX', async () => {
    for (let i = 0; i < 20; i += 1) {
      await dedup.claim(USER, SESSION, `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    }
    expect(dedup._getLocalSize()).toBeLessThanOrEqual(5);
  });

  test('buildKey scopes id to trusted user and session', () => {
    expect(dedup.buildKey(USER, SESSION, CLIENT_ID)).toBe(
      `chat:message:user:${USER}:${SESSION}:${CLIENT_ID}`
    );
  });
});