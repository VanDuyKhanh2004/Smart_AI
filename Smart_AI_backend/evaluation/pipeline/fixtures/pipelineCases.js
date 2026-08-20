/**
 * Constraint Pipeline end-to-end evaluation fixtures (offline, deterministic).
 *
 * Every expected value is HAND-AUTHORED from the evaluation catalog in
 * evaluation/recommendation/recommendationStore.js (built from the shared
 * EVAL_PRODUCTS fixture source plus the two Samsung additions M34 / S24FE).
 * Nothing here is derived from the production constraint parser, validator or
 * ranker under test — the expected IDs were written from the catalog data and
 * the production color-normalization table (utils/productValidator.js) which
 * maps 'Midnight' and 'Graphite' to black, and 'Natural Titanium' to gray.
 *
 * Each case runs the FULL production pipeline the way chatController does:
 *   parseProductConstraints(query)
 *     -> productSearchService.search(cleanedQuery, K, effectiveFilters)
 *     -> matchesProductConstraints(...)  (JS-only gates: RAM/storage/color/...)
 *     -> rankProducts(...)               (soft preferences only when active)
 *
 * Fields:
 *   id                 case identifier
 *   query              natural-language query (first turn when `turns` present)
 *   turns?             multi-turn conversation; merged filters/preferences are
 *                      resolved through the REAL resolveFollowUpQuery()
 *   mergedFilters?     explicit merged filters override (single-turn)
 *   mergedPreferences? explicit merged preferences override
 *   limit              candidate search limit passed to search() (like RAG
 *                      fixtures, widened where the relevant set exceeds 5)
 *   relevantIds        hand-authored ground truth that MUST all be retrieved
 *   forbiddenIds       products that MUST NOT be returned
 *   expectedTop        required first result (only when a preference is active)
 *   pairwisePreferred  required relative order of result pairs
 *   expectedMode       expected retrieval tier ('vector' | 'text' | 'fallback')
 *   vectorFailure      force the vector tier to throw -> real text fallback
 *   expectedEmpty      expect zero products after the whole pipeline
 */

const { IDS } = require('../../recommendation/recommendationStore');

const PIPELINE_CASES = [
  {
    id: 'pipe-brand-001',
    query: 'samsung galaxy',
    limit: 10,
    relevantIds: [IDS.S24, IDS.A15, IDS.ZFOLD, IDS.A05, IDS.M34, IDS.S24FE],
    forbiddenIds: [],
    expectedMode: 'vector',
    note: 'all 6 active Samsung units (M34 + S24FE come from the extra fixtures)',
  },
  {
    id: 'pipe-price-excl-002',
    query: 'điện thoại dưới 10 triệu',
    limit: 10,
    relevantIds: [IDS.NOSPEC, IDS.A15, IDS.M34, IDS.RN13, IDS.A05],
    forbiddenIds: [IDS.IPSE, IDS.S24, IDS.ZFOLD, IDS.IP15PM, IDS.IP16P, IDS.X14T, IDS.OP12, IDS.P9P, IDS.S24FE],
    expectedMode: 'vector',
    note: '"dưới 10 triệu" is EXCLUSIVE -> maxPrice 9,999,999; iPhone SE at exactly 10,000,000 is forbidden',
  },
  {
    id: 'pipe-price-incl-003',
    query: 'điện thoại tối đa 10 triệu',
    limit: 10,
    relevantIds: [IDS.NOSPEC, IDS.A15, IDS.M34, IDS.RN13, IDS.A05, IDS.IPSE],
    forbiddenIds: [IDS.S24, IDS.ZFOLD, IDS.IP15PM, IDS.IP16P, IDS.X14T, IDS.OP12, IDS.P9P, IDS.S24FE],
    expectedMode: 'vector',
    note: '"tối đa 10 triệu" is INCLUSIVE -> maxPrice 10,000,000; iPhone SE at exactly 10,000,000 is relevant',
  },
  {
    id: 'pipe-ram-004',
    query: 'điện thoại ram 8gb',
    limit: 15,
    relevantIds: [IDS.S24, IDS.IP15PM, IDS.IP16P, IDS.RN13, IDS.S24FE],
    forbiddenIds: [IDS.A15, IDS.ZFOLD, IDS.A05, IDS.IPSE, IDS.M34, IDS.X14T, IDS.OP12, IDS.P9P, IDS.NOSPEC],
    expectedMode: 'vector',
    note: 'RAM is a JS-only validator gate; every forbidden product must fail matchesProductConstraints',
  },
  {
    id: 'pipe-ram-min-005',
    query: 'ram ít nhất 12gb',
    limit: 15,
    relevantIds: [IDS.ZFOLD, IDS.X14T, IDS.OP12, IDS.P9P],
    forbiddenIds: [IDS.S24, IDS.A15, IDS.A05, IDS.IP15PM, IDS.IP16P, IDS.IPSE, IDS.RN13, IDS.M34, IDS.S24FE, IDS.NOSPEC],
    expectedMode: 'vector',
    note: 'min RAM 12GB',
  },
  {
    id: 'pipe-storage-006',
    query: 'điện thoại 256gb',
    limit: 15,
    relevantIds: [IDS.S24, IDS.IP15PM, IDS.IP16P, IDS.RN13, IDS.X14T, IDS.S24FE],
    forbiddenIds: [IDS.A15, IDS.ZFOLD, IDS.A05, IDS.IPSE, IDS.M34, IDS.OP12, IDS.P9P, IDS.NOSPEC],
    expectedMode: 'vector',
    note: 'exact storage 256GB',
  },
  {
    id: 'pipe-color-007',
    query: 'màu đen',
    limit: 15,
    relevantIds: [IDS.S24, IDS.A05, IDS.IPSE, IDS.RN13, IDS.X14T, IDS.OP12, IDS.S24FE],
    forbiddenIds: [IDS.A15, IDS.ZFOLD, IDS.IP15PM, IDS.IP16P, IDS.P9P, IDS.M34, IDS.NOSPEC],
    expectedMode: 'vector',
    note: 'production color normalization: Midnight (IPSE) and Graphite (S24FE) map to black; Natural Titanium maps to gray (ZFOLD/IP15PM)',
  },
  {
    id: 'pipe-excluded-008',
    query: 'không lấy apple',
    limit: 15,
    relevantIds: [IDS.S24, IDS.A15, IDS.ZFOLD, IDS.A05, IDS.RN13, IDS.X14T, IDS.OP12, IDS.P9P, IDS.M34, IDS.S24FE, IDS.NOSPEC],
    forbiddenIds: [IDS.IP15PM, IDS.IP16P, IDS.IPSE],
    expectedMode: 'vector',
    note: 'excludedBrands -> post-retrieval $match (not an Atlas prefilter field)',
  },
  {
    id: 'pipe-instock-009',
    query: 'còn hàng',
    limit: 15,
    relevantIds: [IDS.S24, IDS.A15, IDS.ZFOLD, IDS.IP15PM, IDS.IP16P, IDS.IPSE, IDS.RN13, IDS.X14T, IDS.OP12, IDS.P9P, IDS.M34, IDS.S24FE, IDS.NOSPEC],
    forbiddenIds: [IDS.A05],
    expectedMode: 'vector',
    note: 'A05 is the only active product with 0 stock; inStock is a post-retrieval $match field',
  },
  {
    id: 'pipe-combined-010',
    query: 'Samsung dưới 15 triệu có màu đen',
    limit: 5,
    relevantIds: [IDS.A05],
    forbiddenIds: [IDS.S24, IDS.A15, IDS.ZFOLD, IDS.M34, IDS.S24FE, IDS.IP15PM, IDS.IP16P, IDS.IPSE, IDS.RN13, IDS.X14T, IDS.OP12, IDS.P9P, IDS.NOSPEC],
    expectedMode: 'vector',
    note: 'brand + exclusive price + color combine to a single hit (Galaxy A05)',
  },
  {
    id: 'pipe-noresult-011',
    query: 'ram ít nhất 100gb samsung còn hàng',
    limit: 5,
    relevantIds: [],
    forbiddenIds: [],
    expectedMode: 'vector',
    expectedEmpty: true,
    note: 'no product has 100GB+ RAM; the pipeline must end empty even though search returns Samsung candidates',
  },
  {
    id: 'pipe-rank-camera-012',
    query: 'Samsung dưới 20 triệu ưu tiên camera đẹp',
    limit: 5,
    relevantIds: [IDS.S24, IDS.A15, IDS.A05, IDS.M34, IDS.S24FE],
    forbiddenIds: [IDS.ZFOLD, IDS.IP15PM, IDS.IP16P, IDS.IPSE, IDS.RN13, IDS.X14T, IDS.OP12, IDS.P9P, IDS.NOSPEC],
    expectedTop: IDS.S24,
    pairwisePreferred: [[IDS.S24, IDS.S24FE], [IDS.S24FE, IDS.A15], [IDS.S24FE, IDS.M34]],
    expectedMode: 'vector',
    note: 'camera preference over the Samsung-under-20M pool; S24 ranks first',
  },
  {
    id: 'pipe-rank-battery-013',
    query: 'điện thoại dưới 12 triệu ưu tiên pin trâu',
    limit: 5,
    relevantIds: [IDS.NOSPEC, IDS.A15, IDS.A05, IDS.IPSE, IDS.RN13, IDS.M34],
    forbiddenIds: [IDS.S24, IDS.ZFOLD, IDS.IP15PM, IDS.IP16P, IDS.X14T, IDS.OP12, IDS.P9P, IDS.S24FE],
    expectedTop: IDS.M34,
    pairwisePreferred: [[IDS.M34, IDS.RN13], [IDS.RN13, IDS.A15], [IDS.A15, IDS.A05], [IDS.A15, IDS.IPSE]],
    expectedMode: 'vector',
    note: 'battery preference over the under-12M pool; M34 (6000 mAh) ranks first',
  },
  {
    id: 'pipe-text-fallback-014',
    query: 'galaxy s24',
    limit: 10,
    relevantIds: [IDS.S24, IDS.S24FE],
    forbiddenIds: [],
    vectorFailure: true,
    expectedMode: 'text',
    note: 'vector tier throws; the real $text fallback must retrieve both Galaxy S24 units',
  },
  {
    id: 'pipe-multiturn-color-015',
    turns: [
      { query: 'Samsung dưới 15 triệu' },
      { query: 'còn màu đen không?' },
    ],
    limit: 5,
    relevantIds: [IDS.A05],
    forbiddenIds: [IDS.S24, IDS.A15, IDS.ZFOLD, IDS.M34, IDS.S24FE, IDS.IP15PM, IDS.IP16P, IDS.IPSE, IDS.RN13, IDS.X14T, IDS.OP12, IDS.P9P, IDS.NOSPEC],
    expectedMode: 'vector',
    note: 'real resolveFollowUpQuery() merges Samsung + <=14,999,999 + black -> only Galaxy A05',
  },
  {
    id: 'pipe-multiturn-ram-016',
    turns: [
      { query: 'điện thoại dưới 20 triệu' },
      { query: 'RAM 12GB thì sao?' },
    ],
    limit: 10,
    relevantIds: [IDS.X14T],
    forbiddenIds: [IDS.ZFOLD, IDS.OP12, IDS.P9P, IDS.S24, IDS.A15, IDS.A05, IDS.M34, IDS.S24FE, IDS.IP15PM, IDS.IP16P, IDS.IPSE, IDS.RN13, IDS.NOSPEC],
    expectedMode: 'vector',
    note: 'merge inherits the <=20M budget from turn 1, so ZFOLD (42.99M) and OP12/P9P (over budget) are excluded despite 12GB+ RAM; only Xiaomi 14T qualifies',
  },
  {
    id: 'pipe-hang-017',
    query: 'điện thoại hết hàng',
    limit: 10,
    relevantIds: [IDS.A05],
    forbiddenIds: [IDS.S24, IDS.A15, IDS.ZFOLD, IDS.IP15PM, IDS.IP16P, IDS.IPSE, IDS.RN13, IDS.X14T, IDS.OP12, IDS.P9P, IDS.M34, IDS.S24FE, IDS.NOSPEC],
    expectedMode: 'vector',
    note: 'inStock=false keeps only the 0-stock active product (Galaxy A05)',
  },
  {
    id: 'pipe-multi-brand-price-018',
    query: 'Samsung hoặc Xiaomi tối đa 12 triệu',
    limit: 10,
    relevantIds: [IDS.A15, IDS.A05, IDS.M34, IDS.RN13, IDS.NOSPEC],
    forbiddenIds: [IDS.S24, IDS.ZFOLD, IDS.S24FE, IDS.X14T],
    expectedMode: 'vector',
    note: 'multi-brand $in prefilter + inclusive 12M budget; NOSPEC (Xiaomi, 2M) also qualifies',
  },
];

module.exports = { PIPELINE_CASES };