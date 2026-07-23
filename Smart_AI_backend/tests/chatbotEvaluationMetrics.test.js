const {
  calculateConstraintMetrics,
  calculateRankingMetrics,
  calculateContextMetrics,
  calculateFallbackMetrics,
  calculateLatencyMetrics,
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
    expect(m.productPrecision).toBe(1);
    expect(m.totalCases).toBe(0);
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
