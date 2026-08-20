const { createRecommendationStore, IDS } = require('../evaluation/recommendation/recommendationStore');
const { createDeterministicEmbedding } = require('../evaluation/deterministicEmbedding');
const { PIPELINE_CASES } = require('../evaluation/pipeline/fixtures/pipelineCases');
const {
  evaluatePipelineCases,
  runPipelineForCase,
  searchLimitFor,
  RESPONSE_LIMIT,
} = require('../evaluation/pipeline/evaluator');
const { parseProductConstraints } = require('../utils/productConstraintParser');
const { matchesProductConstraints } = require('../utils/productValidator');
const { rankProducts } = require('../utils/productRanking');
const { resolveFollowUpQuery } = require('../utils/conversationContext');

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

const { search } = require('../services/productSearchService');

const buildDeps = (overrides = {}) => ({
  search,
  parse: parseProductConstraints,
  matches: matchesProductConstraints,
  rank: rankProducts,
  resolve: resolveFollowUpQuery,
  ...overrides,
});

const setup = c => store.configure({ vectorFailure: c.vectorFailure === true });

const caseById = id => PIPELINE_CASES.find(c => c.id === id);

describe('pipeline evaluation — real production pipeline vs fixtures', () => {
  let outcome;

  beforeAll(async () => {
    outcome = await evaluatePipelineCases(PIPELINE_CASES, buildDeps(), setup);
  });

  it('evaluates every fixture case', () => {
    expect(outcome.report.totalCases).toBe(18);
    expect(outcome.results.length).toBe(18);
    expect(PIPELINE_CASES).toHaveLength(18);
  });

  it('passes every case', () => {
    expect(outcome.report.passed).toBe(18);
    expect(outcome.report.failed).toBe(0);
  });

  it('never returns a forbidden product', () => {
    expect(outcome.report.forbiddenViolations).toBe(0);
    for (const r of outcome.results) {
      for (const id of r.forbiddenIds) {
        expect(r.retrievedIds).not.toContain(id);
      }
    }
  });

  it('achieves full recall on every non-empty case with ground truth', () => {
    for (const r of outcome.results) {
      if (!r.expectedEmpty && r.relevantIds.length > 0) {
        expect(r.metrics.recallAtK).toBe(1);
      }
    }
  });

  it('is fully deterministic across two runs', () => {
    expect(outcome.report.determinismFailures).toBe(0);
    for (const r of outcome.results) {
      expect(r.stable).toBe(true);
    }
  });

  it('every returned product passes the REAL matchesProductConstraints()', () => {
    expect(outcome.report.validatorSafetyFailures).toBe(0);
    for (const r of outcome.results) {
      expect(r.validatorSafety).toBe(true);
    }
  });

  it('exercises the vector and text tiers', () => {
    expect(outcome.report.modeCounts.vector).toBe(17);
    expect(outcome.report.modeCounts.text).toBe(1);
  });

  it('ranking gates are accurate when a preference is active', () => {
    expect(outcome.report.rankingTop1Accuracy).toBe(1);
    expect(outcome.report.pairwiseAccuracy).toBe(1);
  });
});

describe('pipeline wiring — parser -> search -> validator -> rank are connected', () => {
  it('injects the real production functions', () => {
    const deps = buildDeps();
    expect(deps.parse).toBe(parseProductConstraints);
    expect(deps.matches).toBe(matchesProductConstraints);
    expect(deps.rank).toBe(rankProducts);
    expect(deps.resolve).toBe(resolveFollowUpQuery);
    expect(typeof deps.search).toBe('function');
  });

  it('passes the parser-cleaned query and parsed filters into search()', async () => {
    const realSearch = search;
    const searchSpy = jest.fn((q, limit, filters) => realSearch(q, limit, filters));
    const deps = buildDeps({ search: searchSpy });

    await evaluatePipelineCases([caseById('pipe-brand-001')], deps, setup);

    const calls = searchSpy.mock.calls.filter(call => call[0] === 'galaxy');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][1]).toBe(10);
    expect(calls[0][2].brands).toEqual(['samsung']);
    expect(calls[0][2].minPrice).toBeNull();
    expect(calls[0][2].maxPrice).toBeNull();
  });

  it('widens the candidate window only when a preference is active (like the controller)', () => {
    expect(searchLimitFor(RESPONSE_LIMIT, null)).toBe(RESPONSE_LIMIT);
    expect(searchLimitFor(RESPONSE_LIMIT, { camera: false, battery: false, performance: false, compact: false })).toBe(RESPONSE_LIMIT);
    expect(searchLimitFor(RESPONSE_LIMIT, { camera: true, battery: false, performance: false, compact: false })).toBe(
      Math.min(Math.max(RESPONSE_LIMIT * 3, RESPONSE_LIMIT), 20)
    );
  });

  it('resolves multi-turn fixtures through the REAL resolveFollowUpQuery()', async () => {
    await setup(caseById('pipe-multiturn-color-015'));
    const run = await runPipelineForCase(buildDeps(), caseById('pipe-multiturn-color-015'));
    expect(run.effectiveFilters.brands).toEqual(['samsung']);
    expect(run.effectiveFilters.maxPrice).toBe(14_999_999);
    expect(run.effectiveFilters.colors).toEqual(['black']);
    expect(run.rankedIds).toEqual([IDS.A05]);
  });
});

describe('constraint semantics across the real pipeline', () => {
  it('exclusive "dưới 10 triệu" forbids iPhone SE at exactly 10,000,000', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-price-excl-002')], buildDeps(), setup)).results[0];
    expect(r.effectiveFilters.maxPrice).toBe(9_999_999);
    expect(r.retrievedIds).not.toContain(IDS.IPSE);
    expect(r.finalProductIds).not.toContain(IDS.IPSE);
  });

  it('inclusive "tối đa 10 triệu" makes iPhone SE relevant', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-price-incl-003')], buildDeps(), setup)).results[0];
    expect(r.effectiveFilters.maxPrice).toBe(10_000_000);
    expect(r.retrievedIds).toContain(IDS.IPSE);
  });

  it('exact RAM 8GB keeps only the five 8GB units and rejects every other product', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-ram-004')], buildDeps(), setup)).results[0];
    expect(r.retrievedIds.sort()).toEqual([IDS.S24, IDS.IP15PM, IDS.IP16P, IDS.RN13, IDS.S24FE].sort());
    for (const id of r.forbiddenIds) {
      expect(r.retrievedIds).not.toContain(id);
    }
  });

  it('min RAM 12GB keeps ZFOLD, X14T, OP12, P9P', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-ram-min-005')], buildDeps(), setup)).results[0];
    for (const id of [IDS.ZFOLD, IDS.X14T, IDS.OP12, IDS.P9P]) {
      expect(r.retrievedIds).toContain(id);
    }
  });

  it('exact storage 256GB keeps only the six 256GB units', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-storage-006')], buildDeps(), setup)).results[0];
    expect(r.retrievedIds.sort()).toEqual([IDS.S24, IDS.IP15PM, IDS.IP16P, IDS.RN13, IDS.X14T, IDS.S24FE].sort());
  });

  it('black color includes Midnight (IPSE) and Graphite (S24FE), excludes gray Titanium', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-color-007')], buildDeps(), setup)).results[0];
    for (const id of [IDS.S24, IDS.A05, IDS.IPSE, IDS.RN13, IDS.X14T, IDS.OP12, IDS.S24FE]) {
      expect(r.retrievedIds).toContain(id);
    }
    for (const id of [IDS.ZFOLD, IDS.IP15PM, IDS.IP16P, IDS.P9P, IDS.M34]) {
      expect(r.retrievedIds).not.toContain(id);
    }
  });

  it('brand exclusion never returns an Apple product', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-excluded-008')], buildDeps(), setup)).results[0];
    for (const id of [IDS.IP15PM, IDS.IP16P, IDS.IPSE]) {
      expect(r.retrievedIds).not.toContain(id);
    }
  });

  it('in-stock filter never returns the 0-stock Galaxy A05', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-instock-009')], buildDeps(), setup)).results[0];
    expect(r.retrievedIds).not.toContain(IDS.A05);
  });

  it('combined brand + price + color narrows to Galaxy A05 only', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-combined-010')], buildDeps(), setup)).results[0];
    expect(r.retrievedIds).toEqual([IDS.A05]);
  });

  it('no-result case ends empty after the whole pipeline', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-noresult-011')], buildDeps(), setup)).results[0];
    expect(r.retrievedIds).toEqual([]);
    expect(r.finalProductIds).toEqual([]);
  });

  it('preference ranking puts Galaxy S24 first for camera', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-rank-camera-012')], buildDeps(), setup)).results[0];
    expect(r.retrievedIds[0]).toBe(IDS.S24);
  });

  it('preference ranking puts Galaxy M34 first for battery', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-rank-battery-013')], buildDeps(), setup)).results[0];
    expect(r.retrievedIds[0]).toBe(IDS.M34);
  });

  it('text fallback tier retrieves both Galaxy S24 units when the vector tier throws', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-text-fallback-014')], buildDeps(), setup)).results[0];
    expect(r.searchMode).toBe('text');
    expect(r.retrievedIds).toContain(IDS.S24);
    expect(r.retrievedIds).toContain(IDS.S24FE);
  });

  it('multi-turn color follow-up merges into Samsung + budget + black', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-multiturn-color-015')], buildDeps(), setup)).results[0];
    expect(r.retrievedIds).toEqual([IDS.A05]);
  });

  it('multi-turn RAM follow-up inherits the previous 20M budget', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-multiturn-ram-016')], buildDeps(), setup)).results[0];
    expect(r.effectiveFilters.minRamGB).toBe(12);
    expect(r.effectiveFilters.maxPrice).toBe(19_999_999);
    expect(r.retrievedIds).toEqual([IDS.X14T]);
    expect(r.retrievedIds).not.toContain(IDS.ZFOLD);
  });

  it('out-of-stock query returns only the 0-stock Galaxy A05', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-hang-017')], buildDeps(), setup)).results[0];
    expect(r.effectiveFilters.inStock).toBe(false);
    expect(r.retrievedIds).toEqual([IDS.A05]);
  });

  it('multi-brand $in prefilter + inclusive budget keeps the right Xiaomi/Samsung set', async () => {
    const r = (await evaluatePipelineCases([caseById('pipe-multi-brand-price-018')], buildDeps(), setup)).results[0];
    expect(r.effectiveFilters.brands).toEqual(['samsung', 'xiaomi']);
    expect(r.effectiveFilters.maxPrice).toBe(12_000_000);
    for (const id of [IDS.A15, IDS.A05, IDS.M34, IDS.RN13, IDS.NOSPEC]) {
      expect(r.retrievedIds).toContain(id);
    }
    for (const id of [IDS.S24, IDS.ZFOLD, IDS.S24FE, IDS.X14T]) {
      expect(r.retrievedIds).not.toContain(id);
    }
  });
});

describe('negative tests — the evaluator FAILS when results are wrong', () => {
  it('the recall gate catches a pipeline that drops a relevant product', async () => {
    const realSearch = buildDeps().search;
    const deps = buildDeps({
      search: async (q, limit, filters) => {
        const res = await realSearch(q, limit, filters);
        return { ...res, products: (res.products || []).slice(0, 3) };
      },
    });
    const outcome = await evaluatePipelineCases([caseById('pipe-brand-001')], deps, setup);
    expect(outcome.results[0].passed).toBe(false);
    expect(outcome.results[0].metrics.recallAtK).toBeLessThan(1);
  });

  it('a wrong expectedTop fails the ranking gate', async () => {
    const broken = { ...caseById('pipe-rank-camera-012'), expectedTop: IDS.A15 };
    const outcome = await evaluatePipelineCases([broken], buildDeps(), setup);
    expect(outcome.results[0].passed).toBe(false);
    expect(outcome.results[0].ranking.topOk).toBe(false);
  });

  it('a forbidden product wrongly marked relevant fails the recall gate', async () => {
    const broken = {
      ...caseById('pipe-price-excl-002'),
      relevantIds: [...caseById('pipe-price-excl-002').relevantIds, IDS.IPSE],
    };
    const outcome = await evaluatePipelineCases([broken], buildDeps(), setup);
    expect(outcome.results[0].passed).toBe(false);
    expect(outcome.results[0].metrics.recallAtK).toBeLessThan(1);
  });

  it('a parser that drops constraints breaks the pipeline (parser -> search coupling)', async () => {
    const deps = buildDeps({
      parse: () => ({ cleanedQuery: 'điện thoại', filters: null, preferences: null }),
    });
    const outcome = await evaluatePipelineCases([caseById('pipe-brand-001')], deps, setup);
    expect(outcome.results[0].passed).toBe(false);
    expect(outcome.results[0].metrics.recallAtK).toBeLessThan(1);
  });

  it('a validator that accepts everything lets forbidden products through', async () => {
    const deps = buildDeps({ matches: () => true });
    const outcome = await evaluatePipelineCases([caseById('pipe-ram-004')], deps, setup);
    expect(outcome.results[0].passed).toBe(false);
    expect(
      outcome.results[0].forbiddenIds.some(id => outcome.results[0].retrievedIds.includes(id))
    ).toBe(true);
  });

  it('an empty case that returns products fails', async () => {
    const deps = buildDeps({
      parse: () => ({ cleanedQuery: 'điện thoại', filters: null, preferences: null }),
    });
    const outcome = await evaluatePipelineCases([caseById('pipe-noresult-011')], deps, setup);
    expect(outcome.results[0].passed).toBe(false);
    expect(outcome.results[0].retrievedIds.length).toBeGreaterThan(0);
  });

  it('a wrong expected mode fails', async () => {
    const broken = { ...caseById('pipe-brand-001'), expectedMode: 'fallback' };
    const outcome = await evaluatePipelineCases([broken], buildDeps(), setup);
    expect(outcome.results[0].passed).toBe(false);
  });

  it('a broken ranker (no preference handling) fails the top-1 gate', async () => {
    const deps = buildDeps({
      rank: products => ({ ranked: products, explanations: products.map(() => []) }),
    });
    const outcome = await evaluatePipelineCases([caseById('pipe-rank-battery-013')], deps, setup);
    expect(outcome.results[0].passed).toBe(false);
  });
});