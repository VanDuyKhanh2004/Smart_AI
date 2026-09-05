/* ------------------------------------------------------------------ */
/*  Socket-level sendMessage rate limiting & concurrent-slot tests     */
/*                                                                     */
/*  Real Socket.IO server + client. The AI pipeline (chatController)   */
/*  is mocked. Rate limit and concurrent-slot logic are the real ones  */
/*  (process-local Maps in socketHandler).                             */
/*                                                                     */
/*  Rate limit: sliding window, userId-keyed, configurable max.        */
/*  Concurrent: per-user slot count, userId-keyed, configurable max.   */
/*                                                                     */
/*  No real MongoDB, Redis, or LLM calls are made.                     */
/* ------------------------------------------------------------------ */

// MUST be set before any require() — socketHandler reads these at load time
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.SOCKET_SEND_RATE_MAX = '5';
process.env.SOCKET_SEND_CONCURRENT_MAX = '3';

const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const ioc = require('socket.io-client');

jest.mock('pino', () => {
  const mockInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => mockInstance),
    flush: jest.fn(),
  };
  return jest.fn(() => mockInstance);
});

jest.mock('../models/User', () => ({
  findById: jest.fn(),
}));

jest.mock('../controllers/chatController', () => ({
  processMessage: jest.fn(),
  verifyRetryTarget: jest.fn(),
  retryMessage: jest.fn(),
  verifyRegenerateTarget: jest.fn(),
  regenerateMessage: jest.fn(),
}));

const User = require('../models/User');
const chatController = require('../controllers/chatController');
const dedup = require('../services/chatMessageDedupService');
const registry = require('../services/chatActiveStreams');
const socketHandler = require('../socket/socketHandler');

const mockUser = { id: 'user-123', email: 'test@example.com', role: 'user' };
const OTHER_USER = { id: 'user-456', email: 'other@example.com', role: 'user' };
const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const CLIENT_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const CLIENT_ID_2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c9';
const CLIENT_ID_3 = '6ba7b810-9dad-11d1-80b4-00c04fd430d0';
const CLIENT_ID_4 = '6ba7b810-9dad-11d1-80b4-00c04fd430d1';
const CLIENT_ID_5 = '6ba7b810-9dad-11d1-80b4-00c04fd430d2';
const CLIENT_ID_6 = '6ba7b810-9dad-11d1-80b4-00c04fd430d3';

let httpServer;
let ioServer;
let port;
const clientSockets = [];

const validToken = () =>
  jwt.sign({ id: mockUser.id, email: mockUser.email }, process.env.JWT_SECRET, { expiresIn: '15m' });

const otherToken = () =>
  jwt.sign({ id: OTHER_USER.id, email: OTHER_USER.email }, process.env.JWT_SECRET, { expiresIn: '15m' });

function connectClient(tokenFn) {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://localhost:${port}`, {
      forceNew: true,
      transports: ['websocket'],
      reconnection: false,
      auth: { token: (tokenFn || validToken)() },
    });
    clientSockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => reject(error));
  });
}

function sendMessage(socket, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for ack')), 3000);
    socket.emit('sendMessage', payload, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

function retryMessage(socket, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for retry ack')), 3000);
    socket.emit('retryMessage', payload, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

function regenerateMessage(socket, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for regenerate ack')), 3000);
    socket.emit('regenerateMessage', payload, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

function nextCompleted(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for messageProcessing:completed')), 5000);
    const handler = (data) => {
      if (data.status === 'completed') {
        clearTimeout(timer);
        socket.off('messageProcessing', handler);
        resolve(data);
      }
    };
    socket.on('messageProcessing', handler);
  });
}

function nextError(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for error')), 3000);
    const handler = (data) => {
      clearTimeout(timer);
      socket.off('error', handler);
      resolve(data);
    };
    socket.on('error', handler);
  });
}

function nextCancelled(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for messageProcessing:cancelled')), 3000);
    const handler = (data) => {
      if (data.status === 'cancelled') {
        clearTimeout(timer);
        socket.off('messageProcessing', handler);
        resolve(data);
      }
    };
    socket.on('messageProcessing', handler);
  });
}

function uuid(n) {
  // Generate a valid UUID v4 with a deterministic middle section
  const hex = n.toString(16).padStart(4, '0');
  return `6ba7b810-9dad-11d1-80b4-00c04fd4${hex}`;
}

/** Pipeline that never resolves (simulates live stream). */
function mockLiveStream() {
  chatController.processMessage.mockImplementation(async (_socket, _data, signal) => {
    return new Promise((_resolve, reject) => {
      if (signal && signal.aborted) {
        const err = new Error('Stream aborted');
        err.cancelled = true;
        err.code = 'STREAM_CANCELLED';
        reject(err);
        return;
      }
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort);
        const err = new Error('Stream aborted');
        err.cancelled = true;
        err.code = 'STREAM_CANCELLED';
        reject(err);
      };
      signal.addEventListener('abort', onAbort);
    });
  });
}

/** Pipeline that resolves after a delay (simulates slow but finite work). */
function mockSlowPipeline(delayMs = 10) {
  chatController.processMessage.mockImplementation(async (_socket, data) => {
    await new Promise((r) => setTimeout(r, delayMs));
    return {
      processingTime: delayMs,
      aiPayload: {
        sessionId: data.sessionId,
        clientMessageId: data.clientMessageId,
        message: `reply-${data.clientMessageId}`,
        timestamp: new Date().toISOString(),
      },
    };
  });
}

/** Pipeline that rejects immediately (simulates error). */
function mockErrorPipeline() {
  chatController.processMessage.mockImplementation(async () => {
    throw new Error('Pipeline error');
  });
}

beforeAll(async () => {
  httpServer = http.createServer();
  ioServer = new Server(httpServer, { cors: { origin: '*' } });
  const { initializeSocketHandlers } = require('../socket/socketHandler');
  initializeSocketHandlers(ioServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  for (const socket of clientSockets) {
    socket.close();
  }
  clientSockets.length = 0;
  await new Promise((resolve) => ioServer.close(resolve));
  await new Promise((resolve) => {
    try {
      httpServer.close(resolve);
    } catch {
      resolve();
    }
  });
});

beforeEach(() => {
  dedup._resetLocal();
  registry._resetLocal();
  socketHandler._resetRateLimitStore();
  socketHandler._resetConcurrentStore();
  User.findById.mockReset();
  User.findById.mockImplementation(async (id) => {
    if (id === OTHER_USER.id) return OTHER_USER;
    return mockUser;
  });
  chatController.processMessage.mockReset();
  chatController.verifyRetryTarget.mockReset();
  chatController.retryMessage.mockReset();
  chatController.verifyRegenerateTarget.mockReset();
  chatController.regenerateMessage.mockReset();
});

/* ================================================================== */
/*  A. Rate limiting                                                   */
/* ================================================================== */

describe('Socket sendMessage rate limiting', () => {
  it('accepts messages within the rate limit', async () => {
    const socket = await connectClient();
    mockSlowPipeline(10);

    for (let i = 0; i < 5; i++) {
      const ack = await sendMessage(socket, {
        sessionId: VALID_SESSION_ID,
        message: `msg-${i}`,
        clientMessageId: uuid(i + 0x100),
      });
      expect(ack.accepted).toBe(true);
      await nextCompleted(socket).catch(() => {});
    }
  });

  it('rejects the request exceeding the rate limit with rate_limited', async () => {
    const socket = await connectClient();
    mockSlowPipeline(10);

    // Send 5 messages (the limit)
    for (let i = 0; i < 5; i++) {
      const ack = await sendMessage(socket, {
        sessionId: VALID_SESSION_ID,
        message: `msg-${i}`,
        clientMessageId: uuid(i + 0x200),
      });
      expect(ack.accepted).toBe(true);
      await nextCompleted(socket).catch(() => {});
    }

    // 6th message should be rate limited
    const ack = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'msg-overflow',
      clientMessageId: CLIENT_ID_6,
    });
    expect(ack.accepted).toBe(false);
    expect(ack.status).toBe('rate_limited');
  });

  it('rate-limited message also emits an error event', async () => {
    const socket = await connectClient();
    mockSlowPipeline(10);

    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      await sendMessage(socket, {
        sessionId: VALID_SESSION_ID,
        message: `msg-${i}`,
        clientMessageId: uuid(i + 0x300),
      });
      await nextCompleted(socket).catch(() => {});
    }

    // 6th message: listen for error BEFORE sending
    const errorPromise = nextError(socket);
    const ack = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'msg-overflow',
      clientMessageId: CLIENT_ID_6,
    });
    expect(ack.accepted).toBe(false);
    expect(ack.status).toBe('rate_limited');

    const errorData = await errorPromise;
    expect(errorData.type).toBe('RATE_LIMITED');
  });

  it('rate limit resets after the window expires', async () => {
    const socket = await connectClient();
    mockSlowPipeline(10);

    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      await sendMessage(socket, {
        sessionId: VALID_SESSION_ID,
        message: `msg-${i}`,
        clientMessageId: uuid(i + 0x400),
      });
      await nextCompleted(socket).catch(() => {});
    }

    // Verify rate limited
    const blocked = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'blocked',
      clientMessageId: CLIENT_ID_6,
    });
    expect(blocked.accepted).toBe(false);
    expect(blocked.status).toBe('rate_limited');

    // Manually expire the rate limit window
    socketHandler._resetRateLimitStore();

    // Should be accepted again
    const ack = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'after-reset',
      clientMessageId: uuid(0x500),
    });
    expect(ack.accepted).toBe(true);
  });

  it('different users have independent rate limits', async () => {
    const socket1 = await connectClient();
    const socket2 = await connectClient(otherToken);
    mockSlowPipeline(10);

    // User 1 exhausts their limit
    for (let i = 0; i < 5; i++) {
      await sendMessage(socket1, {
        sessionId: VALID_SESSION_ID,
        message: `msg-${i}`,
        clientMessageId: uuid(i + 0x600),
      });
      await nextCompleted(socket1).catch(() => {});
    }

    // User 1 is rate limited
    const blocked = await sendMessage(socket1, {
      sessionId: VALID_SESSION_ID,
      message: 'blocked',
      clientMessageId: CLIENT_ID_6,
    });
    expect(blocked.accepted).toBe(false);
    expect(blocked.status).toBe('rate_limited');

    // User 2 can still send
    const ack = await sendMessage(socket2, {
      sessionId: VALID_SESSION_ID,
      message: 'user2-msg',
      clientMessageId: uuid(0x700),
    });
    expect(ack.accepted).toBe(true);
  });
});

/* ================================================================== */
/*  B. Concurrent protection                                           */
/* ================================================================== */

describe('Socket sendMessage concurrent limit', () => {
  it('accepts up to 3 concurrent requests', async () => {
    const socket = await connectClient();
    mockLiveStream();

    // Send 3 messages — all should be accepted (live stream never completes)
    for (let i = 0; i < 3; i++) {
      const ack = await sendMessage(socket, {
        sessionId: VALID_SESSION_ID,
        message: `concurrent-${i}`,
        clientMessageId: uuid(i + 0x800),
      });
      expect(ack.accepted).toBe(true);
    }
  });

  it('rejects the 4th concurrent request with too_many_active', async () => {
    const socket = await connectClient();
    mockLiveStream();

    // Fill 3 slots
    for (let i = 0; i < 3; i++) {
      const ack = await sendMessage(socket, {
        sessionId: VALID_SESSION_ID,
        message: `concurrent-${i}`,
        clientMessageId: uuid(i + 0x900),
      });
      expect(ack.accepted).toBe(true);
    }

    // 4th should be rejected
    const ack = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'overflow',
      clientMessageId: CLIENT_ID_6,
    });
    expect(ack.accepted).toBe(false);
    expect(ack.status).toBe('too_many_active');
  });

  it('releases concurrent slot after successful completion', async () => {
    const socket = await connectClient();
    mockSlowPipeline(10);

    // Fill 3 slots with fast-completing pipelines
    for (let i = 0; i < 3; i++) {
      const ack = await sendMessage(socket, {
        sessionId: VALID_SESSION_ID,
        message: `done-${i}`,
        clientMessageId: uuid(i + 0xA00),
      });
      expect(ack.accepted).toBe(true);
      await nextCompleted(socket).catch(() => {});
    }

    // All 3 slots should be released — 4th message should be accepted
    const ack = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'after-completion',
      clientMessageId: uuid(0xB00),
    });
    expect(ack.accepted).toBe(true);
  });

  it('releases concurrent slot after an error', async () => {
    const socket = await connectClient();
    mockErrorPipeline();

    const ack = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'will-fail',
      clientMessageId: CLIENT_ID,
    });
    expect(ack.accepted).toBe(true);

    // Wait for error event
    await nextError(socket).catch(() => {});

    // Slot should be released — next message should be accepted
    mockSlowPipeline(10);
    const ack2 = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'after-error',
      clientMessageId: uuid(0xC00),
    });
    expect(ack2.accepted).toBe(true);
  });

  it('cancel/stop does not leak the slot', async () => {
    const socket = await connectClient();
    mockLiveStream();

    const ack = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'will-cancel',
      clientMessageId: CLIENT_ID,
    });
    expect(ack.accepted).toBe(true);

    // Stop the generation
    const stopped = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), 3000);
      socket.emit('stopGeneration', {
        sessionId: VALID_SESSION_ID,
        clientMessageId: CLIENT_ID,
      }, (a) => { clearTimeout(timer); resolve(a); });
    });
    expect(stopped.stopped).toBe(true);

    // Wait for cancelled event
    await nextCancelled(socket).catch(() => {});

    // Slot should be released
    mockSlowPipeline(10);
    const ack2 = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'after-cancel',
      clientMessageId: uuid(0xD00),
    });
    expect(ack2.accepted).toBe(true);
  });

  it('different users have independent concurrent limits', async () => {
    const socket1 = await connectClient();
    const socket2 = await connectClient(otherToken);
    mockLiveStream();

    // User 1 fills 3 slots
    for (let i = 0; i < 3; i++) {
      const ack = await sendMessage(socket1, {
        sessionId: VALID_SESSION_ID,
        message: `u1-${i}`,
        clientMessageId: uuid(i + 0xE00),
      });
      expect(ack.accepted).toBe(true);
    }

    // User 1 is blocked
    const blocked = await sendMessage(socket1, {
      sessionId: VALID_SESSION_ID,
      message: 'u1-overflow',
      clientMessageId: CLIENT_ID_6,
    });
    expect(blocked.accepted).toBe(false);
    expect(blocked.status).toBe('too_many_active');

    // User 2 can still send
    const ack = await sendMessage(socket2, {
      sessionId: VALID_SESSION_ID,
      message: 'u2-msg',
      clientMessageId: uuid(0xF00),
    });
    expect(ack.accepted).toBe(true);
  });
});

/* ================================================================== */
/*  C. Shared protection across event types                            */
/* ================================================================== */

describe('Shared rate limit across sendMessage/retry/regenerate', () => {
  it('retryMessage participates in the same rate limit', async () => {
    const socket = await connectClient();
    mockSlowPipeline(10);

    // Exhaust rate limit with sendMessage
    for (let i = 0; i < 5; i++) {
      await sendMessage(socket, {
        sessionId: VALID_SESSION_ID,
        message: `msg-${i}`,
        clientMessageId: uuid(i + 0x1000),
      });
      await nextCompleted(socket).catch(() => {});
    }

    // retryMessage should also be rate limited
    chatController.verifyRetryTarget.mockResolvedValue({ status: 'ready' });
    const ack = await retryMessage(socket, {
      sessionId: VALID_SESSION_ID,
      clientMessageId: CLIENT_ID,
    });
    expect(ack.accepted).toBe(false);
    expect(ack.status).toBe('rate_limited');
  });

  it('regenerateMessage participates in the same rate limit', async () => {
    const socket = await connectClient();
    mockSlowPipeline(10);

    // Exhaust rate limit with sendMessage
    for (let i = 0; i < 5; i++) {
      await sendMessage(socket, {
        sessionId: VALID_SESSION_ID,
        message: `msg-${i}`,
        clientMessageId: uuid(i + 0x1100),
      });
      await nextCompleted(socket).catch(() => {});
    }

    // regenerateMessage should also be rate limited
    chatController.verifyRegenerateTarget.mockResolvedValue({ status: 'ready' });
    const ack = await regenerateMessage(socket, {
      sessionId: VALID_SESSION_ID,
      clientMessageId: CLIENT_ID,
    });
    expect(ack.accepted).toBe(false);
    expect(ack.status).toBe('rate_limited');
  });

  it('retryMessage participates in the same concurrent limit', async () => {
    const socket = await connectClient();
    mockLiveStream();

    // Fill 3 slots with sendMessage
    for (let i = 0; i < 3; i++) {
      const ack = await sendMessage(socket, {
        sessionId: VALID_SESSION_ID,
        message: `concurrent-${i}`,
        clientMessageId: uuid(i + 0x1200),
      });
      expect(ack.accepted).toBe(true);
    }

    // retryMessage should also be blocked
    chatController.verifyRetryTarget.mockResolvedValue({ status: 'ready' });
    const ack = await retryMessage(socket, {
      sessionId: VALID_SESSION_ID,
      clientMessageId: CLIENT_ID,
    });
    expect(ack.accepted).toBe(false);
    expect(ack.status).toBe('too_many_active');
  });

  it('regenerateMessage participates in the same concurrent limit', async () => {
    const socket = await connectClient();
    mockLiveStream();

    // Fill 3 slots with sendMessage
    for (let i = 0; i < 3; i++) {
      const ack = await sendMessage(socket, {
        sessionId: VALID_SESSION_ID,
        message: `concurrent-${i}`,
        clientMessageId: uuid(i + 0x1300),
      });
      expect(ack.accepted).toBe(true);
    }

    // regenerateMessage should also be blocked
    chatController.verifyRegenerateTarget.mockResolvedValue({ status: 'ready' });
    const ack = await regenerateMessage(socket, {
      sessionId: VALID_SESSION_ID,
      clientMessageId: CLIENT_ID,
    });
    expect(ack.accepted).toBe(false);
    expect(ack.status).toBe('too_many_active');
  });
});

/* ================================================================== */
/*  D. Regression: existing behavior preserved                         */
/* ================================================================== */

describe('Regression: existing behavior preserved', () => {
  it('dedup still prevents reprocessing the same clientMessageId', async () => {
    const socket = await connectClient();
    mockSlowPipeline(10);

    const payload = {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    };

    const ack1 = await sendMessage(socket, payload);
    expect(ack1.accepted).toBe(true);
    expect(ack1.duplicate).toBe(false);

    // Second submission with same id: should be deduped
    const ack2 = await sendMessage(socket, payload);
    expect(ack2.accepted).toBe(false);
    expect(ack2.duplicate).toBe(true);
  });

  it('stopGeneration still works with rate limiting active', async () => {
    const socket = await connectClient();
    mockLiveStream();

    const STOP_CLIENT_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430ff';
    const ack = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'will-stop',
      clientMessageId: STOP_CLIENT_ID,
    });
    expect(ack.accepted).toBe(true);

    const stopped = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), 3000);
      socket.emit('stopGeneration', {
        sessionId: VALID_SESSION_ID,
        clientMessageId: STOP_CLIENT_ID,
      }, (a) => { clearTimeout(timer); resolve(a); });
    });
    expect(stopped.stopped).toBe(true);

    await nextCancelled(socket).catch(() => {});
  });

  it('socket disconnect still cleans up active streams', async () => {
    const socket = await connectClient();
    mockLiveStream();

    await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'disconnect-me',
      clientMessageId: CLIENT_ID,
    });

    // Verify the stream is active
    expect(registry._getActiveSize()).toBe(1);

    // Disconnect
    socket.close();

    // Wait a tick for disconnect handler to run
    await new Promise((r) => setTimeout(r, 50));

    // Active streams should be cleaned up
    expect(registry._getActiveSize()).toBe(0);
  });
});
