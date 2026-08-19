/**
 * Deterministic retrieval metrics for the offline RAG evaluation.
 *
 * All metrics are computed against hand-authored `relevantIds` ground truth and
 * the actual ordered list returned by the REAL productSearchService.search().
 * Fully deterministic: no randomness, no external calls.
 */

/**
 * Recall@K: fraction of relevant products present in the top K retrieved.
 * Returns 0 when the relevant set is empty (nothing to retrieve).
 */
function recallAtK(relevantIds, retrievedIds, k) {
  if (!Array.isArray(relevantIds) || relevantIds.length === 0) return 0;
  const top = retrievedIds.slice(0, k);
  const hit = relevantIds.filter(id => top.includes(String(id))).length;
  return hit / relevantIds.length;
}

/**
 * Precision@K: fraction of the top K retrieved that are relevant.
 * The denominator is always K (standard Precision@K), so retrieving fewer
 * than K results lowers precision.
 */
function precisionAtK(relevantIds, retrievedIds, k) {
  if (!Number.isFinite(k) || k <= 0) return 0;
  const top = retrievedIds.slice(0, k);
  const hit = top.filter(id => relevantIds.includes(String(id))).length;
  return hit / top.length;
}

/**
 * Hit@K: 1 if at least one relevant product is in the top K retrieved, else 0.
 * Returns 0 when the relevant set is empty.
 */
function hitAtK(relevantIds, retrievedIds, k) {
  if (!Array.isArray(relevantIds) || relevantIds.length === 0) return 0;
  return retrievedIds.slice(0, k).some(id => relevantIds.includes(String(id))) ? 1 : 0;
}

/**
 * Compute all three metrics at the effective K (number of actually retrieved
 * products) unless a k is supplied explicitly.
 */
function computeRetrievalMetrics(relevantIds, retrievedIds, k = retrievedIds.length) {
  return {
    k,
    recallAtK: recallAtK(relevantIds, retrievedIds, k),
    precisionAtK: precisionAtK(relevantIds, retrievedIds, k),
    hitAtK: hitAtK(relevantIds, retrievedIds, k),
  };
}

module.exports = { recallAtK, precisionAtK, hitAtK, computeRetrievalMetrics };