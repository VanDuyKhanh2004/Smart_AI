/* ------------------------------------------------------------------ */
/*  Chatbot user context & appointment integration tests               */
/*                                                                     */
/*  Verifies:                                                          */
/*  1. Authenticated user profile is available to the chatbot          */
/*  2. Appointment queries are handled correctly                       */
/*  3. Cross-user isolation for appointments                           */
/*  4. Multi-turn appointment context                                  */
/*  5. Security: forged userId, logout context clearing                */
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
  const Complaint = jest.fn(function (fields = {}) {
    Object.assign(this, fields);
    this._id = 'comp-' + Date.now();
    this.save = jest.fn(async () => this);
  });
  Complaint.findOne = jest.fn(async () => null);
  return Complaint;
});

/* ------------------------------------------------------------------ */
/*  Appointment mock store                                             */
/* ------------------------------------------------------------------ */
const appointmentStore = [];
jest.mock('../models/Appointment', () => {
  const Appointment = jest.fn(function (fields = {}) {
    Object.assign(this, fields);
    this._id = 'apt-' + (appointmentStore.length + 1);
    this.save = jest.fn(async () => {
      appointmentStore.push(this);
      return this;
    });
    this.populate = jest.fn(function () { return this; });
    this.toObject = jest.fn(function () {
      const ret = { ...this };
      delete ret.save;
      delete ret.populate;
      delete ret.toObject;
      return ret;
    });
  });

  Appointment.find = jest.fn((query) => {
    const results = appointmentStore.filter((apt) => {
      if (query.user && String(apt.user) !== String(query.user)) return false;
      if (query.status && query.status.$in) {
        if (!query.status.$in.includes(apt.status)) return false;
      }
      if (query.date && query.date.$gte) {
        if (new Date(apt.date) < query.date.$gte) return false;
      }
      return true;
    }).map((apt) => {
      const obj = { ...apt };
      if (typeof apt.toObject === 'function') {
        Object.assign(obj, apt.toObject());
      }
      if (apt.store && typeof apt.store === 'object' && apt.store.name) {
        obj.store = apt.store;
      }
      return obj;
    });

    const chain = {
      _results: results,
      populate: jest.fn(function () { return chain; }),
      sort: jest.fn(function () { return chain; }),
      limit: jest.fn(function () { return chain; }),
      then: function (onFulfilled, onRejected) {
        return Promise.resolve(results).then(onFulfilled, onRejected);
      },
    };
    return chain;
  });

  Appointment.findOne = jest.fn(async (query) => {
    const results = await Appointment.find(query);
    return results.length > 0 ? results[0] : null;
  });

  return Appointment;
});

const mockCapturedProducts = { value: null };
const capturedChatHistory = { value: null };
const capturedUserContext = { value: null };
const capturedAppointmentContext = { value: null };

jest.mock('../utils/gemini', () => ({
  classifyIntentAndRespond: jest.fn(),
  generateChatResponse: jest.fn((_h, _m, products, userCtx, aptCtx) => {
    mockCapturedProducts.value = products;
    capturedUserContext.value = userCtx;
    capturedAppointmentContext.value = aptCtx;
    return Promise.resolve({
      text: 'Here are some phones matching your criteria.',
      provider: 'deterministic',
    });
  }),
  generateChatResponseStream: null,
  generateComplaintResponse: jest.fn(),
  preclassifyComplaintContinuation: jest.fn().mockReturnValue(null),
  preclassifyAppointment: jest.fn().mockReturnValue(null),
}));

const Product = require('../models/Product');
const { generateEmbedding } = require('../utils/openai');
const {
  classifyIntentAndRespond,
  generateChatResponse,
} = require('../utils/gemini');
const Conversation = require('../models/Conversation');
const Complaint = require('../models/Complaint');
const Appointment = require('../models/Appointment');
const ChatController = require('../controllers/chatController');

const USER_A = '507f1f77bcf86cd799439011';
const USER_B = '507f1f77bcf86cd799439022';
const SESSION_X = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_Y = '550e8400-e29b-41d4-a716-446655440001';
const STORE_ID = '507f1f77bcf86cd799439033';

function makeSocket(userId, extra = {}) {
  return {
    handshake: { headers: { 'user-agent': 'test' }, address: '127.0.0.1' },
    data: userId
      ? { user: { id: userId, email: `user${userId.slice(-2)}@test.com`, role: 'user', name: `Test User ${userId.slice(-2)}`, phone: '0901234567', ...extra } }
      : {},
    emit: jest.fn(),
  };
}

function setupProductQuery() {
  generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
  Product.aggregate.mockResolvedValue([
    { _id: 's1', name: 'Galaxy S24', brand: 'samsung', price: 18_990_000, inStock: 4, isActive: true, description: 'Flagship' },
  ]);
}

function createMockAppointment(overrides = {}) {
  return {
    _id: 'apt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    store: STORE_ID,
    user: USER_A,
    date: new Date('2099-12-25'),
    timeSlot: { start: '10:00', end: '10:30' },
    purpose: 'consultation',
    status: 'pending',
    notes: 'Test appointment',
    ...overrides,
    populate: jest.fn(function () { return this; }),
    toObject: jest.fn(function () {
      const ret = { ...this };
      delete ret.save;
      delete ret.populate;
      delete ret.toObject;
      return ret;
    }),
  };
}

beforeEach(() => {
  conversationStore.length = 0;
  appointmentStore.length = 0;
  Object.keys(global.__ctxCache).forEach((k) => delete global.__ctxCache[k]);
  jest.clearAllMocks();
  mockCapturedProducts.value = null;
  capturedChatHistory.value = null;
  capturedUserContext.value = null;
  capturedAppointmentContext.value = null;
  generateChatResponse.mockImplementation((history, _m, products, userCtx, aptCtx) => {
    capturedChatHistory.value = history;
    mockCapturedProducts.value = products;
    capturedUserContext.value = userCtx;
    capturedAppointmentContext.value = aptCtx;
    return Promise.resolve({
      text: 'Here are some phones matching your criteria.',
      provider: 'deterministic',
    });
  });
});

/* ================================================================== */
/*  USER PROFILE CONTEXT                                               */
/* ================================================================== */
describe('User profile context', () => {
  it('passes user profile from socket.data.user to generateChatResponse', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    const socket = makeSocket(USER_A);
    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
    });

    expect(capturedUserContext.value).toEqual({
      name: 'Test User 11',
      email: 'user11@test.com',
      phone: '0901234567',
    });
  });

  it('name is available in user context', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
    });

    expect(capturedUserContext.value.name).toBe('Test User 11');
  });

  it('email is available in user context', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
    });

    expect(capturedUserContext.value.email).toBe('user11@test.com');
  });

  it('phone is available in user context when present', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
    });

    expect(capturedUserContext.value.phone).toBe('0901234567');
  });

  it('handles missing optional profile fields gracefully', async () => {
    setupProductQuery();
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });

    // Socket with only id and email (no name, no phone)
    const socket = {
      handshake: { headers: { 'user-agent': 'test' }, address: '127.0.0.1' },
      data: { user: { id: USER_A, email: 'user@test.com', role: 'user' } },
      emit: jest.fn(),
    };

    await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
    });

    expect(capturedUserContext.value).toEqual({
      email: 'user@test.com',
    });
  });

  it('unauthenticated user has no private profile context', async () => {
    const socket = {
      handshake: { headers: { 'user-agent': 'test' }, address: '127.0.0.1' },
      data: {},
      emit: jest.fn(),
    };

    await expect(
      ChatController.processMessage(socket, {
        sessionId: SESSION_X,
        message: 'hello',
      })
    ).rejects.toThrow('Missing authenticated user');
  });
});

/* ================================================================== */
/*  APPOINTMENT INTENT                                                 */
/* ================================================================== */
describe('Appointment intent handling', () => {
  it('handles user with one appointment', async () => {
    const apt = createMockAppointment({
      user: USER_A,
      date: new Date('2099-12-25'),
      timeSlot: { start: '10:00', end: '10:30' },
      purpose: 'consultation',
      status: 'pending',
      store: { name: 'Test Store', address: { fullAddress: '123 Street, District 1, City' }, phone: '0123456789' },
    });
    appointmentStore.push(apt);

    classifyIntentAndRespond.mockResolvedValue({
      intent: 'appointment',
    });

    const socket = makeSocket(USER_A);
    const result = await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'Tôi có lịch hẹn nào không?',
    });

    expect(result.responseType).toBe('appointment');
    expect(result.appointmentData).toHaveLength(1);
    expect(result.fullResponse).toContain('1 lịch hẹn');
  });

  it('handles user with multiple appointments', async () => {
    const apt1 = createMockAppointment({
      user: USER_A,
      date: new Date('2099-12-25'),
      timeSlot: { start: '10:00', end: '10:30' },
      purpose: 'consultation',
      status: 'pending',
      store: { name: 'Store A', address: { fullAddress: '123 Street' }, phone: '0123456789' },
    });
    const apt2 = createMockAppointment({
      user: USER_A,
      date: new Date('2099-12-26'),
      timeSlot: { start: '14:00', end: '14:30' },
      purpose: 'warranty',
      status: 'confirmed',
      store: { name: 'Store B', address: { fullAddress: '456 Avenue' }, phone: '0987654321' },
    });
    appointmentStore.push(apt1, apt2);

    classifyIntentAndRespond.mockResolvedValue({
      intent: 'appointment',
    });

    const result = await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'Lịch hẹn của tôi là gì?',
    });

    expect(result.responseType).toBe('appointment');
    expect(result.appointmentData).toHaveLength(2);
    expect(result.fullResponse).toContain('2 lịch hẹn');
  });

  it('handles user with no appointments', async () => {
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'appointment',
    });

    const result = await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'Tôi có lịch hẹn nào không?',
    });

    expect(result.responseType).toBe('appointment');
    expect(result.appointmentData).toHaveLength(0);
    expect(result.fullResponse).toContain('chưa có lịch hẹn');
  });

  it('prioritizes upcoming appointments (pending/confirmed)', async () => {
    const apt = createMockAppointment({
      user: USER_A,
      date: new Date('2099-12-25'),
      status: 'pending',
      store: { name: 'Store A', address: { fullAddress: '123 Street' }, phone: '0123456789' },
    });
    appointmentStore.push(apt);

    classifyIntentAndRespond.mockResolvedValue({
      intent: 'appointment',
    });

    const result = await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'Tôi có lịch hẹn nào không?',
    });

    expect(result.appointmentData).toHaveLength(1);
    expect(result.appointmentData[0].status).toBe('Chờ xác nhận');
  });

  it('does not show cancelled appointments as upcoming', async () => {
    const apt = createMockAppointment({
      user: USER_A,
      date: new Date('2099-12-25'),
      status: 'cancelled',
      store: { name: 'Store A', address: { fullAddress: '123 Street' }, phone: '0123456789' },
    });
    appointmentStore.push(apt);

    classifyIntentAndRespond.mockResolvedValue({
      intent: 'appointment',
    });

    const result = await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'Tôi có lịch hẹn nào không?',
    });

    expect(result.appointmentData).toHaveLength(0);
    expect(result.fullResponse).toContain('chưa có lịch hẹn');
  });

  it('does not show completed appointments as upcoming', async () => {
    const apt = createMockAppointment({
      user: USER_A,
      date: new Date('2099-12-25'),
      status: 'completed',
      store: { name: 'Store A', address: { fullAddress: '123 Street' }, phone: '0123456789' },
    });
    appointmentStore.push(apt);

    classifyIntentAndRespond.mockResolvedValue({
      intent: 'appointment',
    });

    const result = await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'Tôi có lịch hẹn nào không?',
    });

    expect(result.appointmentData).toHaveLength(0);
    expect(result.fullResponse).toContain('chưa có lịch hẹn');
  });

  it('shows store name and address in appointment data', async () => {
    const apt = createMockAppointment({
      user: USER_A,
      date: new Date('2099-12-25'),
      status: 'confirmed',
      store: { name: 'Điện Thoại Giá Kho', address: { fullAddress: '123 Lê Lợi, Quận 1' }, phone: '0123456789' },
    });
    appointmentStore.push(apt);

    classifyIntentAndRespond.mockResolvedValue({
      intent: 'appointment',
    });

    const result = await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'Lịch hẹn của tôi ở cửa hàng nào?',
    });

    expect(result.appointmentData[0].storeName).toBe('Điện Thoại Giá Kho');
    expect(result.appointmentData[0].storeAddress).toContain('123 Lê Lợi');
  });

  it('shows purpose in Vietnamese', async () => {
    const apt = createMockAppointment({
      user: USER_A,
      date: new Date('2099-12-25'),
      status: 'confirmed',
      purpose: 'warranty',
      store: { name: 'Store A', address: { fullAddress: '123 Street' }, phone: '0123456789' },
    });
    appointmentStore.push(apt);

    classifyIntentAndRespond.mockResolvedValue({
      intent: 'appointment',
    });

    const result = await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'Lịch hẹn đó lúc mấy giờ?',
    });

    expect(result.appointmentData[0].purpose).toBe('Bảo hành');
  });
});

/* ================================================================== */
/*  MULTI-TURN APPOINTMENT CONTEXT                                     */
/* ================================================================== */
describe('Multi-turn appointment context', () => {
  it('appointment context is available in product_query turns after appointment turn', async () => {
    const apt = createMockAppointment({
      user: USER_A,
      date: new Date('2099-12-25'),
      status: 'pending',
      store: { name: 'Store A', address: { fullAddress: '123 Street' }, phone: '0123456789' },
    });
    appointmentStore.push(apt);

    // Turn 1: appointment intent
    classifyIntentAndRespond.mockResolvedValue({ intent: 'appointment' });
    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'Tôi có lịch hẹn nào không?',
    });

    // Turn 2: product query — appointment context should still be available
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'Samsung',
    });
    setupProductQuery();
    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'tìm Samsung',
    });

    // The appointment context should have been passed to generateChatResponse
    expect(capturedAppointmentContext.value).toBeDefined();
    expect(capturedAppointmentContext.value.length).toBeGreaterThan(0);
    expect(capturedAppointmentContext.value[0].storeName).toBe('Store A');
  });

  it('appointment context is threaded through to LLM for ambiguous follow-ups', async () => {
    const apt = createMockAppointment({
      user: USER_A,
      date: new Date('2099-12-25'),
      status: 'pending',
      store: { name: 'Store A', address: { fullAddress: '123 Street' }, phone: '0123456789' },
    });
    appointmentStore.push(apt);

    // First turn: appointment intent
    classifyIntentAndRespond.mockResolvedValue({ intent: 'appointment' });
    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'Tôi có lịch hẹn nào không?',
    });

    // Second turn: product query with ambiguous reference
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'lịch hẹn đó ở đâu',
    });
    setupProductQuery();
    await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'Lịch hẹn đó ở đâu?',
    });

    // appointment context should be passed for the LLM to reason about
    expect(capturedAppointmentContext.value).toBeDefined();
    expect(capturedAppointmentContext.value.length).toBeGreaterThan(0);
  });
});

/* ================================================================== */
/*  SECURITY — CROSS-USER ISOLATION                                    */
/* ================================================================== */
describe('Cross-user appointment isolation', () => {
  it('User1 cannot see User2 appointments', async () => {
    const aptA = createMockAppointment({
      user: USER_A,
      date: new Date('2099-12-25'),
      status: 'pending',
      store: { name: 'Store A', address: { fullAddress: '123 Street' }, phone: '0123456789' },
    });
    const aptB = createMockAppointment({
      user: USER_B,
      date: new Date('2099-12-26'),
      status: 'pending',
      store: { name: 'Store B', address: { fullAddress: '456 Avenue' }, phone: '0987654321' },
    });
    appointmentStore.push(aptA, aptB);

    // User A queries appointments
    classifyIntentAndRespond.mockResolvedValue({ intent: 'appointment' });
    const resultA = await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'Tôi có lịch hẹn nào không?',
    });

    // User A should only see their own appointment
    expect(resultA.appointmentData).toHaveLength(1);
    expect(resultA.fullResponse).toContain('1 lịch hẹn');

    // User B queries appointments
    const resultB = await ChatController.processMessage(makeSocket(USER_B), {
      sessionId: SESSION_Y,
      message: 'Tôi có lịch hẹn nào không?',
    });

    // User B should only see their own appointment
    expect(resultB.appointmentData).toHaveLength(1);
    expect(resultB.fullResponse).toContain('1 lịch hẹn');
  });

  it('forged userId in payload is ignored — socket.data.user.id is trusted', async () => {
    const aptA = createMockAppointment({
      user: USER_A,
      date: new Date('2099-12-25'),
      status: 'pending',
      store: { name: 'Store A', address: { fullAddress: '123 Street' }, phone: '0123456789' },
    });
    appointmentStore.push(aptA);

    classifyIntentAndRespond.mockResolvedValue({ intent: 'appointment' });

    // Socket is authenticated as USER_B, but payload tries to forge USER_A
    const socket = makeSocket(USER_B);
    const result = await ChatController.processMessage(socket, {
      sessionId: SESSION_X,
      message: 'Tôi có lịch hẹn nào không?',
      userId: USER_A, // forged — must be ignored
    });

    // Should see User_B's appointments (which is empty), not User_A's
    expect(result.appointmentData).toHaveLength(0);
    expect(result.fullResponse).toContain('chưa có lịch hẹn');
  });

  it('logout and login as another user does not inherit previous context', async () => {
    const aptA = createMockAppointment({
      user: USER_A,
      date: new Date('2099-12-25'),
      status: 'pending',
      store: { name: 'Store A', address: { fullAddress: '123 Street' }, phone: '0123456789' },
    });
    appointmentStore.push(aptA);

    // User A queries
    classifyIntentAndRespond.mockResolvedValue({ intent: 'appointment' });
    const resultA = await ChatController.processMessage(makeSocket(USER_A), {
      sessionId: SESSION_X,
      message: 'Tôi có lịch hẹn nào không?',
    });
    expect(resultA.appointmentData).toHaveLength(1);

    // Simulate "logout" — new session for User B
    classifyIntentAndRespond.mockResolvedValue({ intent: 'appointment' });
    const resultB = await ChatController.processMessage(makeSocket(USER_B), {
      sessionId: SESSION_Y, // different session
      message: 'Tôi có lịch hẹn nào không?',
    });

    // User B sees no appointments
    expect(resultB.appointmentData).toHaveLength(0);
    expect(resultB.fullResponse).toContain('chưa có lịch hẹn');

    // User A's context is not leaked to User B
    const userBCaptured = capturedAppointmentContext.value;
    if (userBCaptured && userBCaptured.length > 0) {
      expect(userBCaptured.every((a) => a.storeName !== 'Store A')).toBe(true);
    }
  });

  it('stale Redis/session appointment context cannot leak across users', async () => {
    // Simulate: User A's context is saved in Redis
    const keyA = `chat:context:user:${USER_A}:${SESSION_X}`;
    global.__ctxCache[keyA] = { lastAppointmentId: 'apt-stale', turnCount: 1 };

    // User B connects with same sessionId
    const keyB = `chat:context:user:${USER_B}:${SESSION_X}`;
    expect(global.__ctxCache[keyB]).toBeUndefined();

    // User B's context is independent
    const aptB = createMockAppointment({
      user: USER_B,
      date: new Date('2099-12-26'),
      status: 'confirmed',
      store: { name: 'Store B', address: { fullAddress: '456 Avenue' }, phone: '0987654321' },
    });
    appointmentStore.push(aptB);

    classifyIntentAndRespond.mockResolvedValue({ intent: 'appointment' });
    const result = await ChatController.processMessage(makeSocket(USER_B), {
      sessionId: SESSION_X,
      message: 'Tôi có lịch hẹn nào không?',
    });

    expect(result.appointmentData).toHaveLength(1);
    expect(result.appointmentData[0].storeName).toBe('Store B');
    // User B's context is saved with lastAppointmentResults, not User A's stale data
    expect(global.__ctxCache[keyB]).toBeDefined();
    expect(global.__ctxCache[keyB].lastAppointmentResults).toBeDefined();
    expect(global.__ctxCache[keyB].lastAppointmentResults[0].storeName).toBe('Store B');
    expect(global.__ctxCache[keyB].lastAppointmentId).toBeUndefined();
  });

  it('unauthenticated user receives graceful response and no private data', async () => {
    const socket = {
      handshake: { headers: { 'user-agent': 'test' }, address: '127.0.0.1' },
      data: {},
      emit: jest.fn(),
    };

    await expect(
      ChatController.processMessage(socket, {
        sessionId: SESSION_X,
        message: 'Tôi có lịch hẹn nào không?',
      })
    ).rejects.toThrow('Missing authenticated user');

    // No appointment data should be queried or emitted
    expect(socket.emit).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  APPOINTMENT PRE-CLASSIFIER                                         */
/* ================================================================== */
describe('Appointment pre-classifier', () => {
  const { preclassifyAppointment } = jest.requireActual('../utils/gemini');

  it('detects "Tôi có lịch hẹn nào không?"', () => {
    const result = preclassifyAppointment('Tôi có lịch hẹn nào không?');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('appointment');
  });

  it('detects "Lịch hẹn của tôi là gì?"', () => {
    const result = preclassifyAppointment('Lịch hẹn của tôi là gì?');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('appointment');
  });

  it('detects "Lịch hẹn gần nhất của tôi?"', () => {
    const result = preclassifyAppointment('Lịch hẹn gần nhất của tôi?');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('appointment');
  });

  it('detects "Hôm nay tôi có lịch hẹn không?"', () => {
    const result = preclassifyAppointment('Hôm nay tôi có lịch hẹn không?');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('appointment');
  });

  it('detects "Lịch hẹn của tôi ở cửa hàng nào?"', () => {
    const result = preclassifyAppointment('Lịch hẹn của tôi ở cửa hàng nào?');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('appointment');
  });

  it('detects "Lịch hẹn đó lúc mấy giờ?"', () => {
    const result = preclassifyAppointment('Lịch hẹn đó lúc mấy giờ?');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('appointment');
  });

  it('detects "Tôi có lịch hẹn nào sắp tới không?"', () => {
    const result = preclassifyAppointment('Tôi có lịch hẹn nào sắp tới không?');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('appointment');
  });

  it('does not match non-appointment queries', () => {
    expect(preclassifyAppointment('tìm Samsung')).toBeNull();
    expect(preclassifyAppointment('giá bao nhiêu')).toBeNull();
    expect(preclassifyAppointment('bạn là ai')).toBeNull();
  });

  it('returns null for empty/null input', () => {
    expect(preclassifyAppointment('')).toBeNull();
    expect(preclassifyAppointment(null)).toBeNull();
    expect(preclassifyAppointment(undefined)).toBeNull();
  });
});

/* ================================================================== */
/*  REDIS CONTEXT ISOLATION                                            */
/* ================================================================== */
describe('Redis context isolation for appointments', () => {
  it('builds per-user context keys for appointments', () => {
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
      message: 'tìm Samsung',
    });
    await ChatController.processMessage(makeSocket(USER_B), {
      sessionId: SESSION_X,
      message: 'tìm iPhone',
    });

    const keys = Object.keys(global.__ctxCache);
    const aKey = keys.find((k) => k.includes(USER_A));
    const bKey = keys.find((k) => k.includes(USER_B));
    expect(aKey).toBeDefined();
    expect(bKey).toBeDefined();
    expect(aKey).not.toBe(bKey);
  });
});
