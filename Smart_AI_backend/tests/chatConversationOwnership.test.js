/* ------------------------------------------------------------------ */
/*  Conversation ownership isolation tests                             */
/*                                                                     */
/*  Verifies that chat conversations and Redis context are scoped to   */
/*  the authenticated user (socket.data.user.id) and that a client-    */
/*  supplied sessionId can never cross user boundaries.                */
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

const mockCapturedProducts = { value: null };
const capturedChatHistory = { value: null };

jest.mock('../utils/gemini', () => ({
  classifyIntentAndRespond: jest.fn(),
  generateChatResponse: jest.fn((_h, _m, products) => {
    mockCapturedProducts.value = products;
    return Promise.resolve({
      text: 'Here are some phones matching your criteria.',
      provider: 'deterministic',
    });
  }),
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
const Complaint = require('../models/Complaint');
const ChatController = require('../controllers/chatController');

const USER_A = '507f1f77bcf86cd799439011';
const USER_B = '507f1f77bcf86cd799439022';
const SESSION_X = '550e8400-e29b-41d4-a716-446655440000';

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

beforeEach(() => {
  conversationStore.length = 0;
  Object.keys(global.__ctxCache).forEach((k) => delete global.__ctxCache[k]);
  jest.clearAllMocks();
  mockCapturedProducts.value = null;
  capturedChatHistory.value = null;
  generateChatResponse.mockImplementation((history, _m, products) => {
    capturedChatHistory.value = history;
    mockCapturedProducts.value = products;
    return Promise.resolve({
      text: 'Here are some phones matching your criteria.',
      provider: 'deterministic',
    });
  });
});

describe('Conversation ownership — create/lookup', () => {
  it('stores the authenticated userId on a newly created conversation', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
    });

    const created = conversationStore.find((c) => c.sessionId === SESSION_X);
    expect(created).toBeDefined();
    expect(String(created.userId)).toBe(USER_A);
  });

  it('looks up conversations by both userId and sessionId', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
    });

    expect(Conversation.findOne).toHaveBeenCalledWith({
      sessionId: SESSION_X,
      userId: USER_A,
    });
  });

  it('resumes the same user conversation across turns', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
    });
    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'tìm Samsung tiếp',
    });

    const owned = conversationStore.filter((c) => c.sessionId === SESSION_X);
    expect(owned).toHaveLength(1);
    expect(String(owned[0].userId)).toBe(USER_A);
    expect(owned[0].messages.length).toBe(4);
  });
});

describe('Conversation ownership — cross-user isolation', () => {
  it('different users with the same sessionId get separate conversations', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
    });
    await ChatController.processMessage(makeSocket(USER_B), {
      sessionId: SESSION_X,
      message: 'tìm iPhone',
    });

    const convs = conversationStore.filter((c) => c.sessionId === SESSION_X);
    expect(convs).toHaveLength(2);
    expect(new Set(convs.map((c) => String(c.userId)))).toEqual(new Set([USER_A, USER_B]));
  });

  it('a foreign user cannot append to another user conversation', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
    });

    const aConv = conversationStore.find((c) => c.sessionId === SESSION_X);
    const aMessageCount = aConv.messages.length;

    await ChatController.processMessage(makeSocket(USER_B), {
      sessionId: SESSION_X,
      message: 'tìm iPhone',
    });

    expect(aConv.messages.length).toBe(aMessageCount);
  });

  it('foreign history is never included in the LLM prompt', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'SECRET_A_CONTENT',
    });

    await ChatController.processMessage(makeSocket(USER_B), {
      sessionId: SESSION_X,
      message: 'hello',
    });

    const lastHistory = capturedChatHistory.value;
    const historyText = JSON.stringify(lastHistory);
    expect(historyText).not.toContain('SECRET_A_CONTENT');
  });

  it('assistant response is saved only to the authenticated user conversation', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
    });
    await ChatController.processMessage(makeSocket(USER_B), {
      sessionId: SESSION_X,
      message: 'tìm iPhone',
    });

    const aConv = conversationStore.find(
      (c) => c.sessionId === SESSION_X && String(c.userId) === USER_A
    );
    const bConv = conversationStore.find(
      (c) => c.sessionId === SESSION_X && String(c.userId) === USER_B
    );

    expect(aConv.messages.filter((m) => m.role === 'assistant').length).toBe(1);
    expect(bConv.messages.filter((m) => m.role === 'assistant').length).toBe(1);
    expect(aConv.messages.find((m) => m.role === 'user').content).toBe('tìm Samsung');
    expect(bConv.messages.find((m) => m.role === 'user').content).toBe('tìm iPhone');
  });
});

describe('Conversation ownership — trust boundary', () => {
  it('ignores a client-supplied userId in the payload', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
      userId: USER_B, // must be ignored
    });

    const owned = conversationStore.find((c) => c.sessionId === SESSION_X);
    expect(String(owned.userId)).toBe(USER_A);
  });

  it('rejects a message when the authenticated user is missing', async () => {
    await expect(
      ChatController.processMessage(makeSocket(null), {
        sessionId: SESSION_X,
        message: 'hello',
      })
    ).rejects.toThrow('Missing authenticated user');
    expect(conversationStore).toHaveLength(0);
  });
});

describe('Conversation ownership — legacy conversations', () => {
  it('does not auto-claim an unowned legacy conversation via sessionId', async () => {
    // Simulate a legacy document created before ownership existed (no userId).
    const legacy = new Conversation({ sessionId: 'legacy-session-1' });
    legacy.save();
    const legacyBefore = conversationStore.length;

    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: 'legacy-session-1',
      message: 'tìm Samsung',
    });

    // The legacy document must remain untouched and a fresh owned conversation
    // is created for the current user.
    expect(conversationStore.length).toBe(legacyBefore + 1);
    const created = conversationStore.find(
      (c) => c.sessionId === 'legacy-session-1' && String(c.userId) === USER_A
    );
    expect(created).toBeDefined();
    const legacyDoc = conversationStore.find(
      (c) => c.sessionId === 'legacy-session-1' && !c.userId
    );
    expect(legacyDoc).toBeDefined();
    expect(legacyDoc.messages.length).toBe(0);
  });
});

describe('Redis context isolation', () => {
  it('builds per-user context keys', () => {
    const contextService = require('../services/contextService');
    const keyA = contextService.buildKey(USER_A, SESSION_X);
    const keyB = contextService.buildKey(USER_B, SESSION_X);
    expect(keyA).toContain('user:' + USER_A + ':' + SESSION_X);
    expect(keyB).toContain('user:' + USER_B + ':' + SESSION_X);
    expect(keyA).not.toBe(keyB);
  });

  it('two users with same sessionId have separate Redis context', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'tìm Samsung dưới 10 triệu',
    });
    await ChatController.processMessage(makeSocket(USER_B), {
      sessionId: SESSION_X,
      message: 'tìm iPhone dưới 5 triệu',
    });

    const keys = Object.keys(global.__ctxCache);
    const aKey = keys.find((k) => k.includes(USER_A));
    const bKey = keys.find((k) => k.includes(USER_B));
    expect(aKey).toBeDefined();
    expect(bKey).toBeDefined();
    expect(aKey).not.toBe(bKey);
  });
});

describe('Complaint flow ownership', () => {
  it('scopes complaint lookup to the owned conversation', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({ intent: 'complaint' });
    generateComplaintResponse.mockResolvedValue({
      responseText: 'Em xin lỗi',
      isComplete: true,
      complaintData: {
        detailedDescription: 'lỗi sản phẩm',
        customerContact: { email: 'a@example.com', phone: null },
        priority: 'high',
        tags: ['hardware'],
      },
    });

    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'sản phẩm bị lỗi',
    });

    expect(Complaint.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: expect.anything(),
        status: { $in: ['open', 'in_progress'] },
      })
    );
    // Complaint lookup must be scoped by conversation, never by sessionId alone.
    expect(Complaint.findOne.mock.calls[0][0]).not.toHaveProperty('sessionId');
  });
});
