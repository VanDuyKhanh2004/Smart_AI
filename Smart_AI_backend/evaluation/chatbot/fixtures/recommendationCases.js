/**
 * Recommendation evaluation cases (Evaluation v2).
 *
 * Ground truth (`relevantIds`) is hand-authored per query from the fixture
 * catalog in evaluation/recommendation/recommendationStore.js, independent of
 * the system-under-test's output. Constraints are parsed from `query` by
 * utils/recommendationConstraintParser when a case has no explicit `constraints`.
 */

const { IDS } = require('../../recommendation/recommendationStore');

const RECOMMENDATION_CASES = [
  {
    id: 'reco-vector-flagship-001',
    category: 'recommendation',
    query: 'điện thoại tương tự',
    sourceProductId: IDS.OP12,
    limit: 5,
    // Premium flagships a OnePlus 12 shopper would consider (hand-authored).
    relevantIds: [IDS.S24, IDS.S24FE, IDS.ZFOLD, IDS.IP15PM, IDS.IP16P, IDS.P9P, IDS.X14T],
    embedSource: true,
    expectMode: 'vector',
  },
  {
    id: 'reco-priority-camera-002',
    category: 'recommendation',
    query: 'điện thoại chụp ảnh đẹp',
    sourceProductId: IDS.IP15PM,
    limit: 5,
    // Strongest camera phones in the catalog (triple rear + OIS/telephoto).
    relevantIds: [IDS.OP12, IDS.P9P, IDS.X14T, IDS.ZFOLD, IDS.S24],
    embedSource: true,
    expectMode: 'vector',
  },
  {
    id: 'reco-priority-performance-003',
    category: 'recommendation',
    query: 'điện thoại hiệu năng cao',
    sourceProductId: IDS.A15,
    limit: 5,
    // Highest-performing phones (RAM/chipset tiers) a performance shopper
    // would accept as alternatives to the budget Galaxy A15.
    relevantIds: [IDS.OP12, IDS.P9P, IDS.ZFOLD, IDS.X14T, IDS.S24, IDS.S24FE, IDS.IP15PM],
    embedSource: true,
    expectMode: 'vector',
  },
  {
    id: 'reco-brand-budget-004',
    category: 'recommendation',
    query: 'điện thoại Apple dưới 25 triệu',
    sourceProductId: IDS.IP15PM,
    limit: 5,
    // Only in-scope candidate: iPhone SE (apple, <= 25M, in stock).
    relevantIds: [IDS.IPSE],
    embedSource: true,
    expectMode: 'vector',
  },
  {
    id: 'reco-out-of-stock-005',
    category: 'recommendation',
    query: 'điện thoại tương tự',
    sourceProductId: IDS.S24,
    limit: 5,
    // Galaxy A05 (eval-s4) is nearest-budget but out of stock and must never
    // appear; the relevance set deliberately excludes it.
    relevantIds: [IDS.S24FE, IDS.ZFOLD, IDS.OP12, IDS.P9P, IDS.IP15PM, IDS.IP16P],
    embedSource: true,
    expectMode: 'vector',
  },
  {
    id: 'reco-brand-price-006',
    category: 'recommendation',
    query: 'điện thoại Samsung',
    sourceProductId: IDS.S24,
    limit: 5,
    // Source has no embedding -> brand-price fallback; only Galaxy S24 FE is
    // inside the +/-20% price band.
    relevantIds: [IDS.S24FE],
    embedSource: false,
    expectMode: 'brand_price',
  },
  {
    id: 'reco-latest-fallback-007',
    category: 'recommendation',
    query: 'điện thoại giá rẻ',
    sourceProductId: IDS.IPSE,
    limit: 5,
    // Source has no embedding and the brand-price band is empty -> latest
    // fallback. Last-resort listing: constraint safety is what we assert.
    embedSource: false,
    expectMode: 'fallback',
  },
  {
    id: 'reco-vector-throw-008',
    category: 'recommendation',
    query: 'điện thoại tương tự',
    sourceProductId: IDS.S24,
    limit: 5,
    // Vector search throws -> service must fall back to brand-price and still
    // respect hard constraints.
    embedSource: true,
    vectorFailure: true,
    expectMode: 'brand_price',
  },
];

module.exports = { RECOMMENDATION_CASES };
