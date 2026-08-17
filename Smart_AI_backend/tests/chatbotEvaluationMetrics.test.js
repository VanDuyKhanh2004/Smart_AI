const {
  calculateConstraintMetrics,
  calculateRankingMetrics,
  calculateContextMetrics,
  calculateFallbackMetrics,
  calculateLatencyMetrics,
  calculateRecommendationMetrics,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  ndcgAtK,
  distinctBrandRatio,
} = require('../evaluation/chatbot/metrics');

describe('calculateConstraintMetrics', () => {
  it('all pass case', () => {
    const results = [
      { passed: true, violatingProducts: 0, returnedProductIds: ['a', 'b'], noResultExpected: false },
      { passed: true, violatingProducts: 0, returnedProductIds: ['c'], noResultExpected: false },
    ];
    const m = calculateConstraintMetrics(results);
    expect(m.caseAccuracy).toBe(1);
    expect(m.productPrecision).toBe(1);
    expect(m.violatingProductCount).toBe(0);
  });

  it('violations reduce score', () => {
    const results = [
      { passed: true, violatingProducts: 0, returnedProductIds: ['a', 'b'], noResultExpected: false },
      { passed: false, violatingProducts: 1, returnedProductIds: ['c', 'd'], noResultExpected: false },
    ];
    const m = calculateConstraintMetrics(results);
    expect(m.caseAccuracy).toBe(0.5);
    expect(m.productPrecision).toBeLessThan(1);
    expect(m.violatingProductCount).toBe(1);
  });

  it('empty results handled safely', () => {
    const m = calculateConstraintMetrics([]);
    expect(m.caseAccuracy).toBe(0);
    expect(m.productPrecision).toBe(null);
    expect(m.totalCases).toBe(0);
  });

  it('no-result honesty rate is null when no no-result cases exist', () => {
    const m = calculateConstraintMetrics([
      { passed: true, violatingProducts: 0, returnedProductIds: ['a'], noResultExpected: false },
    ]);
    expect(m.noResultHonestyRate).toBe(null);
  });

  it('product precision is null when nothing was returned', () => {
    const m = calculateConstraintMetrics([
      { passed: false, violatingProducts: 0, returnedProductIds: [], noResultExpected: true, returnedEmpty: true },
    ]);
    expect(m.productPrecision).toBe(null);
  });

  it('no NaN or Infinity', () => {
    const m = calculateConstraintMetrics([{ passed: true, violatingProducts: 0, returnedProductIds: [], noResultExpected: false }]);
    const values = Object.values(m);
    values.forEach(v => {
      if (typeof v === 'number') {
        expect(isNaN(v)).toBe(false);
        expect(isFinite(v)).toBe(true);
      }
    });
  });
});

describe('calculateRankingMetrics', () => {
  it('top-1 accuracy', () => {
    const results = [
      { topExpectedId: 'a', rankedIds: ['a', 'b', 'c'], pairwisePreferred: [], stable: true },
      { topExpectedId: 'b', rankedIds: ['a', 'b', 'c'], pairwisePreferred: [], stable: true },
      { topExpectedId: 'c', rankedIds: ['c', 'a', 'b'], pairwisePreferred: [], stable: true },
    ];
    const m = calculateRankingMetrics(results);
    expect(m.top1Accuracy).toBe(2 / 3);
  });

  it('mean reciprocal rank', () => {
    const results = [
      { topExpectedId: 'c', rankedIds: ['a', 'b', 'c'], pairwisePreferred: [], stable: true },
    ];
    const m = calculateRankingMetrics(results);
    expect(m.meanReciprocalRank).toBeCloseTo(1 / 3, 5);
  });

  it('pairwise ranking accuracy', () => {
    const results = [
      {
        topExpectedId: 'a', rankedIds: ['a', 'b', 'c'],
        pairwisePreferred: [['a', 'b'], ['a', 'c'], ['b', 'c']],
        stable: true,
      },
    ];
    const m = calculateRankingMetrics(results);
    expect(m.pairwiseRankingAccuracy).toBe(1);
  });

  it('empty results handled safely', () => {
    const m = calculateRankingMetrics([]);
    expect(m.top1Accuracy).toBe(0);
    expect(m.meanReciprocalRank).toBe(0);
    expect(m.totalCases).toBe(0);
  });

  it('pairwise ranking accuracy is null when no pairs are defined', () => {
    const m = calculateRankingMetrics([
      { topExpectedId: 'a', rankedIds: ['a', 'b'], pairwisePreferred: [], stable: true },
    ]);
    expect(m.pairwiseRankingAccuracy).toBe(null);
  });

  it('deterministic output', () => {
    const results = [
      { topExpectedId: 'a', rankedIds: ['a', 'b'], pairwisePreferred: [['a', 'b']], stable: true },
    ];
    const m1 = calculateRankingMetrics(JSON.parse(JSON.stringify(results)));
    const m2 = calculateRankingMetrics(JSON.parse(JSON.stringify(results)));
    expect(m1).toEqual(m2);
  });
});

describe('calculateContextMetrics', () => {
  it('retention score', () => {
    const results = [
      { metricType: 'retention', passed: true },
      { metricType: 'retention', passed: true },
      { metricType: 'retention', passed: false },
    ];
    const m = calculateContextMetrics(results);
    expect(m.retentionAccuracy).toBe(2 / 3);
  });

  it('reset score', () => {
    const results = [
      { metricType: 'reset', passed: true },
    ];
    const m = calculateContextMetrics(results);
    expect(m.resetAccuracy).toBe(1);
  });

  it('empty results handled safely', () => {
    const m = calculateContextMetrics([]);
    expect(m.retentionAccuracy).toBe(0);
    expect(m.totalCases).toBe(0);
  });
});

describe('calculateFallbackMetrics', () => {
  it('success score', () => {
    const results = [
      { validResponse: true, expectProvider: 'deterministic', actualProvider: 'deterministic', contextSaved: true, contextSaveExpected: true },
    ];
    const m = calculateFallbackMetrics(results);
    expect(m.validResponseRate).toBe(1);
    expect(m.deterministicFallbackSuccessRate).toBe(1);
  });

  it('failure preserves context', () => {
    const results = [
      { validResponse: true, expectProvider: 'deterministic', actualProvider: 'deterministic', contextSaved: false, contextSaveExpected: false },
    ];
    const m = calculateFallbackMetrics(results);
    expect(m.contextNotSavedOnFailureRate).toBe(1);
  });

  it('deterministic success is null when no deterministic cases exist', () => {
    const m = calculateFallbackMetrics([
      { validResponse: true, expectProvider: 'openai', actualProvider: 'openai' },
    ]);
    expect(m.deterministicFallbackSuccessRate).toBe(null);
  });

  it('constraintSafetyUnderFallback is computed, not fabricated', () => {
    const results = [
      { validResponse: true, constraintSafe: true },
      { validResponse: true, constraintSafe: false },
    ];
    const m = calculateFallbackMetrics(results);
    expect(m.constraintSafetyUnderFallback).toBe(0.5);
  });

  it('constraintSafetyUnderFallback is null when no constraint data exists', () => {
    const m = calculateFallbackMetrics([{ validResponse: true }]);
    expect(m.constraintSafetyUnderFallback).toBe(null);
  });

  it('context-save rates are null when not measured', () => {
    const m = calculateFallbackMetrics([{ validResponse: true }]);
    expect(m.contextSaveOnValidResponseRate).toBe(null);
    expect(m.contextNotSavedOnFailureRate).toBe(null);
  });
});

describe('calculateContextMetrics', () => {
  it('absent metric types report null instead of a fabricated 1.0', () => {
    const m = calculateContextMetrics([{ metricType: 'retention', passed: true }]);
    expect(m.retentionAccuracy).toBe(1);
    expect(m.replacementAccuracy).toBe(null);
    expect(m.resetAccuracy).toBe(null);
    expect(m.isolationAccuracy).toBe(null);
  });
});

describe('calculateLatencyMetrics', () => {
  it('percentiles', () => {
    const durations = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const m = calculateLatencyMetrics(durations);
    expect(m.averageMs).toBe(5.5);
    expect(m.p50Ms).toBe(5);
    expect(m.p95Ms).toBe(9);
    expect(m.maxMs).toBe(10);
    expect(m.label).toBe('offline simulated');
  });

  it('empty handled safely', () => {
    const m = calculateLatencyMetrics([]);
    expect(m.averageMs).toBe(0);
    expect(m.count).toBe(0);
  });

  it('no NaN or Infinity', () => {
    const m = calculateLatencyMetrics([1, 2, 3]);
    const values = Object.values(m);
    values.forEach(v => {
      if (typeof v === 'number') {
        expect(isNaN(v)).toBe(false);
        expect(isFinite(v)).toBe(true);
      }
    });
  });
});

describe('recommendation ranking metrics', () => {
  const base = {
    caseId: 'c1',
    limit: 5,
    returnedIds: ['a', 'b', 'c', 'd', 'e'],
    returnedProducts: [
      { _id: 'a', brand: 'apple' },
      { _id: 'b', brand: 'samsung' },
      { _id: 'c', brand: 'samsung' },
      { _id: 'd', brand: 'xiaomi' },
      { _id: 'e', brand: 'oneplus' },
    ],
    relevantIds: ['a', 'c', 'e'],
  };

  it('precisionAtK', () => {
    expect(precisionAtK(base)).toBe(3 / 5);
    expect(precisionAtK({ ...base, relevantIds: ['x', 'y'] })).toBe(0);
  });

  it('recallAtK', () => {
    expect(recallAtK(base)).toBe(3 / 3);
    expect(recallAtK({ ...base, relevantIds: ['a', 'c', 'e', 'f'] })).toBe(3 / 4);
  });

  it('reciprocalRank', () => {
    expect(reciprocalRank(base)).toBe(1);
    expect(reciprocalRank({ ...base, returnedIds: ['x', 'a', 'b'] })).toBe(0.5);
    expect(reciprocalRank({ ...base, returnedIds: ['x', 'y'] })).toBe(0);
  });

  it('ndcgAtK with binary relevance', () => {
    // ideal order (all relevant first) -> NDCG 1
    expect(ndcgAtK({ ...base, returnedIds: ['a', 'c', 'e', 'x', 'y'] })).toBeCloseTo(1, 5);
    // relevant at ranks 1,3,5 with non-relevant interspersed
    expect(ndcgAtK(base)).toBeGreaterThan(0.85);
    expect(ndcgAtK(base)).toBeLessThan(1);
    // relevant only at the end of a 5-list
    const worst = ndcgAtK({ ...base, returnedIds: ['x', 'y', 'z', 'w', 'a'] });
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThan(1);
  });

  it('distinctBrandRatio', () => {
    expect(distinctBrandRatio(base)).toBe(4 / 5);
    expect(distinctBrandRatio({ ...base, returnedProducts: base.returnedProducts.slice(0, 2) })).toBe(1);
  });

  it('missing ground truth returns null, never a fake 1', () => {
    expect(precisionAtK({ ...base, relevantIds: undefined })).toBe(null);
    expect(recallAtK({ ...base, relevantIds: [] })).toBe(null);
    expect(reciprocalRank({ ...base, relevantIds: undefined })).toBe(null);
    expect(ndcgAtK({ ...base, relevantIds: undefined })).toBe(null);
    expect(distinctBrandRatio({ ...base, returnedIds: [] })).toBe(null);
  });

  it('aggregate recommendation metrics', () => {
    const results = [
      {
        caseId: 'r1', limit: 5,
        returnedIds: ['a'], returnedProducts: [{ _id: 'a', brand: 'apple' }],
        relevantIds: ['a'], recommendationMode: 'vector',
        constraintSafe: true, outOfStockReturned: 0, stable: true, passed: true,
      },
      {
        caseId: 'r2', limit: 5,
        returnedIds: ['x'], returnedProducts: [{ _id: 'x', brand: 'samsung' }],
        relevantIds: ['x'], recommendationMode: 'brand_price',
        constraintSafe: true, outOfStockReturned: 0, stable: true, passed: true,
      },
    ];
    const m = calculateRecommendationMetrics(results);
    expect(m.totalCases).toBe(2);
    expect(m.passed).toBe(2);
    expect(m.hardConstraintSatisfaction).toBe(1);
    expect(m.outOfStockReturned).toBe(0);
    expect(m.determinismRate).toBe(1);
    expect(m.modeCounts).toEqual({ vector: 1, brand_price: 1, fallback: 0 });
    expect(m.mrr).toBe(1);
    expect(m.meanPrecisionAtK).toBe(1);
    expect(m.meanRecallAtK).toBe(1);
    expect(m.meanDistinctBrandRatio).toBe(1);
  });

  it('constraint violations reduce safety and determinism', () => {
    const results = [
      { caseId: 'r1', limit: 5, returnedIds: ['a'], returnedProducts: [{ _id: 'a', brand: 'samsung' }], relevantIds: ['a'], recommendationMode: 'vector', constraintSafe: false, outOfStockReturned: 1, stable: false, passed: false },
    ];
    const m = calculateRecommendationMetrics(results);
    expect(m.hardConstraintSatisfaction).toBe(0);
    expect(m.outOfStockReturned).toBe(1);
    expect(m.determinismRate).toBe(0);
    expect(m.passed).toBe(0);
  });

  it('empty recommendation results handled safely', () => {
    const m = calculateRecommendationMetrics([]);
    expect(m.totalCases).toBe(0);
    expect(m.hardConstraintSatisfaction).toBe(null);
    expect(m.mrr).toBe(null);
  });
});
