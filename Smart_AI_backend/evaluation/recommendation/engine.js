/**
 * Offline recommendation evaluation engine (Evaluation v2).
 *
 * Runs the REAL services/productRecommendationService.recommend() against a
 * fixture-backed Product model and computes ranking-quality, constraint-safety
 * and determinism metrics from hand-authored relevance ground truth.
 *
 * `recommend` is injected so both the Jest suite (jest.doMock) and the CLI
 * (require.cache override) can supply the fixture Product model.
 */

const {
  parseRecommendationConstraints,
} = require('../../utils/recommendationConstraintParser');
const {
  calculateRecommendationMetrics,
} = require('../chatbot/metrics');

function constraintSafetyOf(constraints, returnedProducts) {
  const brand = constraints && constraints.brand ? String(constraints.brand).toLowerCase() : null;
  const budgetMin = constraints ? constraints.budgetMin : null;
  const budgetMax = constraints ? constraints.budgetMax : null;

  for (const p of returnedProducts) {
    if (p.isActive === false) return false;
    if (!(p.inStock > 0)) return false;
    if (brand && String(p.brand).toLowerCase() !== brand) return false;
    if (budgetMin != null && p.price < budgetMin) return false;
    if (budgetMax != null && p.price > budgetMax) return false;
  }
  return true;
}

async function evaluateRecommendationCases(cases, recommend, setup) {
  const results = [];

  for (const c of cases) {
    const constraints = c.constraints || parseRecommendationConstraints(c.query);
    if (setup) await setup(c);

    const run1 = await recommend(c.sourceProductId, c.limit, constraints);
    const run2 = await recommend(c.sourceProductId, c.limit, constraints);

    const products = (run1.products || []).slice();
    const returnedIds = products.map(p => p._id);
    const returnedProducts = products.map(p => ({
      _id: p._id,
      brand: p.brand,
      name: p.name,
    }));

    const idsRun2 = JSON.stringify((run2.products || []).map(p => p._id));
    const stable = JSON.stringify(returnedIds) === idsRun2;
    const constraintSafe =
      !run1.error && constraintSafetyOf(constraints, products);

    const outOfStockReturned = products.filter(p => !(p.inStock > 0)).length;

    const modeMatches = c.expectMode ? run1.recommendationMode === c.expectMode : true;
    const passed = Boolean(
      !run1.error &&
      constraintSafe &&
      stable &&
      outOfStockReturned === 0 &&
      modeMatches
    );

    results.push({
      caseId: c.id,
      query: c.query,
      limit: c.limit,
      constraints,
      recommendationMode: run1.recommendationMode || (run1.error ? 'error' : 'unknown'),
      error: run1.error || undefined,
      returnedIds,
      returnedProducts,
      relevantIds: Array.isArray(c.relevantIds) ? c.relevantIds : undefined,
      expectMode: c.expectMode || undefined,
      constraintSafe,
      outOfStockReturned,
      stable,
      passed,
    });
  }

  return {
    results,
    report: calculateRecommendationMetrics(results),
  };
}

module.exports = { evaluateRecommendationCases, constraintSafetyOf };
