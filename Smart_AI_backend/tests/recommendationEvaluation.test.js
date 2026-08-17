const { createRecommendationStore, IDS } = require('../evaluation/recommendation/recommendationStore');
const { RECOMMENDATION_CASES } = require('../evaluation/chatbot/fixtures/recommendationCases');
const { evaluateRecommendationCases } = require('../evaluation/recommendation/engine');

const store = createRecommendationStore();
jest.doMock('../models/Product', () => store);

const { recommend } = require('../services/productRecommendationService');

const setup = c => store.configure({
  embedSourceId: c.sourceProductId,
  embedSource: c.embedSource !== false,
  vectorFailure: c.vectorFailure === true,
});

describe('recommendation evaluation — real recommend() vs fixtures', () => {
  let outcome;

  beforeAll(async () => {
    outcome = await evaluateRecommendationCases(RECOMMENDATION_CASES, recommend, setup);
  });

  it('evaluates every fixture case', () => {
    expect(outcome.report.totalCases).toBe(RECOMMENDATION_CASES.length);
    expect(outcome.results.length).toBe(RECOMMENDATION_CASES.length);
  });

  it('passes every case (safety + mode + determinism + no out-of-stock)', () => {
    expect(outcome.report.passed).toBe(RECOMMENDATION_CASES.length);
  });

  it('never returns an out-of-stock product', () => {
    expect(outcome.report.outOfStockReturned).toBe(0);
    for (const r of outcome.results) {
      expect(r.outOfStockReturned).toBe(0);
    }
  });

  it('satisfies hard constraints on every returned product (all modes)', () => {
    expect(outcome.report.hardConstraintSatisfaction).toBe(1);
  });

  it('is deterministic across two runs', () => {
    expect(outcome.report.determinismRate).toBe(1);
    for (const r of outcome.results) {
      expect(r.stable).toBe(true);
    }
  });

  it('exercises all three recommendation modes', () => {
    const { vector, brand_price, fallback } = outcome.report.modeCounts;
    expect(vector).toBeGreaterThan(0);
    expect(brand_price).toBeGreaterThan(0);
    expect(fallback).toBeGreaterThan(0);
  });

  it('respects the expected mode per case', () => {
    for (const r of outcome.results) {
      if (r.expectMode) expect(r.recommendationMode).toBe(r.expectMode);
    }
  });

  it('reco-vector-flagship-001 stays on the vector path', () => {
    const r = outcome.results.find(x => x.caseId === 'reco-vector-flagship-001');
    expect(r.recommendationMode).toBe('vector');
    expect(r.returnedIds).toContain(IDS.P9P);
  });

  it('reco-out-of-stock-005 never returns the out-of-stock Galaxy A05', () => {
    const r = outcome.results.find(x => x.caseId === 'reco-out-of-stock-005');
    expect(r.returnedIds).not.toContain(IDS.A05);
  });

  it('reco-brand-price-006 falls back to brand-price with the in-band phone', () => {
    const r = outcome.results.find(x => x.caseId === 'reco-brand-price-006');
    expect(r.recommendationMode).toBe('brand_price');
    expect(r.returnedIds).toEqual([IDS.S24FE]);
  });

  it('reco-latest-fallback-007 uses the latest-products fallback', () => {
    const r = outcome.results.find(x => x.caseId === 'reco-latest-fallback-007');
    expect(r.recommendationMode).toBe('fallback');
    expect(r.returnedIds.length).toBeGreaterThan(0);
  });

  it('reco-vector-throw-008 recovers to brand-price when vector search throws', () => {
    const r = outcome.results.find(x => x.caseId === 'reco-vector-throw-008');
    expect(r.recommendationMode).toBe('brand_price');
    expect(r.constraintSafe).toBe(true);
  });

  it('ranking quality stays above regression thresholds', () => {
    const { meanPrecisionAtK, meanRecallAtK, mrr, meanNdcgAtK, meanDistinctBrandRatio } = outcome.report;
    expect(meanPrecisionAtK).toBeGreaterThanOrEqual(0.7);
    expect(meanRecallAtK).toBeGreaterThanOrEqual(0.6);
    expect(mrr).toBeGreaterThanOrEqual(0.7);
    expect(meanNdcgAtK).toBeGreaterThanOrEqual(0.7);
    expect(meanDistinctBrandRatio).toBeGreaterThanOrEqual(0.4);
  });

  it('hard-constraint cases enforce brand and budget in the returned set', () => {
    const r = outcome.results.find(x => x.caseId === 'reco-brand-budget-004');
    expect(r.recommendationMode).toBe('vector');
    for (const id of r.returnedIds) {
      expect(id).toBe(IDS.IPSE);
    }
  });
});
