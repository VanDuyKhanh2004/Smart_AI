/* ------------------------------------------------------------------ */
/*  Streaming chat provider fallback tests                              */
/*                                                                     */
/*  Covers generateChatResponseStream's fallback chain (OpenAI ->      */
/*  Gemini -> deterministic), the MAX_STREAMED_TEXT_CHARS ceiling, and  */
/*  partial-content preservation on a mid-stream error.                 */
/*                                                                     */
/*  Providers are fully mocked; no real LLM/network calls are made.    */
/* ------------------------------------------------------------------ */

process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';

const mockCreate = jest.fn();
const mockStreamGemini = jest.fn();

jest.mock('openai', () => {
  const mockOpenAI = jest.fn(() => ({
    chat: { completions: { create: mockCreate } },
  }));
  mockOpenAI.mockCreate = mockCreate;
  return mockOpenAI;
});

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(() => ({
    models: {
      generateContentStream: mockStreamGemini,
    },
  })),
}));

const { generateChatResponseStream } = require('../utils/gemini');

const mockProducts = [
  {
    _id: 'p1',
    name: 'iPhone 16 Pro',
    brand: 'apple',
    price: 29990000,
    description: 'Flagship smartphone',
    inStock: 10,
  },
];

/** Build an async iterable of OpenAI stream chunks. */
function openAiChunks(chunks, finishReason = 'stop') {
  return [
    ...chunks.map((content) => ({ choices: [{ delta: { content }, finish_reason: null }] })),
    { choices: [{ delta: { content: '' }, finish_reason: finishReason }] },
  ];
}

/** Async generator of Gemini stream chunks. */
async function* geminiChunks(chunks) {
  for (const c of chunks) {
    yield { text: c };
  }
}

describe('generateChatResponseStream()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('streams OpenAI deltas and resolves with assembled text + finishReason + streamed:true', async () => {
    const collected = [];
    mockCreate.mockReturnValueOnce(asyncIterable(openAiChunks(['Xin ', 'chào!'])));

    const result = await generateChatResponseStream({
      userMessage: 'ai đó',
      productContext: mockProducts,
      onDelta: (d) => collected.push(d),
    });

    expect(collected.join('')).toBe('Xin chào!');
    expect(result.fullResponse).toBe('Xin chào!');
    expect(result.provider).toBe('openai');
    expect(result.finishReason).toBe('stop');
    expect(result.streamed).toBe(true);
  });

  it('uses stream:true with the OpenAI provider', async () => {
    mockCreate.mockReturnValueOnce(asyncIterable(openAiChunks(['a'])));
    await generateChatResponseStream({
      userMessage: 'x',
      messages: [],
      onDelta: () => {},
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.stream).toBe(true);
  });

  it('falls back to Gemini when OpenAI fails before any delta', async () => {
    mockCreate.mockRejectedValueOnce(new Error('openai down'));
    mockStreamGemini.mockReturnValueOnce(geminiChunks(['Tôi ', 'gợi ý ', 'iPhone.']));

    const collected = [];
    const result = await generateChatResponseStream({
      userMessage: 'gợi ý iphone',
      productContext: mockProducts,
      onDelta: (d) => collected.push(d),
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockStreamGemini).toHaveBeenCalledTimes(1);
    expect(collected.join('')).toBe('Tôi gợi ý iPhone.');
    expect(result.fullResponse).toBe('Tôi gợi ý iPhone.');
    expect(result.provider).toBe('gemini');
    expect(result.streamed).toBe(true);
  });

  it('falls back to deterministic when both providers fail before any delta; stays buffered', async () => {
    mockCreate.mockRejectedValueOnce(new Error('openai down'));
    mockStreamGemini.mockRejectedValueOnce(new Error('gemini down'));

    const collected = [];
    const result = await generateChatResponseStream({
      userMessage: 'gợi ý iphone',
      productContext: mockProducts,
      onDelta: (d) => collected.push(d),
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockStreamGemini).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('deterministic');
    expect(result.fullResponse.length).toBeGreaterThan(0);
    // Deterministic is BUFFERED: it emits no deltas so the caller uses aiResponse.
    expect(collected).toHaveLength(0);
    expect(result.streamed).toBe(false);
  });

  it('does NOT fall back to Gemini after a mid-stream OpenAI error (partial output)', async () => {
    async function* chunkThenThrow() {
      yield { choices: [{ delta: { content: 'partial ' }, finish_reason: null }] };
      throw new Error('network failed mid-stream');
    }
    mockCreate.mockReturnValueOnce(chunkThenThrow());

    let captured;
    try {
      await generateChatResponseStream({
        userMessage: 'head test',
        productContext: mockProducts,
        onDelta: () => {},
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeDefined();
    expect(captured.partialContent).toBe('partial ');
    // Partial output must NOT fall back to another provider.
    expect(mockStreamGemini).not.toHaveBeenCalled();
  });

  it('preserves partial content on a mid-stream OpenAI error', async () => {
    async function* chunkThenThrow() {
      yield { choices: [{ delta: { content: 'partial ' }, finish_reason: null }] };
      throw new Error('network failed mid-stream');
    }
    mockCreate.mockReturnValueOnce(chunkThenThrow());

    let captured;
    try {
      await generateChatResponseStream({
        userMessage: 'head test',
        productContext: mockProducts,
        onDelta: () => {},
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeDefined();
    expect(captured.partialContent).toBe('partial ');
  });

  it('caps assembled output at MAX_STREAMED_TEXT_CHARS -> finishReason max_tokens', async () => {
    const big = 'a'.repeat(2000);
    const collected = [];
    mockCreate.mockReturnValueOnce(asyncIterable(openAiChunks([big, big, big], 'stop')));

    const result = await generateChatResponseStream({
      userMessage: 'long text',
      productContext: mockProducts,
      onDelta: (d) => collected.push(d),
    });

    expect(result.fullResponse.length).toBe(4000);
    expect(collected.join('').length).toBe(4000);
    expect(result.finishReason).toBe('max_tokens');
    expect(result.streamed).toBe(true);
  });
});

/** Minimal async-iterable wrapper for a static array of chunks. */
function asyncIterable(items) {
  async function* gen() {
    for (const item of items) {
      yield item;
    }
  }
  return gen();
}