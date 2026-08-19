const { createRecommendationStore, IDS } = require('../evaluation/recommendation/recommendationStore');
const { createDeterministicEmbedding } = require('../evaluation/deterministicEmbedding');

jest.mock('openai', () => require('../evaluation/rag/fakeLLMProviders').FakeOpenAI);
jest.mock('@google/genai', () => ({
  GoogleGenAI: require('../evaluation/rag/fakeLLMProviders').FakeGoogleGenAI,
}));

const { createGenerationHooks } = require('../evaluation/rag/fakeLLMProviders');
const { RAG_CASES } = require('../evaluation/rag/fixtures/ragCases');
const { evaluateRagCases } = require('../evaluation/rag/evaluator');

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

const setup = c => store.configure({ vectorFailure: c.vectorFailure === true });
const getCatalog = () => store.find({}).lean();

describe('RAG evaluation — real productSearchService.search() vs fixtures', () => {
  let outcome;

  beforeAll(async () => {
    outcome = await evaluateRagCases(RAG_CASES, search, setup, getCatalog, generation);
  });

  it('evaluates every fixture case', () => {
    expect(outcome.report.totalCases).toBe(RAG_CASES.length);
    expect(outcome.results.length).toBe(RAG_CASES.length);
  });

  it('passes every case', () => {
    expect(outcome.report.passed).toBe(RAG_CASES.length);
  });

  it('never returns a forbidden product', () => {
    expect(outcome.report.forbiddenViolations).toBe(0);
    for (const r of outcome.results) {
      for (const id of r.forbiddenIds) {
        expect(r.retrievedIds).not.toContain(id);
      }
    }
  });

  it('achieves full recall on every case with ground truth', () => {
    for (const r of outcome.results) {
      if (r.relevantIds.length > 0) {
        expect(r.metrics.recallAtK).toBe(1);
      }
    }
  });

  it('is fully deterministic across two runs', () => {
    for (const r of outcome.results) {
      expect(r.stable).toBe(true);
    }
  });

  it('produces fully grounded answers', () => {
    for (const r of outcome.results) {
      expect(r.groundedness.score).toBe(1);
      expect(r.groundedness.unsupportedClaims).toBe(0);
    }
  });

  it('generates answers through the real production path (fake provider)', () => {
    expect(outcome.report.generationProviderCounts.OpenAI).toBe(RAG_CASES.length);
    for (const r of outcome.results) {
      expect(r.generated.provider).toBe('OpenAI');
      expect(r.generated.usesSystemMessage).toBe(true);
      expect(r.generated.messagesCount).toBe(2);
      expect(r.generated.groundedness.score).toBe(1);
      expect(r.generated.groundedness.unsupportedClaims).toBe(0);
    }
  });

  it('keeps the retrieved product context in the production system prompt', () => {
    expect(outcome.report.meanPromptGrounding).toBe(1);
    expect(outcome.report.promptGroundingFailures).toBe(0);
    expect(outcome.report.missingSystemMessage).toBe(0);
    for (const r of outcome.results) {
      if (r.retrievedIds.length > 0) {
        expect(r.generated.promptProductsFound).toBe(r.retrievedIds.length);
      }
      for (const id of r.retrievedIds) {
        expect(r.generated.systemPrompt).toContain(id);
      }
    }
  });

  it('streaming path carries the system message with product context', () => {
    expect(outcome.report.streamedMissingSystemMessage).toBe(0);
    for (const r of outcome.results) {
      expect(r.streamed.usesSystemMessage).toBe(true);
      expect(r.streamed.fullResponse).toBe(r.generated.text);
    }
  });

  it('exercises all three retrieval tiers', () => {
    const { vector, text, fallback } = outcome.report.modeCounts;
    expect(vector).toBeGreaterThan(0);
    expect(text).toBe(1);
    expect(fallback).toBe(1);
  });

  it('rag-text-007 uses the real text fallback tier', () => {
    const r = outcome.results.find(x => x.caseId === 'rag-text-007');
    expect(r.searchMode).toBe('text');
    expect(r.retrievedIds).toContain(IDS.S24);
    expect(r.retrievedIds).toContain(IDS.S24FE);
  });

  it('rag-no-result-008 ends empty in the fallback tier', () => {
    const r = outcome.results.find(x => x.caseId === 'rag-no-result-008');
    expect(r.searchMode).toBe('fallback');
    expect(r.retrievedIds).toEqual([]);
  });

  it('rag-excluded-brand-005 never returns an Apple product', () => {
    const r = outcome.results.find(x => x.caseId === 'rag-excluded-brand-005');
    for (const id of [IDS.IP15PM, IDS.IP16P, IDS.IPSE]) {
      expect(r.retrievedIds).not.toContain(id);
    }
  });

  it('aggregate metrics stay above regression thresholds', () => {
    expect(outcome.report.meanRecallAtK).toBeGreaterThanOrEqual(0.9);
    expect(outcome.report.meanPrecisionAtK).toBeGreaterThanOrEqual(0.7);
    expect(outcome.report.meanHitAtK).toBe(1);
    expect(outcome.report.meanGroundedness).toBe(1);
  });
});