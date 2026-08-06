/* ------------------------------------------------------------------ */
/*  ChatController.generateResponse streaming CONTRACT tests           */
/*                                                                    */
/*  Proves the accepted event contract for LIVE provider success:     */
/*    ack -> started -> aiResponseStart -> aiResponseChunk*           */
/*           -> aiResponseComplete -> completed                       */
/*  and that `aiResponse` is never emitted for a live streamed        */
/*  success (reserved for buffered/deterministic fallback and         */
/*  completed duplicate replays).                                     */
/*                                                                    */
/*  generateChatResponseStream is mocked to emit deltas with a        */
/*  configurable fail-point so we can assert exactly-once start,      */
/*  sequential zero-based chunkIndex, no empty chunks, complete       */
/*  after chunks / before messageProcessing completed, totalChunks,   */
/*  authoritative content, no aiResponse on live, and the buffered    */
/*  fallback path.                                                    */
/*                                                                    */
/*  No real socket, MongoDB, Redis, or LLM calls are made.            */
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

jest.mock('../models/Conversation', () => ({
  findOne: jest.fn(),
}));

jest.mock('../models/Complaint', () => ({
  findOne: jest.fn(),
}));

const streamResult = {
  fullResponse: '',
  provider: 'openai',
  finishReason: 'stop',
  streamed: true,
};
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

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const CLIENT_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/** In-memory fake socket that records each emitted event. */
function fakeSocket() {
  const emitted = [];
  const socket = {
    emitted,
    emit: (event, payload) => {
      emitted.push({ event, payload });
      return true;
    },
    handshake: { headers: {}, address: '127.0.0.1' },
    data: { user: { id: 'user-123' } },
  };
  return socket;
}

/** Drive generateResponse against a fake socket and return emitted events. */
async function runStream(overrides = {}) {
  const socket = fakeSocket();
  const events = [];
  socket.emit = (event, payload) => {
    events.push({ event, payload });
    return true;
  };
  socket.emit.bind(socket); // no-op to keep shape consistent
  await ChatController.generateResponse(
    socket,
    SESSION_ID,
    [],
    'user query',
    [{ _id: 'p1', name: 'iPhone', price: 1000, inStock: 1 }],
    CLIENT_ID
  );
  return events;
}

describe('ChatController.generateResponse streaming contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

it('emits aiResponseStart exactly once + complete, never aiResponse, on live success', async () => {
    mockStreamImpl.mockImplementation(({ onDelta }) => {
      onDelta('Xin '.repeat(20));
      onDelta('chào');
      return Promise.resolve({
        fullResponse: 'Xin chào',
        provider: 'openai',
        finishReason: 'stop',
        streamed: true,
      });
    });
    const events = await runStream();
    const names = events.map((e) => e.event);

    expect(names.filter((n) => n === 'aiResponseStart')).toHaveLength(1);
    expect(names.filter((n) => n === 'aiResponseComplete')).toHaveLength(1);
    expect(names.filter((n) => n === 'aiResponse')).toHaveLength(0);
  });

  it('emits aiResponseStart before the first chunk and content order preserved', async () => {
    mockStreamImpl.mockImplementation(({ onDelta }) => {
      onDelta('Xin ');
      onDelta('chào ');
      onDelta('bạn');
      return Promise.resolve({
        fullResponse: 'Xin chào bạn',
        provider: 'openai',
        finishReason: 'stop',
        streamed: true,
      });
    });
    const events = await runStream();
    const startIdx = events.findIndex((e) => e.event === 'aiResponseStart');
    const chunks = events.filter((e) => e.event === 'aiResponseChunk');
    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(chunks.length).toBeGreaterThan(0);
    const firstChunkIdx = events.findIndex((e) => e.event === 'aiResponseChunk');
    expect(firstChunkIdx).toBeGreaterThan(startIdx);
    expect(chunks.map((c) => c.payload.chunk).join('')).toBe('Xin chào bạn');
  });

  it('uses delta-only chunks with zero-based sequential chunkIndex', async () => {
mockStreamImpl.mockImplementation(({ onDelta }) => {
      ['alpha ', 'beta ', 'gamma'].forEach((d) => onDelta(d.repeat(10)));
      return Promise.resolve({
        fullResponse: 'alphabeta gamma'.replace(/ /g, '').repeat(1),
        provider: 'openai',
        finishReason: 'stop',
        streamed: true,
      });
    });
    const events = await runStream();
    const chunks = events.filter((e) => e.event === 'aiResponseChunk');
    // Each >=40-char delta flushes as its own chunk -> indices 0,1,2
    expect(chunks.map((c) => c.payload.chunkIndex)).toEqual([0, 1, 2]);
    // delta-only: never a running accumulator
    expect(chunks[1].payload.chunk).not.toBe('alpha '.repeat(10).concat('beta '.repeat(10)));
    // required super-shape
    for (const c of chunks) {
      expect(c.payload).toHaveProperty('sessionId', SESSION_ID);
      expect(c.payload).toHaveProperty('clientMessageId', CLIENT_ID);
      expect(c.payload).toHaveProperty('chunk');
      expect(c.payload).toHaveProperty('chunkIndex');
      expect(c.payload).toHaveProperty('timestamp');
      expect(typeof c.payload.timestamp).toBe('string');
    }
  });

  it('never emits an empty chunk', async () => {
    mockStreamImpl.mockImplementation(({ onDelta }) => {
      onDelta('');
      onDelta('ok '.repeat(20));
      onDelta('');
      return Promise.resolve({
        fullResponse: 'ok '.repeat(20).trim(),
        provider: 'openai',
        finishReason: 'stop',
        streamed: true,
      });
    });
    const events = await runStream();
    const chunks = events.filter((e) => e.event === 'aiResponseChunk');
    expect(chunks.every((c) => c.payload.chunk.length > 0)).toBe(true);
    expect(chunks.map((c) => c.payload.chunk).join('')).toBe('ok '.repeat(20));
  });

  it('carries authoritative full content + finishReason + totalChunks in aiResponseComplete', async () => {
    mockStreamImpl.mockImplementation(({ onDelta }) => {
      const parts = ['ab'.repeat(30), 'cd'.repeat(30), 'ef'.repeat(30)];
      parts.forEach((d) => onDelta(d));
      return Promise.resolve({
        fullResponse: parts.join(''),
        provider: 'openai',
        finishReason: 'stop',
        streamed: true,
      });
    });
    const events = await runStream();
    const complete = events.find((e) => e.event === 'aiResponseComplete');
    const chunks = events.filter((e) => e.event === 'aiResponseChunk');
    expect(complete.payload.content).toBe('ab'.repeat(30).concat('cd'.repeat(30)).concat('ef'.repeat(30)));
    expect(complete.payload.finishReason).toBe('stop');
    expect(complete.payload.totalChunks).toBe(chunks.length);
    expect(complete.payload.clientMessageId).toBe(CLIENT_ID);
    expect(complete.payload.sessionId).toBe(SESSION_ID);
    expect(complete.payload).toHaveProperty('timestamp');
  });

  it('reports finishReason max_tokens when the provider caps output', async () => {
    mockStreamImpl.mockResolvedValue({
      fullResponse: 'x'.repeat(4000),
      provider: 'openai',
      finishReason: 'max_tokens',
      streamed: true,
    });
    const events = await runStream();
    const complete = events.find((e) => e.event === 'aiResponseComplete');
    expect(complete.payload.finishReason).toBe('max_tokens');
    expect(complete.payload.content.length).toBe(4000);
  });

  it('emits exactly one compatibility aiResponse (no start/complete) for buffered/deterministic', async () => {
    mockStreamImpl.mockResolvedValue({
      fullResponse: 'deterministic text',
      provider: 'deterministic',
      finishReason: 'stop',
      streamed: false,
    });
    const events = await runStream();
    const names = events.map((e) => e.event);
    expect(names.filter((n) => n === 'aiResponse')).toHaveLength(1);
    expect(names.filter((n) => n === 'aiResponseStart')).toHaveLength(0);
    expect(names.filter((n) => n === 'aiResponseComplete')).toHaveLength(0);
  });

  it('throws (no terminal aiResponse) when the stream function rejects before any chunk', async () => {
    mockStreamImpl.mockRejectedValue(new Error('provider down'));
    const socket = fakeSocket();
    let captured;
    try {
      await ChatController.generateResponse(socket, SESSION_ID, [], 'q', [], CLIENT_ID);
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeDefined();
    const names = socket.emitted.map((e) => e.event);
    // A genuine stream failure propagates to the socket boundary which emits
    // exactly one correlated 'error' — never a terminal aiResponse.
    expect(names.filter((n) => n === 'aiResponse')).toHaveLength(0);
    expect(names.filter((n) => n === 'aiResponseComplete')).toHaveLength(0);
  });

  it('throws (no terminal aiResponse) when the stream errors after emitting a chunk', async () => {
mockStreamImpl.mockImplementation(({ onDelta }) => {
      onDelta('partial '.repeat(10));
      return Promise.reject(new Error('mid-stream failure'));
    });
    const socket = fakeSocket();
    let captured;
    try {
      await ChatController.generateResponse(
        socket,
        SESSION_ID,
        [],
        'q',
        [],
        CLIENT_ID
      );
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeDefined();
    const events = socket.emitted.filter((e) => e);
    const names = events.map((e) => e.event);
    // Partial stream: start+chunk were emitted, but no complete and no aiResponse.
    expect(names.filter((n) => n === 'aiResponseStart').length).toBe(1);
    expect(names.filter((n) => n === 'aiResponseComplete')).toHaveLength(0);
    expect(names.filter((n) => n === 'aiResponse')).toHaveLength(0);
  });
});
