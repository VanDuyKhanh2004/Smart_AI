/**
 * Regression tests for the offline RAG answer-generation path.
 *
 * These verify that the evaluation exercises the REAL production generation
 * orchestration (utils/gemini.js generateChatResponse / generateChatResponseStream
 * -> production createSystemPrompt) against the retrieved product context, with
 * ONLY the LLM SDK packages replaced by deterministic offline fakes — no
 * external provider or network is ever called.
 */

const { createRecommendationStore, IDS } = require('../evaluation/recommendation/recommendationStore');
const { createDeterministicEmbedding } = require('../evaluation/deterministicEmbedding');

jest.mock('openai', () => require('../evaluation/rag/fakeLLMProviders').FakeOpenAI);
jest.mock('@google/genai', () => ({
  GoogleGenAI: require('../evaluation/rag/fakeLLMProviders').FakeGoogleGenAI,
}));

const {
  createGenerationHooks,
  FakeOpenAI,
  FakeGoogleGenAI,
} = require('../evaluation/rag/fakeLLMProviders');
const { RAG_CASES } = require('../evaluation/rag/fixtures/ragCases');
const { computePromptGrounding } = require('../evaluation/rag/evaluator');

const store = createRecommendationStore();
jest.doMock('../models/Product', () => store);
jest.doMock('../utils/openai', () => ({
  generateEmbedding: async text => createDeterministicEmbedding(text),
  generateEmbeddingsBatch: async texts => (Array.isArray(texts) ? texts : [texts]).map(createDeterministicEmbedding),
  calculateSimilarity: (a, b) => {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i += 1) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  },
  testOpenAIConnection: async () => true,
}));

const responsesByQuery = new Map(RAG_CASES.map(c => [c.query, c.answer]));
const generation = createGenerationHooks({
  resolveResponse: userMessage =>
    responsesByQuery.get(userMessage) || 'Xin lỗi, tôi chưa có thông tin cụ thể về sản phẩm này.',
});

const { search } = require('../services/productSearchService');

const caseById = id => RAG_CASES.find(c => c.id === id);
const setup = c => store.configure({ vectorFailure: c.vectorFailure === true });

describe('RAG generation — real production answer-generation path offline', () => {
  let brandRes;
  let textRes;
  let emptyRes;

  beforeAll(async () => {
    setup(caseById('rag-brand-001'));
    brandRes = await search('samsung galaxy', 10, { brands: ['samsung'] });
    setup(caseById('rag-text-007'));
    textRes = await search('galaxy s24', 10);
    setup(caseById('rag-no-result-008'));
    emptyRes = await search('nokia lumia', 10, { brands: ['nokia'] });
  });

  it('the generated-answer path receives the same product context intended for the model', async () => {
    const gen = await generation.generate([], 'samsung galaxy', brandRes.products);
    // The production createSystemPrompt serializes each retrieved product.
    expect(gen.messages[0].role).toBe('system');
    expect(gen.messages[gen.messages.length - 1]).toEqual({ role: 'user', content: 'samsung galaxy' });
    for (const p of brandRes.products) {
      expect(gen.systemPrompt).toContain(String(p._id));
      expect(gen.systemPrompt).toContain(p.name);
    }
    // Same shape as production: system + user (empty chat history).
    expect(gen.messages).toHaveLength(2);
  });

  it('the streaming path contains the system message with product context', async () => {
    const st = await generation.generateStream({
      userMessage: 'samsung galaxy',
      chatHistory: [],
      productContext: brandRes.products,
    });
    expect(st.messages[0].role).toBe('system');
    expect(st.messages[0].content).toContain(IDS.S24);
    expect(st.messages[0].content).toContain('Galaxy S24');
    expect(st.fullResponse).toBe(responsesByQuery.get('samsung galaxy'));
  });

  it('text-tier retrieved context also reaches the system prompt', async () => {
    const gen = await generation.generate([], 'galaxy s24', textRes.products);
    const grounding = computePromptGrounding(gen.systemPrompt, textRes.products);
    expect(grounding.score).toBe(1);
    expect(gen.systemPrompt).toContain(IDS.S24FE);
  });

  it('no-result case emits the production no-products marker, not product blocks', async () => {
    const gen = await generation.generate([], 'nokia lumia', emptyRes.products);
    const grounding = computePromptGrounding(gen.systemPrompt, emptyRes.products);
    expect(grounding.noProductsMarker).toBe(true);
    expect(gen.systemPrompt).toContain('HIỆN TẠI KHÔNG CÓ SẢN PHẨM LIÊN QUAN TRONG KHO');
    expect(gen.systemPrompt).not.toContain('SẢN PHẨM 1');
  });

  it('no external provider or network is called', async () => {
    // The SDK packages resolve to our deterministic fakes, so the real
    // OpenAI / GoogleGenAI client code never loads and cannot hit the net.
    expect(require('openai')).toBe(FakeOpenAI);
    expect(require('@google/genai').GoogleGenAI).toBe(FakeGoogleGenAI);

    // Any provider invocation goes through the fakes only.
    expect(generation.capture.networkAttempted).toBe(false);
    expect(generation.capture.calls.length).toBeGreaterThan(0);
    for (const call of generation.capture.calls) {
      expect(['openai', 'gemini']).toContain(call.kind);
    }
  });

  it('the production generation orchestration resolved through the fake primary provider', async () => {
    const gen = await generation.generate([], 'samsung galaxy', brandRes.products);
    expect(gen.provider).toBe('OpenAI');
    expect(gen.text).toBe(responsesByQuery.get('samsung galaxy'));
  });
});