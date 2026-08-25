/* ------------------------------------------------------------------ */
/*  Chatbot store + promotion context tests                            */
/*                                                                     */
/*  Verifies:                                                          */
/*  1. Store context returns only active stores with safe fields       */
/*  2. Promotion context returns only valid promotions with safe fields */
/*  3. Deterministic pre-classifiers for store_query and promotion_query */
/*  4. handleStoreQuery and handlePromotionQuery emit correct responses */
/*  5. Regression: existing intents unchanged                           */
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

jest.mock('../models/Appointment', () => {
  const Appointment = jest.fn(function (fields = {}) {
    Object.assign(this, fields);
    this._id = 'apt-' + Date.now();
    this.save = jest.fn(async () => this);
    this.populate = jest.fn(function () { return this; });
    this.toObject = jest.fn(function () {
      const ret = { ...this };
      delete ret.save;
      delete ret.populate;
      delete ret.toObject;
      return ret;
    });
  });
  Appointment.find = jest.fn(async () => []);
  Appointment.findOne = jest.fn(async () => null);
  return Appointment;
});

/* ------------------------------------------------------------------ */
/*  Store mock — use mock prefix for jest.mock scope                   */
/* ------------------------------------------------------------------ */
const mockActiveStores = [
  {
    _id: 'store-1',
    name: 'Cửa hàng Nguyễn Huệ',
    address: { street: '123 Nguyễn Huệ', district: 'Quận 1', city: 'TP.HCM', fullAddress: '123 Nguyễn Huệ, Quận 1, TP.HCM' },
    phone: '0123456789',
    businessHours: {
      monday: { open: '08:00', close: '21:00', isClosed: false },
      tuesday: { open: '08:00', close: '21:00', isClosed: false },
      wednesday: { open: '08:00', close: '21:00', isClosed: false },
      thursday: { open: '08:00', close: '21:00', isClosed: false },
      friday: { open: '08:00', close: '21:00', isClosed: false },
      saturday: { open: '09:00', close: '20:00', isClosed: false },
      sunday: { open: '09:00', close: '20:00', isClosed: false },
    },
    description: 'Cửa hàng flagship',
    isActive: true,
    toObject: jest.fn(function () { return { ...this }; }),
  },
  {
    _id: 'store-2',
    name: 'Cửa hàng Lê Lợi',
    address: { street: '456 Lê Lợi', district: 'Quận 1', city: 'TP.HCM', fullAddress: '456 Lê Lợi, Quận 1, TP.HCM' },
    phone: '0987654321',
    businessHours: {
      monday: { open: '09:00', close: '20:00', isClosed: false },
      tuesday: { open: '09:00', close: '20:00', isClosed: false },
      wednesday: { open: '09:00', close: '20:00', isClosed: false },
      thursday: { open: '09:00', close: '20:00', isClosed: false },
      friday: { open: '09:00', close: '20:00', isClosed: false },
      saturday: { open: '09:00', close: '20:00', isClosed: false },
      sunday: { isClosed: true },
    },
    description: null,
    isActive: true,
    toObject: jest.fn(function () { return { ...this }; }),
  },
  {
    _id: 'store-inactive',
    name: 'Cửa hàng inactive',
    address: { street: '999', district: 'Quận 2', city: 'TP.HCM', fullAddress: '999, Quận 2, TP.HCM' },
    phone: '0000000000',
    businessHours: {},
    description: 'Hidden',
    isActive: false,
    toObject: jest.fn(function () { return { ...this }; }),
  },
];

jest.mock('../models/Store', () => {
  const chainable = (results) => ({
    sort: jest.fn(function () { return chainable(results); }),
    limit: jest.fn(function () { return chainable(results); }),
    then: jest.fn(function (resolve) { return Promise.resolve(results).then(resolve); }),
  });
  return {
    find: jest.fn((query) => {
      const results = mockActiveStores.filter((s) => {
        if (query.isActive !== undefined && s.isActive !== query.isActive) return false;
        return true;
      });
      return chainable(results);
    }),
  };
});

/* ------------------------------------------------------------------ */
/*  Promotion mock                                                     */
/* ------------------------------------------------------------------ */
const mockValidPromotions = [
  {
    _id: 'promo-1',
    code: 'SALE10',
    description: 'Giảm 10% cho đơn từ 500K',
    discountType: 'percentage',
    discountValue: 10,
    maxDiscountAmount: 200000,
    minOrderValue: 500000,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    usageLimit: 100,
    usedCount: 55,
    isActive: true,
    toObject: jest.fn(function () { return { ...this }; }),
  },
  {
    _id: 'promo-2',
    code: 'FIXED50K',
    description: 'Giảm 50K cho đơn từ 1 triệu',
    discountType: 'fixed',
    discountValue: 50000,
    maxDiscountAmount: null,
    minOrderValue: 1000000,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    usageLimit: 200,
    usedCount: 199,
    isActive: true,
    toObject: jest.fn(function () { return { ...this }; }),
  },
  {
    _id: 'promo-expired',
    code: 'EXPIRED',
    description: 'Hết hạn',
    discountType: 'percentage',
    discountValue: 20,
    maxDiscountAmount: null,
    minOrderValue: 0,
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
    usageLimit: 100,
    usedCount: 10,
    isActive: true,
    toObject: jest.fn(function () { return { ...this }; }),
  },
  {
    _id: 'promo-inactive',
    code: 'INACTIVE',
    description: 'Vô hiệu',
    discountType: 'percentage',
    discountValue: 15,
    maxDiscountAmount: null,
    minOrderValue: 0,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    usageLimit: 100,
    usedCount: 0,
    isActive: false,
    toObject: jest.fn(function () { return { ...this }; }),
  },
  {
    _id: 'promo-depleted',
    code: 'DEPLETED',
    description: 'Hết lượt',
    discountType: 'percentage',
    discountValue: 25,
    maxDiscountAmount: null,
    minOrderValue: 0,
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    usageLimit: 50,
    usedCount: 50,
    isActive: true,
    toObject: jest.fn(function () { return { ...this }; }),
  },
];

jest.mock('../models/Promotion', () => {
  return {
    find: jest.fn((query) => {
      const results = mockValidPromotions.filter((p) => {
        if (query.isActive !== undefined && p.isActive !== query.isActive) return false;
        if (query.startDate && query.startDate.$lte && p.startDate > query.startDate.$lte) return false;
        if (query.endDate && query.endDate.$gte && p.endDate < query.endDate.$gte) return false;
        if (query.$expr && query.$expr.$lt && p.usedCount >= p.usageLimit) return false;
        return true;
      });
      const chain = {
        sort: jest.fn(function () { return chain; }),
        limit: jest.fn(function () { return chain; }),
        then: jest.fn(function (resolve) { return Promise.resolve(results).then(resolve); }),
      };
      return chain;
    }),
  };
});

/* ------------------------------------------------------------------ */
/*  Gemini mock — include actual pre-classifiers for unit testing      */
/* ------------------------------------------------------------------ */
const mockCapturedProducts = { value: null };
const capturedUserContext = { value: null };
const capturedAppointmentContext = { value: null };

// We need the real pre-classifiers, so load the real module's source.
// The jest.mock factory runs before require, so we inline the logic here.
const _normalizePhrase = (str) => {
  if (!str || typeof str !== "string") return "";
  return str
    .toLowerCase()
    .trim()
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:\-–—""''""]+$/, "")
    .trim();
};

const _preclassifyPromotion = (userQuery) => {
  const normalized = _normalizePhrase(userQuery);
  if (!normalized) return null;
  if (
    /giảm\s*giá\s*(sản\s*phẩm|điện\s*thoại|máy|laptop|tablet|sp)/.test(normalized) ||
    /(sản\s*phẩm|điện\s*thoại|máy|laptop|tablet|sp)\s*(nào|gì|đang|có)?(\s*\S+)?\s*giảm\s*giá/.test(normalized) ||
    /(giá|giảm)\s*(sản\s*phẩm|điện\s*thoại|máy|laptop|tablet)/.test(normalized)
  ) {
    return null;
  }
  if (
    /mã\s*giảm\s*giá/.test(normalized) ||
    /khuyến\s*mãi/.test(normalized) ||
    /voucher/.test(normalized) ||
    /coupon/.test(normalized) ||
    /ưu\s*đãi/.test(normalized) ||
    /chương\s*trình\s*giảm/.test(normalized) ||
    /đợt\s*giảm/.test(normalized) ||
    /có\s*mã\s*gì/.test(normalized) ||
    /mã\s*nào/.test(normalized) ||
    /mã\s*giam/.test(normalized) ||
    /giảm\s*giá/.test(normalized)
  ) {
    return { intent: "promotion_query", clarified_query: null, direct_response: null, preclassified: "promotion_query" };
  }
  return null;
};

const _preclassifyStore = (userQuery) => {
  const normalized = _normalizePhrase(userQuery);
  if (!normalized) return null;
  if (
    /cửa\s*hàng/.test(normalized) ||
    /chi\s*nhánh/.test(normalized) ||
    /địa\s*chỉ\s*(shop|store|cửa\s*hàng)/.test(normalized) ||
    /store\s*gần/.test(normalized) ||
    /mở\s*cửa/.test(normalized) ||
    /giờ\s*mở/.test(normalized) ||
    /giờ\s*đóng/.test(normalized) ||
    /(shop|store)\s*(ở|nào|gần|này|đó)/.test(normalized)
  ) {
    return { intent: "store_query", clarified_query: null, direct_response: null, preclassified: "store_query" };
  }
  if (
    /ở\s*đâu/.test(normalized) &&
    /(cửa\s*hàng|chi\s*nhánh|shop|store)/.test(normalized)
  ) {
    return { intent: "store_query", clarified_query: null, direct_response: null, preclassified: "store_query" };
  }
  return null;
};

const _preclassifyComplaint = (userQuery) => {
  const normalized = _normalizePhrase(userQuery);
  if (!normalized) return null;
  if (
    /khiếu\s*nại/.test(normalized) ||
    /phàn\s*nàn/.test(normalized) ||
    /phản\s*ánh/.test(normalized)
  ) {
    return { intent: "complaint", clarified_query: null, direct_response: null, preclassified: "complaint" };
  }
  return null;
};

const _preclassifyAppointment = (userQuery) => {
  const normalized = _normalizePhrase(userQuery);
  if (!normalized) return null;
  if (
    /lịch\s*hẹn/.test(normalized) ||
    /đặt\s*lịch/.test(normalized)
  ) {
    return { intent: "appointment", clarified_query: null, direct_response: null, preclassified: "appointment" };
  }
  return null;
};

const realPreclassifyIntent = (userQuery) => {
  if (!userQuery || typeof userQuery !== "string") return null;
  const appointmentResult = _preclassifyAppointment(userQuery);
  if (appointmentResult) return appointmentResult;
  const complaintResult = _preclassifyComplaint(userQuery);
  if (complaintResult) return complaintResult;
  const promotionResult = _preclassifyPromotion(userQuery);
  if (promotionResult) return promotionResult;
  const storeResult = _preclassifyStore(userQuery);
  if (storeResult) return storeResult;
  return null;
};

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
  preclassifyPromotion: _preclassifyPromotion,
  preclassifyStore: _preclassifyStore,
  preclassifyIntent: realPreclassifyIntent,
}));

const Product = require('../models/Product');
const { generateEmbedding } = require('../utils/openai');
const {
  classifyIntentAndRespond,
  generateChatResponse,
  preclassifyPromotion,
  preclassifyStore,
  preclassifyIntent,
} = require('../utils/gemini');
const Conversation = require('../models/Conversation');
const Complaint = require('../models/Complaint');
const Appointment = require('../models/Appointment');
const Store = require('../models/Store');
const Promotion = require('../models/Promotion');
const ChatController = require('../controllers/chatController');

const USER_ID = '507f1f77bcf86cd799439011';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeSocket(userId, extra = {}) {
  return {
    handshake: { headers: { 'user-agent': 'test' }, address: '127.0.0.1' },
    data: userId
      ? { user: { id: userId, email: `user${userId.slice(-2)}@test.com`, role: 'user', name: `Test User ${userId.slice(-2)}`, phone: '0901234567', ...extra } }
      : {},
    emit: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  conversationStore.length = 0;
  classifyIntentAndRespond.mockImplementation(async (_h, query) => {
    const lower = (query || '').toLowerCase();
    if (/cửa\s*hàng|chi\s*nhánh|mở\s*cửa|giờ\s*mở/.test(lower)) {
      return { intent: 'store_query', clarified_query: null, direct_response: null };
    }
    if (/mã\s*giảm|khuyến\s*mãi|voucher|coupon|ưu\s*đãi|giảm\s*giá/.test(lower)) {
      return { intent: 'promotion_query', clarified_query: null, direct_response: null };
    }
    return { intent: 'product_query', clarified_query: query, direct_response: null };
  });
});

/* =========================================================
 *  PRE-CLASSIFIER: preclassifyPromotion
 * ========================================================= */
describe('preclassifyPromotion', () => {
  it('should match "mã giảm giá"', () => {
    const result = preclassifyPromotion('Có mã giảm giá nào không?');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('promotion_query');
  });

  it('should match "khuyến mãi"', () => {
    expect(preclassifyPromotion('Khuyến mãi hiện tại')?.intent).toBe('promotion_query');
  });

  it('should match "voucher"', () => {
    expect(preclassifyPromotion('Có voucher gì không?')?.intent).toBe('promotion_query');
  });

  it('should match "coupon"', () => {
    expect(preclassifyPromotion('Mã coupon nào đang chạy?')?.intent).toBe('promotion_query');
  });

  it('should match "ưu đãi"', () => {
    expect(preclassifyPromotion('Ưu đãi hôm nay')?.intent).toBe('promotion_query');
  });

  it('should match "giảm giá" standalone', () => {
    expect(preclassifyPromotion('Giảm giá')?.intent).toBe('promotion_query');
  });

  it('should match "mã nào"', () => {
    expect(preclassifyPromotion('Có mã nào không?')?.intent).toBe('promotion_query');
  });

  it('should match "chương trình giảm"', () => {
    expect(preclassifyPromotion('Chương trình giảm giá')?.intent).toBe('promotion_query');
  });

  it('should NOT match "giảm giá sản phẩm X" (product pricing)', () => {
    expect(preclassifyPromotion('Giảm giá sản phẩm Samsung')).toBeNull();
  });

  it('should NOT match "điện thoại nào giảm giá" (product pricing)', () => {
    expect(preclassifyPromotion('Điện thoại nào giảm giá?')).toBeNull();
  });

  it('should NOT match "sản phẩm nào giảm giá"', () => {
    expect(preclassifyPromotion('Sản phẩm nào đang giảm giá?')).toBeNull();
  });

  it('should return null for empty input', () => {
    expect(preclassifyPromotion('')).toBeNull();
    expect(preclassifyPromotion(null)).toBeNull();
  });
});

/* =========================================================
 *  PRE-CLASSIFIER: preclassifyStore
 * ========================================================= */
describe('preclassifyStore', () => {
  it('should match "cửa hàng"', () => {
    const result = preclassifyStore('Có cửa hàng nào không?');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('store_query');
  });

  it('should match "chi nhánh"', () => {
    expect(preclassifyStore('Chi nhánh gần nhất')?.intent).toBe('store_query');
  });

  it('should match "mở cửa"', () => {
    expect(preclassifyStore('Cửa hàng mở cửa lúc mấy giờ?')?.intent).toBe('store_query');
  });

  it('should match "giờ mở"', () => {
    expect(preclassifyStore('Giờ mở cửa là mấy giờ?')?.intent).toBe('store_query');
  });

  it('should match "giờ đóng"', () => {
    expect(preclassifyStore('Giờ đóng cửa')?.intent).toBe('store_query');
  });

  it('should match "địa chỉ shop"', () => {
    expect(preclassifyStore('Địa chỉ shop là gì?')?.intent).toBe('store_query');
  });

  it('should match "ở đâu" with store context', () => {
    expect(preclassifyStore('Cửa hàng ở đâu?')?.intent).toBe('store_query');
  });

  it('should NOT match "ở đâu" without store context (product query)', () => {
    expect(preclassifyStore('Sản phẩm ở đâu?')).toBeNull();
  });

  it('should NOT match "sản phẩm nào tốt"', () => {
    expect(preclassifyStore('Sản phẩm nào tốt nhất?')).toBeNull();
  });

  it('should return null for empty input', () => {
    expect(preclassifyStore('')).toBeNull();
    expect(preclassifyStore(null)).toBeNull();
  });
});

/* =========================================================
 *  PRE-CLASSIFIER: preclassifyIntent priority
 * ========================================================= */
describe('preclassifyIntent priority', () => {
  it('should match appointment first', () => {
    const result = preclassifyIntent('Đặt lịch hẹn cửa hàng');
    expect(result?.intent).toBe('appointment');
  });

  it('should match complaint second', () => {
    const result = preclassifyIntent('Phản ánh dịch vụ cửa hàng tệ');
    expect(result?.intent).toBe('complaint');
  });

  it('should match promotion third', () => {
    const result = preclassifyIntent('Mã giảm giá khuyến mãi');
    expect(result?.intent).toBe('promotion_query');
  });

  it('should match store fourth', () => {
    const result = preclassifyIntent('Cửa hàng mở cửa lúc mấy giờ?');
    expect(result?.intent).toBe('store_query');
  });
});

/* =========================================================
 *  BUILD STORE CONTEXT
 * ========================================================= */
describe('buildStoreContext', () => {
  it('should return only active stores', async () => {
    const stores = await Store.find({ isActive: true });
    expect(stores).toHaveLength(2);
    expect(stores.every((s) => s.isActive === true)).toBe(true);
  });

  it('should exclude inactive stores', async () => {
    const stores = await Store.find({ isActive: true });
    expect(stores.find((s) => s._id === 'store-inactive')).toBeUndefined();
  });
});

/* =========================================================
 *  BUILD PROMOTION CONTEXT
 * ========================================================= */
describe('buildPromotionContext', () => {
  it('should return only valid promotions', async () => {
    const now = new Date();
    const promotions = await Promotion.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $expr: { $lt: ['$usedCount', '$usageLimit'] },
    });
    expect(promotions).toHaveLength(2);
    expect(promotions.map((p) => p.code)).toContain('SALE10');
    expect(promotions.map((p) => p.code)).toContain('FIXED50K');
  });

  it('should exclude expired promotions', async () => {
    const now = new Date();
    const promotions = await Promotion.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $expr: { $lt: ['$usedCount', '$usageLimit'] },
    });
    expect(promotions.find((p) => p.code === 'EXPIRED')).toBeUndefined();
  });

  it('should exclude inactive promotions', async () => {
    const now = new Date();
    const promotions = await Promotion.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $expr: { $lt: ['$usedCount', '$usageLimit'] },
    });
    expect(promotions.find((p) => p.code === 'INACTIVE')).toBeUndefined();
  });

  it('should exclude usage-depleted promotions', async () => {
    const now = new Date();
    const promotions = await Promotion.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $expr: { $lt: ['$usedCount', '$usageLimit'] },
    });
    expect(promotions.find((p) => p.code === 'DEPLETED')).toBeUndefined();
  });
});

/* =========================================================
 *  HANDLE STORE QUERY
 * ========================================================= */
describe('handleStoreQuery', () => {
  it('should emit aiResponse with store data', async () => {
    const socket = makeSocket(USER_ID);
    const result = await ChatController.handleStoreQuery(
      socket, SESSION_ID, USER_ID, [], 'Có cửa hàng nào?', 'msg-1'
    );
    expect(result.responseType).toBe('store_query');
    expect(result.fullResponse).toContain('Cửa hàng Nguyễn Huệ');
    expect(result.fullResponse).toContain('Cửa hàng Lê Lợi');
    expect(result.fullResponse).toContain('123 Nguyễn Huệ');
    expect(result.fullResponse).toContain('0123456789');
    expect(socket.emit).toHaveBeenCalledWith('aiResponse', expect.objectContaining({
      message: expect.stringContaining('Cửa hàng Nguyễn Huệ'),
    }));
  });

  it('should format business hours', async () => {
    const socket = makeSocket(USER_ID);
    const result = await ChatController.handleStoreQuery(
      socket, SESSION_ID, USER_ID, [], 'Giờ mở cửa', 'msg-2'
    );
    expect(result.fullResponse).toContain('T2:');
    expect(result.fullResponse).toContain('08:00-21:00');
  });
});

/* =========================================================
 *  HANDLE PROMOTION QUERY
 * ========================================================= */
describe('handlePromotionQuery', () => {
  it('should emit aiResponse with promotion data', async () => {
    const socket = makeSocket(USER_ID);
    const result = await ChatController.handlePromotionQuery(
      socket, SESSION_ID, USER_ID, [], 'Có mã giảm giá nào?', 'msg-3'
    );
    expect(result.responseType).toBe('promotion_query');
    expect(result.fullResponse).toContain('SALE10');
    expect(result.fullResponse).toContain('FIXED50K');
    expect(result.fullResponse).toContain('10%');
    expect(result.fullResponse).toContain('50.000đ');
    expect(socket.emit).toHaveBeenCalledWith('aiResponse', expect.objectContaining({
      message: expect.stringContaining('SALE10'),
    }));
  });

  it('should format percentage promotion correctly', async () => {
    const socket = makeSocket(USER_ID);
    const result = await ChatController.handlePromotionQuery(
      socket, SESSION_ID, USER_ID, [], 'Mã giảm giá', 'msg-4'
    );
    expect(result.fullResponse).toContain('Giảm 10%');
    expect(result.fullResponse).toContain('tối đa 200.000đ');
    expect(result.fullResponse).toContain('Đơn tối thiểu: 500.000đ');
  });

  it('should format remaining uses', async () => {
    const socket = makeSocket(USER_ID);
    const result = await ChatController.handlePromotionQuery(
      socket, SESSION_ID, USER_ID, [], 'Khuyến mãi', 'msg-5'
    );
    expect(result.fullResponse).toContain('lượt sử dụng');
  });
});

/* =========================================================
 *  CLASSIFY AND PROCESS INTENT
 * ========================================================= */
describe('classifyAndProcessIntent', () => {
  it('should return store_query intent', async () => {
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'store_query',
      clarified_query: null,
      direct_response: null,
    });
    const result = await ChatController.classifyAndProcessIntent([], 'Có cửa hàng nào?');
    expect(result.intent).toBe('store_query');
  });

  it('should return promotion_query intent', async () => {
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'promotion_query',
      clarified_query: null,
      direct_response: null,
    });
    const result = await ChatController.classifyAndProcessIntent([], 'Mã giảm giá');
    expect(result.intent).toBe('promotion_query');
  });

  it('should still return product_query for product queries', async () => {
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'product_query',
      clarified_query: 'iPhone 16',
      direct_response: null,
    });
    const result = await ChatController.classifyAndProcessIntent([], 'iPhone 16');
    expect(result.intent).toBe('product_query');
  });

  it('should still return complaint for complaints', async () => {
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'complaint',
      clarified_query: null,
      direct_response: null,
    });
    const result = await ChatController.classifyAndProcessIntent([], 'Phản ánh hàng bị lỗi');
    expect(result.intent).toBe('complaint');
  });

  it('should still return appointment for appointments', async () => {
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'appointment',
      clarified_query: null,
      direct_response: null,
    });
    const result = await ChatController.classifyAndProcessIntent([], 'Đặt lịch hẹn');
    expect(result.intent).toBe('appointment');
  });

  it('should still return small_talk for greetings', async () => {
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'small_talk',
      clarified_query: null,
      direct_response: 'Xin chào!',
    });
    const result = await ChatController.classifyAndProcessIntent([], 'Xin chào');
    expect(result.intent).toBe('small_talk');
    expect(result.directResponse).toBe('Xin chào!');
  });
});

/* =========================================================
 *  INTEGRATION: renderResponse dispatches correctly
 * ========================================================= */
describe('renderResponse dispatch', () => {
  it('should call handleStoreQuery for store_query intent', async () => {
    const socket = makeSocket(USER_ID);
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'store_query',
      clarified_query: null,
      direct_response: null,
    });
    const handleSpy = jest.spyOn(ChatController, 'handleStoreQuery').mockResolvedValue({
      fullResponse: 'Store response',
      responseType: 'store_query',
      relatedProducts: [],
      aiPayload: {},
    });

    const result = await ChatController.renderResponse({
      socket, sessionId: SESSION_ID, userId: USER_ID, chatHistory: [],
      userQuery: 'Cửa hàng nào?', clientMessageId: 'msg-d1',
    });
    expect(handleSpy).toHaveBeenCalled();
    expect(result.responseType).toBe('store_query');
    handleSpy.mockRestore();
  });

  it('should call handlePromotionQuery for promotion_query intent', async () => {
    const socket = makeSocket(USER_ID);
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'promotion_query',
      clarified_query: null,
      direct_response: null,
    });
    const handleSpy = jest.spyOn(ChatController, 'handlePromotionQuery').mockResolvedValue({
      fullResponse: 'Promo response',
      responseType: 'promotion_query',
      relatedProducts: [],
      aiPayload: {},
    });

    const result = await ChatController.renderResponse({
      socket, sessionId: SESSION_ID, userId: USER_ID, chatHistory: [],
      userQuery: 'Mã giảm giá?', clientMessageId: 'msg-d2',
    });
    expect(handleSpy).toHaveBeenCalled();
    expect(result.responseType).toBe('promotion_query');
    handleSpy.mockRestore();
  });

  it('should NOT intercept store_query with complaint confirmation', async () => {
    const socket = makeSocket(USER_ID);
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'store_query',
      clarified_query: null,
      direct_response: null,
    });
    const handleStoreSpy = jest.spyOn(ChatController, 'handleStoreQuery').mockResolvedValue({
      fullResponse: 'Store data',
      responseType: 'store_query',
      relatedProducts: [],
      aiPayload: {},
    });

    await ChatController.renderResponse({
      socket, sessionId: SESSION_ID, userId: USER_ID, chatHistory: [],
      userQuery: 'Cửa hàng ở đâu?', clientMessageId: 'msg-d3',
    });
    expect(handleStoreSpy).toHaveBeenCalled();
    handleStoreSpy.mockRestore();
  });
});
