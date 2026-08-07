/* ------------------------------------------------------------------ */
/*  Retry / Regenerate controller tests                                */
/*                                                                     */
/*  Uses the REAL ChatController with an in-memory Conversation mock.  */
/*  The small-talk intent path is exercised so no RAG/context/Redis     */
/*  or provider calls are made.                                         */
/*                                                                     */
/*  Covers the core domain contract:                                   */
/*    clientMessageId = logical turn identity                          */
/*    generationId    = generation attempt identity                    */
/*  Retry reuses the logical id and never duplicates the user row;     */
/*  Regenerate mints a fresh generationId and atomically replaces the  */
/*  existing assistant row (never appends, never deletes-old-first).   */
/*                                                                     */
/*  No real MongoDB, Redis, or LLM calls.                              */
/* ------------------------------------------------------------------ */

const conversationStore = [];

// Add the logical-turn helper methods to every Conversation document so the
// controller's Retry/Regenerate lookup methods work against the in-memory mock.
function attachDocHelpers(conversation) {
  conversation.getUserMessageByClientMessageId = function (clientMessageId) {
    if (!clientMessageId) return null;
    return (
      this.messages.find((m) => m.role === 'user' && m.clientMessageId === clientMessageId) || null
    );
  };
  conversation.getAssistantMessageByClientMessageId = function (clientMessageId) {
    if (!clientMessageId) return null;
    return (
      this.messages.find((m) => m.role === 'assistant' && m.clientMessageId === clientMessageId) || null
    );
  };
  return conversation;
}

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
  const Complaint = jest.fn(function () {
    this.save = jest.fn(async () => null);
  });
  Complaint.findOne = jest.fn(async () => null);
  return Complaint;
});

const smallTalkReply = { intent: 'small_talk', direct_response: 'Xin chào!' };

jest.mock('../utils/openai', () => ({
  generateEmbedding: jest.fn(),
  generateEmbeddingsBatch: jest.fn(),
  calculateSimilarity: jest.fn(),
  testOpenAIConnection: jest.fn(),
}));

jest.mock('../utils/gemini', () => ({
  classifyIntentAndRespond: jest.fn(async () => smallTalkReply),
  generateChatResponse: jest.fn(),
  generateComplaintResponse: jest.fn(),
}));

jest.mock('../utils/productConstraintParser', () => ({
  parseProductConstraints: jest.fn(() => ({ cleanedQuery: '', filters: {}, preferences: {} })),
}));

const Conversation = require('../models/Conversation');
// chatController exports a singleton instance (module.exports = controller).
const controller = require('../controllers/chatController');
const { classifyIntentAndRespond } = require('../utils/gemini');

const USER_A = '507f1f77bcf86cd799439011';
const USER_B = '507f1f77bcf86cd799439022';
const sessionId = '550e8400-e29b-41d4-a716-446655440000';
const clientMessageId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const cleanSignal = { aborted: false };

function makeSocket(userId) {
  return {
    handshake: { headers: { 'user-agent': 'test' }, address: '127.0.0.1' },
    data: userId ? { user: { id: userId } } : {},
    emit: jest.fn(),
  };
}

function setupConversation({ userId = USER_A, withAssistant = false, generationId } = {}) {
  conversationStore.length = 0;
  const c = new Conversation({ sessionId, userId });
  const userMsg = { role: 'user', content: 'Toi muon mua iphone', clientMessageId, timestamp: new Date() };
  const assisMsg = {
    role: 'assistant',
    content: 'old-answer',
    clientMessageId,
    generationId: generationId || clientMessageId,
    timestamp: new Date(),
    metadata: { modelUsed: 'deterministic' },
  };
  c.messages.push(userMsg);
  if (withAssistant) c.messages.push(assisMsg);
  conversationStore.push(c);
  return c;
}

function findStore(sessionId, userId) {
  return conversationStore.find(
    (c) => c.sessionId === sessionId && !!c.userId && String(c.userId) === String(userId)
  );
}

beforeEach(() => {
  conversationStore.length = 0;
  jest.clearAllMocks();
  classifyIntentAndRespond.mockResolvedValue(smallTalkReply);
});

describe('verifyRetryTarget / verifyRegenerateTarget', () => {
  it('returns not_found for another user (ownership enforced, generic)', async () => {
    setupConversation({ userId: USER_A, withAssistant: false });
    const retryB = await controller.verifyRetryTarget(sessionId, USER_B, clientMessageId);
    const regenB = await controller.verifyRegenerateTarget(sessionId, USER_B, clientMessageId);
    expect(retryB.status).toBe('not_found');
    expect(regenB.status).toBe('not_found');
  });

  it('returns not_found when the user turn is missing', async () => {
    conversationStore.length = 0;
    const c = new Conversation({ sessionId, userId: USER_A });
    c.messages.push({ role: 'assistant', content: 'x', clientMessageId, timestamp: new Date() });
    conversationStore.push(c);
    expect((await controller.verifyRetryTarget(sessionId, USER_A, clientMessageId)).status).toBe('not_found');
    expect((await controller.verifyRegenerateTarget(sessionId, USER_A, clientMessageId)).status).toBe('not_found');
  });

  it('returns already_completed for Retry when an assistant reply exists', async () => {
    setupConversation({ userId: USER_A, withAssistant: true });
    const res = await controller.verifyRetryTarget(sessionId, USER_A, clientMessageId);
    expect(res.status).toBe('already_completed');
  });

  it('returns not_completed for Regenerate when no assistant reply exists', async () => {
    setupConversation({ userId: USER_A, withAssistant: false });
    const res = await controller.verifyRegenerateTarget(sessionId, USER_A, clientMessageId);
    expect(res.status).toBe('not_completed');
  });
});

describe('Retry', () => {
  it('cancelled turn retries, persisting ONE assistant reply and not duplicating the user row', async () => {
    setupConversation({ userId: USER_A, withAssistant: false });
    const socket = makeSocket(USER_A);
    const res = await controller.retryMessage(
      socket, sessionId, USER_A, clientMessageId, cleanSignal
    );

    expect(res.status).toBe('accepted');
    const conv = findStore(sessionId, USER_A);
    const users = conv.messages.filter((m) => m.role === 'user');
    const assistants = conv.messages.filter((m) => m.role === 'assistant');
    expect(users).toHaveLength(1);
    expect(assistants).toHaveLength(1);
    expect(users[0].clientMessageId).toBe(clientMessageId);
    expect(assistants[0].clientMessageId).toBe(clientMessageId);
    expect(assistants[0].generationId).toBe(clientMessageId);
    expect(assistants[0].content).toBe(smallTalkReply.direct_response);
  });

  it('refuses a turn that already has an assistant reply (never Regenerate as Retry)', async () => {
    setupConversation({ userId: USER_A, withAssistant: true });
    const socket = makeSocket(USER_A);
    const res = await controller.retryMessage(
      socket, sessionId, USER_A, clientMessageId, cleanSignal
    );
    expect(res.status).toBe('already_completed');
    const conv = findStore(sessionId, USER_A);
    expect(conv.messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
  });

  it('throws as a cancelled generation (signal aborted) and persists no assistant', async () => {
    setupConversation({ userId: USER_A, withAssistant: false });
    const socket = makeSocket(USER_A);
    const aborted = {
      aborted: true,
      signalAborted: true,
    };
    // simulate cancelledError from the cancellation util
    const err = new Error('Stream aborted');
    err.cancelled = true;
    err.code = 'STREAM_CANCELLED';
    classifyIntentAndRespond.mockImplementation(async () => {
      throw err;
    });
    await expect(
      controller.retryMessage(socket, sessionId, USER_A, clientMessageId, aborted)
    ).rejects.toThrow('Stream aborted');
    const conv = findStore(sessionId, USER_A);
    expect(conv.messages.filter((m) => m.role === 'assistant')).toHaveLength(0);
    // user row preserved, still one
    expect(conv.messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });
});

describe('Regenerate', () => {
  it('completed turn regenerates with a fresh generationId and replaces, not appends', async () => {
    setupConversation({ userId: USER_A, withAssistant: true, generationId: 'old-gen' });
    const socket = makeSocket(USER_A);
    const freshGen = '11111111-2222-3333-4444-555555555555';
    const res = await controller.regenerateMessage(
      socket, sessionId, USER_A, clientMessageId, freshGen, cleanSignal
    );

    expect(res.status).toBe('accepted');
    expect(res.generationId).toBe(freshGen);
    const conv = findStore(sessionId, USER_A);
    const assis = conv.messages.filter((m) => m.role === 'assistant');
    expect(assis).toHaveLength(1);
    expect(assis[0].clientMessageId).toBe(clientMessageId);
    expect(assis[0].generationId).toBe(freshGen);
    expect(assis[0].content).toBe(smallTalkReply.direct_response);
  });

  it('returns not_completed when no assistant reply exists', async () => {
    setupConversation({ userId: USER_A, withAssistant: false });
    const socket = makeSocket(USER_A);
    const res = await controller.regenerateMessage(
      socket, sessionId, USER_A, clientMessageId, 'fresh-gen', cleanSignal
    );
    expect(res.status).toBe('not_completed');
  });

it('preserves the old assistant reply when the new generation fails', async () => {
    setupConversation({ userId: USER_A, withAssistant: true, generationId: 'old-gen' });
    const socket = makeSocket(USER_A);

    // Force the generation pipeline to fail for this attempt. The regenerate
    // flow never deletes-or-overwrites the old row before a new generation
    // succeeds, so a failure must leave the previous completed reply intact.
    const originalRender = controller.renderResponse.bind(controller);
    controller.renderResponse = jest.fn().mockRejectedValue(new Error('provider down'));

    await expect(
      controller.regenerateMessage(socket, sessionId, USER_A, clientMessageId, 'fresh-gen', cleanSignal)
    ).rejects.toThrow('provider down');

    controller.renderResponse = originalRender;

    const conv = findStore(sessionId, USER_A);
    const assis = conv.messages.filter((m) => m.role === 'assistant');
    expect(assis).toHaveLength(1);
    expect(assis[0].content).toBe('old-answer');
    expect(assis[0].generationId).toBe('old-gen');
  });
});
