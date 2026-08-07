/* ------------------------------------------------------------------ */
/*  ChatController.processMessage cancellation CHECKPOINT tests        */
/*                                                                     */
/*  The ONE AbortController is created at the socket boundary; its     */
/*  { signal } is threaded through processMessage which asserts        */
/*  throwIfCancelled(signal) between phases. These tests prove that a  */
/*  stop at any checkpoint halts all LATER work and, crucially, never  */
/*  persists an assistant reply — while the user message may remain    */
/*  (manageSession ran before the cancel).                             */
/*                                                                     */
/*  No real socket, MongoDB, Redis, or LLM calls are made.             */
/* ------------------------------------------------------------------ */

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

const mockConversation = {
  _id: 'conv1',
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  userId: 'user-123',
  messages: [],
  save: jest.fn().mockResolvedValue(true),
};
jest.mock('../models/Conversation', () => {
  const C = jest.fn(() => mockConversation);
  C.findOne = jest.fn().mockResolvedValue(mockConversation);
  return C;
});
jest.mock('../models/Complaint', () => {
  const C = jest.fn();
  C.findOne = jest.fn();
  return C;
});

const mockClassify = jest.fn();
jest.mock('../utils/gemini', () => ({
  classifyIntentAndRespond: (h, q) => mockClassify(h, q),
  generateChatResponseStream: jest.fn().mockResolvedValue({
    fullResponse: 'rep',
    provider: 'deterministic',
    finishReason: 'stop',
    streamed: false,
  }),
  generateChatResponse: jest.fn().mockResolvedValue({ text: 'buffered', provider: 'deterministic' }),
  generateComplaintResponse: jest.fn(),
}));

jest.mock('../services/productSearchService', () => ({ search: jest.fn().mockResolvedValue({ products: [] }) }));
jest.mock('../services/contextService', () => ({
  loadContext: jest.fn().mockResolvedValue(null),
  deleteContext: jest.fn().mockResolvedValue(null),
  saveContext: jest.fn().mockResolvedValue(null),
}));

const ChatController = require('../controllers/chatController');
const contextService = require('../services/contextService');
const productSearchService = require('../services/productSearchService');

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const CLIENT_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const USER_ID = 'user-123';

function makeSocket() {
  return {
    id: 'sock-1',
    handshake: { headers: {}, address: '127.0.0.1' },
    data: { user: { id: USER_ID } },
    emit: jest.fn(),
  };
}

// Deferred so a test can fully control when a phase resolves.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConversation.messages = [];
  mockClassify.mockReset();
  mockClassify.mockResolvedValue({
    intent: 'product_query',
    direct_response: null,
    clarified_query: 'iphone 15',
  });
});

describe('ChatController.processMessage cancellation checkpoints', () => {
  it('a pre-aborted signal cancels before any work (no session, no LLM, no save)', async () => {
    const ac = new AbortController();
    ac.abort();
    const socket = makeSocket();
    await expect(
      ChatController.processMessage(socket, {
        sessionId: SESSION_ID,
        message: 'hello',
        clientMessageId: CLIENT_ID,
      }, ac.signal)
    ).rejects.toMatchObject({ cancelled: true, aborted: true, code: 'STREAM_CANCELLED' });

    // Nothing at all ran.
    expect(mockConversation.save).not.toHaveBeenCalled();
    expect(mockClassify).not.toHaveBeenCalled();
    expect(productSearchService.search).not.toHaveBeenCalled();
  });

  it('a cancel during intent classification prevents RAG, provider call, and assistant save', async () => {
    const gate = deferred();
    mockClassify.mockImplementation(() => gate.promise);

    const ac = new AbortController();
    const socket = makeSocket();
    const p = ChatController.processMessage(socket, {
      sessionId: SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    }, ac.signal);

    // Let manageSession + the post-session checkpoint pass, then abort while
    // intent is still pending.
    await new Promise((r) => setTimeout(r, 0));
    ac.abort();
    gate.resolve({
      intent: 'product_query',
      direct_response: null,
      clarified_query: 'iphone',
    });

    await expect(p).rejects.toMatchObject({ code: 'STREAM_CANCELLED' });

    // Prioritization: no RAG, no provider, no assistant persistence.
    expect(productSearchService.search).not.toHaveBeenCalled();
    expect(contextService.saveContext).not.toHaveBeenCalled();
    // saveAIResponse appends to the conversation — it must not have been called.
    expect(mockConversation.messages.some((m) => m.role === 'assistant')).toBe(false);
  });

  it('a cancel after session management leaves the user message persisted but suppresses assistant save', async () => {
    const gate = deferred();
    mockClassify.mockImplementation(() => gate.promise);
    const ac = new AbortController();
    const socket = makeSocket();
    const p = ChatController.processMessage(socket, {
      sessionId: SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    }, ac.signal);

    await new Promise((r) => setTimeout(r, 0));
    ac.abort();
    gate.resolve({ intent: 'product_query', direct_response: null, clarified_query: 'q' });
    await expect(p).rejects.toMatchObject({ code: 'STREAM_CANCELLED' });

    // User message was persisted by manageSession (approved behavior).
    expect(mockConversation.messages.some((m) => m.role === 'user' && m.content === 'hello')).toBe(true);
    // Assistant reply is never persisted.
    expect(mockConversation.messages.some((m) => m.role === 'assistant')).toBe(false);
  });
});

describe('ChatController.processMessage completion (unaffected) path', () => {
  it('a normal run reaches the provider and saves an assistant reply', async () => {
    // generateChatResponseStream short-circuits the deterministic buffered path,
    // which still marks completed and returns an aiPayload for dedup.
    const socket = makeSocket();
    const result = await ChatController.processMessage(socket, {
      sessionId: SESSION_ID,
      message: 'hello',
      clientMessageId: CLIENT_ID,
    });
    expect(result).toMatchObject({ success: true });
    // The provider produced a response, context saved, assistant persisted once.
    expect(productSearchService.search).toHaveBeenCalledTimes(1);
    expect(contextService.saveContext).toHaveBeenCalledTimes(1);
    expect(mockConversation.messages.some((m) => m.role === 'assistant')).toBe(true);
  });
});