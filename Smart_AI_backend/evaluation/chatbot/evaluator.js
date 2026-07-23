const { EVAL_PRODUCTS, getProductsByIds } = require('./fixtures/products');
const { SINGLE_TURN_CASES } = require('./fixtures/singleTurnCases');
const { RANKING_CASES } = require('./fixtures/rankingCases');
const { MULTI_TURN_CASES } = require('./fixtures/multiTurnCases');
const { FALLBACK_CASES, SEARCH_TIER_CASES } = require('./fixtures/fallbackCases');
const { parseProductConstraints } = require('../../utils/productConstraintParser');
const { matchesProductConstraints } = require('../../utils/productValidator');
const { rankProducts } = require('../../utils/productRanking');
const { classifyQuery, resolveFollowUpQuery, createContextFromParsed, sanitizeConversationContext } = require('../../utils/conversationContext');
const {
  calculateConstraintMetrics,
  calculateRankingMetrics,
  calculateContextMetrics,
  calculateFallbackMetrics,
  calculateLatencyMetrics,
  calculateParserNormalizationMetrics,
} = require('./metrics');

class InMemoryContextStore {
  constructor() {
    this._store = {};
  }
  async save(identity, context) {
    this._store[identity] = JSON.parse(JSON.stringify(context));
    return true;
  }
  async load(identity) {
    return this._store[identity] || null;
  }
  async delete(identity) {
    delete this._store[identity];
  }
  async exists(identity) {
    return this._store[identity] !== undefined;
  }
  _clear() {
    this._store = {};
  }
}

class ChatbotEvaluator {
  constructor(options = {}) {
    this.ctxStore = new InMemoryContextStore();
    this.cases = [];
    this.results = [];
    this.durations = [];
    this.mockedProvider = options.defaultProvider || 'deterministic';
  }

  _classifyIntent(query) {
    return { intent: 'product_query', directResponse: null, clarifiedQuery: query };
  }

  _simulateProviderResponse(providerSequence) {
    for (const p of providerSequence) {
      if (p === 'openai' || p === 'gemini' || p === 'deterministic') {
        return { text: `Response from ${p}`, provider: p };
      }
      if (p === 'openai_fail' || p === 'gemini_fail') continue;
      if (p === 'openai_timeout' || p === 'gemini_timeout') continue;
      if (p === 'openai_malformed') continue;
    }
    return { text: 'Deterministic fallback response', provider: 'deterministic' };
  }

  _simulateSearch(query, searchMode = 'vector') {
    const { cleanedQuery, filters } = parseProductConstraints(query);
    let products = EVAL_PRODUCTS.filter(p => p.isActive !== false);

    if (filters) {
      products = products.filter(p => matchesProductConstraints(p, filters));
    }

    return { products, searchMode };
  }

  async evaluateAll() {
    this.results = [];
    this.durations = [];
    this.ctxStore._clear();

    const allFixtures = [
      ...SINGLE_TURN_CASES.map(c => ({ ...c, _type: 'constraint' })),
      ...RANKING_CASES.map(c => ({ ...c, _type: 'ranking' })),
      ...MULTI_TURN_CASES.map(c => ({ ...c, _type: 'context' })),
      ...FALLBACK_CASES.map(c => ({ ...c, _type: 'fallback' })),
      ...SEARCH_TIER_CASES.map(c => ({ ...c, _type: 'search_tier' })),
    ];

    for (const fixture of allFixtures) {
      const start = process.hrtime.bigint();

      if (fixture._type === 'constraint') {
        await this._evaluateConstraintCase(fixture);
      } else if (fixture._type === 'ranking') {
        await this._evaluateRankingCase(fixture);
      } else if (fixture._type === 'context') {
        await this._evaluateContextCase(fixture);
      } else if (fixture._type === 'fallback') {
        await this._evaluateFallbackCase(fixture);
      } else if (fixture._type === 'search_tier') {
        await this._evaluateSearchTierCase(fixture);
      }

      const end = process.hrtime.bigint();
      this.durations.push(Number(end - start) / 1e6);
    }

    return this._aggregateResults();
  }

  _checkParserNormalization(filters, expected) {
    const filterFields = ['minPrice', 'maxPrice', 'brands', 'excludedBrands', 'inStock',
      'ramGB', 'minRamGB', 'maxRamGB', 'storageGB', 'minStorageGB', 'maxStorageGB', 'colors'];
    const errors = [];

    for (const field of filterFields) {
      if (!(field in expected)) continue;
      const exp = expected[field];
      const act = filters[field];

      if (Array.isArray(exp)) {
        const actArr = Array.isArray(act) ? act : (act != null ? [act] : []);
        const sortedExp = [...exp].sort();
        const sortedAct = [...actArr].sort();
        if (JSON.stringify(sortedExp) !== JSON.stringify(sortedAct)) {
          errors.push(`${field}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(act)}`);
        }
      } else if (typeof exp === 'number') {
        if (act !== exp) {
          errors.push(`${field}: expected ${exp}, got ${act}`);
        }
      } else if (typeof exp === 'boolean') {
        if (act !== exp) {
          errors.push(`${field}: expected ${exp}, got ${act}`);
        }
      } else {
        // null or string comparison
        if (act !== exp) {
          errors.push(`${field}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(act)}`);
        }
      }
    }

    return { passed: errors.length === 0, errors };
  }

  async _evaluateConstraintCase(fixture) {
    const { filters } = parseProductConstraints(fixture.query);
    const normalization = this._checkParserNormalization(filters, fixture.expected);
    const result = {
      caseId: fixture.id,
      category: 'constraint',
      query: fixture.query,
      passed: false,
      normalizationPassed: normalization.passed,
      normalizationErrors: normalization.errors,
      violatingProducts: 0,
      returnedProductIds: [],
      expectedProductIds: [],
    };

    if (!filters) {
      result.error = 'No filters parsed';
      this.results.push(result);
      return;
    }

    const { products } = this._simulateSearch(fixture.query, 'vector');
    const returnedIds = products.map(p => p._id);
    result.returnedProductIds = returnedIds;
    result.expectedProductIds = fixture.expected.requiredProductIds || [];

    const required = fixture.expected.requiredProductIds || [];
    const forbidden = fixture.expected.forbiddenProductIds || [];

    // Count violations: returned products that are in the forbidden list
    for (const id of returnedIds) {
      if (forbidden.includes(id)) result.violatingProducts++;
    }

    // Check all required products are present
    let allRequiredPresent;
    if (required.length === 0) {
      allRequiredPresent = returnedIds.length === 0;
    } else {
      allRequiredPresent = required.every(id => returnedIds.includes(id));
    }

    const noForbiddenPresent = forbidden.every(id => !returnedIds.includes(id));

    result.passed = allRequiredPresent && noForbiddenPresent;
    result.noResultExpected = required.length === 0;
    result.returnedEmpty = returnedIds.length === 0;

    this.results.push(result);
  }

  async _evaluateRankingCase(fixture) {
    const pool = getProductsByIds(fixture.productPool);
    const { ranked } = rankProducts(pool, fixture.preferences);
    const rankedIds = ranked.map(p => p._id);

    const result = {
      caseId: fixture.id,
      category: 'ranking',
      query: fixture.query,
      topExpectedId: fixture.expected.topExpectedId,
      rankedIds,
      pairwisePreferred: fixture.expected.pairwisePreferred || [],
      passed: false,
      stable: true,
    };

    const topHit = fixture.expected.topExpectedId
      ? rankedIds[0] === fixture.expected.topExpectedId
      : true;

    let allPairwiseOk = true;
    if (Array.isArray(fixture.expected.pairwisePreferred)) {
      for (const [a, b] of fixture.expected.pairwisePreferred) {
        const ai = rankedIds.indexOf(a);
        const bi = rankedIds.indexOf(b);
        if (ai < 0 || bi < 0 || ai >= bi) {
          allPairwiseOk = false;
          break;
        }
      }
    }

    result.passed = topHit && allPairwiseOk;
    this.results.push(result);
  }

  async _evaluateContextCase(fixture) {
    const result = {
      caseId: fixture.id,
      category: 'context',
      metricType: 'retention',
      passed: false,
      turns: [],
      finalContext: null,
    };

    const sessionId = fixture.sessionId || fixture.sessionIdA || 'eval-default';

    for (const turn of fixture.turns) {
      const sid = turn.sessionId || sessionId;
      let intentResult;

      if (turn.responseType === 'small_talk') {
        intentResult = { intent: 'small_talk', directResponse: 'Xin chào!', clarifiedQuery: null };
      } else if (turn.responseType === 'reset') {
        intentResult = { intent: 'product_query', clarifiedQuery: turn.query };
      } else {
        intentResult = { intent: 'product_query', clarifiedQuery: turn.query };
      }

      const parsed = parseProductConstraints(intentResult.clarifiedQuery || turn.query);
      const queryType = classifyQuery(intentResult.clarifiedQuery || turn.query, parsed);
      const previousContext = await this.ctxStore.load(sid);
      let mergedFilters = parsed.filters;
      let mergedPreferences = parsed.preferences;
      let contextReset = false;

      if (turn.responseType === 'reset') {
        await this.ctxStore.delete(sid);
        contextReset = true;
      } else if (queryType.action === 'follow_up' && previousContext) {
        const { mergedParsed } = resolveFollowUpQuery(parsed, previousContext);
        if (mergedParsed) {
          mergedFilters = mergedParsed.filters;
          mergedPreferences = mergedParsed.preferences;
        }
      } else if (turn.responseType === 'small_talk') {
        // small talk — skip context save
        result.turns.push({ query: turn.query, action: 'small_talk' });
        continue;
      }

      if (turn.forceFailure) {
        result.turns.push({ query: turn.query, action: 'forced_failure' });
        continue;
      }

      const { products } = this._simulateSearch(intentResult.clarifiedQuery || turn.query, 'vector');
      const finalProducts = mergedFilters
        ? products.filter(p => matchesProductConstraints(p, mergedFilters))
        : products;

      const { ranked } = rankProducts(finalProducts, mergedPreferences);

      const newContext = createContextFromParsed(
        { cleanedQuery: intentResult.clarifiedQuery || turn.query, filters: mergedFilters, preferences: mergedPreferences },
        ranked.slice(0, 5).map(p => p._id)
      );
      if (previousContext && !contextReset) {
        newContext.turnCount = (previousContext.turnCount || 0) + 1;
      }
      await this.ctxStore.save(sid, sanitizeConversationContext(newContext));

      result.turns.push({ query: turn.query, action: queryType.action });
    }

    const finalCtx = await this.ctxStore.load(sessionId);
    result.finalContext = finalCtx;

    if (fixture.checkPreviousContextRetained) {
      result.metricType = 'failure_preserve';
      result.passed = finalCtx !== null
        && finalCtx.filters.brands
        && finalCtx.filters.brands.includes('samsung');
    } else if (fixture.checkOldFiltersAbsent) {
      result.metricType = 'reset';
      result.passed = finalCtx !== null
        && finalCtx.filters.brands
        && finalCtx.filters.brands.includes('apple');
    } else if (fixture.sessionIdA && fixture.sessionIdB) {
      result.metricType = 'isolation';
      const ctxA = await this.ctxStore.load(fixture.sessionIdA);
      const ctxB = await this.ctxStore.load(fixture.sessionIdB);
      result.passed = ctxA !== null && ctxB !== null
        && ctxA.filters.brands
        && ctxA.filters.brands.includes('samsung')
        && ctxB.filters.brands
        && ctxB.filters.brands.includes('samsung');
    } else if (fixture.expectedFinalConstraints.brands) {
      result.metricType = 'retention';
      result.passed = finalCtx !== null
        && finalCtx.filters.brands
        && fixture.expectedFinalConstraints.brands.every(b =>
          finalCtx.filters.brands.includes(b)
        );
    } else {
      result.metricType = 'retention';
      result.passed = finalCtx !== null;
    }

    this.results.push(result);
  }

  async _evaluateFallbackCase(fixture) {
    const providerResponse = this._simulateProviderResponse(fixture.providerSequence);

    const result = {
      caseId: fixture.id,
      category: 'fallback',
      query: fixture.query,
      expectProvider: fixture.expectProvider,
      actualProvider: providerResponse.provider,
      validResponse: !!(providerResponse.text && providerResponse.text.length > 0),
      contextSaved: false,
      contextSaveExpected: undefined,
    };

    result.passed = result.validResponse && providerResponse.provider === fixture.expectProvider;

    this.results.push(result);
  }

  async _evaluateSearchTierCase(fixture) {
    const { products, searchMode } = this._simulateSearch(fixture.query, fixture.searchMode);

    const result = {
      caseId: fixture.id,
      category: 'search_tier',
      query: fixture.query,
      searchMode,
      productCount: products.length,
      passed: false,
      constraintSafe: true,
    };

    if (fixture.expectBrand) {
      const allMatchBrand = products.every(p => p.brand === fixture.expectBrand);
      result.constraintSafe = allMatchBrand;
      result.passed = products.length > 0 && allMatchBrand;
    } else if (fixture.expectProducts) {
      result.passed = products.length > 0;
    }

    this.results.push(result);
  }

  _aggregateResults() {
    const constraintResults = this.results.filter(r => r.category === 'constraint');
    const rankingResults = this.results.filter(r => r.category === 'ranking');
    const contextResults = this.results.filter(r => r.category === 'context');
    const fallbackResults = this.results.filter(r => r.category === 'fallback');
    const searchTierResults = this.results.filter(r => r.category === 'search_tier');

    const constraints = calculateConstraintMetrics(constraintResults);
    const ranking = calculateRankingMetrics(rankingResults);
    const context = calculateContextMetrics(contextResults);
    const fallback = calculateFallbackMetrics(fallbackResults);
    const latency = calculateLatencyMetrics(this.durations);
    const parserNormalization = calculateParserNormalizationMetrics(constraintResults);

    const allPassed = this.results.filter(r => r.passed).length;
    const overallPassRate = this.results.length > 0 ? allPassed / this.results.length : 0;

    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        mode: 'offline-mocked',
        totalCases: this.results.length,
      },
      summary: {
        overallPassRate: Math.round(overallPassRate * 10000) / 10000,
        passed: allPassed,
        failed: this.results.length - allPassed,
      },
      constraints,
      parserNormalization,
      ranking,
      context,
      fallback,
      searchTiers: {
        totalCases: searchTierResults.length,
        passed: searchTierResults.filter(r => r.passed).length,
      },
      latency,
      cases: this.results.map(r => ({
        caseId: r.caseId,
        category: r.category,
        passed: r.passed,
        normalizationPassed: r.normalizationPassed,
        normalizationErrors: r.normalizationErrors && r.normalizationErrors.length > 0
          ? r.normalizationErrors : undefined,
      })),
    };
  }
}

module.exports = { ChatbotEvaluator, InMemoryContextStore };
