function calculateConstraintMetrics(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return { caseAccuracy: 0, productPrecision: null, violatingProductCount: 0, noResultHonestyRate: null, totalCases: 0 };
  }

  let passed = 0;
  let totalViolatingProducts = 0;
  let noResultCases = 0;
  let honestNoResults = 0;

  for (const r of results) {
    if (r.passed) passed++;
    totalViolatingProducts += (typeof r.violatingProducts === 'number' ? r.violatingProducts : 0);
    if (r.noResultExpected) {
      noResultCases++;
      if (r.returnedEmpty) honestNoResults++;
    }
  }

  const caseAccuracy = results.length > 0 ? passed / results.length : 0;
  const productPrecision = calculatePrecision(results);
  const noResultHonestyRate = noResultCases > 0 ? honestNoResults / noResultCases : null;

  return {
    caseAccuracy: clamp01(caseAccuracy),
    productPrecision: productPrecision === null ? null : clamp01(productPrecision),
    violatingProductCount: totalViolatingProducts,
    noResultHonestyRate: noResultHonestyRate === null ? null : clamp01(noResultHonestyRate),
    totalCases: results.length,
    passed,
  };
}

function calculatePrecision(results) {
  let validCount = 0;
  let totalCount = 0;
  for (const r of results) {
    if (Array.isArray(r.returnedProductIds)) {
      totalCount += r.returnedProductIds.length;
      validCount += (r.returnedProductIds.length - (r.violatingProducts || 0));
    }
  }
  // null (not 0, not 1) when nothing was returned: the metric is unmeasured,
  // and an empty result set must never be reported as "perfect precision".
  return totalCount > 0 ? validCount / totalCount : null;
}

function calculateRankingMetrics(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return { top1Accuracy: 0, meanReciprocalRank: 0, pairwiseRankingAccuracy: 0, stableRankingRate: 0, totalCases: 0 };
  }

  let top1Hits = 0;
  let reciprocalRanks = [];
  let pairwiseHits = 0;
  let pairwiseTotal = 0;
  let stableCount = 0;

  for (const r of results) {
    if (r.topExpectedId && Array.isArray(r.rankedIds) && r.rankedIds.length > 0) {
      const idx = r.rankedIds.indexOf(r.topExpectedId);
      if (idx === 0) top1Hits++;
      if (idx >= 0) reciprocalRanks.push(1 / (idx + 1));
    }

    if (Array.isArray(r.pairwisePreferred)) {
      for (const [a, b] of r.pairwisePreferred) {
        pairwiseTotal++;
        const ai = r.rankedIds.indexOf(a);
        const bi = r.rankedIds.indexOf(b);
        if (ai >= 0 && bi >= 0 && ai < bi) pairwiseHits++;
      }
    }

    if (r.stable !== false) stableCount++;
  }

  const top1Accuracy = results.length > 0 ? top1Hits / results.length : 0;
  const mrr = reciprocalRanks.length > 0
    ? reciprocalRanks.reduce((a, b) => a + b, 0) / reciprocalRanks.length
    : 0;
  const pairwiseRankingAccuracy = pairwiseTotal > 0 ? pairwiseHits / pairwiseTotal : null;
  const stableRankingRate = results.length > 0 ? stableCount / results.length : 0;

  return {
    top1Accuracy: clamp01(top1Accuracy),
    meanReciprocalRank: clamp01(mrr),
    pairwiseRankingAccuracy: pairwiseRankingAccuracy === null ? null : clamp01(pairwiseRankingAccuracy),
    stableRankingRate: clamp01(stableRankingRate),
    totalCases: results.length,
  };
}

function calculateContextMetrics(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return { retentionAccuracy: 0, replacementAccuracy: 0, resetAccuracy: 0, isolationAccuracy: 0, failedTurnPreservationAccuracy: 0, totalCases: 0 };
  }

  let retentionCases = 0;
  let retentionHits = 0;
  let replacementHits = 0;
  let replacementCases = 0;
  let resetHits = 0;
  let resetCases = 0;
  let isolationHits = 0;
  let isolationCases = 0;
  let failurePreserveHits = 0;
  let failurePreserveCases = 0;

  for (const r of results) {
    if (r.metricType === 'retention') {
      retentionCases++;
      if (r.passed) retentionHits++;
    } else if (r.metricType === 'replacement') {
      replacementCases++;
      if (r.passed) replacementHits++;
    } else if (r.metricType === 'reset') {
      resetCases++;
      if (r.passed) resetHits++;
    } else if (r.metricType === 'isolation') {
      isolationCases++;
      if (r.passed) isolationHits++;
    } else if (r.metricType === 'failure_preserve') {
      failurePreserveCases++;
      if (r.passed) failurePreserveHits++;
    }
  }

  return {
    retentionAccuracy: retentionCases > 0 ? clamp01(retentionHits / retentionCases) : null,
    replacementAccuracy: replacementCases > 0 ? clamp01(replacementHits / replacementCases) : null,
    resetAccuracy: resetCases > 0 ? clamp01(resetHits / resetCases) : null,
    isolationAccuracy: isolationCases > 0 ? clamp01(isolationHits / isolationCases) : null,
    failedTurnPreservationAccuracy: failurePreserveCases > 0 ? clamp01(failurePreserveHits / failurePreserveCases) : null,
    totalCases: results.length,
  };
}

function calculateFallbackMetrics(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return { validResponseRate: 0, deterministicFallbackSuccessRate: null, constraintSafetyUnderFallback: null, contextSaveOnValidResponseRate: null, contextNotSavedOnFailureRate: null, totalCases: 0 };
  }

  let validCount = 0;
  let deterministicCount = 0;
  let deterministicTotal = 0;
  let constraintSafeCount = 0;
  let constraintSafeTotal = 0;
  let contextSaveValidCount = 0;
  let contextSaveValidTotal = 0;
  let contextNotSavedFailCount = 0;
  let contextNotSavedFailTotal = 0;

  for (const r of results) {
    if (r.validResponse) validCount++;

    if (r.expectProvider === 'deterministic') {
      deterministicTotal++;
      if (r.actualProvider === 'deterministic') deterministicCount++;
    }

    if (r.constraintSafe !== undefined) {
      constraintSafeTotal++;
      if (r.constraintSafe) constraintSafeCount++;
    }

    if (r.contextSaveExpected === true) {
      contextSaveValidTotal++;
      if (r.contextSaved) contextSaveValidCount++;
    }
    if (r.contextSaveExpected === false) {
      contextNotSavedFailTotal++;
      if (!r.contextSaved) contextNotSavedFailCount++;
    }
  }

  // Metrics are null (unmeasured) when no data supports them; a fabricated 1.0
  // used to hide the absence of evidence and made the report look perfect.
  const deterministicRate = deterministicTotal > 0 ? clamp01(deterministicCount / deterministicTotal) : null;
  const constraintSafetyRate = constraintSafeTotal > 0 ? clamp01(constraintSafeCount / constraintSafeTotal) : null;
  const contextSaveRate = contextSaveValidTotal > 0 ? clamp01(contextSaveValidCount / contextSaveValidTotal) : null;
  const contextNotSavedRate = contextNotSavedFailTotal > 0 ? clamp01(contextNotSavedFailCount / contextNotSavedFailTotal) : null;

  return {
    validResponseRate: results.length > 0 ? clamp01(validCount / results.length) : 0,
    deterministicFallbackSuccessRate: deterministicRate,
    constraintSafetyUnderFallback: constraintSafetyRate,
    contextSaveOnValidResponseRate: contextSaveRate,
    contextNotSavedOnFailureRate: contextNotSavedRate,
    totalCases: results.length,
  };
}

function calculateLatencyMetrics(durations) {
  if (!Array.isArray(durations) || durations.length === 0) {
    return { averageMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, label: 'offline simulated', count: 0 };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const n = sorted.length;
  const avg = sorted.reduce((a, b) => a + b, 0) / n;
  const p50 = sorted[Math.floor((n - 1) * 0.5)];
  const p95 = sorted[Math.floor((n - 1) * 0.95)];
  const max = sorted[n - 1];

  return {
    label: 'offline simulated',
    averageMs: round2(avg),
    p50Ms: round2(p50),
    p95Ms: round2(p95),
    maxMs: round2(max),
    count: n,
  };
}

function clamp01(v) {
  if (typeof v !== 'number' || isNaN(v) || !isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function round2(v) {
  if (typeof v !== 'number' || isNaN(v) || !isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function calculateParserNormalizationMetrics(constraintResults) {
  if (!Array.isArray(constraintResults) || constraintResults.length === 0) {
    return { accuracy: 1, passed: 0, totalCases: 0, errors: [] };
  }

  let passed = 0;
  const allErrors = [];

  for (const r of constraintResults) {
    if (r.normalizationPassed) {
      passed++;
    }
    if (Array.isArray(r.normalizationErrors) && r.normalizationErrors.length > 0) {
      allErrors.push({ caseId: r.caseId, errors: r.normalizationErrors });
    }
  }

  return {
    accuracy: clamp01(passed / constraintResults.length),
    passed,
    totalCases: constraintResults.length,
    errors: allErrors.length > 0 ? allErrors : undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Recommendation evaluation metrics (Evaluation v2)                  */
/* ------------------------------------------------------------------ */

/**
 * Precision@K for one recommendation case.
 * K is the number of products actually returned (min(requested, returned)).
 * Returns null when there is no relevance ground truth or nothing returned.
 */
function precisionAtK(result) {
  if (!result || !Array.isArray(result.returnedIds) || result.returnedIds.length === 0) return null;
  if (!Array.isArray(result.relevantIds) || result.relevantIds.length === 0) return null;
  const k = Math.min(result.limit || result.returnedIds.length, result.returnedIds.length);
  const relevant = new Set(result.relevantIds);
  let hits = 0;
  for (let i = 0; i < k; i++) {
    if (relevant.has(result.returnedIds[i])) hits++;
  }
  return k > 0 ? hits / k : null;
}

/**
 * Recall@K: fraction of the hand-authored relevance set present in the
 * returned list. Returns null without ground truth.
 */
function recallAtK(result) {
  if (!result || !Array.isArray(result.returnedIds) || result.returnedIds.length === 0) return null;
  if (!Array.isArray(result.relevantIds) || result.relevantIds.length === 0) return null;
  const relevant = new Set(result.relevantIds);
  let hits = 0;
  for (const id of result.returnedIds) {
    if (relevant.has(id)) hits++;
  }
  return relevant.size > 0 ? hits / relevant.size : null;
}

/**
 * Reciprocal rank: 1 / (1-indexed rank of the first relevant product).
 * Returns null without ground truth; 0 when no relevant product is returned.
 */
function reciprocalRank(result) {
  if (!result || !Array.isArray(result.returnedIds) || result.returnedIds.length === 0) return null;
  if (!Array.isArray(result.relevantIds) || result.relevantIds.length === 0) return null;
  const relevant = new Set(result.relevantIds);
  for (let i = 0; i < result.returnedIds.length; i++) {
    if (relevant.has(result.returnedIds[i])) return 1 / (i + 1);
  }
  return 0;
}

/**
 * NDCG@K with binary relevance derived from the hand-authored relevantIds.
 * Returns null without ground truth.
 */
function ndcgAtK(result) {
  if (!result || !Array.isArray(result.returnedIds) || result.returnedIds.length === 0) return null;
  if (!Array.isArray(result.relevantIds) || result.relevantIds.length === 0) return null;
  const k = Math.min(result.limit || result.returnedIds.length, result.returnedIds.length);
  const relevant = new Set(result.relevantIds);
  const idealCount = Math.min(k, relevant.size);
  if (idealCount === 0) return 0;

  let dcg = 0;
  for (let i = 0; i < k; i++) {
    const gain = relevant.has(result.returnedIds[i]) ? 1 : 0;
    dcg += gain / Math.log2(i + 2);
  }

  let idcg = 0;
  for (let i = 0; i < idealCount; i++) {
    idcg += 1 / Math.log2(i + 2);
  }

  return idcg > 0 ? dcg / idcg : 0;
}

/**
 * Brand diversity of the returned list: distinct brands / min(K, returned).
 * Returns null when nothing is returned or brand metadata is missing.
 */
function distinctBrandRatio(result) {
  if (!result || !Array.isArray(result.returnedIds) || result.returnedIds.length === 0) return null;
  if (!Array.isArray(result.returnedProducts) || result.returnedProducts.length === 0) return null;
  const k = Math.min(result.limit || result.returnedIds.length, result.returnedIds.length);
  const top = result.returnedProducts.slice(0, k);
  const brands = new Set(
    top.map(p => (p && p.brand ? String(p.brand).toLowerCase() : '')).filter(Boolean)
  );
  return top.length > 0 ? brands.size / top.length : null;
}

function avg(values) {
  const nums = values.filter(v => typeof v === 'number' && isFinite(v));
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

/**
 * Aggregate recommendation metrics over all recommendation cases.
 *
 * result entries (produced by the recommendation evaluation engine):
 *   { caseId, limit, recommendationMode, constraintSafe, outOfStockReturned,
 *     stable, returnedIds, returnedProducts, relevantIds?, passed? }
 */
function calculateRecommendationMetrics(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return {
      totalCases: 0,
      passed: 0,
      modeCounts: { vector: 0, brand_price: 0, fallback: 0 },
      hardConstraintSatisfaction: null,
      outOfStockReturned: 0,
      determinismRate: null,
      meanPrecisionAtK: null,
      meanRecallAtK: null,
      mrr: null,
      meanNdcgAtK: null,
      meanDistinctBrandRatio: null,
    };
  }

  const passed = results.filter(r => r.passed === true).length;
  const safeTotal = results.filter(r => r.constraintSafe !== undefined).length;
  const safeCount = results.filter(r => r.constraintSafe === true).length;
  const outOfStockReturned = results.reduce((a, r) => a + (r.outOfStockReturned || 0), 0);
  const stableCount = results.filter(r => r.stable === true).length;

  const modeCounts = { vector: 0, brand_price: 0, fallback: 0 };
  for (const r of results) {
    if (r.recommendationMode in modeCounts) modeCounts[r.recommendationMode]++;
  }

  const withGt = results.filter(r => Array.isArray(r.relevantIds) && r.relevantIds.length > 0);

  return {
    totalCases: results.length,
    passed,
    modeCounts,
    hardConstraintSatisfaction: safeTotal > 0 ? clamp01(safeCount / safeTotal) : null,
    outOfStockReturned,
    determinismRate: results.length > 0 ? clamp01(stableCount / results.length) : null,
    meanPrecisionAtK: avg(withGt.map(precisionAtK)),
    meanRecallAtK: avg(withGt.map(recallAtK)),
    mrr: avg(withGt.map(reciprocalRank)),
    meanNdcgAtK: avg(withGt.map(ndcgAtK)),
    meanDistinctBrandRatio: avg(results.map(distinctBrandRatio)),
  };
}

module.exports = {
  calculateConstraintMetrics,
  calculateRankingMetrics,
  calculateContextMetrics,
  calculateFallbackMetrics,
  calculateLatencyMetrics,
  calculateParserNormalizationMetrics,
  calculateRecommendationMetrics,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  ndcgAtK,
  distinctBrandRatio,
  clamp01,
  round2,
};
