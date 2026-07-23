function calculateConstraintMetrics(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return { caseAccuracy: 0, productPrecision: 1, violatingProductCount: 0, noResultHonestyRate: 1, totalCases: 0 };
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
  const noResultHonestyRate = noResultCases > 0 ? honestNoResults / noResultCases : 1;

  return {
    caseAccuracy: clamp01(caseAccuracy),
    productPrecision: clamp01(productPrecision),
    violatingProductCount: totalViolatingProducts,
    noResultHonestyRate: clamp01(noResultHonestyRate),
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
  return totalCount > 0 ? validCount / totalCount : 1;
}

function calculateRankingMetrics(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return { top1Accuracy: 0, meanReciprocalRank: 0, pairwiseRankingAccuracy: 0, stableRankingRate: 1, totalCases: 0 };
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
  const pairwiseRankingAccuracy = pairwiseTotal > 0 ? pairwiseHits / pairwiseTotal : 1;
  const stableRankingRate = results.length > 0 ? stableCount / results.length : 1;

  return {
    top1Accuracy: clamp01(top1Accuracy),
    meanReciprocalRank: clamp01(mrr),
    pairwiseRankingAccuracy: clamp01(pairwiseRankingAccuracy),
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
    retentionAccuracy: retentionCases > 0 ? clamp01(retentionHits / retentionCases) : 1,
    replacementAccuracy: replacementCases > 0 ? clamp01(replacementHits / replacementCases) : 1,
    resetAccuracy: resetCases > 0 ? clamp01(resetHits / resetCases) : 1,
    isolationAccuracy: isolationCases > 0 ? clamp01(isolationHits / isolationCases) : 1,
    failedTurnPreservationAccuracy: failurePreserveCases > 0 ? clamp01(failurePreserveHits / failurePreserveCases) : 1,
    totalCases: results.length,
  };
}

function calculateFallbackMetrics(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return { validResponseRate: 0, deterministicFallbackSuccessRate: 1, constraintSafetyUnderFallback: 1, contextSaveOnValidResponseRate: 1, contextNotSavedOnFailureRate: 1, totalCases: 0 };
  }

  let validCount = 0;
  let deterministicCount = 0;
  let deterministicTotal = 0;
  let constraintSafeCount = 0;
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

  return {
    validResponseRate: results.length > 0 ? clamp01(validCount / results.length) : 0,
    deterministicFallbackSuccessRate: deterministicTotal > 0 ? clamp01(deterministicCount / deterministicTotal) : 1,
    constraintSafetyUnderFallback: 1,
    contextSaveOnValidResponseRate: contextSaveValidTotal > 0 ? clamp01(contextSaveValidCount / contextSaveValidTotal) : 1,
    contextNotSavedOnFailureRate: contextNotSavedFailTotal > 0 ? clamp01(contextNotSavedFailCount / contextNotSavedFailTotal) : 1,
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

module.exports = {
  calculateConstraintMetrics,
  calculateRankingMetrics,
  calculateContextMetrics,
  calculateFallbackMetrics,
  calculateLatencyMetrics,
  calculateParserNormalizationMetrics,
  clamp01,
  round2,
};
