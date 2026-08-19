/* ------------------------------------------------------------------ */
/*  Streaming grounding regression test                                 */
/*                                                                      */
/*  Bug: generateChatResponseStream() builds a system prompt containing */
/*  the retrieved product context (createSystemPrompt) but the          */
/*  `messages` array passed to streamOpenAICompatible() omits the       */
/*  { role: "system" } entry — so OpenAI's primary streaming provider   */
/*  receives no product context and no grounding instruction.           */
/*                                                                      */
/*  This test asserts the system prompt IS messages[0] for OpenAI.      */
/*  It is expected to FAIL against current production code and PASS     */
/*  after the one-line fix (prepending the system message) is applied.  */
/*                                                                      */
/*  Providers are fully mocked; no real LLM/network calls are made.     */
/* ------------------------------------------------------------------ */

process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';

const mockCreate = jest.fn();

jest.mock('openai', () => {
  const mockOpenAI = jest.fn(() => ({
    chat: { completions: { create: mockCreate } },
  }));
  mockOpenAI.mockCreate = mockCreate;
  return mockOpenAI;
});

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(() => ({
    models: { generateContentStream: jest.fn() },
  })),
}));

const { generateChatResponseStream } = require('../utils/gemini');

const PRODUCT_CONTEXT = [
  {
    _id: 'p1',
    name: 'iPhone 16 Pro',
    brand: 'apple',
    price: 29990000,
    description: 'Flagship smartphone',
    inStock: 10,
    specs: { memory: { ram: '8 GB', storage: '256 GB' } },
  },
];

const CHAT_HISTORY = [
  { role: 'user', content: 'Tôi muốn mua iPhone' },
  { role: 'assistant', content: 'Bạn muốn phân khúc nào?' },
];

function asyncIterable(items) {
  async function* gen() {
    for (const item of items) yield item;
  }
  return gen();
}

function openAiChunks(content) {
  return [
    { choices: [{ delta: { content }, finish_reason: null }] },
    { choices: [{ delta: { content: '' }, finish_reason: 'stop' }] },
  ];
}

describe('generateChatResponseStream() streaming grounding regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the system prompt (with product context) as messages[0] to OpenAI', async () => {
    mockCreate.mockReturnValueOnce(asyncIterable(openAiChunks('ok')));

    await generateChatResponseStream({
      userMessage: 'Gợi ý iPhone 16 Pro',
      chatHistory: CHAT_HISTORY,
      productContext: PRODUCT_CONTEXT,
      onDelta: () => {},
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const { messages } = mockCreate.mock.calls[0][0];

    // The grounding system prompt built from productContext must be messages[0].
    expect(messages[0]).toEqual({
      role: 'system',
      content: expect.stringContaining('SẢN PHẨM 1:'),
    });
    expect(messages[0].content).toEqual(expect.stringContaining('iPhone 16 Pro'));
    expect(messages[0].content).toEqual(expect.stringContaining('apple'));

    // History and user message follow the system prompt (post-fix shape):
    // [system, ...history, user].
    expect(messages.length).toBe(CHAT_HISTORY.length + 2);
    expect(messages[messages.length - 1]).toEqual({
      role: 'user',
      content: 'Gợi ý iPhone 16 Pro',
    });
  });
});