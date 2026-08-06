/* ------------------------------------------------------------------ */
/*  Socket-level chat message correlation / dedup / ack tests          */
/*                                                                     */
/*  Real Socket.IO server + client. The AI pipeline (chatController)   */
/*  is mocked; the dedup guard and ack plumbing are the real ones      */
/*  (Redis unavailable -> bounded process-local fallback).             */
/*                                                                     */
/*  Ack contract (the ack is a DELIVERY/DEDUP receipt, NOT a           */
/*  completion signal):                                                */
/*    accepted/processing/completed  -> receipt only, never terminal   */
/*    invalid                        -> terminal validation rejection  */
/*  Final outcomes are signaled separately:                            */
/*    success  -> aiResponse  + messageProcessing 'completed'          */
/*    failure  -> socket 'error' (correlated) + messageProcessing err  */
/*                                                                     */
/*  Socket.IO delivers data packets (messages/errors) ahead of an ack  */
/*  callback, so every future-style wait/if-listener below is attached */
/*  BEFORE the submission is emitted.                                  */
/*                                                                     */
/*  Covers: ack lifecycle, duplicate suppression, replay of a stored   */
/*  aiResponse, malformed-id rejection, and single terminal error.     */
/*                                                                     */
/*  No real MongoDB, Redis, or LLM calls are made.                     */
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
}));

const User = require('../models/User');
const chatController = require('../controllers/chatController');
const dedup = require('../services/chatMessageDedupService');

const mockUser = { id: 'user-123', email: 'test@example.com', role: 'user' };
const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_SESSION_ID = '550e8400-e29b-41d4-a716-446655440001';
const CLIENT_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

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

/** Send once and resolve with the ack. */
function sendMessage(socket, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for ack')), 3000);
    socket.emit('sendMessage', payload, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

/** Collect every ack callback invocation (assert exactly-once). */
function collectAcks(socket, payload) {
  const acks = [];
  const emit = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for ack')), 3000);
    socket.emit('sendMessage', payload, (ack) => {
      clearTimeout(timer);
      acks.push(ack);
      resolve(ack);
    });
  });
  return { emit, acks };
}

/** A promise that resolves the next matching messageProcessing status. */
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

/** A promise that resolves the next socket 'error' event. */
function nextError(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for error')), 3000);
    socket.once('error', (data) => {
      clearTimeout(timer);
      resolve(data);
    });
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
  User.findById.mockReset();
  User.findById.mockResolvedValue(mockUser);
  chatController.processMessage.mockReset();
  chatController.processMessage.mockImplementation(async (socket, data) => ({
    processingTime: 7,
    aiPayload: {
      sessionId: data.sessionId,
      clientMessageId: data.clientMessageId,
      message: `reply-to-${data.clientMessageId}`,
      timestamp: new Date().toISOString(),
    },
  }));
});

describe('Socket-level sendMessage correlation', () => {
  it('orders accepted ack before started, both before the pipeline resolves, ack once', async () => {
    const socket = await connectClient();
    const completed = nextProcessing(socket, 'completed');
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let pipelineResolved = false;
    chatController.processMessage.mockImplementation(async (s, data) => {
      await gate;
      pipelineResolved = true;
      return { processingTime: 7, aiPayload: { sessionId: data.sessionId, clientMessageId: data.clientMessageId, message: 'r', timestamp: new Date().toISOString() } };
    });

    // Record the exact client observation order. Both the ack callback and the
    // messageProcessing 'started' handler push synchronously during packet
    // dispatch, so this reflects true packet order (not promise/microtask order).
    const observations = [];
    socket.on('messageProcessing', (data) => {
      if (data.status === 'started') observations.push('started');
    });
    let ackCount = 0;
    const ackPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for ack')), 3000);
      socket.emit('sendMessage', {
        sessionId: VALID_SESSION_ID,
        message: 'hello',
        clientMessageId: CLIENT_ID,
      }, (ack) => {
        clearTimeout(timer);
        ackCount += 1;
        observations.push('ack');
        resolve(ack);
      });
    });

    const ack = await ackPromise;

    // The accepted ack is observed BEFORE messageProcessing 'started', and both
    // occur while the AI pipeline is still gated (not yet resolved).
    expect(observations).toEqual(['ack', 'started']);
    expect(ack).toEqual({
      accepted: true,
      duplicate: false,
      status: 'accepted',
      clientMessageId: CLIENT_ID,
    });
    expect(pipelineResolved).toBe(false);
    expect(ackCount).toBe(1);
    expect(chatController.processMessage).toHaveBeenCalledTimes(1);

    release();
    await completed;
  });

  it('a successful submission acks once with status accepted', async () => {
    const socket = await connectClient();
    const completed = nextProcessing(socket, 'completed');
    const { emit, acks } = collectAcks(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });

    const ack = await emit();
    expect(ack).toEqual({
      accepted: true,
      duplicate: false,
      status: 'accepted',
      clientMessageId: CLIENT_ID,
    });
    await completed;
    await tick();

    // The 'accepted' ack was the only ack — success is signaled via aiResponse
    // + messageProcessing 'completed', never a second ack.
    expect(acks).toHaveLength(1);
    expect(chatController.processMessage).toHaveBeenCalledTimes(1);
  });

  it('emits messageProcessing started then completed, correlated by id', async () => {
    const socket = await connectClient();
    const events = [];
    socket.on('messageProcessing', (data) => events.push(data));
    const completed = nextProcessing(socket, 'completed');

    await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    await completed;

    expect(events.map((e) => e.status)).toEqual(['started', 'completed']);
    expect(events.every((e) => e.clientMessageId === CLIENT_ID)).toBe(true);
  });

  it('a completed duplicate acks before the replayed aiResponse, once each, no pipeline', async () => {
    const socket = await connectClient();
    const firstCompleted = nextProcessing(socket, 'completed');

    await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    await firstCompleted;

    // Capture the exact observation order of the duplicate's ack vs its replay.
    // Capture the exact client observation order. Both the ack callback and the
    // aiResponse handler push synchronously during packet dispatch, so this
    // reflects real packet order (not promise/microtask order).
    const order = [];
    socket.on('aiResponse', (data) => order.push({ kind: 'aiResponse', clientMessageId: data.clientMessageId }));
    let dupAckCount = 0;
    const ackPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for ack')), 3000);
      socket.emit('sendMessage', {
        sessionId: VALID_SESSION_ID,
        message: 'hello',
        clientMessageId: CLIENT_ID,
      }, (ack) => {
        clearTimeout(timer);
        dupAckCount += 1;
        order.push({ kind: 'ack', status: ack.status });
        resolve(ack);
      });
    });

    const dupAck = await ackPromise;
    await tick();

    // The duplicate/completed ack is delivered BEFORE the replayed aiResponse.
    expect(dupAck).toEqual({
      accepted: false,
      duplicate: true,
      status: 'completed',
      clientMessageId: CLIENT_ID,
    });
    expect(order.map((o) => o.kind)).toEqual(['ack', 'aiResponse']);
    expect(order.filter((o) => o.kind === 'aiResponse')).toHaveLength(1);
    expect(dupAckCount).toBe(1);
    // The pipeline ran exactly once overall — never for the duplicate.
    expect(chatController.processMessage).toHaveBeenCalledTimes(1);
  });

  it('acks a duplicate while still processing as processing; pipeline runs once', async () => {
    const socket = await connectClient();
    const completed = nextProcessing(socket, 'completed');
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    chatController.processMessage.mockImplementation(async (s, data) => {
      await gate;
      return {
        processingTime: 7,
        aiPayload: { sessionId: data.sessionId, clientMessageId: data.clientMessageId, message: 'slow reply', timestamp: new Date().toISOString() },
      };
    });

    const firstAck = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    expect(firstAck.status).toBe('accepted');

    // No aiResponse may be replayed while the first submission is still running.
    const aiResponses = [];
    socket.on('aiResponse', (data) => aiResponses.push(data));

    // Second identical submission arrives while the first is still processing.
    const dupAck = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    expect(dupAck).toEqual({
      accepted: false,
      duplicate: true,
      status: 'processing',
      clientMessageId: CLIENT_ID,
    });
    expect(aiResponses).toHaveLength(0);
    expect(chatController.processMessage).toHaveBeenCalledTimes(1);

    release();
    await completed;
    expect(aiResponses).toHaveLength(0);
    expect(chatController.processMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed clientMessageId with an invalid ack and one error', async () => {
    const socket = await connectClient();
    const errPromise = nextError(socket);
    const ack = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: 'not-a-uuid',
    });

    expect(ack).toEqual({
      accepted: false,
      duplicate: false,
      status: 'invalid',
      clientMessageId: 'not-a-uuid',
    });
    const err = await errPromise;
    expect(err.type).toBe('VALIDATION_ERROR');
    expect(chatController.processMessage).not.toHaveBeenCalled();
  });

  it('legacy clients without clientMessageId keep working (accepted ack, generated id)', async () => {
    const socket = await connectClient();
    const completed = nextProcessing(socket, 'completed');

    const ack = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
    });
    expect(ack).toMatchObject({ accepted: true, duplicate: false, status: 'accepted' });
    expect(ack.clientMessageId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    const completedEvent = await completed;
    expect(completedEvent.clientMessageId).toBe(ack.clientMessageId);
    expect(chatController.processMessage).toHaveBeenCalledTimes(1);
  });

  it('a failed generation acks once (accepted) and emits exactly one correlated terminal error', async () => {
    const socket = await connectClient();
    chatController.processMessage.mockRejectedValue(new Error('boom'));

    const errors = [];
    socket.on('error', (data) => errors.push(data));
    const errPromise = nextError(socket);

    const { emit, acks } = collectAcks(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    const ack = await emit();
    const err = await errPromise;

    // The ack was the accepted receipt; failure is signaled by exactly one
    // terminal error correlated with the id (never a second ack).
    expect(ack.status).toBe('accepted');
    expect(acks).toHaveLength(1);
    expect(err.type).toBe('PROCESSING_ERROR');
    expect(err.clientMessageId).toBe(CLIENT_ID);
    expect(errors).toHaveLength(1);
  });

  it('releases the claim on failure so an explicit resend can reprocess', async () => {
    const socket = await connectClient();
    chatController.processMessage.mockRejectedValueOnce(new Error('boom'));
    const errPromise = nextError(socket);
    const completed = nextProcessing(socket, 'completed');

    const failedAck = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    expect(failedAck.status).toBe('accepted');
    await errPromise;

    // The claim was released, so the same id can legitimately reprocess.
    const retryAck = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    expect(retryAck.status).toBe('accepted');
    await completed;
    expect(chatController.processMessage).toHaveBeenCalledTimes(2);
  });

  it('treats the same id on a different session as a distinct submission', async () => {
    const socket = await connectClient();
    const completed = nextProcessing(socket, 'completed');

    const ack1 = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    const ack2 = await sendMessage(socket, {
      sessionId: OTHER_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });

    expect(ack1.status).toBe('accepted');
    expect(ack2.status).toBe('accepted');
    await completed;
    expect(chatController.processMessage).toHaveBeenCalledTimes(2);
  });
});