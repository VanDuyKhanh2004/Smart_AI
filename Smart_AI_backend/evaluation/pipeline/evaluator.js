/**
 * Constraint Pipeline end-to-end evaluation engine (offline, deterministic).
 *
 * Runs the FULL production product-query pipeline the way the controller does:
 *   parseProductConstraints(query)
 *     -> (optional) resolveFollowUpQuery() for multi-turn fixtures
 *     -> productSearchService.search(cleanedQuery, K, effectiveFilters)
 *     -> matchesProductConstraints(...)   JS-only gate (RAM/storage/color/...)
 *     -> rankProducts(...)                soft-preferences ordering
 *     -> top-5 response slice             (what the production caller surfaces)
 *
 * The search function runs the REAL services/productSearchService.search()
 * against the fixture-backed Product store with the deterministic embedding
 * override installed — the same "inject before require" pattern used by the
 * RAG evaluation (evaluation/rag/runRagEvaluation.js).
 *
 * All production decision functions are injected via `deps` so both the Jest
 * suite (jest.doMock) and the CLI (require.cache override) can run the same
 * engine offline:
 *   deps = { search, parse, matches, rank, resolve }
 * The evaluator only ORCHESTRATES the pipeline — it never re-implements any
 * parser/validator/ranker logic.
 */

const { computeRetrievalMetrics } = require('../rag/retrievalMetrics');
const { classifyQuery, createContextFromParsed } = require('../../utils/conversationContext');

const RESPONSE_LIMIT = 5;

const hasAnyPreference = prefs =>
  Boolean(prefs && (prefs.camera || prefs.battery || prefs.performance || prefs.compact));

/**
 * Mirror chatController.searchRelevantProducts(): when any soft preference is
 * active the candidate search window is widened so ranking has variety.
 */
function searchLimitFor(limit, preferences) {
  return hasAnyPreference(preferences)
    ? Math.min(Math.max(limit * 3, limit), 20)
    : limit;
}

/**
 * Resolve the effective parsed query for a fixture, replicating the controller's
 * multi-turn context flow with the REAL production functions.
 */
function resolveEffectiveParsed(fixture, parse, resolve) {
  if (Array.isArray(fixture.turns) && fixture.turns.length > 0) {
    let current = parse(fixture.turns[0].query);
    let previousContext = createContextFromParsed(current);

    for (let i = 1; i < fixture.turns.length; i += 1) {
      const turn = fixture.turns[i];
      const parsed = parse(turn.query);
      const queryType = classifyQuery(turn.query, parsed);
      if (queryType.action === 'follow_up' && previousContext) {
        const { mergedParsed } = resolve(parsed, previousContext);
        current = mergedParsed;
      } else {
        current = parsed;
      }
      previousContext = createContextFromParsed(current);
    }

    return current;
  }

  const parsed = parse(fixture.query);
  return {
    cleanedQuery: parsed.cleanedQuery,
    filters: fixture.mergedFilters || parsed.filters,
    preferences: fixture.mergedPreferences || parsed.preferences,
  };
}

/**
 * Run the pipeline for one case. Returns the raw search result plus every
 * intermediate/final set the evaluator gates on.
 */
async function runPipelineForCase(deps, fixture) {
  const { search, parse, matches, rank, resolve } = deps;
  const limit = fixture.limit || RESPONSE_LIMIT;

  const parsed = resolveEffectiveParsed(fixture, parse, resolve);
  const cleanedQuery = parsed.cleanedQuery || fixture.query || '';
  const effectiveFilters = parsed.filters || null;
  const effectivePreferences = parsed.preferences || null;

  const searchLimit = searchLimitFor(limit, effectivePreferences);
  const result = await search(cleanedQuery, searchLimit, effectiveFilters);

  // Final validation gate — the same JS-only filters production applies to
  // products that slip past MongoDB-level filtering (RAM/storage/color/...).
  const filtered = effectiveFilters
    ? (result.products || []).filter(p => matches(p, effectiveFilters))
    : (result.products || []);

  // Deterministic soft-preference ordering; no preferences -> search order.
  const { ranked } = rank(filtered, effectivePreferences);

  return {
    searchMode: result.searchMode,
    cleanedQuery,
    effectiveFilters,
    effectivePreferences,
    searchLimit,
    searchProducts: result.products || [],
    filtered,
    ranked,
    rankedIds: ranked.map(p => String(p._id)),
    finalProductIds: ranked.slice(0, RESPONSE_LIMIT).map(p => String(p._id)),
  };
}

function evaluateRanking(run, fixture) {
  const anyPref = hasAnyPreference(run.effectivePreferences);
  const rankedIds = run.rankedIds;

  let topOk = true;
  if (anyPref && fixture.expectedTop) {
    topOk = rankedIds[0] === String(fixture.expectedTop);
  }

  let pairwiseOk = true;
  let pairwiseViolation = null;
  if (anyPref && Array.isArray(fixture.pairwisePreferred)) {
    for (const [a, b] of fixture.pairwisePreferred) {
      const ai = rankedIds.indexOf(String(a));
      const bi = rankedIds.indexOf(String(b));
      if (ai < 0 || bi < 0 || ai >= bi) {
        pairwiseOk = false;
        pairwiseViolation = `${a} >= ${b} (indices ${ai}, ${bi})`;
        break;
      }
    }
  }

  return { anyPref, topOk, pairwiseOk, pairwiseViolation };
}

/**
 * Evaluate every fixture case through the real pipeline and aggregate metrics.
 *
 * @param {object[]} cases   fixtures (evaluation/pipeline/fixtures/pipelineCases)
 * @param {object}   deps    { search, parse, matches, rank, resolve }
 * @param {function} [setup] per-case store setup, e.g. vectorFailure flag
 */
async function evaluatePipelineCases(cases, deps, setup) {
  const results = [];

  for (const fixture of cases) {
    if (setup) await setup(fixture);

    let run1 = null;
    let run2 = null;
    let error = null;
    try {
      run1 = await runPipelineForCase(deps, fixture);
      run2 = await runPipelineForCase(deps, fixture);
    } catch (e) {
      error = e;
    }

    const retrievedIds = run1 ? run1.rankedIds : [];
    const relevantIds = (fixture.relevantIds || []).map(String);
    const forbiddenIds = (fixture.forbiddenIds || []).map(String);

    const metrics = computeRetrievalMetrics(relevantIds, retrievedIds);

    const stable =
      !error && JSON.stringify(retrievedIds) === JSON.stringify(run2.rankedIds);
    const modeMatches = !error && (fixture.expectedMode ? run1.searchMode === fixture.expectedMode : true);

    const forbiddenViolated = retrievedIds.some(id => forbiddenIds.includes(id));

    const validatorSafety =
      !error && run1.ranked.every(p => deps.matches(p, run1.effectiveFilters));

    const ranking = error
      ? { anyPref: false, topOk: true, pairwiseOk: true, pairwiseViolation: null }
      : evaluateRanking(run1, fixture);

    let passed = false;
    if (error) {
      passed = false;
    } else if (fixture.expectedEmpty === true) {
      passed = stable && retrievedIds.length === 0;
    } else {
      const recallGate = relevantIds.length === 0 || metrics.recallAtK >= 1;
      passed = Boolean(
        stable &&
        modeMatches &&
        !forbiddenViolated &&
        recallGate &&
        validatorSafety &&
        ranking.topOk &&
        ranking.pairwiseOk
      );
    }

    results.push({
      caseId: fixture.id,
      query: fixture.query || (fixture.turns ? fixture.turns.map(t => t.query).join(' | ') : ''),
      limit: fixture.limit || RESPONSE_LIMIT,
      relevantIds,
      forbiddenIds,
      expectedMode: fixture.expectedMode || undefined,
      expectedEmpty: fixture.expectedEmpty === true,
      vectorFailure: fixture.vectorFailure === true,
      expectedTop: fixture.expectedTop ? String(fixture.expectedTop) : undefined,
      pairwisePreferred: fixture.pairwisePreferred || [],
      searchMode: run1 ? run1.searchMode : 'error',
      error: error ? error.message : undefined,
      cleanedQuery: run1 ? run1.cleanedQuery : undefined,
      searchLimit: run1 ? run1.searchLimit : undefined,
      effectiveFilters: run1 ? run1.effectiveFilters : undefined,
      effectivePreferences: run1 ? run1.effectivePreferences : undefined,
      retrievedIds,
      finalProductIds: run1 ? run1.finalProductIds : [],
      metrics,
      stable,
      validatorSafety,
      ranking: {
        anyPref: ranking.anyPref,
        topOk: ranking.topOk,
        pairwiseOk: ranking.pairwiseOk,
        pairwiseViolation: ranking.pairwiseViolation,
      },
      passed,
    });
  }

  const retrievalResults = results.filter(r => r.relevantIds.length > 0);
  const modeCounts = results.reduce((acc, r) => {
    acc[r.searchMode] = (acc[r.searchMode] || 0) + 1;
    return acc;
  }, {});

  const rankingResults = results.filter(r => r.ranking.anyPref);
  const top1Cases = rankingResults.filter(r => r.expectedTop);
  const pairwiseCases = rankingResults.filter(r => r.pairwisePreferred.length > 0);

  const report = {
    totalCases: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    passRate: results.length === 0 ? 0 : results.filter(r => r.passed).length / results.length,
    meanRecallAtK: retrievalResults.length === 0 ? 0 : retrievalResults.reduce((s, r) => s + r.metrics.recallAtK, 0) / retrievalResults.length,
    meanPrecisionAtK: retrievalResults.length === 0 ? 0 : retrievalResults.reduce((s, r) => s + r.metrics.precisionAtK, 0) / retrievalResults.length,
    meanHitAtK: retrievalResults.length === 0 ? 0 : retrievalResults.reduce((s, r) => s + r.metrics.hitAtK, 0) / retrievalResults.length,
    modeCounts,
    forbiddenViolations: results.filter(r => r.forbiddenIds.some(id => r.retrievedIds.includes(id))).length,
    validatorSafetyFailures: results.filter(r => !r.validatorSafety).length,
    determinismFailures: results.filter(r => !r.stable).length,
    rankingTop1Accuracy: top1Cases.length === 0 ? 0 : top1Cases.filter(r => r.ranking.topOk).length / top1Cases.length,
    pairwiseAccuracy: pairwiseCases.length === 0 ? 0 : pairwiseCases.filter(r => r.ranking.pairwiseOk).length / pairwiseCases.length,
    emptyCases: results.filter(r => r.expectedEmpty).length,
    nonEmptyCases: results.filter(r => !r.expectedEmpty).length,
  };

  return { results, report };
}

module.exports = { evaluatePipelineCases, runPipelineForCase, searchLimitFor, hasAnyPreference, RESPONSE_LIMIT };