/* ------------------------------------------------------------------ */
/*  Conversation message cap tests                                     */
/*                                                                     */
/*  Verifies that enforceMessageCap prevents unbounded growth of the   */
/*  embedded messages[] array in MongoDB.                              */
/*                                                                     */
/*  No real MongoDB, Redis, or LLM calls.                              */
/* ------------------------------------------------------------------ */

process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';

const conversationStore = [];

jest.mock('../models/Conversation', () => {
  const Conversation = jest.fn(function (fields = {}) {
    this._id = fields._id || 'conv-' + (conversationStore.length + 1);
    this.sessionId = fields.sessionId;
    this.userId = fields.userId;
    this.messages = fields.messages || [];
    this.save = jest.fn(async () => {
      const idx = conversationStore.findIndex((c) => c._id === this._id);
      if (idx >= 0) conversationStore[idx] = this;
      else conversationStore.push(this);
      return this;
    });
    this.getUserMessageByClientMessageId = function (clientMessageId) {
      if (!clientMessageId) return null;
      return this.messages.find((m) => m.role === 'user' && m.clientMessageId === clientMessageId) || null;
    };
    this.getAssistantMessageByClientMessageId = function (clientMessageId) {
      if (!clientMessageId) return null;
      return this.messages.find((m) => m.role === 'assistant' && m.clientMessageId === clientMessageId) || null;
    };
  });
  Conversation.findOne = jest.fn(async ({ sessionId, userId }) => {
    return (
      conversationStore.find(
        (c) => c.sessionId === sessionId && !!c.userId && String(c.userId) === String(userId)
      ) || null
    );
  });
  return Conversation;
});

jest.mock('../models/Complaint', () => {
  const C = jest.fn();
  C.findOne = jest.fn(async () => null);
  return C;
});

jest.mock('../models/Appointment', () => {
  const C = jest.fn();
  C.findOne = jest.fn(async () => null);
  return C;
});

jest.mock('../models/Store', () => ({ find: jest.fn().mockResolvedValue([]) }));
jest.mock('../models/Promotion', () => ({ find: jest.fn().mockResolvedValue([]) }));

jest.mock('../utils/gemini', () => ({
  classifyIntentAndRespond: jest.fn(async () => ({ intent: 'small_talk', direct_response: 'Xin chào!' })),
  generateChatResponse: jest.fn(),
  generateChatResponseStream: jest.fn(),
  generateComplaintResponse: jest.fn(),
  preclassifyComplaintContinuation: jest.fn().mockReturnValue(null),
  preclassifyAppointment: jest.fn().mockReturnValue(null),
  preclassifyPersonalInfo: jest.fn().mockReturnValue(null),
}));

jest.mock('../utils/openai', () => ({
  generateEmbedding: jest.fn(),
  generateEmbeddingsBatch: jest.fn(),
  calculateSimilarity: jest.fn(),
  testOpenAIConnection: jest.fn(),
}));

jest.mock('../services/productSearchService', () => ({
  search: jest.fn().mockResolvedValue({ products: [] }),
}));

jest.mock('../services/contextService', () => ({
  loadContext: jest.fn().mockResolvedValue(null),
  deleteContext: jest.fn().mockResolvedValue(null),
  saveContext: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/complaintService', () => ({
  createComplaint: jest.fn(),
}));

jest.mock('../services/complaintFlowService', () => ({
  loadPending: jest.fn().mockResolvedValue(null),
  savePending: jest.fn().mockResolvedValue(null),
  deletePending: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/chatStreamBatching', () => ({
  createChatStreamBatching: jest.fn(() => ({ emit: jest.fn(), flush: jest.fn() })),
}));

jest.mock('../services/chatActiveStreams', () => ({
  register: jest.fn(),
  complete: jest.fn(),
  isActive: jest.fn(() => false),
}));

jest.mock('../utils/chatCancellation', () => ({
  throwIfCancelled: jest.fn(),
  maybeTestDelay: jest.fn(),
}));

jest.mock('../utils/productConstraintParser', () => ({
  parseProductConstraints: jest.fn(() => ({ cleanedQuery: '', filters: {}, preferences: {} })),
}));

jest.mock('../utils/productValidator', () => ({
  matchesProductConstraints: jest.fn(() => true),
}));

jest.mock('../utils/productRanking', () => ({
  rankProducts: jest.fn((p) => p),
}));

jest.mock('../utils/conversationContext', () => ({
  classifyQuery: jest.fn(() => ({ intent: 'product_query' })),
  resolveFollowUpQuery: jest.fn(),
  createContextFromParsed: jest.fn(() => ({})),
  sanitizeConversationContext: jest.fn((c) => c),
  buildEntityLabels: jest.fn(() => ''),
}));

jest.mock('../utils/productSpecResolver', () => ({
  resolveProductSpec: jest.fn(),
}));

const Conversation = require('../models/Conversation');
const controller = require('../controllers/chatController');

const USER_ID = '507f1f77bcf86cd799439011';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeSocket(userId) {
  return {
    id: 'sock-1',
    handshake: { headers: { 'user-agent': 'test' }, address: '127.0.0.1' },
    data: userId ? { user: { id: userId } } : {},
    emit: jest.fn(),
  };
}

function populateConversation(count) {
  conversationStore.length = 0;
  const c = new Conversation({ sessionId: SESSION_ID, userId: USER_ID });
  c.messages = [];
  for (let i = 0; i < count; i++) {
    const isUser = i % 2 === 0;
    c.messages.push({
      role: isUser ? 'user' : 'assistant',
      content: `message-${i}`,
      clientMessageId: `turn-${i}`,
      generationId: isUser ? undefined : `turn-${i}`,
      timestamp: new Date(Date.now() + i * 1000),
      metadata: isUser
        ? { userAgent: 'test', ipAddress: '127.0.0.1' }
        : { modelUsed: 'gpt-4o', processingTime: 100 },
    });
  }
  conversationStore.push(c);
  return c;
}

beforeEach(() => {
  conversationStore.length = 0;
  jest.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  enforceMessageCap (via manageSession integration)                   */
/* ------------------------------------------------------------------ */
describe('Conversation message cap', () => {
  it('does not prune messages when under the cap', async () => {
    populateConversation(5);
    await controller.manageSession(SESSION_ID, USER_ID, 'hello', {}, 'new-turn-1');

    const stored = conversationStore[0];
    expect(stored.messages.length).toBe(6);
    expect(stored.messages[0].content).toBe('message-0');
    expect(stored.messages[5].content).toBe('hello');
  });

  it('prunes oldest messages when exceeding the cap', async () => {
    process.env.CONVERSATION_MAX_MESSAGES = '10';
    try {
      populateConversation(10);
      await controller.manageSession(SESSION_ID, USER_ID, 'overflow-msg', {}, 'overflow-id');

      const stored = conversationStore[0];
      expect(stored.messages.length).toBe(10);
      expect(stored.messages[0].content).toBe('message-1');
      expect(stored.messages[9].content).toBe('overflow-msg');
    } finally {
      delete process.env.CONVERSATION_MAX_MESSAGES;
    }
  });

  it('defaults to 500 when CONVERSATION_MAX_MESSAGES is unset', async () => {
    delete process.env.CONVERSATION_MAX_MESSAGES;
    populateConversation(3);
    await controller.manageSession(SESSION_ID, USER_ID, 'test', {}, 'test-id');

    const stored = conversationStore[0];
    expect(stored.messages.length).toBe(4);
  });

  it('falls back to 500 when CONVERSATION_MAX_MESSAGES is invalid', async () => {
    process.env.CONVERSATION_MAX_MESSAGES = 'not-a-number';
    try {
      populateConversation(3);
      await controller.manageSession(SESSION_ID, USER_ID, 'test', {}, 'test-id');

      const stored = conversationStore[0];
      expect(stored.messages.length).toBe(4);
    } finally {
      delete process.env.CONVERSATION_MAX_MESSAGES;
    }
  });

  it('falls back to 500 when CONVERSATION_MAX_MESSAGES is zero', async () => {
    process.env.CONVERSATION_MAX_MESSAGES = '0';
    try {
      populateConversation(3);
      await controller.manageSession(SESSION_ID, USER_ID, 'test', {}, 'test-id');

      const stored = conversationStore[0];
      expect(stored.messages.length).toBe(4);
    } finally {
      delete process.env.CONVERSATION_MAX_MESSAGES;
    }
  });

  it('falls back to 500 when CONVERSATION_MAX_MESSAGES is negative', async () => {
    process.env.CONVERSATION_MAX_MESSAGES = '-5';
    try {
      populateConversation(3);
      await controller.manageSession(SESSION_ID, USER_ID, 'test', {}, 'test-id');

      const stored = conversationStore[0];
      expect(stored.messages.length).toBe(4);
    } finally {
      delete process.env.CONVERSATION_MAX_MESSAGES;
    }
  });

  it('respects a custom cap value', async () => {
    process.env.CONVERSATION_MAX_MESSAGES = '5';
    try {
      populateConversation(5);
      await controller.manageSession(SESSION_ID, USER_ID, 'new-msg', {}, 'new-id');

      const stored = conversationStore[0];
      expect(stored.messages.length).toBe(5);
      expect(stored.messages[0].content).toBe('message-1');
      expect(stored.messages[4].content).toBe('new-msg');
    } finally {
      delete process.env.CONVERSATION_MAX_MESSAGES;
    }
  });

  it('preserves message order after pruning', async () => {
    process.env.CONVERSATION_MAX_MESSAGES = '4';
    try {
      populateConversation(4);
      await controller.manageSession(SESSION_ID, USER_ID, 'final', {}, 'final-id');

      const stored = conversationStore[0];
      const contents = stored.messages.map((m) => m.content);
      expect(contents).toEqual(['message-1', 'message-2', 'message-3', 'final']);
    } finally {
      delete process.env.CONVERSATION_MAX_MESSAGES;
    }
  });
});

/* ------------------------------------------------------------------ */
/*  saveAIResponse message cap                                         */
/* ------------------------------------------------------------------ */
describe('saveAIResponse message cap', () => {
  it('prunes oldest messages when AI response exceeds the cap', async () => {
    process.env.CONVERSATION_MAX_MESSAGES = '5';
    try {
      populateConversation(5);
      await controller.saveAIResponse(SESSION_ID, USER_ID, 'ai-answer', {
        clientMessageId: 'new-turn',
        generationId: 'gen-1',
        processingTime: 100,
        retrievedProducts: [],
      });

      const stored = conversationStore[0];
      expect(stored.messages.length).toBe(5);
      expect(stored.messages[0].content).toBe('message-1');
      expect(stored.messages[4].content).toBe('ai-answer');
      expect(stored.messages[4].role).toBe('assistant');
    } finally {
      delete process.env.CONVERSATION_MAX_MESSAGES;
    }
  });

  it('does not prune when under the cap', async () => {
    populateConversation(3);
    await controller.saveAIResponse(SESSION_ID, USER_ID, 'reply', {
      clientMessageId: 'turn-3',
      processingTime: 50,
    });

    const stored = conversationStore[0];
    expect(stored.messages.length).toBe(4);
    expect(stored.messages[3].content).toBe('reply');
  });
});

/* ------------------------------------------------------------------ */
/*  LLM context uses last 6 regardless of cap                          */
/* ------------------------------------------------------------------ */
describe('LLM context unaffected by cap', () => {
  it('manageSession returns last 6 messages as chatHistory', async () => {
    populateConversation(20);
    const result = await controller.manageSession(SESSION_ID, USER_ID, 'new', {}, 'new-id');

    expect(result.chatHistory.length).toBe(6);
    const stored = conversationStore[0];
    const expected = stored.messages.slice(-6);
    expect(result.chatHistory).toEqual(expected);
  });
});

/* ------------------------------------------------------------------ */
/*  replaceAIResponse does NOT need cap (in-place replace)             */
/* ------------------------------------------------------------------ */
describe('replaceAIResponse does not grow array', () => {
  it('replaces in place without adding messages', async () => {
    populateConversation(2);
    const initialLength = conversationStore[0].messages.length;

    await controller.replaceAIResponse(SESSION_ID, USER_ID, 'turn-1', 'new-content', 'gen-new', {
      processingTime: 200,
    });

    const stored = conversationStore[0];
    expect(stored.messages.length).toBe(initialLength);
    expect(stored.messages[1].content).toBe('new-content');
  });
});

/* ------------------------------------------------------------------ */
/*  Dedup guard still works with cap                                    */
/* ------------------------------------------------------------------ */
describe('dedup with cap', () => {
  it('does not add duplicate messages', async () => {
    populateConversation(2);
    const cid = 'dedup-id';

    await controller.manageSession(SESSION_ID, USER_ID, 'first', {}, cid);
    const afterFirst = conversationStore[0].messages.length;

    await controller.manageSession(SESSION_ID, USER_ID, 'first-again', {}, cid);
    const afterSecond = conversationStore[0].messages.length;

    expect(afterSecond).toBe(afterFirst);
  });
});
