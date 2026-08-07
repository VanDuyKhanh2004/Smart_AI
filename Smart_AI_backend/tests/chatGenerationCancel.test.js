/* ------------------------------------------------------------------ */
/*  ChatController + provider cancellation (Stop AI generation) tests  */
/*                                                                     */
/*  Part A — ChatController.generateResponse abort plumbing:           */
/*    - registers a stream into the real chatActiveStreams registry    */
/*    - passes the AbortController's signal into the stream function   */
/*    - aborting via the registry makes the stream reject and the      */
/*      controller rethrow STREAM_CANCELLED without any terminal       */
/*      event (no aiResponseComplete, no aiResponse)                   */
/*    - a normal live success marks the id completed (registry)        */
/*    - a buffered/deterministic fallback also marks it completed      */
/*                                                                     */
/*  Part B — provider: a pre-aborted signal rejects with the shared    */
/*  STREAM_CANCELLED identity ({ cancelled: true, code }).             */
/*                                                                     */
/*  No real socket, MongoDB, Redis, or LLM calls are made.             */
/* ------------------------------------------------------------------ */

const crypto = require('crypto');

process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';

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

jest.mock('../models/Conversation', () => ({ findOne: jest.fn() }));
jest.mock('../models/Complaint', () => ({ findOne: jest.fn() }));

const mockStreamImpl = jest.fn();

jest.mock('../utils/gemini', () => {
  const actual = jest.requireActual('../utils/gemini');
  return {
    ...actual,
    generateChatResponseStream: (opts) => mockStreamImpl(opts),
    generateChatResponse: jest.fn().mockResolvedValue({ text: 'buffered', provider: 'deterministic' }),
  };
});

const ChatController = require('../controllers/chatController');
const registry = require('../services/chatActiveStreams');

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const CLIENT_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const USER_ID = 'user-123';

/** Make a STREAM_CANCELLED error exactly like the provider produces. */
const cancelledError = () => {
  const e = new Error('Stream aborted');
  e.cancelled = true;
  e.code = 'STREAM_CANCELLED';
  return e;
};

/** Mock generateChatResponseStream to behave like a real provider: it keeps
 * the signal and rejects with STREAM_CANCELLED when that signal aborts. */
// (Handled inline per-test: the caller's controller is passed as `signal`.)

function fakeSocket() {
  const emitted = [];
  const socket = {
    emitted,
    emit: (event, payload) => {
      emitted.push({ event, payload });
      return true;
    },
    id: 'fake-socket',
    handshake: { headers: {}, address: '127.0.0.1' },
    data: { user: { id: USER_ID } },
  };
  return socket;
}

function callGenerateResponses(socket, signal) {
  return ChatController.generateResponse(
    socket,
    SESSION_ID,
    [],
    'user query',
    [{ _id: 'p1', name: 'iPhone', price: 1000, inStock: 1 }],
    CLIENT_ID,
    signal
  );
}

describe('ChatController.generateResponse cancellation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    registry._resetLocal();
  });

  it('threads the caller-provided signal into the provider', async () => {
    mockStreamImpl.mockImplementation(({ signal }) => {
      expect(signal).toBeDefined();
      expect(signal.aborted).toBe(false);
      return { signal };
    });
    const ac = new AbortController();
    const socket = fakeSocket();
    await callGenerateResponses(socket, ac.signal);
    // The provider received exactly the caller's signal (one controller/request).
    expect(mockStreamImpl).toHaveBeenCalledTimes(1);
    expect(mockStreamImpl.mock.calls[0][0].signal).toBe(ac.signal);
  });

  it('a pre-aborted signal rejects with STREAM_CANCELLED before any emit', async () => {
    mockStreamImpl.mockImplementation(({ signal }) => {
      expect(signal.aborted).toBe(true);
      return Promise.resolve({
        fullResponse: 'should-not-run',
        provider: 'openai',
        finishReason: 'stop',
        streamed: true,
      });
    });
    const ac = new AbortController();
    ac.abort();
    const socket = fakeSocket();
    await expect(callGenerateResponses(socket, ac.signal)).rejects.toMatchObject({
      cancelled: true,
      aborted: true,
      code: 'STREAM_CANCELLED',
    });
    const names = socket.emitted.map((e) => e.event);
    expect(names.filter((n) => n === 'aiResponseStart')).toHaveLength(0);
    expect(names.filter((n) => n === 'aiResponseComplete')).toHaveLength(0);
    expect(names.filter((n) => n === 'aiResponse')).toHaveLength(0);
  });

  it('aborting the caller signal mid-stream rejects and emits no completion', async () => {
    mockStreamImpl.mockImplementation(({ signal }) => new Promise((resolve, reject) => {
      if (signal.aborted) { reject(cancelledError()); return; }
      signal.addEventListener('abort', () => reject(cancelledError()));
    }));
    const ac = new AbortController();
    const socket = fakeSocket();
    const promise = callGenerateResponses(socket, ac.signal);
    ac.abort();
    await expect(promise).rejects.toMatchObject({ cancelled: true, code: 'STREAM_CANCELLED' });
    const names = socket.emitted.map((e) => e.event);
    expect(names.filter((n) => n === 'aiResponseStart')).toHaveLength(0);
    expect(names.filter((n) => n === 'aiResponseChunk')).toHaveLength(0);
    expect(names.filter((n) => n === 'aiResponseComplete')).toHaveLength(0);
    expect(names.filter((n) => n === 'aiResponse')).toHaveLength(0);
  });

  it('does not emit / mark completed when the caller signal is aborted at the finish race', async () => {
    // Provider resolves normally but the signal is aborted right before the
    // completion emit checkpoint: the generation is treated as cancelled.
    mockStreamImpl.mockResolvedValue({
      fullResponse: 'done',
      provider: 'openai',
      finishReason: 'stop',
      streamed: true,
    });
    const ac = new AbortController();
    const socket = fakeSocket();
    const promise = callGenerateResponses(socket, ac.signal);
    ac.abort();
    await expect(promise).rejects.toMatchObject({ cancelled: true, code: 'STREAM_CANCELLED' });
    const names = socket.emitted.map((e) => e.event);
    expect(names.filter((n) => n === 'aiResponseComplete')).toHaveLength(0);
    expect(registry.isCompleted({ userId: USER_ID, sessionId: SESSION_ID, clientMessageId: CLIENT_ID })).toBe(false);
  });

  it('a normal live success emits aiResponseComplete once and marks completed', async () => {
    mockStreamImpl.mockResolvedValue({
      fullResponse: 'hi',
      provider: 'openai',
      finishReason: 'stop',
      streamed: true,
    });
    const ac = new AbortController();
    const socket = fakeSocket();
    await callGenerateResponses(socket, ac.signal);
    const names = socket.emitted.map((e) => e.event);
    expect(names.filter((n) => n === 'aiResponseComplete')).toHaveLength(1);
    expect(names.filter((n) => n === 'aiResponse')).toHaveLength(0);
    expect(registry._getActiveSize()).toBe(0);
    expect(registry.isCompleted({ userId: USER_ID, sessionId: SESSION_ID, clientMessageId: CLIENT_ID })).toBe(true);
  });

  it('a buffered/deterministic stream result also marks completed and emits one aiResponse', async () => {
    mockStreamImpl.mockResolvedValue({
      fullResponse: 'deterministic',
      provider: 'deterministic',
      finishReason: 'stop',
      streamed: false,
    });
    const ac = new AbortController();
    const socket = fakeSocket();
    await callGenerateResponses(socket, ac.signal);
    const names = socket.emitted.map((e) => e.event);
    expect(names.filter((n) => n === 'aiResponse')).toHaveLength(1);
    expect(names.filter((n) => n === 'aiResponseStart')).toHaveLength(0);
    expect(registry.isCompleted({ userId: USER_ID, sessionId: SESSION_ID, clientMessageId: CLIENT_ID })).toBe(true);
  });
});

describe('Provider cancellation identity', () => {
  // The real gemini module (bypassing the controller-level mock above).
  const gen = jest.requireActual('../utils/gemini');

  it('exports STREAM_CANCELLED constant', () => {
    expect(gen.STREAM_CANCELLED).toBe('STREAM_CANCELLED');
  });

  it('a pre-aborted signal rejects with the shared cancelled identity', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      gen.generateChatResponseStream({
        userMessage: 'q',
        chatHistory: [],
        productContext: [],
        signal: ac.signal,
        onDelta: jest.fn(),
      })
    ).rejects.toMatchObject({ cancelled: true, code: 'STREAM_CANCELLED' });
  });
});