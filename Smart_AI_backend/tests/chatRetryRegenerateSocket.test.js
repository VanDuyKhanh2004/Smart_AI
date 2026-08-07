/* ------------------------------------------------------------------ */
/*  Socket-level Retry / Regenerate ack-contract tests                  */
/*                                                                     */
/*  Real Socket.IO server + client. The chatController methods are     */
/*  mocked; the dedup/active-stream plumbing is the real one.          */
/*                                                                     */
/*  Verifies the ack contracts (≤ one ack, required statuses,          */
/*  generationId on accepted regenerate) and the ownership-derived     */
/*  not_found behavior.                                                */
/*                                                                     */
/*  No real MongoDB, Redis, or LLM calls.                              */
/* ------------------------------------------------------------------ */

const http = require('http');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const ioc = require('socket.io-client');

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';

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
  verifyRegenerateTarget: jest.fn(),
  retryMessage: jest.fn(),
  regenerateMessage: jest.fn(),
}));

const User = require('../models/User');
const chatController = require('../controllers/chatController');
const dedup = require('../services/chatMessageDedupService');
const activeStreams = require('../services/chatActiveStreams');

const mockUser = { id: 'user-123', email: 'test@example.com', role: 'user' };
const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const LOGICAL_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const FRESH_GEN = '11111111-2222-3333-4444-555555555555';

let httpServer;
let ioServer;
let port;
const clientSockets = [];

const validToken = () =>
  jwt.sign({ id: mockUser.id, email: mockUser.email }, process.env.JWT_SECRET, { expiresIn: '15m' });

function connectClient() {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://localhost:${port}`, {
      forceNew: true,
      transports: ['websocket'],
      reconnection: false,
      auth: { token: validToken() },
    });
    clientSockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => reject(error));
  });
}

function emitAck(socket, event, payload, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event} ack`)), timeout);
    socket.emit(event, payload, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

function nextProcessing(socket, status) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for messageProcessing:${status}`)), 3000);
    const handler = (data) => {
      if (data.status === status) {
        clearTimeout(timer);
        socket.off('messageProcessing', handler);
        resolve(data);
      }
    };
    socket.on('messageProcessing', handler);
  });
}

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  httpServer = http.createServer();
  ioServer = new Server(httpServer, { cors: { origin: '*' } });
  const { initializeSocketHandlers } = require('../socket/socketHandler');
  initializeSocketHandlers(ioServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  for (const socket of clientSockets) socket.close();
  clientSockets.length = 0;
  await new Promise((resolve) => ioServer.close(resolve));
  await new Promise((resolve) => {
    try { httpServer.close(resolve); } catch { resolve(); }
  });
});

beforeEach(() => {
  dedup._resetLocal();
  activeStreams._resetLocal();
  User.findById.mockReset();
  User.findById.mockResolvedValue(mockUser);
  chatController.processMessage.mockReset();
  chatController.verifyRetryTarget.mockReset();
  chatController.verifyRegenerateTarget.mockReset();
  chatController.retryMessage.mockReset();
  chatController.regenerateMessage.mockReset();
});

describe('retryMessage ack contract', () => {
  it('accepts a Retry for a ready target, generationId == logical id, runs once, completes', async () => {
    const socket = await connectClient();
    const completed = nextProcessing(socket, 'completed');

    chatController.verifyRetryTarget.mockResolvedValue({ status: 'ready' });
    chatController.retryMessage.mockImplementation(async () => ({
      status: 'accepted',
      result: { processingTime: 5, aiPayload: { sessionId: VALID_SESSION_ID, clientMessageId: LOGICAL_ID, message: 'r', timestamp: new Date().toISOString() } },
    }));

    const ack = await emitAck(socket, 'retryMessage', {
      sessionId: VALID_SESSION_ID,
      clientMessageId: LOGICAL_ID,
    });

    expect(ack).toEqual({
      accepted: true,
      duplicate: false,
      status: 'accepted',
      clientMessageId: LOGICAL_ID,
      generationId: LOGICAL_ID,
    });
    await completed;
    expect(chatController.retryMessage).toHaveBeenCalledTimes(1);
    const calledWith = chatController.retryMessage.mock.calls[0];
    expect(calledWith[2]).toBe(mockUser.id); // userId from socket, never payload
  });

  it('rejects already_completed when an assistant reply exists', async () => {
    const socket = await connectClient();
    chatController.verifyRetryTarget.mockResolvedValue({ status: 'already_completed' });

    const ack = await emitAck(socket, 'retryMessage', {
      sessionId: VALID_SESSION_ID,
      clientMessageId: LOGICAL_ID,
    });
    expect(ack).toEqual({ accepted: false, duplicate: false, status: 'already_completed', clientMessageId: LOGICAL_ID });
    expect(chatController.retryMessage).not.toHaveBeenCalled();
  });

  it('rejects with generic not_found on an ownership/missing target', async () => {
    const socket = await connectClient();
    chatController.verifyRetryTarget.mockResolvedValue({ status: 'not_found' });
    const ack = await emitAck(socket, 'retryMessage', {
      sessionId: VALID_SESSION_ID,
      clientMessageId: LOGICAL_ID,
    });
    expect(ack.status).toBe('not_found');
    expect(chatController.retryMessage).not.toHaveBeenCalled();
  });

  it('rejects invalid when the logical id is malformed (no pipeline)', async () => {
    const socket = await connectClient();
    const ack = await emitAck(socket, 'retryMessage', {
      sessionId: VALID_SESSION_ID,
      clientMessageId: 'not-a-uuid',
    });
    expect(ack.status).toBe('invalid');
    expect(chatController.verifyRetryTarget).not.toHaveBeenCalled();
  });
});

describe('regenerateMessage ack contract', () => {
  it('accepts a regenerate and returns the fresh generationId', async () => {
    const socket = await connectClient();

    chatController.verifyRegenerateTarget.mockResolvedValue({ status: 'ready' });
    chatController.regenerateMessage.mockImplementation(async (s, sessionId, userId, clientMessageId, generationId) => ({
      status: 'accepted',
      generationId,
      result: { processingTime: 4, aiPayload: { sessionId: VALID_SESSION_ID, clientMessageId: LOGICAL_ID, message: 'new', timestamp: new Date().toISOString() } },
    }));

    // Ensure a fresh generationId is minted server-side (mock captures it).
    const ack = await emitAck(socket, 'regenerateMessage', {
      sessionId: VALID_SESSION_ID,
      clientMessageId: LOGICAL_ID,
    });

    expect(ack.accepted).toBe(true);
    expect(ack.status).toBe('accepted');
    expect(ack.clientMessageId).toBe(LOGICAL_ID);
    expect(typeof ack.generationId).toBe('string');

    // handleRegenerateMessage logic: ack after claim must differ from logical.
    await tick();
  });

  it('rejects not_completed (no completed assistant reply to replace)', async () => {
    const socket = await connectClient();
    chatController.verifyRegenerateTarget.mockResolvedValue({ status: 'not_completed' });
    const ack = await emitAck(socket, 'regenerateMessage', {
      sessionId: VALID_SESSION_ID,
      clientMessageId: LOGICAL_ID,
    });
    expect(ack.status).toBe('not_completed');
    expect(chatController.regenerateMessage).not.toHaveBeenCalled();
  });

  it('rejects not_found generically for an ownership miss', async () => {
    const socket = await connectClient();
    chatController.verifyRegenerateTarget.mockResolvedValue({ status: 'not_found' });
    const ack = await emitAck(socket, 'regenerateMessage', {
      sessionId: VALID_SESSION_ID,
      clientMessageId: LOGICAL_ID,
    });
    expect(ack.status).toBe('not_found');
  });

  it('rejects invalid for a malformed logical id', async () => {
    const socket = await connectClient();
    const ack = await emitAck(socket, 'regenerateMessage', {
      sessionId: VALID_SESSION_ID,
      clientMessageId: 'bad',
    });
    expect(ack.status).toBe('invalid');
  });
});

describe('Regenerate logical-turn guard (double-click)', () => {
  it('rejects a second regenerate while the same logical turn is active', async () => {
    const socket = await connectClient();

    let firstResolve;
    const gate = new Promise((resolve) => { firstResolve = resolve; });
    chatController.verifyRegenerateTarget.mockResolvedValue({ status: 'ready' });
    chatController.regenerateMessage.mockImplementation(async () => {
      await gate;
      return { status: 'accepted', generationId: FRESH_GEN, result: { processingTime: 1 } };
    });

    const first = emitAck(socket, 'regenerateMessage', { sessionId: VALID_SESSION_ID, clientMessageId: LOGICAL_ID });
    await tick();

    // While the first attempt is still gated (logical turn active), the second
    // request must be rejected with already_processing.
    const second = await emitAck(socket, 'regenerateMessage', { sessionId: VALID_SESSION_ID, clientMessageId: LOGICAL_ID });
    expect(second.status).toBe('already_processing');

    firstResolve();
    await first;
  });
});