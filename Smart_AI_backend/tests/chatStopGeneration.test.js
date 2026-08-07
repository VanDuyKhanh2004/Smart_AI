/* ------------------------------------------------------------------ */
/*  Socket-level "Stop AI generation" tests                            */
/*                                                                     */
/*  Real Socket.IO server + client. The AI pipeline (chatController)   */
/*  is mocked to behave like a LIVE stream: it registers an            */
/*  AbortController into the real chatActiveStreams registry, then     */
/*  rejects with STREAM_CANCELLED when that controller aborts.         */
/*                                                                     */
/*  stopGeneration ack contract (at most one ack):                     */
/*    stopped          -> a live stream was aborted                    */
/*    already_completed-> the id already finished                      */
/*    not_found        -> no live stream for the id                    */
/*    invalid          -> bad sessionId/clientMessageId                */
/*                                                                     */
/*  After a successful stop the ONLY terminal signal is               */
/*  messageProcessing 'cancelled' (reason user_cancelled) — never the  */
/*  generic error event and never aiResponse/aiResponseComplete.       */
/*  The dedup claim is released so the same id can reprocess.          */
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
const registry = require('../services/chatActiveStreams');

const mockUser = { id: 'user-123', email: 'test@example.com', role: 'user' };
const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_SESSION_ID = '550e8400-e29b-41d4-a716-446655440001';
const CLIENT_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const CLIENT_ID_2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c9';

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

/** A live-stream pipeline: observes the AbortController created at the socket
 * boundary (3rd arg) and rejects with STREAM_CANCELLED when it aborts. Never
 * resolves on its own. */
function mockAbortableStream() {
  chatController.processMessage.mockImplementation(async (socket, data, signal) => {
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

/** A normal (buffered/completed) pipeline: resolves immediately with a
 * payload and marks the id completed in the registry. */
function mockBufferedPipeline() {
  chatController.processMessage.mockImplementation(async (socket, data) => {
    registry.markCompleted({
      userId: mockUser.id,
      sessionId: data.sessionId,
      clientMessageId: data.clientMessageId,
    });
    return {
      processingTime: 7,
      aiPayload: {
        sessionId: data.sessionId,
        clientMessageId: data.clientMessageId,
        message: `reply-to-${data.clientMessageId}`,
        timestamp: new Date().toISOString(),
      },
    };
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

function stopGeneration(socket, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for stop ack')), 3000);
    socket.emit('stopGeneration', payload, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

/** A promise that resolves the next messageProcessing 'cancelled' event. */
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

function nextCompleted(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for messageProcessing:completed')), 3000);
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
  registry._resetLocal();
  User.findById.mockReset();
  User.findById.mockResolvedValue(mockUser);
  chatController.processMessage.mockReset();
});

describe('Socket-level stopGeneration', () => {
  it('registers exactly ONE controller at the boundary BEFORE the pipeline runs', async () => {
    const socket = await connectClient();
    mockAbortableStream();

    await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });

    // The registry owns one active generation for this request, registered
    // before processMessage (the mock pipeline is still pending).
    expect(registry._getActiveSize()).toBe(1);
    const entry = registry.get({
      userId: mockUser.id,
      sessionId: VALID_SESSION_ID,
      clientMessageId: CLIENT_ID,
    });
    expect(entry).not.toBeNull();
    expect(entry.socketId).toBe(socket.id);

    // The SAME signal is threaded into processMessage (3rd arg).
    const processArgs = chatController.processMessage.mock.calls[0];
    expect(processArgs[0]).toBeDefined();
    expect(processArgs[0].id).toBe(socket.id);
    expect(processArgs[1].clientMessageId).toBe(CLIENT_ID);
    expect(processArgs[2]).toBe(entry.controller.signal);
  });

  it('two concurrent accepted requests are isolated: stopping A never aborts B', async () => {
    const socket = await connectClient();
    mockAbortableStream();

    await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello again',
      clientMessageId: CLIENT_ID_2,
    });
    expect(registry._getActiveSize()).toBe(2);

    const cancelledA = nextCancelled(socket);
    const stopA = await stopGeneration(socket, { sessionId: VALID_SESSION_ID, clientMessageId: CLIENT_ID });
    expect(stopA).toEqual({ stopped: true, status: 'stopped', clientMessageId: CLIENT_ID });
    await cancelledA;

    // B is untouched and still live.
    expect(registry.get({ userId: mockUser.id, sessionId: VALID_SESSION_ID, clientMessageId: CLIENT_ID })).toBeNull();
    expect(registry.get({ userId: mockUser.id, sessionId: VALID_SESSION_ID, clientMessageId: CLIENT_ID_2 })).not.toBeNull();

    const stopB = await stopGeneration(socket, { sessionId: VALID_SESSION_ID, clientMessageId: CLIENT_ID_2 });
    expect(stopB).toEqual({ stopped: true, status: 'stopped', clientMessageId: CLIENT_ID_2 });
  });

  it('a genuine pipeline error removes the registry entry and emits one error + messageProcessing error', async () => {
    const socket = await connectClient();
    chatController.processMessage.mockRejectedValue(new Error('boom'));

    const errorEvents = [];
    socket.on('error', (data) => errorEvents.push(data));
    const processingErrors = [];
    socket.on('messageProcessing', (data) => {
      if (data.status === 'error') processingErrors.push(data);
    });

    await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    await new Promise((resolve) => setTimeout(resolve, 30));

    // A real failure is a terminal error, not a cancellation.
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0].type).toBe('PROCESSING_ERROR');
    expect(processingErrors).toHaveLength(1);
    // Registry cleaned up; the claim was released so the same id can retry.
    expect(registry._getActiveSize()).toBe(0);
    const retryAck = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    expect(retryAck.status).toBe('accepted');
  });


  it('stopping a live stream acks stopped then emits ONLY messageProcessing cancelled', async () => {
    const socket = await connectClient();
    mockAbortableStream();

    const cancelled = nextCancelled(socket);
    const errors = [];
    socket.on('error', (data) => errors.push(data));
    const responses = [];
    socket.on('aiResponse', (data) => responses.push(data));
    socket.on('aiResponseComplete', (data) => responses.push(data));

    const ack = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    expect(ack.status).toBe('accepted');

    const stopAck = await stopGeneration(socket, {
      sessionId: VALID_SESSION_ID,
      clientMessageId: CLIENT_ID,
    });
    expect(stopAck).toEqual({ stopped: true, status: 'stopped', clientMessageId: CLIENT_ID });

    const cancelledEvent = await cancelled;
    expect(cancelledEvent).toMatchObject({
      sessionId: VALID_SESSION_ID,
      clientMessageId: CLIENT_ID,
      status: 'cancelled',
      reason: 'user_cancelled',
    });
    expect(cancelledEvent.timestamp).toBeDefined();

    await tick();
    expect(errors).toHaveLength(0);
    expect(responses).toHaveLength(0);
  });

  it('acks stop exactly once', async () => {
    const socket = await connectClient();
    mockAbortableStream();
    const cancelled = nextCancelled(socket);

    await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });

    const stopAcks = [];
    socket.emit('stopGeneration', {
      sessionId: VALID_SESSION_ID,
      clientMessageId: CLIENT_ID,
    }, (ack) => {
      stopAcks.push(ack);
    });
    await tick();
    await cancelled;
    await tick();

    expect(stopAcks).toHaveLength(1);
    expect(stopAcks[0]).toEqual({ stopped: true, status: 'stopped', clientMessageId: CLIENT_ID });
  });

  it('releases the dedup claim on cancel so the same id can reprocess', async () => {
    const socket = await connectClient();
    mockAbortableStream();

    const cancelled1 = nextCancelled(socket);
    const ack1 = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    expect(ack1.status).toBe('accepted');
    await stopGeneration(socket, { sessionId: VALID_SESSION_ID, clientMessageId: CLIENT_ID });
    await cancelled1;

    // The claim was released: the SAME id is accepted again (never a duplicate).
    const ack2 = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    expect(ack2).toEqual({
      accepted: true,
      duplicate: false,
      status: 'accepted',
      clientMessageId: CLIENT_ID,
    });
    expect(chatController.processMessage).toHaveBeenCalledTimes(2);
  });

  it('a second stop for the same (already-stopped) id acks not_found', async () => {
    const socket = await connectClient();
    mockAbortableStream();
    const cancelled = nextCancelled(socket);

    await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });

    const first = await stopGeneration(socket, { sessionId: VALID_SESSION_ID, clientMessageId: CLIENT_ID });
    expect(first.status).toBe('stopped');
    await cancelled;

    const second = await stopGeneration(socket, { sessionId: VALID_SESSION_ID, clientMessageId: CLIENT_ID });
    expect(second).toEqual({ stopped: false, status: 'not_found', clientMessageId: CLIENT_ID });
  });

  it('stopping a completed id acks already_completed', async () => {
    const socket = await connectClient();
    mockBufferedPipeline();
    const completed = nextCompleted(socket);

    await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    await completed;

    const stopAck = await stopGeneration(socket, { sessionId: VALID_SESSION_ID, clientMessageId: CLIENT_ID });
    expect(stopAck).toEqual({ stopped: false, status: 'already_completed', clientMessageId: CLIENT_ID });
  });

  it('a completed id can still replay via dedup after a stop request', async () => {
    const socket = await connectClient();
    mockBufferedPipeline();
    const completed = nextCompleted(socket);

    await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    await completed;

    // A stop request does not disturb the completed dedup state.
    const stopAck = await stopGeneration(socket, { sessionId: VALID_SESSION_ID, clientMessageId: CLIENT_ID });
    expect(stopAck.status).toBe('already_completed');

    // Duplicate resubmission still replays the stored aiResponse.
    const aiResponsePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for aiResponse')), 3000);
      socket.once('aiResponse', (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
    const dupAck = await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    expect(dupAck.status).toBe('completed');
    const replayed = await aiResponsePromise;
    expect(replayed.clientMessageId).toBe(CLIENT_ID);
    expect(chatController.processMessage).toHaveBeenCalledTimes(1);
  });

  it('stopping an unknown id acks not_found', async () => {
    const socket = await connectClient();
    const stopAck = await stopGeneration(socket, { sessionId: VALID_SESSION_ID, clientMessageId: CLIENT_ID });
    expect(stopAck).toEqual({ stopped: false, status: 'not_found', clientMessageId: CLIENT_ID });
  });

  it('an unknown id on a DIFFERENT session is not found even if the same id is live elsewhere', async () => {
    const socket = await connectClient();
    mockAbortableStream();
    const cancelled = nextCancelled(socket);

    await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });

    const stopAck = await stopGeneration(socket, { sessionId: OTHER_SESSION_ID, clientMessageId: CLIENT_ID });
    expect(stopAck).toEqual({ stopped: false, status: 'not_found', clientMessageId: CLIENT_ID });

    // The real stream is untouched.
    const realStop = await stopGeneration(socket, { sessionId: VALID_SESSION_ID, clientMessageId: CLIENT_ID });
    expect(realStop.status).toBe('stopped');
    await cancelled;
  });

  it('rejects an invalid sessionId with status invalid', async () => {
    const socket = await connectClient();
    const stopAck = await stopGeneration(socket, { sessionId: 'not-a-uuid', clientMessageId: CLIENT_ID });
    expect(stopAck).toEqual({ stopped: false, status: 'invalid', clientMessageId: CLIENT_ID });
  });

  it('rejects an invalid clientMessageId with status invalid', async () => {
    const socket = await connectClient();
    const stopAck = await stopGeneration(socket, { sessionId: VALID_SESSION_ID, clientMessageId: 'nope' });
    expect(stopAck).toEqual({ stopped: false, status: 'invalid', clientMessageId: 'nope' });
  });

  it('a stop without an ack callback still aborts and emits cancelled (no crash)', async () => {
    const socket = await connectClient();
    mockAbortableStream();
    const cancelled = nextCancelled(socket);

    await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });

    // No ack function: the handler must not throw.
    socket.emit('stopGeneration', { sessionId: VALID_SESSION_ID, clientMessageId: CLIENT_ID });
    const cancelledEvent = await cancelled;
    expect(cancelledEvent.status).toBe('cancelled');
  });

  it('disconnecting a socket aborts and clears its live streams', async () => {
    const socket = await connectClient();
    mockAbortableStream();

    await sendMessage(socket, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });

    // A live stream is registered for this socket.
    expect(registry._getActiveSize()).toBe(1);

    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The stream was aborted and removed by the disconnect sweep.
    expect(registry._getActiveSize()).toBe(0);

    // The cancelled pipeline released the dedup claim: a fresh client using the
    // SAME id is accepted again (never a duplicate/processing).
    const socket2 = await connectClient();
    mockAbortableStream();
    const ack2 = await sendMessage(socket2, {
      sessionId: VALID_SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    expect(ack2).toEqual({
      accepted: true,
      duplicate: false,
      status: 'accepted',
      clientMessageId: CLIENT_ID,
    });
  });
});
