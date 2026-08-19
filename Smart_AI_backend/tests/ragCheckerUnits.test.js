/**
 * Focused unit/negative tests for the RAG evaluation checker utilities:
 * groundedness (sentence-level numeric assertions + product-not-retrieved),
 * retrieval metrics, prompt grounding and the evaluator's forbidden-product
 * reporting. All tests are offline and deterministic.
 */

const { evaluateGroundedness, splitClaims } = require('../evaluation/rag/groundedness');
const { recallAtK, precisionAtK, hitAtK, computeRetrievalMetrics } = require('../evaluation/rag/retrievalMetrics');
const { computePromptGrounding, evaluateRagCases } = require('../evaluation/rag/evaluator');

const makeProduct = (price, overrides = {}) => ({
  _id: 'p1',
  name: 'Galaxy S24',
  brand: 'samsung',
  price,
  inStock: 5,
  specs: {
    memory: { ram: '8 GB', storage: '256 GB' },
    battery: { capacity: '5000 mAh' },
    camera: { rear: { primary: '50 MP' } },
  },
  ...overrides,
});

describe('groundedness — numeric assertions (offline)', () => {
  it('keeps Vietnamese dot-formatted prices intact inside claims', () => {
    const claims = splitClaims('Galaxy S24 giá 19.990.000 đồng và pin 5000 mAh.');
    expect(claims).toEqual(['Galaxy S24 giá 19.990.000 đồng và pin 5000 mAh']);
  });

  it('accepts the correct dot-formatted price (catalog 19.990.000)', () => {
    const product = makeProduct(19_990_000);
    const res = evaluateGroundedness({
      answer: 'Galaxy S24 giá 19.990.000 đồng và pin 5000 mAh.',
      allProducts: [product],
      retrievedProducts: [product],
    });
    expect(res.score).toBe(1);
    expect(res.unsupportedClaims).toBe(0);
  });

  it('HIGH-1 regression: rejects a wrong dot-formatted price (18.990.000 vs catalog 19.990.000)', () => {
    const product = makeProduct(19_990_000);
    const res = evaluateGroundedness({
      answer: 'Galaxy S24 giá 18.990.000 đồng và pin 5000 mAh.',
      allProducts: [product],
      retrievedProducts: [product],
    });
    expect(res.score).toBe(0);
    expect(res.unsupportedClaims).toBe(1);
    expect(res.claims[0].reason).toContain('assertion_mismatch');
  });

  it('accepts the correct RAM', () => {
    const product = makeProduct(18_990_000);
    const res = evaluateGroundedness({
      answer: 'Galaxy S24 có RAM 8 GB.',
      allProducts: [product],
      retrievedProducts: [product],
    });
    expect(res.score).toBe(1);
  });

  it('rejects an incorrect RAM', () => {
    const product = makeProduct(18_990_000);
    const res = evaluateGroundedness({
      answer: 'Galaxy S24 có RAM 12 GB.',
      allProducts: [product],
      retrievedProducts: [product],
    });
    expect(res.score).toBe(0);
    expect(res.claims[0].reason).toContain('assertion_mismatch');
  });

  it('accepts the correct storage', () => {
    const product = makeProduct(18_990_000);
    const res = evaluateGroundedness({
      answer: 'Galaxy S24 có 256 GB bộ nhớ.',
      allProducts: [product],
      retrievedProducts: [product],
    });
    expect(res.score).toBe(1);
  });

  it('rejects an incorrect storage', () => {
    const product = makeProduct(18_990_000);
    const res = evaluateGroundedness({
      answer: 'Galaxy S24 có 512 GB bộ nhớ.',
      allProducts: [product],
      retrievedProducts: [product],
    });
    expect(res.score).toBe(0);
    expect(res.claims[0].reason).toContain('assertion_mismatch');
  });

  it('accepts the correct battery', () => {
    const product = makeProduct(18_990_000);
    const res = evaluateGroundedness({
      answer: 'Galaxy S24 có pin 5000 mAh.',
      allProducts: [product],
      retrievedProducts: [product],
    });
    expect(res.score).toBe(1);
  });

  it('rejects an incorrect battery', () => {
    const product = makeProduct(18_990_000);
    const res = evaluateGroundedness({
      answer: 'Galaxy S24 có pin 6000 mAh.',
      allProducts: [product],
      retrievedProducts: [product],
    });
    expect(res.score).toBe(0);
    expect(res.claims[0].reason).toContain('assertion_mismatch');
  });

  it('accepts the correct camera megapixels', () => {
    const product = makeProduct(18_990_000);
    const res = evaluateGroundedness({
      answer: 'Galaxy S24 có camera 50 MP.',
      allProducts: [product],
      retrievedProducts: [product],
    });
    expect(res.score).toBe(1);
  });

  it('rejects an incorrect camera megapixels', () => {
    const product = makeProduct(18_990_000);
    const res = evaluateGroundedness({
      answer: 'Galaxy S24 có camera 108 MP.',
      allProducts: [product],
      retrievedProducts: [product],
    });
    expect(res.score).toBe(0);
    expect(res.claims[0].reason).toContain('assertion_mismatch');
  });

  it('rejects a claim about a product that was not retrieved', () => {
    const s24 = makeProduct(18_990_000);
    const zFold = {
      _id: 'p2',
      name: 'Galaxy Z Fold6',
      brand: 'samsung',
      price: 42_990_000,
      specs: {},
    };
    const res = evaluateGroundedness({
      answer: 'Galaxy S24 giá 18.990.000 đồng. Galaxy Z Fold6 giá 42.990.000 đồng.',
      allProducts: [s24, zFold],
      retrievedProducts: [s24],
    });
    expect(res.score).toBe(0.5);
    expect(res.unsupportedClaims).toBe(1);
    expect(res.claims.some(c => c.reason === 'product_not_retrieved:p2')).toBe(true);
  });
});

describe('retrievalMetrics — deterministic metrics', () => {
  it('recall detects missing relevant IDs', () => {
    expect(recallAtK(['a', 'b'], ['a', 'c', 'd'], 3)).toBe(0.5);
  });

  it('recall is 1 when all relevant products are retrieved', () => {
    expect(recallAtK(['a', 'b'], ['b', 'a'], 2)).toBe(1);
  });

  it('hit@K detects a miss', () => {
    expect(hitAtK(['a'], ['b', 'c'], 2)).toBe(0);
  });

  it('hit@K hits when a relevant product is in the top K', () => {
    expect(hitAtK(['a'], ['b', 'a'], 2)).toBe(1);
  });

  it('precision changes correctly when irrelevant products are included', () => {
    expect(precisionAtK(['a'], ['a'], 1)).toBe(1);
    expect(precisionAtK(['a'], ['a', 'b'], 2)).toBe(0.5);
    expect(precisionAtK(['a'], ['a', 'b', 'c'], 3)).toBeCloseTo(1 / 3, 5);
  });

  it('computeRetrievalMetrics returns recall/precision/hit at the given K', () => {
    const m = computeRetrievalMetrics(['a'], ['a', 'b'], 2);
    expect(m.k).toBe(2);
    expect(m.recallAtK).toBe(1);
    expect(m.precisionAtK).toBe(0.5);
    expect(m.hitAtK).toBe(1);
  });
});

describe('prompt grounding — computePromptGrounding', () => {
  const product = makeProduct(18_990_000);

  it('passes when the retrieved product name/ID is present in the prompt', () => {
    const res = computePromptGrounding(
      'SẢN PHẨM 1:\n- ID: p1\n- Tên: Galaxy S24\n- Giá: 18.990.000 VND',
      [product]
    );
    expect(res.score).toBe(1);
    expect(res.found).toBe(1);
    expect(res.total).toBe(1);
  });

  it('fails when the retrieved product reference is missing from the prompt', () => {
    const res = computePromptGrounding('Bạn cần tìm sản phẩm nào ạ?', [product]);
    expect(res.score).toBe(0);
    expect(res.found).toBe(0);
  });

  it('no-result case reports the intended no-result marker, not a blind pass', () => {
    const withMarker = computePromptGrounding(
      'HIỆN TẠI KHÔNG CÓ SẢN PHẨM LIÊN QUAN TRONG KHO.',
      []
    );
    expect(withMarker.score).toBe(1);
    expect(withMarker.noProductsMarker).toBe(true);

    const withoutMarker = computePromptGrounding('Bạn cần tìm sản phẩm nào ạ?', []);
    expect(withoutMarker.noProductsMarker).toBe(false);
  });
});

describe('evaluator — forbidden product reporting', () => {
  it('flags and reports a forbidden product returned by retrieval', async () => {
    const searchFn = async () => ({
      products: [{ _id: 'a' }, { _id: 'b' }],
      searchMode: 'vector',
    });
    const getCatalog = async () => [
      { _id: 'a', name: 'A', price: 100 },
      { _id: 'b', name: 'B', price: 200 },
    ];
    const cases = [
      {
        id: 'forbidden-001',
        query: 'q',
        relevantIds: ['a'],
        forbiddenIds: ['b'],
        answer: 'Không tìm thấy sản phẩm phù hợp.',
      },
    ];

    const { results, report } = await evaluateRagCases(cases, searchFn, null, getCatalog);
    expect(results[0].retrievedIds).toContain('b');
    expect(report.forbiddenViolations).toBe(1);
    expect(results[0].passed).toBe(false);
  });
});