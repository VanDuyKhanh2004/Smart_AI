/* ------------------------------------------------------------------ */
/*  Chat message correlation tests                                     */
/*                                                                     */
/*  Verifies clientMessageId threading through the chat pipeline:      */
/*    - every aiResponse carries the same clientMessageId/sessionId    */
/*    - user and assistant messages persist the correlation id          */
/*    - defensive guards never append duplicate user/assistant rows     */
/*    - a failed generation emits NO aiResponse and NO controller-level */
/*      'error' (single terminal error is emitted by the socket layer)  */
/*                                                                     */
/*  No real MongoDB, Redis, or LLM calls are made.                     */
/* ------------------------------------------------------------------ */

global.__ctxCache = {};
jest.mock('../services/cacheService', () => {
  const store = global.__ctxCache;
  return {
    get: jest.fn().mockImplementation(async (key) => store[key] || null),
    set: jest.fn().mockImplementation(async (key, value) => { store[key] = value; }),
    del: jest.fn().mockImplementation(async (key) => { delete store[key]; }),
    exists: jest.fn().mockImplementation(async (key) => store[key] !== undefined),
    invalidatePattern: jest.fn().mockResolvedValue(0),
  };
});

jest.mock('../models/Product', () => ({
  aggregate: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

jest.mock('../utils/openai', () => ({
  generateEmbedding: jest.fn(),
  generateEmbeddingsBatch: jest.fn(),
  calculateSimilarity: jest.fn(),
  testOpenAIConnection: jest.fn(),
}));

const conversationStore = [];

jest.mock('../models/Conversation', () => {
  const Conversation = jest.fn(function (fields = {}) {
    this._id = 'conv-' + (conversationStore.length + 1);
    this.sessionId = fields.sessionId;
    this.userId = fields.userId;
    this.messages = fields.messages || [];
    this.save = jest.fn(async () => {
      const idx = conversationStore.findIndex((c) => c._id === this._id);
      if (idx >= 0) conversationStore[idx] = this;
      else conversationStore.push(this);
      return this;
    });
  });
  Conversation.findOne = jest.fn(async ({ sessionId, userId }) => {
    return (
      conversationStore.find(
        (c) =>
          c.sessionId === sessionId &&
          !!c.userId &&
          String(c.userId) === String(userId)
      ) || null
    );
  });
  return Conversation;
});

jest.mock('../models/Complaint', () => {
  const complaintStore = [];
  const Complaint = jest.fn(function (fields = {}) {
    Object.assign(this, fields);
    this._id = 'comp-' + (complaintStore.length + 1);
    this.save = jest.fn(async () => {
      complaintStore.push(this);
      return this;
    });
  });
  Complaint.findOne = jest.fn(async () => null);
  return Complaint;
});

jest.mock('../utils/gemini', () => ({
  classifyIntentAndRespond: jest.fn(),
  generateChatResponse: jest.fn(),
  generateComplaintResponse: jest.fn(),
}));

const Product = require('../models/Product');
const { generateEmbedding } = require('../utils/openai');
const {
  classifyIntentAndRespond,
  generateChatResponse,
  generateComplaintResponse,
} = require('../utils/gemini');
const Conversation = require('../models/Conversation');
const ChatController = require('../controllers/chatController');

const USER_A = '507f1f77bcf86cd799439011';
const SESSION_X = '550e8400-e29b-41d4-a716-446655440000';
const CLIENT_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function makeSocket(userId) {
  return {
    handshake: { headers: { 'user-agent': 'test' }, address: '127.0.0.1' },
    data: userId ? { user: { id: userId } } : {},
    emit: jest.fn(),
  };
}

function setupProductQuery() {
  generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
  Product.aggregate.mockResolvedValue([
    { _id: 's1', name: 'Galaxy S24', brand: 'samsung', price: 18_990_000, inStock: 4, isActive: true, description: 'Flagship' },
  ]);
}

function emitted(socket, event) {
  return socket.emit.mock.calls.filter(([name]) => name === event).map(([, payload]) => payload);
}

beforeEach(() => {
  conversationStore.length = 0;
  Object.keys(global.__ctxCache).forEach((k) => delete global.__ctxCache[k]);
  jest.clearAllMocks();
  generateChatResponse.mockResolvedValue({
    text: 'Here are some phones matching your criteria.',
    provider: 'deterministic',
  });
});

describe('Chat message correlation — product query', () => {
  it('emits aiResponse with the same clientMessageId and sessionId', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    const socket = makeSocket(USER_A);
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
      clientMessageId: CLIENT_ID,
    });

    const responses = emitted(socket, 'aiResponse');
    expect(responses).toHaveLength(1);
    expect(responses[0].sessionId).toBe(SESSION_X);
    expect(responses[0].clientMessageId).toBe(CLIENT_ID);
  });

  it('persists the correlation id on both user and assistant messages', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    const socket = makeSocket(USER_A);
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
      clientMessageId: CLIENT_ID,
    });

    const conv = conversationStore.find((c) => c.sessionId === SESSION_X);
    expect(conv).toBeDefined();
    const roles = conv.messages.map((m) => ({ role: m.role, clientMessageId: m.clientMessageId }));
    expect(roles).toEqual([
      { role: 'user', clientMessageId: CLIENT_ID },
      { role: 'assistant', clientMessageId: CLIENT_ID },
    ]);
  });

  it('does not append a duplicate user message for an already stored id', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });
    conversationStore.push({
      _id: 'conv-existing',
      sessionId: SESSION_X,
      userId: USER_A,
      messages: [{ role: 'user', content: 'tìm Samsung', clientMessageId: CLIENT_ID }],
    });

    const socket = makeSocket(USER_A);
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
      clientMessageId: CLIENT_ID,
    });

    const conv = conversationStore.find((c) => c.sessionId === SESSION_X);
    const userMessages = conv.messages.filter((m) => m.role === 'user');
    expect(userMessages).toHaveLength(1);
    const assistantMessages = conv.messages.filter((m) => m.role === 'assistant');
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].clientMessageId).toBe(CLIENT_ID);
  });

  it('never emits an error or aiResponse when generation fails', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });
    generateChatResponse.mockRejectedValue(new Error('LLM down'));

    const socket = makeSocket(USER_A);
    await expect(
      ChatController.processMessage(socket, {
        sessionId: SESSION_X,
        message: 'tìm Samsung',
        clientMessageId: CLIENT_ID,
      })
    ).rejects.toThrow('LLM down');

    expect(emitted(socket, 'aiResponse')).toHaveLength(0);
    expect(emitted(socket, 'error')).toHaveLength(0);
  });

  it('does not persist an assistant reply when generation fails', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });
    generateChatResponse.mockRejectedValue(new Error('LLM down'));

    const socket = makeSocket(USER_A);
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
      clientMessageId: CLIENT_ID,
    }).catch(() => {});

    const conv = conversationStore.find((c) => c.sessionId === SESSION_X);
    expect(conv).toBeDefined();
    expect(conv.messages.filter((m) => m.role === 'assistant')).toHaveLength(0);
  });
});

describe('Chat message correlation — small talk and complaint', () => {
  it('small talk aiResponse carries the correlation id', async () => {
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'small_talk',
      directResponse: 'Xin chào!',
    });

    const socket = makeSocket(USER_A);
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'chào bạn',
      clientMessageId: CLIENT_ID,
    });

    const responses = emitted(socket, 'aiResponse');
    expect(responses).toHaveLength(1);
    expect(responses[0].clientMessageId).toBe(CLIENT_ID);
    expect(responses[0].metadata.responseType).toBe('small_talk');
  });

  it('complaint aiResponse carries the correlation id', async () => {
    classifyIntentAndRespond.mockResolvedValue({ intent: 'complaint' });
    generateComplaintResponse.mockResolvedValue({
      responseText: 'Em xin lỗi vì sự bất tiện này.',
      isComplete: true,
      complaintData: {
        priority: 'high',
        tags: ['complaint'],
        detailedDescription: 'Sản phẩm bị lỗi',
        customerContact: { email: 'a@b.com', phone: '0900000000' },
      },
    });

    const socket = makeSocket(USER_A);
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'tôi muốn khiếu nại',
      clientMessageId: CLIENT_ID,
    });

    const responses = emitted(socket, 'aiResponse');
    expect(responses).toHaveLength(1);
    expect(responses[0].clientMessageId).toBe(CLIENT_ID);
    expect(responses[0].metadata.responseType).toBe('complaint');
  });
});

describe('Chat message correlation — ack/payload shape', () => {
  it('buildAiPayload always includes sessionId, clientMessageId, message, timestamp', () => {
    const payload = ChatController.buildAiPayload(SESSION_X, CLIENT_ID, 'Hi');
    expect(payload).toMatchObject({
      sessionId: SESSION_X,
      clientMessageId: CLIENT_ID,
      message: 'Hi',
    });
    expect(typeof payload.timestamp).toBe('string');
  });

  it('buildAiPayload attaches metadata only when provided', () => {
    const withMeta = ChatController.buildAiPayload(SESSION_X, CLIENT_ID, 'Hi', { a: 1 });
    expect(withMeta.metadata).toEqual({ a: 1 });

    const withoutMeta = ChatController.buildAiPayload(SESSION_X, CLIENT_ID, 'Hi');
    expect(withoutMeta.metadata).toBeUndefined();
  });
});