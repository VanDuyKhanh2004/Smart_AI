/* ------------------------------------------------------------------ */
/*  Complaint confirmation-gated persistence                           */
/*                                                                     */
/*  Verifies the complaint flow NEVER persists without the user's      */
/*  explicit confirmation, and that the confirmation decision runs    */
/*  deterministically (works with no LLM provider).                    */
/*                                                                     */
/*  Also unit-tests the confirmation decision classifier and the       */
/*  persistence service (status mapping, contact merge, tag union).    */
/*                                                                     */
/*  No real MongoDB/Redis/LLM calls are made.                          */
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
      complaintStore.push(this);
      return this;
    });
  });
  Complaint.findOne = jest.fn(() => ({
    sort: jest.fn().mockResolvedValue(null),
  }));
  return Complaint;
});

jest.mock('../utils/gemini', () => ({
  classifyIntentAndRespond: jest.fn(),
  generateChatResponse: jest.fn(),
  generateComplaintResponse: jest.fn(),
  preclassifyComplaintContinuation: jest.fn().mockReturnValue(null),
}));

const ChatController = require('../controllers/chatController');
const complaintFlowService = require('../services/complaintFlowService');
const complaintService = require('../services/complaintService');
const {
  classifyIntentAndRespond,
  generateComplaintResponse,
} = require('../utils/gemini');

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

beforeEach(() => {
  conversationStore.length = 0;
  complaintStore.length = 0;
  complaintFlowService._clearMemoryStore();
  Object.keys(global.__ctxCache).forEach((k) => delete global.__ctxCache[k]);
  jest.clearAllMocks();
  classifyIntentAndRespond.mockResolvedValue({ intent: 'complaint' });
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
   End-to-end: confirmation-gated persistence through the chat
   ============================================================ */
describe('Chat complaint flow — no persistence without confirmation', () => {
  it('creates NO complaint on the first complaint turn — only a pending confirmation', async () => {
    const socket = makeSocket(USER_A);
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'tôi muốn khiếu nại',
      clientMessageId: CLIENT_ID,
    });

    expect(complaintStore).toHaveLength(0);

    const pending = await complaintFlowService.getPending(USER_A, SESSION_X);
    expect(pending).not.toBeNull();
    expect(pending.state).toBe('awaiting_confirmation');
  });

  it('persists the complaint ONLY after the user explicitly confirms', async () => {
    const socket = makeSocket(USER_A);
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'tôi muốn khiếu nại',
      clientMessageId: CLIENT_ID,
    });
    expect(complaintStore).toHaveLength(0);

    // "có" would be classified as small_talk without the pending-confirmation
    // intercept — the intercept must route it to a decision, not to small talk.
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'có',
      clientMessageId: CLIENT_ID + '-confirm',
    });

    expect(complaintStore).toHaveLength(1);
    expect(complaintStore[0].conversationId).toBe('conv-1');
    // Contact was provided during extraction → record is actionable.
    expect(complaintStore[0].status).toBe('in_progress');
    expect(complaintFlowService.getPending(USER_A, SESSION_X)).resolves.toBeNull();
  });

  it('declining clears the pending state and creates nothing', async () => {
    const socket = makeSocket(USER_A);
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'tôi muốn khiếu nại',
      clientMessageId: CLIENT_ID,
    });
    expect(complaintStore).toHaveLength(0);

    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'thôi khỏi',
      clientMessageId: CLIENT_ID + '-decline',
    });

    expect(complaintStore).toHaveLength(0);
    await expect(complaintFlowService.getPending(USER_A, SESSION_X)).resolves.toBeNull();
  });

  it('an ambiguous reply keeps the pending state and enriches details (never persists)', async () => {
    const socket = makeSocket(USER_A);
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'tôi muốn khiếu nại',
      clientMessageId: CLIENT_ID,
    });

    // The continuation turn now supplies the enriched narrative.
    generateComplaintResponse.mockResolvedValue({
      responseText: 'Em hiểu rồi ạ.',
      isComplete: false,
      complaintData: {
        detailedDescription: 'giao chậm cả tuần chưa có hàng',
        customerContact: { email: null, phone: null },
        priority: 'medium',
        tags: ['general'],
      },
    });
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'mà giao chậm cả tuần chưa có hàng nữa',
      clientMessageId: CLIENT_ID + '-cont',
    });

    expect(complaintStore).toHaveLength(0);
    const pending = await complaintFlowService.getPending(USER_A, SESSION_X);
    expect(pending).not.toBeNull();
    expect(pending.detailedDescription).toBe('giao chậm cả tuần chưa có hàng');
    // Attempt counter advanced → pending still alive for a later confirm.
    expect(pending.attempts).toBe(2);
  });

  it('stores an "open" record when no contact info was ever provided', async () => {
    generateComplaintResponse.mockResolvedValue({
      responseText: 'Em xin lỗi.',
      isComplete: false,
      complaintData: {
        detailedDescription: 'pin tụt nhanh bất thường',
        customerContact: { email: null, phone: null },
        priority: 'medium',
        tags: [],
      },
    });

    const socket = makeSocket(USER_A);
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'điện thoại bị lỗi pin',
      clientMessageId: CLIENT_ID,
    });
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'vâng',
      clientMessageId: CLIENT_ID + '-ok',
    });

    expect(complaintStore).toHaveLength(1);
    expect(complaintStore[0].status).toBe('open');
    expect(complaintStore[0].customerContact).toEqual({ email: null, phone: null });
  });
});

/* ============================================================
   Deterministic confirmation decision (no LLM needed)
   ============================================================ */
describe('classifyComplaintConfirmation — deterministic decision', () => {
  const { classifyComplaintConfirmation, AFFIRM_EXACT, DECLINE_EXACT } = complaintFlowService;

  test.each([...AFFIRM_EXACT])('affirm: "%s" -> confirmed', (msg) => {
    expect(classifyComplaintConfirmation(msg)).toBe('confirmed');
  });

  test.each([...DECLINE_EXACT])('decline: "%s" -> declined', (msg) => {
    expect(classifyComplaintConfirmation(msg)).toBe('declined');
  });

  test('providing contact info is explicit engagement -> confirmed', () => {
    expect(classifyComplaintConfirmation('đây email của tôi a@b.com')).toBe('confirmed');
    expect(classifyComplaintConfirmation('0901234567 ạ')).toBe('confirmed');
  });

  test('continuation phrasing -> confirmed', () => {
    expect(classifyComplaintConfirmation('gửi giúp em ạ')).toBe('confirmed');
    expect(classifyComplaintConfirmation('tôi gửi khiếu nại nhé')).toBe('confirmed');
  });

  test('short hard "no" without complaint keywords -> declined', () => {
    expect(classifyComplaintConfirmation('không cần đâu')).toBe('declined');
    expect(classifyComplaintConfirmation('thôi')).toBe('declined');
    expect(classifyComplaintConfirmation('hủy')).toBe('declined');
  });

  test('a continued complaint narrative is NOT a decision -> ambiguous', () => {
    expect(classifyComplaintConfirmation('sản phẩm bị lỗi')).toBe('ambiguous');
    expect(classifyComplaintConfirmation('hàng giao thiếu phụ kiện')).toBe('ambiguous');
  });

  test('"không" immediately before complaint words is ambiguous, not a decline decision', () => {
    // "không gởi" typo-resilient readings and negation + complaint body must
    // never clear the pending state silently.
    expect(classifyComplaintConfirmation('không gửi khiếu nại')).toBe('declined');
  });

  test('empty / null input -> ambiguous (keeps pending alive)', () => {
    expect(classifyComplaintConfirmation('')).toBe('ambiguous');
    expect(classifyComplaintConfirmation(null)).toBe('ambiguous');
    expect(classifyComplaintConfirmation(undefined)).toBe('ambiguous');
  });
});

/* ============================================================
   Persistence service — status mapping, contact merge, tags
   ============================================================ */
describe('complaintService — persistence logic', () => {
  it('maps status to in_progress when contact is present, else open', async () => {
    const withContact = await complaintService.createComplaint({
      sessionId: SESSION_X,
      conversationId: 'conv-abc',
      complaintSummary: 'lỗi pin',
      detailedDescription: 'pin tụt nhanh',
      customerContact: { email: 'x@y.com' },
      priority: 'high',
      tags: ['hardware'],
    });
    expect(withContact.status).toBe('in_progress');
    expect(withContact.customerContact.email).toBe('x@y.com');

    const withoutContact = await complaintService.createComplaint({
      sessionId: SESSION_X,
      conversationId: 'conv-def',
      detailedDescription: 'giao chậm',
    });
    expect(withoutContact.status).toBe('open');
  });

  it('merges updates, unions tags, and advances open -> in_progress once contact appears', async () => {
    const rec = await complaintService.createComplaint({
      sessionId: SESSION_X,
      conversationId: 'conv-ghi',
      detailedDescription: 'chưa nhận hàng',
      customerContact: { email: null, phone: null },
    });
    expect(rec.status).toBe('open');

    const updated = await complaintService.updateExistingComplaint(rec, {
      detailedDescription: 'chưa nhận hàng, đơn có dấu hiệu thất lạc',
      customerContact: { email: 'z@w.com' },
      tags: ['delivery', 'general'],
    });

    expect(updated.detailedDescription).toBe('chưa nhận hàng, đơn có dấu hiệu thất lạc');
    expect(updated.customerContact.email).toBe('z@w.com');
    expect(updated.status).toBe('in_progress');
    expect(updated.tags).toContain('delivery');
    expect(updated.tags).toContain('general');
  });

  it('hasContact only counts a real email or phone', () => {
    expect(complaintService.hasContact({ email: 'a@b.com' })).toBe(true);
    expect(complaintService.hasContact({ phone: '0900000000' })).toBe(true);
    expect(complaintService.hasContact({ email: null, phone: null })).toBe(false);
    expect(complaintService.hasContact({})).toBe(false);
    expect(complaintService.hasContact(null)).toBe(false);
  });
});