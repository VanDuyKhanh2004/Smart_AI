/* ------------------------------------------------------------------ */
/*  Complaint continuation flow tests                                  */
/*                                                                     */
/*  Verifies the manual-test bug fix: once a complaint has been        */
/*  confirmed and persisted as an open/in_progress record, an obvious  */
/*  additional defect message ("Sản phẩm còn bị sọc màn hình nữa",     */
/*  "Camera cũng không hoạt động", …) continues the EXISTING complaint */
/*  deterministically (no LLM needed) instead of falling through to a  */
/*  product-query response. Unrelated product/shipping questions keep  */
/*  their normal flows; a NEW complaint still needs explicit           */
/*  confirmation; no second Complaint record is ever created.          */
/*                                                                     */
/*  No real MongoDB/Redis/LLM calls are made. The deterministic        */
/*  continuation detector is the REAL gemini export.                   */
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

const complaintStore = [];

jest.mock('../models/Complaint', () => {
  const Complaint = jest.fn(function (fields = {}) {
    Object.assign(this, fields);
    this._id = 'comp-' + (complaintStore.length + 1);
    this.save = jest.fn(async () => {
      const idx = complaintStore.findIndex((c) => c._id === this._id);
      if (idx >= 0) complaintStore[idx] = this;
      else complaintStore.push(this);
      return this;
    });
  });
  Complaint.findOne = jest.fn((query) => ({
    sort: jest.fn().mockResolvedValue(
      complaintStore
        .filter(
          (c) =>
            String(c.conversationId) === String(query.conversationId) &&
            Array.isArray(query.status && query.status.$in) &&
            query.status.$in.includes(c.status)
        )
        .sort((a, b) => ((a.createdAt || 0) > (b.createdAt || 0) ? -1 : 1))[0] || null
    ),
  }));
  return Complaint;
});

jest.mock('../models/Appointment', () => {
  const Appointment = jest.fn();
  Appointment.find = jest.fn(() => {
    const chain = {
      populate: jest.fn(() => chain),
      sort: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      then: (resolve, reject) => Promise.resolve([]).then(resolve, reject),
    };
    return chain;
  });
  return Appointment;
});

jest.mock('../utils/gemini', () => {
  const actual = jest.requireActual('../utils/gemini');
  return {
    ...actual,
    // No streaming in tests → the classic buffered path is used.
    generateChatResponseStream: undefined,
    classifyIntentAndRespond: jest.fn(),
    generateChatResponse: jest.fn(),
    generateComplaintResponse: jest.fn(),
  };
});

const Product = require('../models/Product');
const { generateEmbedding } = require('../utils/openai');
const {
  classifyIntentAndRespond,
  generateChatResponse,
  generateComplaintResponse,
  preclassifyComplaintContinuation,
} = require('../utils/gemini');
const ChatController = require('../controllers/chatController');
const complaintFlowService = require('../services/complaintFlowService');
const complaintService = require('../services/complaintService');

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

function emitted(socket, event) {
  return socket.emit.mock.calls.filter(([name]) => name === event).map(([, payload]) => payload);
}

function setupProductQuery() {
  generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
  Product.aggregate.mockResolvedValue([
    { _id: 's1', name: 'Galaxy S24', brand: 'samsung', price: 18_990_000, inStock: 4, isActive: true, description: 'Flagship' },
  ]);
}

/** Runs the first complaint turn then confirms it, leaving one persisted record. */
async function startAndConfirm(socket) {
  await ChatController.processMessage(socket, {
    sessionId: SESSION_X,
    message: 'tôi muốn khiếu nại',
    clientMessageId: CLIENT_ID + '-0',
  });
  await ChatController.processMessage(socket, {
    sessionId: SESSION_X,
    message: 'có',
    clientMessageId: CLIENT_ID + '-1',
  });
  expect(complaintStore).toHaveLength(1);
}

beforeEach(() => {
  conversationStore.length = 0;
  complaintStore.length = 0;
  complaintFlowService._clearMemoryStore();
  Object.keys(global.__ctxCache).forEach((k) => delete global.__ctxCache[k]);
  jest.clearAllMocks();
  classifyIntentAndRespond.mockResolvedValue({ intent: 'complaint' });
  generateChatResponse.mockImplementation((_h, _m, _products) =>
    Promise.resolve({ text: 'Đây là những sản phẩm phù hợp với yêu cầu của anh/chị ạ.', provider: 'deterministic' })
  );
  generateComplaintResponse.mockResolvedValue({
    responseText: 'Em xin lỗi vì sự bất tiện này.',
    isComplete: true,
    complaintData: {
      detailedDescription: 'Điện thoại giao bị vỡ',
      customerContact: { email: 'a@b.com', phone: '0901234567' },
      priority: 'high',
      tags: ['hardware'],
    },
  });
});

/* ============================================================
   Deterministic continuation detector (real implementation)
   ============================================================ */
describe('preclassifyComplaintContinuation — deterministic, question-safe', () => {
  test.each([
    'Sản phẩm còn bị sọc màn hình nữa',
    'Máy còn bị nóng bất thường',
    'Camera cũng không hoạt động',
    'Tôi còn phát hiện màn hình bị nhấp nháy',
    'Pin cũng bị chai nhanh',
    'Ngoài ra máy còn bị rò rỉ nước nữa ạ',
  ])('"%s" is a complaint continuation', (msg) => {
    const result = preclassifyComplaintContinuation(msg);
    expect(result).not.toBeNull();
    expect(result.intent).toBe('complaint_continuation');
  });

  test.each([
    'iPhone 12 Pro giá bao nhiêu?',
    'Có điện thoại Samsung nào dưới 20 triệu không?',
    'Giao hàng bao lâu?',
    'Phí giao hàng thế nào ạ?',
    'Máy mới có bị nóng khi sạc không?',
    'Sản phẩm này có bị lỗi không ạ?',
    'Màn hình còn bị sọc nữa không?',
    'Tư vấn mua máy giúp tôi',
    'Còn mẫu màu đen không?',
  ])('"%s" is NOT a continuation (null → defer)', (msg) => {
    expect(preclassifyComplaintContinuation(msg)).toBeNull();
  });

  test('null / undefined / empty input -> null', () => {
    expect(preclassifyComplaintContinuation(null)).toBeNull();
    expect(preclassifyComplaintContinuation(undefined)).toBeNull();
    expect(preclassifyComplaintContinuation('')).toBeNull();
    expect(preclassifyComplaintContinuation('   ')).toBeNull();
  });
});

/* ============================================================
   Continuation flow through the chat (confirmed complaint)
   ============================================================ */
describe('Complaint continuation — confirmed complaint', () => {
  it('updates the existing complaint, creates no second record, never runs the product path', async () => {
    const socket = makeSocket(USER_A);
    await startAndConfirm(socket);

    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'Sản phẩm còn bị sọc màn hình nữa',
      clientMessageId: CLIENT_ID + '-2',
    });

    expect(complaintStore).toHaveLength(1);
    const record = complaintStore[0];
    expect(record.detailedDescription).toContain('Điện thoại giao bị vỡ');
    expect(record.detailedDescription).toContain('Sản phẩm còn bị sọc màn hình nữa');

    const reply = emitted(socket, 'aiResponse').pop();
    expect(reply.metadata.responseType).toBe('complaint');
    expect(reply.metadata.complaintId).toBe(record._id);
    expect(typeof reply.message).toBe('string');

    // Deterministic short-circuit: classification runs only for the first turn.
    expect(classifyIntentAndRespond).toHaveBeenCalledTimes(1);
    expect(generateChatResponse).not.toHaveBeenCalled();
    expect(Product.aggregate).not.toHaveBeenCalled();
  });

  it('keeps appending subsequent details onto the SAME record (still one record)', async () => {
    const socket = makeSocket(USER_A);
    await startAndConfirm(socket);

    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'Sản phẩm còn bị sọc màn hình nữa',
      clientMessageId: CLIENT_ID + '-2',
    });
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'Máy còn bị nóng bất thường',
      clientMessageId: CLIENT_ID + '-3',
    });

    expect(complaintStore).toHaveLength(1);
    expect(complaintStore[0].detailedDescription).toContain('Điện thoại giao bị vỡ');
    expect(complaintStore[0].detailedDescription).toContain('Sản phẩm còn bị sọc màn hình nữa');
    expect(complaintStore[0].detailedDescription).toContain('Máy còn bị nóng bất thường');
    expect(classifyIntentAndRespond).toHaveBeenCalledTimes(1);
  });

  it('an unrelated product price question keeps its normal product flow and never touches the complaint', async () => {
    const socket = makeSocket(USER_A);
    await startAndConfirm(socket);
    setupProductQuery();

    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'iPhone 12 Pro giá bao nhiêu',
    });

    const result = await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'iPhone 12 Pro giá bao nhiêu?',
      clientMessageId: CLIENT_ID + '-2',
    });

    expect(result.responseType).toBe('product_query');
    expect(Product.aggregate).toHaveBeenCalled();
    expect(complaintStore).toHaveLength(1);
    expect(complaintStore[0].detailedDescription).toBe('Điện thoại giao bị vỡ');
    expect(complaintStore[0].detailedDescription).not.toContain('iPhone');
    // The question went through classification (continuation detector returned null).
    expect(classifyIntentAndRespond).toHaveBeenCalledTimes(2);
  });

  it('a shipping-time question keeps its normal flow and never touches the complaint', async () => {
    const socket = makeSocket(USER_A);
    await startAndConfirm(socket);
    setupProductQuery();

    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Giao hàng bao lâu',
    });

    const result = await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'Giao hàng bao lâu?',
      clientMessageId: CLIENT_ID + '-2',
    });

    expect(result.responseType).toBe('product_query');
    expect(complaintStore).toHaveLength(1);
    expect(complaintStore[0].detailedDescription).toBe('Điện thoại giao bị vỡ');
    expect(classifyIntentAndRespond).toHaveBeenCalledTimes(2);
  });

  it('a continuation marker with no existing complaint is NOT auto-persisted — new complaints still need explicit confirmation', async () => {
    const socket = makeSocket(USER_A);
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'tôi muốn khiếu nại',
      clientMessageId: CLIENT_ID + '-0',
    });
    expect(complaintStore).toHaveLength(0);

    // Continuation-looking phrasing BEFORE any confirmed record → no record is
    // created; the pending state is simply kept and enriched.
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'Sản phẩm còn bị sọc màn hình nữa',
      clientMessageId: CLIENT_ID + '-2',
    });
    expect(complaintStore).toHaveLength(0);
    await expect(complaintFlowService.getPending(USER_A, SESSION_X)).resolves.not.toBeNull();

    // Explicit confirmation still creates exactly one record.
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'có',
      clientMessageId: CLIENT_ID + '-1',
    });
    expect(complaintStore).toHaveLength(1);
    await expect(complaintFlowService.getPending(USER_A, SESSION_X)).resolves.toBeNull();
  });

  it('continues deterministically when providers are down — no raw error, complaint updated', async () => {
    const socket = makeSocket(USER_A);
    await startAndConfirm(socket);

    // Simulate a total provider outage on any path that might still run.
    classifyIntentAndRespond.mockRejectedValue(Object.assign(new Error('Insufficient quota'), { status: 429 }));
    generateChatResponse.mockRejectedValue(new Error('socket hang up'));

    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'Camera cũng không hoạt động',
      clientMessageId: CLIENT_ID + '-2',
    });

    expect(complaintStore).toHaveLength(1);
    expect(complaintStore[0].detailedDescription).toContain('Camera cũng không hoạt động');

    const reply = emitted(socket, 'aiResponse').pop();
    expect(reply.metadata.responseType).toBe('complaint');
    expect(reply.message).toContain('khiếu nại');
    expect(reply.message).not.toContain('quota');
    expect(reply.message).not.toContain('socket hang up');
    // Only the initial complaint turn ran classification; the continuation turn
    // was fully deterministic (no provider path invoked).
    expect(classifyIntentAndRespond).toHaveBeenCalledTimes(1);
  });

  it('never creates more than one record across multiple continuations', async () => {
    const socket = makeSocket(USER_A);
    await startAndConfirm(socket);

    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'Camera cũng không hoạt động',
      clientMessageId: CLIENT_ID + '-2',
    });
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'Tôi còn phát hiện màn hình bị nhấp nháy',
      clientMessageId: CLIENT_ID + '-3',
    });

    expect(complaintStore).toHaveLength(1);
  });
});

/* ============================================================
   mergeComplaintDescription — original detail is preserved
   ============================================================ */
describe('mergeComplaintDescription — preserves the original report', () => {
  it('appends the new detail under the original narrative', () => {
    const merged = complaintService.mergeComplaintDescription('Điện thoại giao bị vỡ', 'Sản phẩm còn bị sọc màn hình nữa');
    expect(merged).toContain('Điện thoại giao bị vỡ');
    expect(merged).toContain('Sản phẩm còn bị sọc màn hình nữa');
  });

  it('handles empty inputs', () => {
    expect(complaintService.mergeComplaintDescription('', 'thêm lỗi')).toBe('thêm lỗi');
    expect(complaintService.mergeComplaintDescription('lỗi pin', '')).toBe('lỗi pin');
    expect(complaintService.mergeComplaintDescription('', '')).toBe('');
  });

  it('caps the total at 2000 while keeping the original text first', () => {
    const prior = 'A'.repeat(1990);
    const merged = complaintService.mergeComplaintDescription(prior, 'B'.repeat(100));
    expect(merged.length).toBeLessThanOrEqual(2000);
    expect(merged.startsWith(prior)).toBe(true);
  });
});
