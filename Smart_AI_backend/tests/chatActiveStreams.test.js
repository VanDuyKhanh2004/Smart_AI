/* ------------------------------------------------------------------ */
/*  chatActiveStreams registry tests                                   */
/*                                                                     */
/*  Verifies the process-local live-stream registry backing the        */
/*  "Stop AI generation" feature: register / abort / markCompleted /   */
/*  remove / removeForSocket / isCompleted, plus TTL cleanup and the   */
/*  user+session+id identity scoping.                                  */
/*                                                                     */
/*  No real sockets, Redis, MongoDB, or LLM calls are made.            */
/* ------------------------------------------------------------------ */

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn(() => undefined),
}));

const registry = require('../services/chatActiveStreams');

const USER_A = '507f1f77bcf86cd799439011';
const USER = USER_A;
const USER_B = '507f1f77bcf86cd799439012';
const SESSION = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_OTHER = '550e8400-e29b-41d4-a716-446655440001';
const CLIENT_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const SOCKET_A = 'socket-a';
const SOCKET_B = 'socket-b';

function makeController() {
  return new AbortController();
}

describe('chatActiveStreams', () => {
  beforeEach(() => {
    registry._resetLocal();
    jest.clearAllMocks();
  });

  it('register stores an entry retrievable by the same identity', () => {
    const controller = makeController();
    registry.register({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID, controller, socketId: SOCKET_A });
    const entry = registry.get({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID });
    expect(entry).not.toBeNull();
    expect(entry.controller).toBe(controller);
    expect(entry.socketId).toBe(SOCKET_A);
  });

  it('requires an AbortController at register', () => {
    expect(() =>
      registry.register({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID, controller: {}, socketId: SOCKET_A })
    ).toThrow('AbortController');
  });

  it('abort aborts the controller exactly once and removes the entry', () => {
    const controller = makeController();
    registry.register({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID, controller, socketId: SOCKET_A });

    const first = registry.abort({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID });
    expect(first.found).toBe(true);
    expect(controller.signal.aborted).toBe(true);

    // Second abort finds nothing (already removed).
    const second = registry.abort({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID });
    expect(second.found).toBe(false);
    expect(registry._getActiveSize()).toBe(0);
  });

  it('keys are scoped to (user, session, clientMessageId) — other users/sessions miss', () => {
    const controller = makeController();
    registry.register({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID, controller, socketId: SOCKET_A });

    // Different trusted user -> miss.
    expect(registry.abort({ userId: USER_B, sessionId: SESSION, clientMessageId: CLIENT_ID }).found).toBe(false);
    // Different session -> miss.
    expect(registry.abort({ userId: USER, sessionId: SESSION_OTHER, clientMessageId: CLIENT_ID }).found).toBe(false);
    expect(registry._getActiveSize()).toBe(1);
  });

  it('markCompletes moves the entry from active to completed (already_completed)', () => {
    const controller = makeController();
    registry.register({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID, controller, socketId: SOCKET_A });
    registry.markCompleted({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID });

    expect(registry.get({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID })).toBeNull();
    expect(registry.abort({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID }).found).toBe(false);
    expect(registry.isCompleted({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID })).toBe(true);
  });

  it('register supers a stale completed mark for the same identity', () => {
    const c1 = makeController();
    registry.register({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID, controller: c1, socketId: SOCKET_A });
    registry.markCompleted({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID });

    const c2 = makeController();
    registry.register({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID, controller: c2, socketId: SOCKET_A });
    expect(registry.isCompleted({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID })).toBe(false);
    expect(registry._getCompletedSize()).toBe(0);
  });

  it('remove only clears the active entry and never aborts', () => {
    const controller = makeController();
    registry.register({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID, controller, socketId: SOCKET_A });
    registry.remove({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID });

    expect(registry._getActiveSize()).toBe(0);
    expect(controller.signal.aborted).toBe(false);
  });

  it('removeForSocket aborts and removes every entry owned by the socket', () => {
    const c1 = makeController();
    const c2 = makeController();
    const c3 = makeController();
    registry.register({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID, controller: c1, socketId: SOCKET_A });
    registry.register({ userId: USER, sessionId: SESSION_OTHER, clientMessageId: '6ba7b810-9dad-11d1-80b4-00c04fd430c9', controller: c2, socketId: SOCKET_A });
    registry.register({ userId: USER, sessionId: SESSION_OTHER, clientMessageId: '6ba7b810-9dad-11d1-80b4-00c04fd430ca', controller: c3, socketId: SOCKET_B });

    registry.removeForSocket(SOCKET_A);

    expect(c1.signal.aborted).toBe(true);
    expect(c2.signal.aborted).toBe(true);
    expect(c3.signal.aborted).toBe(false);
    expect(registry._getActiveSize()).toBe(1);
  });

  it('abort on an unknown id returns not found', () => {
    expect(registry.abort({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID }).found).toBe(false);
    expect(registry.isCompleted({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID })).toBe(false);
  });

  it('expired active entries are swept away', () => {
    const controller = makeController();
    registry.register({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID, controller, socketId: SOCKET_A });
    registry._forceExpireActive();
    // Any op triggers an internal sweep; an expired active entry is dropped.
    registry.register({ userId: USER, sessionId: SESSION_OTHER, clientMessageId: '6ba7b810-9dad-11d1-80b4-00c04fd430cd', controller: makeController(), socketId: SOCKET_B });
    expect(registry._getActiveSize()).toBe(1);
  });

  it('an expired ACTIVE entry aborts its controller before being deleted', () => {
    const controller = makeController();
    registry.register({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID, controller, socketId: SOCKET_A });
    registry._forceExpireActive();
    // A sweep triggered by any op must ABORT the stale controller, not just
    // forget it — otherwise the in-flight provider call would run to completion
    // orphaned (STREAM_CANCELLED must surface instead).
    registry.register({ userId: USER, sessionId: SESSION_OTHER, clientMessageId: '6ba7b810-9dad-11d1-80b4-00c04fd430cd', controller: makeController(), socketId: SOCKET_B });
    expect(controller.signal.aborted).toBe(true);
    expect(registry._getActiveSize()).toBe(1);
  });

  it('expired completed marks are swept away', () => {
    const controller = makeController();
    registry.register({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID, controller, socketId: SOCKET_A });
    registry.markCompleted({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID });
    registry._forceExpireCompleted();
    // Re-register triggers sweep which drops the expired completed mark.
    registry.register({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID, controller: makeController(), socketId: SOCKET_A });
    expect(registry.isCompleted({ userId: USER, sessionId: SESSION, clientMessageId: CLIENT_ID })).toBe(false);
  });
});