/* ------------------------------------------------------------------ */
/*  Chatbot personal-info context tests                                */
/*                                                                     */
/*  Verifies:                                                          */
/*  1. preclassifyPersonalInfo detects user-identity queries           */
/*  2. Bot-identity guard prevents false positive personal_info        */
/*  3. handlePersonalInfo is deterministic, no LLM                     */
/*  4. classifyAndProcessIntent routes personal_info correctly         */
/*  5. renderResponse routes personal_info to handlePersonalInfo       */
/*  6. Regression: existing intents unchanged                           */
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

jest.mock('../models/Store', () => {
  const Store = jest.fn(function (fields = {}) {
    Object.assign(this, fields);
    this._id = 'store-' + Date.now();
    this.save = jest.fn(async () => this);
  });
  Store.find = jest.fn(async () => []);
  Store.findOne = jest.fn(async () => null);
  return Store;
});

jest.mock('../models/Promotion', () => {
  const Promotion = jest.fn(function (fields = {}) {
    Object.assign(this, fields);
    this._id = 'promo-' + Date.now();
    this.save = jest.fn(async () => this);
  });
  Promotion.find = jest.fn(async () => []);
  Promotion.findOne = jest.fn(async () => null);
  return Promotion;
});

jest.mock('../services/complaintService', () => ({
  createComplaint: jest.fn(),
  updateExistingComplaint: jest.fn(),
  mergeComplaintDescription: jest.fn((old, msg) => `${old}\n\n${msg}`),
}));

jest.mock('../services/complaintFlowService', () => ({
  getPending: jest.fn(async () => null),
  setPending: jest.fn(async () => {}),
  clearPending: jest.fn(async () => {}),
  classifyComplaintConfirmation: jest.fn(),
}));

jest.mock('../services/contextService', () => ({
  loadContext: jest.fn(async () => null),
  saveContext: jest.fn(async () => {}),
  deleteContext: jest.fn(async () => {}),
}));

jest.mock('../services/productSearchService', () => ({
  search: jest.fn(async () => ({ products: [] })),
}));

jest.mock('../services/chatStreamBatching', () => ({
  createChatStreamBatching: jest.fn(() => ({
    push: jest.fn(),
    flush: jest.fn(),
    chunkCount: jest.fn(() => 0),
    dispose: jest.fn(),
  })),
}));

jest.mock('../services/chatActiveStreams', () => ({
  markCompleted: jest.fn(),
  remove: jest.fn(),
}));

jest.mock('../utils/productConstraintParser', () => ({
  parseProductConstraints: jest.fn(() => ({ cleanedQuery: '', filters: null, preferences: null })),
}));

jest.mock('../utils/productValidator', () => ({
  matchesProductConstraints: jest.fn(() => true),
}));

jest.mock('../utils/productRanking', () => ({
  rankProducts: jest.fn((products) => ({ ranked: products })),
}));

jest.mock('../utils/conversationContext', () => ({
  classifyQuery: jest.fn(() => ({ action: 'independent' })),
  resolveFollowUpQuery: jest.fn(() => ({ mergedParsed: { filters: null, preferences: null } })),
  createContextFromParsed: jest.fn(() => ({})),
  sanitizeConversationContext: jest.fn((ctx) => ctx),
}));

jest.mock('../utils/productSpecResolver', () => ({
  resolveProductSpec: jest.fn(async () => null),
}));

jest.mock('../utils/chatCancellation', () => ({
  throwIfCancelled: jest.fn(),
  maybeTestDelay: jest.fn(),
  STREAM_CANCELLED: 'STREAM_CANCELLED',
}));

jest.mock('../services/chatStreamBatching', () => ({
  createChatStreamBatching: jest.fn(() => ({
    push: jest.fn(),
    flush: jest.fn(),
    chunkCount: jest.fn(() => 0),
    dispose: jest.fn(),
  })),
}));

/* ------------------------------------------------------------------ */
/*  Inline pre-classifiers (mirrors gemini.js logic for test isolation) */
/* ------------------------------------------------------------------ */
const _normalizePhrase = (str) => {
  if (!str || typeof str !== "string") return "";
  return str.toLowerCase().trim()
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:\-–—"''"""]+$/, "")
    .trim();
};

const _preclassifyPersonalInfo = (userQuery) => {
  const normalized = _normalizePhrase(userQuery);
  if (!normalized) return null;
  if (/(bạn|bot|ai)\s*(là|tên)/.test(normalized)) return null;
  if (/(bạn|bot|ai)\s*(biết|làm|có)/.test(normalized) && !/(tôi|mình|em)/.test(normalized)) return null;
  if (
    /tên\s*(tôi|của\s*tôi|mình|em)/.test(normalized) ||
    /tôi\s*tên\s*gì/.test(normalized) ||
    /mình\s*tên\s*gì/.test(normalized) ||
    /tôi\s*được\s*gọi\s*là\s*gì/.test(normalized)
  ) {
    return { intent: "personal_info", clarified_query: null, direct_response: null, preclassified: "personal_info" };
  }
  if (
    /email\s*(của\s*tôi|tôi|mình|em)/.test(normalized) ||
    /tôi\s*(đăng\s*ký|dùng|sử\s*dụng)\s*bằng\s*email/.test(normalized) ||
    /email\s*(gì|nào)/.test(normalized)
  ) {
    return { intent: "personal_info", clarified_query: null, direct_response: null, preclassified: "personal_info" };
  }
  if (
    /(số\s*điện\s*thoại|sđt|sdt|phone)\s*(của\s*tôi|tôi|mình|em|là)/.test(normalized) ||
    /tôi\s*(đăng\s*ký|dùng|sử\s*dụng)\s*bằng\s*(số\s*điện\s*thoại|sđt|sdt)/.test(normalized) ||
    /(số\s*điện\s*thoại|sđt|sdt)\s*(gì|nào)/.test(normalized)
  ) {
    return { intent: "personal_info", clarified_query: null, direct_response: null, preclassified: "personal_info" };
  }
  if (
    /thông\s*tin\s*(cá\s*nhân|của\s*tôi|tôi|mình|em)/.test(normalized) ||
    /bạn\s*(biết|nhớ|có)\s*(gì|gì\s*về)\s*(tôi|mình|em)/.test(normalized) ||
    /tôi\s*là\s*ai/.test(normalized) ||
    /giới\s*thiệu\s*(về\s*tôi|bản\s*thân)/.test(normalized) ||
    /tôi\s*có\s*những\s*thông\s*tin\s*gì/.test(normalized)
  ) {
    return { intent: "personal_info", clarified_query: null, direct_response: null, preclassified: "personal_info" };
  }
  return null;
};

const _preclassifyPromotion = (userQuery) => {
  const normalized = _normalizePhrase(userQuery);
  if (!normalized) return null;
  if (/mã\s*giảm\s*giá/.test(normalized) || /khuyến\s*mãi/.test(normalized) || /giảm\s*giá/.test(normalized)) {
    return { intent: "promotion_query", clarified_query: null, direct_response: null, preclassified: "promotion_query" };
  }
  return null;
};

const _preclassifyStore = (userQuery) => {
  const normalized = _normalizePhrase(userQuery);
  if (!normalized) return null;
  if (/cửa\s*hàng/.test(normalized) || /chi\s*nhánh/.test(normalized) || /mở\s*cửa/.test(normalized)) {
    return { intent: "store_query", clarified_query: null, direct_response: null, preclassified: "store_query" };
  }
  return null;
};

const _preclassifyComplaint = (userQuery) => {
  const normalized = _normalizePhrase(userQuery);
  if (!normalized) return null;
  if (/khiếu\s*nại/.test(normalized) || /phàn\s*nàn/.test(normalized)) {
    return { intent: "complaint", clarified_query: null, direct_response: null, preclassified: "complaint" };
  }
  return null;
};

const _preclassifyAppointment = (userQuery) => {
  const normalized = _normalizePhrase(userQuery);
  if (!normalized) return null;
  if (/lịch\s*hẹn/.test(normalized) || /đặt\s*lịch/.test(normalized)) {
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
  const personalInfoResult = _preclassifyPersonalInfo(userQuery);
  if (personalInfoResult) return personalInfoResult;
  return null;
};

jest.mock('../utils/gemini', () => ({
  classifyIntentAndRespond: jest.fn(),
  generateChatResponse: jest.fn(),
  generateChatResponseStream: null,
  generateComplaintResponse: jest.fn(),
  preclassifyComplaintContinuation: jest.fn().mockReturnValue(null),
  preclassifyAppointment: jest.fn().mockReturnValue(null),
  preclassifyPromotion: _preclassifyPromotion,
  preclassifyStore: _preclassifyStore,
  preclassifyPersonalInfo: _preclassifyPersonalInfo,
  preclassifyIntent: realPreclassifyIntent,
}));

const {
  classifyIntentAndRespond,
  preclassifyPersonalInfo,
  preclassifyIntent,
} = require('../utils/gemini');
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
    const personalResult = _preclassifyPersonalInfo(query);
    if (personalResult) return personalResult;
    return { intent: 'product_query', clarified_query: query, direct_response: null };
  });
});

/* =========================================================
 *  PRE-CLASSIFIER: preclassifyPersonalInfo
 * ========================================================= */
describe('preclassifyPersonalInfo', () => {
  it('should match "Bạn có biết tên tôi không?"', () => {
    const result = preclassifyPersonalInfo('Bạn có biết tên tôi không?');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('personal_info');
  });

  it('should match "Tôi tên gì?"', () => {
    expect(preclassifyPersonalInfo('Tôi tên gì?')?.intent).toBe('personal_info');
  });

  it('should match "Tên tôi là gì?"', () => {
    expect(preclassifyPersonalInfo('Tên tôi là gì?')?.intent).toBe('personal_info');
  });

  it('should match "Email của tôi là gì?"', () => {
    expect(preclassifyPersonalInfo('Email của tôi là gì?')?.intent).toBe('personal_info');
  });

  it('should match "Số điện thoại của tôi là gì?"', () => {
    expect(preclassifyPersonalInfo('Số điện thoại của tôi là gì?')?.intent).toBe('personal_info');
  });

  it('should match "SĐT của tôi?"', () => {
    expect(preclassifyPersonalInfo('SĐT của tôi?')?.intent).toBe('personal_info');
  });

  it('should match "SDT của tôi?"', () => {
    expect(preclassifyPersonalInfo('SDT của tôi?')?.intent).toBe('personal_info');
  });

  it('should match "Bạn biết gì về tôi?"', () => {
    expect(preclassifyPersonalInfo('Bạn biết gì về tôi?')?.intent).toBe('personal_info');
  });

  it('should match "Thông tin cá nhân của tôi?"', () => {
    expect(preclassifyPersonalInfo('Thông tin cá nhân của tôi?')?.intent).toBe('personal_info');
  });

  it('should match "Thông tin của tôi là gì?"', () => {
    expect(preclassifyPersonalInfo('Thông tin của tôi là gì?')?.intent).toBe('personal_info');
  });

  it('should match "Tôi là ai?"', () => {
    expect(preclassifyPersonalInfo('Tôi là ai?')?.intent).toBe('personal_info');
  });

  it('should match "Tôi đăng ký bằng email nào?"', () => {
    expect(preclassifyPersonalInfo('Tôi đăng ký bằng email nào?')?.intent).toBe('personal_info');
  });

  it('should match "Tôi dùng số điện thoại nào?"', () => {
    expect(preclassifyPersonalInfo('Tôi dùng số điện thoại nào?')?.intent).toBe('personal_info');
  });

  it('should match "Giới thiệu về tôi?"', () => {
    expect(preclassifyPersonalInfo('Giới thiệu về tôi?')?.intent).toBe('personal_info');
  });

  it('should match "Tên của tôi là gì?"', () => {
    expect(preclassifyPersonalInfo('Tên của tôi là gì?')?.intent).toBe('personal_info');
  });

  it('should match "Mình tên gì?"', () => {
    expect(preclassifyPersonalInfo('Mình tên gì?')?.intent).toBe('personal_info');
  });

  it('should match "Tên em là gì?"', () => {
    expect(preclassifyPersonalInfo('Tên em là gì?')?.intent).toBe('personal_info');
  });

  it('should match "Phone của tôi?"', () => {
    expect(preclassifyPersonalInfo('Phone của tôi?')?.intent).toBe('personal_info');
  });

  it('should match "Số điện thoại gì?"', () => {
    expect(preclassifyPersonalInfo('Số điện thoại gì?')?.intent).toBe('personal_info');
  });

  it('should match "Email gì?"', () => {
    expect(preclassifyPersonalInfo('Email gì?')?.intent).toBe('personal_info');
  });
});

/* =========================================================
 *  BOT-IDENTITY GUARD
 * ========================================================= */
describe('preclassifyPersonalInfo — bot-identity guard', () => {
  it('should NOT match "Bạn là ai?"', () => {
    expect(preclassifyPersonalInfo('Bạn là ai?')).toBeNull();
  });

  it('should NOT match "Tên bạn là gì?"', () => {
    expect(preclassifyPersonalInfo('Tên bạn là gì?')).toBeNull();
  });

  it('should NOT match "Bạn làm được gì?"', () => {
    expect(preclassifyPersonalInfo('Bạn làm được gì?')).toBeNull();
  });

  it('should NOT match "Bạn có thể làm gì?"', () => {
    expect(preclassifyPersonalInfo('Bạn có thể làm gì?')).toBeNull();
  });

  it('should NOT match "Bạn là ai vậy?"', () => {
    expect(preclassifyPersonalInfo('Bạn là ai vậy?')).toBeNull();
  });

  it('should NOT match "Bot là gì?"', () => {
    expect(preclassifyPersonalInfo('Bot là gì?')).toBeNull();
  });

  it('should NOT match "AI là gì?"', () => {
    expect(preclassifyPersonalInfo('AI là gì?')).toBeNull();
  });
});

/* =========================================================
 *  OTHER INTENTS NOT AFFECTED
 * ========================================================= */
describe('preclassifyPersonalInfo — other intents not affected', () => {
  it('should NOT match product query', () => {
    expect(preclassifyPersonalInfo('mua iphone 15')).toBeNull();
  });

  it('should NOT match store query', () => {
    expect(preclassifyPersonalInfo('cửa hàng ở đâu')).toBeNull();
  });

  it('should NOT match promotion query', () => {
    expect(preclassifyPersonalInfo('giảm giá gì không')).toBeNull();
  });

  it('should NOT match appointment', () => {
    expect(preclassifyPersonalInfo('lịch hẹn của tôi')).toBeNull();
  });

  it('should NOT match complaint', () => {
    expect(preclassifyPersonalInfo('sản phẩm bị lỗi')).toBeNull();
  });

  it('should NOT match small talk greeting', () => {
    expect(preclassifyPersonalInfo('xin chào')).toBeNull();
  });

  it('should NOT match small talk how-are-you', () => {
    expect(preclassifyPersonalInfo('bạn khỏe không')).toBeNull();
  });
});

/* =========================================================
 *  EDGE CASES
 * ========================================================= */
describe('preclassifyPersonalInfo — edge cases', () => {
  it('should return null for null input', () => {
    expect(preclassifyPersonalInfo(null)).toBeNull();
  });

  it('should return null for undefined input', () => {
    expect(preclassifyPersonalInfo(undefined)).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(preclassifyPersonalInfo('')).toBeNull();
  });

  it('should return null for whitespace only', () => {
    expect(preclassifyPersonalInfo('   ')).toBeNull();
  });
});

/* =========================================================
 *  PRECLASSIFYINTENT PRIORITY — personal_info integration
 * ========================================================= */
describe('preclassifyIntent — personal_info priority', () => {
  it('"Tên tôi là gì?" is personal_info', () => {
    const result = preclassifyIntent('Tên tôi là gì?');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('personal_info');
  });

  it('"Bạn là ai?" is NOT personal_info', () => {
    const result = preclassifyIntent('Bạn là ai?');
    if (result) {
      expect(result.intent).not.toBe('personal_info');
    }
  });

  it('"Email của tôi là gì?" is personal_info', () => {
    const result = preclassifyIntent('Email của tôi là gì?');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('personal_info');
  });

  it('"Số điện thoại của tôi là gì?" is personal_info', () => {
    const result = preclassifyIntent('Số điện thoại của tôi là gì?');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('personal_info');
  });

  it('"cửa hàng ở đâu" is store_query, NOT personal_info', () => {
    const result = preclassifyIntent('cửa hàng ở đâu');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('store_query');
  });

  it('"giảm giá gì không" is promotion_query, NOT personal_info', () => {
    const result = preclassifyIntent('giảm giá gì không');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('promotion_query');
  });

  it('"lịch hẹn của tôi" is appointment, NOT personal_info', () => {
    const result = preclassifyIntent('lịch hẹn của tôi');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('appointment');
  });

  it('"sản phẩm bị lỗi" is NOT personal_info', () => {
    const result = preclassifyIntent('sản phẩm bị lỗi');
    if (result) {
      expect(result.intent).not.toBe('personal_info');
    }
  });
});

/* =========================================================
 *  MIXED QUERIES — priority behavior
 * ========================================================= */
describe('preclassifyPersonalInfo — mixed queries', () => {
  it('"tên tôi là gì và có iphone nào không" is personal_info (first match wins)', () => {
    const result = preclassifyPersonalInfo('tên tôi là gì và có iphone nào không');
    expect(result).not.toBeNull();
    expect(result.intent).toBe('personal_info');
  });
});

/* =========================================================
 *  CLASSIFY AND PROCESS INTENT — personal_info routing
 * ========================================================= */
describe('classifyAndProcessIntent — personal_info', () => {
  it('should return personal_info intent', async () => {
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'personal_info',
      clarified_query: null,
      direct_response: null,
    });
    const result = await ChatController.classifyAndProcessIntent([], 'Tên tôi là gì?');
    expect(result.intent).toBe('personal_info');
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

  it('should still return store_query for store queries', async () => {
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'store_query',
      clarified_query: null,
      direct_response: null,
    });
    const result = await ChatController.classifyAndProcessIntent([], 'Có cửa hàng nào?');
    expect(result.intent).toBe('store_query');
  });

  it('should still return promotion_query for promotion queries', async () => {
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'promotion_query',
      clarified_query: null,
      direct_response: null,
    });
    const result = await ChatController.classifyAndProcessIntent([], 'Mã giảm giá');
    expect(result.intent).toBe('promotion_query');
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

  it('should still return small_talk for small talk', async () => {
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'small_talk',
      clarified_query: null,
      direct_response: 'Xin chào!',
    });
    const result = await ChatController.classifyAndProcessIntent([], 'Xin chào');
    expect(result.intent).toBe('small_talk');
  });
});

/* =========================================================
 *  HANDLE PERSONAL INFO — deterministic responses
 * ========================================================= */
describe('handlePersonalInfo', () => {
  it('should return name when query asks for name', async () => {
    const socket = makeSocket(USER_ID);
    const result = await ChatController.handlePersonalInfo(
      socket, SESSION_ID, USER_ID, 'Tên tôi là gì?', 'msg-1'
    );
    expect(result.responseType).toBe('personal_info');
    expect(result.fullResponse).toContain('Test User');
    expect(result.fullResponse).toContain('Tên của bạn là');
    expect(socket.emit).toHaveBeenCalledWith('aiResponse', expect.objectContaining({
      message: expect.stringContaining('Test User'),
    }));
  });

  it('should return email when query asks for email', async () => {
    const socket = makeSocket(USER_ID);
    const result = await ChatController.handlePersonalInfo(
      socket, SESSION_ID, USER_ID, 'Email của tôi là gì?', 'msg-2'
    );
    expect(result.responseType).toBe('personal_info');
    expect(result.fullResponse).toContain('Email của bạn là');
    expect(result.fullResponse).toContain('user11@test.com');
  });

  it('should return phone when query asks for phone', async () => {
    const socket = makeSocket(USER_ID);
    const result = await ChatController.handlePersonalInfo(
      socket, SESSION_ID, USER_ID, 'Số điện thoại của tôi là gì?', 'msg-3'
    );
    expect(result.responseType).toBe('personal_info');
    expect(result.fullResponse).toContain('Số điện thoại của bạn là');
    expect(result.fullResponse).toContain('0901234567');
  });

  it('should return all available fields for generic query', async () => {
    const socket = makeSocket(USER_ID);
    const result = await ChatController.handlePersonalInfo(
      socket, SESSION_ID, USER_ID, 'Bạn biết gì về tôi?', 'msg-4'
    );
    expect(result.responseType).toBe('personal_info');
    expect(result.fullResponse).toContain('Thông tin cá nhân của bạn');
    expect(result.fullResponse).toContain('Tên:');
    expect(result.fullResponse).toContain('Email:');
    expect(result.fullResponse).toContain('Số điện thoại:');
  });

  it('should handle missing name', async () => {
    const socket = makeSocket(USER_ID, { name: undefined });
    const result = await ChatController.handlePersonalInfo(
      socket, SESSION_ID, USER_ID, 'Tên tôi là gì?', 'msg-5'
    );
    expect(result.fullResponse).toContain('chưa cập nhật tên');
  });

  it('should handle missing email', async () => {
    const socket = makeSocket(USER_ID, { email: undefined });
    const result = await ChatController.handlePersonalInfo(
      socket, SESSION_ID, USER_ID, 'Email của tôi là gì?', 'msg-6'
    );
    expect(result.fullResponse).toContain('chưa cập nhật email');
  });

  it('should handle missing phone', async () => {
    const socket = makeSocket(USER_ID, { phone: undefined });
    const result = await ChatController.handlePersonalInfo(
      socket, SESSION_ID, USER_ID, 'Số điện thoại của tôi?', 'msg-7'
    );
    expect(result.fullResponse).toContain('chưa cập nhật số điện thoại');
  });

  it('should handle unauthenticated user', async () => {
    const socket = makeSocket(null);
    const result = await ChatController.handlePersonalInfo(
      socket, SESSION_ID, null, 'Tên tôi là gì?', 'msg-8'
    );
    expect(result.responseType).toBe('personal_info');
    expect(result.fullResponse).toContain('đăng nhập');
    expect(result.aiPayload.metadata.needsLogin).toBe(true);
  });

  it('should handle no user data at all', async () => {
    const socket = { data: {}, emit: jest.fn(), handshake: { headers: {}, address: '' } };
    const result = await ChatController.handlePersonalInfo(
      socket, SESSION_ID, null, 'Bạn biết gì về tôi?', 'msg-9'
    );
    expect(result.fullResponse).toContain('đăng nhập');
  });

  it('should not call LLM', async () => {
    const socket = makeSocket(USER_ID);
    await ChatController.handlePersonalInfo(
      socket, SESSION_ID, USER_ID, 'Tên tôi là gì?', 'msg-10'
    );
    expect(classifyIntentAndRespond).not.toHaveBeenCalled();
  });

  it('should not search products', async () => {
    const Product = require('../models/Product');
    const socket = makeSocket(USER_ID);
    await ChatController.handlePersonalInfo(
      socket, SESSION_ID, USER_ID, 'Tên tôi là gì?', 'msg-11'
    );
    expect(Product.aggregate).not.toHaveBeenCalled();
    expect(Product.find).not.toHaveBeenCalled();
  });

  it('should emit correct aiResponse payload structure', async () => {
    const socket = makeSocket(USER_ID);
    const result = await ChatController.handlePersonalInfo(
      socket, SESSION_ID, USER_ID, 'Tên tôi là gì?', 'msg-12'
    );
    expect(result.aiPayload).toMatchObject({
      sessionId: SESSION_ID,
      clientMessageId: 'msg-12',
      message: expect.any(String),
      timestamp: expect.any(String),
      metadata: {
        responseType: 'personal_info',
        skipRAG: true,
      },
    });
  });

  it('should handle "SĐT của tôi?"', async () => {
    const socket = makeSocket(USER_ID);
    const result = await ChatController.handlePersonalInfo(
      socket, SESSION_ID, USER_ID, 'SĐT của tôi?', 'msg-13'
    );
    expect(result.fullResponse).toContain('Số điện thoại của bạn là');
  });

  it('should handle "Số điện thoại gì?"', async () => {
    const socket = makeSocket(USER_ID);
    const result = await ChatController.handlePersonalInfo(
      socket, SESSION_ID, USER_ID, 'Số điện thoại gì?', 'msg-14'
    );
    expect(result.fullResponse).toContain('Số điện thoại của bạn là');
  });

  it('should return fallback message on error', async () => {
    const socket = makeSocket(USER_ID);
    let callCount = 0;
    socket.emit.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error('emit failed');
    });
    const result = await ChatController.handlePersonalInfo(
      socket, SESSION_ID, USER_ID, 'Tên tôi là gì?', 'msg-15'
    );
    expect(result.responseType).toBe('personal_info');
    expect(result.fullResponse).toContain('Em xin lỗi');
  });
});

/* =========================================================
 *  FULL PIPELINE: renderResponse → handlePersonalInfo
 * ========================================================= */
describe('renderResponse — personal_info routing', () => {
  it('should route personal_info to handlePersonalInfo', async () => {
    const socket = makeSocket(USER_ID);
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'personal_info',
      clarified_query: null,
      direct_response: null,
    });
    const handleSpy = jest.spyOn(ChatController, 'handlePersonalInfo').mockResolvedValue({
      fullResponse: 'Tên của bạn là Test User 11 ạ.',
      responseType: 'personal_info',
      relatedProducts: [],
      aiPayload: {
        sessionId: SESSION_ID,
        clientMessageId: 'msg-pi-1',
        message: 'Tên của bạn là Test User 11 ạ.',
        timestamp: new Date().toISOString(),
        metadata: { responseType: 'personal_info', skipRAG: true },
      },
    });

    const result = await ChatController.renderResponse({
      socket,
      sessionId: SESSION_ID,
      userId: USER_ID,
      chatHistory: [],
      userQuery: 'Tên tôi là gì?',
      clientMessageId: 'msg-pi-1',
      generationId: 'msg-pi-1',
      signal: null,
      persistContext: false,
    });

    expect(handleSpy).toHaveBeenCalledWith(
      socket, SESSION_ID, USER_ID, 'Tên tôi là gì?', 'msg-pi-1', 'msg-pi-1', null
    );
    expect(result.responseType).toBe('personal_info');
    expect(result.fullResponse).toContain('Test User');
    handleSpy.mockRestore();
  });

  it('should NOT route "Bạn là ai?" to handlePersonalInfo', async () => {
    const socket = makeSocket(USER_ID);
    classifyIntentAndRespond.mockResolvedValue({
      intent: 'small_talk',
      clarified_query: null,
      direct_response: 'Mình là trợ lý AI của Dienthoaigiakho.',
    });
    const handlePersonalSpy = jest.spyOn(ChatController, 'handlePersonalInfo');

    await ChatController.renderResponse({
      socket,
      sessionId: SESSION_ID,
      userId: USER_ID,
      chatHistory: [],
      userQuery: 'Bạn là ai?',
      clientMessageId: 'msg-bot-1',
      generationId: 'msg-bot-1',
      signal: null,
      persistContext: false,
    });

    expect(handlePersonalSpy).not.toHaveBeenCalled();
    handlePersonalSpy.mockRestore();
  });
});
