/**
 * RAG answer-quality evaluation fixtures (offline, deterministic).
 *
 * Every expected value is HAND-AUTHORED from the evaluation catalog in
 * evaluation/recommendation/recommendationStore.js (and its EVAL_PRODUCTS
 * fixture source). Nothing here is derived from the production constraint
 * parsers or from the implementation under test — the expected relevant IDs
 * were written from the catalog data, and verified to lie inside the retrieval
 * window by probing the real offline search.
 *
 * Each case carries:
 *   - query            the natural-language query passed to search()
 *   - filters          optional constraint filters (search() third argument)
 *   - relevantIds      hand-authored ground truth of relevant products
 *   - forbiddenIds     products that must NOT be returned
 *   - expectedMode     expected retrieval tier ('vector' | 'text' | 'fallback')
 *   - expectedEmpty    expect zero results (no-result case)
 *   - vectorFailure    force the vector tier to throw so search() exercises the
 *                      real text fallback path (per-case store configuration)
 *   - answer           a canned assistant answer, authored fully grounded to the
 *                      retrieved products, graded by groundedness.js
 */

const { IDS } = require('../../recommendation/recommendationStore');

const RAG_CASES = [
  {
    id: 'rag-brand-001',
    query: 'samsung galaxy',
    filters: { brands: ['samsung'] },
    limit: 10,
    relevantIds: [IDS.S24, IDS.A15, IDS.ZFOLD, IDS.A05, IDS.M34, IDS.S24FE],
    forbiddenIds: [],
    expectedMode: 'vector',
    answer: 'Galaxy S24 giá 18.990.000 đồng có pin 5000 mAh, camera 50 MP và RAM 8 GB. Galaxy S24 FE giá 17.490.000 đồng. Galaxy A15 giá 4.990.000 đồng với pin 5000 mAh.',
    note: 'all 6 active Samsung units',
  },
  {
    id: 'rag-price-002',
    query: 'điện thoại dưới 10 triệu',
    filters: { maxPrice: 10_000_000 },
    limit: 10,
    relevantIds: [IDS.NOSPEC, IDS.IPSE, IDS.A15, IDS.M34, IDS.RN13, IDS.A05],
    forbiddenIds: [],
    expectedMode: 'vector',
    answer: 'iPhone SE có giá 10.000.000 đồng, camera 12 MP và pin 2018 mAh. Galaxy A15 giá 4.990.000 đồng. Redmi Note 13 giá 6.990.000 đồng với pin 5000 mAh.',
    note: 'all active products priced at or under 10M VND',
  },
  {
    id: 'rag-brand-price-003',
    query: 'samsung dưới 20 triệu',
    filters: { brands: ['samsung'], maxPrice: 20_000_000 },
    limit: 10,
    relevantIds: [IDS.S24FE, IDS.A05, IDS.A15, IDS.M34, IDS.S24],
    forbiddenIds: [IDS.ZFOLD],
    expectedMode: 'vector',
    answer: 'Galaxy S24 FE giá 17.490.000 đồng. Galaxy S24 giá 18.990.000 đồng có RAM 8 GB. Galaxy A15 giá 4.990.000 đồng.',
    note: 'Samsung under 20M; Galaxy Z Fold6 (42.99M) is over budget',
  },
  {
    id: 'rag-spec-004',
    query: 'điện thoại ram 8gb',
    limit: 10,
    relevantIds: [IDS.S24, IDS.S24FE, IDS.IP15PM, IDS.IP16P, IDS.RN13],
    forbiddenIds: [],
    expectedMode: 'vector',
    answer: 'Galaxy S24 có RAM 8 GB và pin 5000 mAh. Galaxy S24 FE cũng có RAM 8 GB. iPhone 15 Pro Max có RAM 8 GB và camera 48 MP. Redmi Note 13 có RAM 8 GB.',
    note: 'all catalog products with 8 GB RAM',
  },
  {
    id: 'rag-excluded-brand-005',
    query: 'iphone',
    filters: { excludedBrands: ['apple'] },
    limit: 10,
    relevantIds: [IDS.S24, IDS.A15, IDS.ZFOLD, IDS.A05, IDS.RN13, IDS.X14T, IDS.OP12],
    forbiddenIds: [IDS.IP15PM, IDS.IP16P, IDS.IPSE],
    expectedMode: 'vector',
    answer: 'Galaxy S24 giá 18.990.000 đồng. Galaxy A15 giá 4.990.000 đồng. Galaxy Z Fold6 giá 42.990.000 đồng.',
    note: 'query targets Apple but Apple is excluded via the post-filter',
  },
  {
    id: 'rag-instock-006',
    query: 'samsung galaxy',
    filters: { inStock: true },
    limit: 10,
    relevantIds: [IDS.S24, IDS.A15, IDS.ZFOLD, IDS.M34, IDS.S24FE],
    forbiddenIds: [IDS.A05, IDS.OLDS],
    expectedMode: 'vector',
    answer: 'Galaxy S24 có RAM 8 GB và pin 5000 mAh. Galaxy A15 có pin 5000 mAh. Galaxy M34 có pin 6000 mAh. Galaxy S24 FE có RAM 8 GB.',
    note: 'Galaxy A05 (0 in stock) and Old Samsung (inactive) must never appear',
  },
  {
    id: 'rag-text-007',
    query: 'galaxy s24',
    limit: 10,
    vectorFailure: true,
    relevantIds: [IDS.S24, IDS.S24FE],
    forbiddenIds: [],
    expectedMode: 'text',
    answer: 'Galaxy S24 giá 18.990.000 đồng. Galaxy S24 FE giá 17.490.000 đồng.',
    note: 'vector tier throws; real $text fallback path must retrieve both Galaxy S24 units',
  },
  {
    id: 'rag-no-result-008',
    query: 'nokia lumia',
    filters: { brands: ['nokia'] },
    limit: 10,
    relevantIds: [],
    forbiddenIds: [],
    expectedMode: 'fallback',
    expectedEmpty: true,
    answer: 'Không tìm thấy sản phẩm phù hợp với yêu cầu của bạn.',
    note: 'no Nokia product exists; every tier must end empty',
  },
];

module.exports = { RAG_CASES };