jest.mock('../models/Product', () => ({
  aggregate: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

jest.mock('../utils/openai', () => ({
  generateEmbedding: jest.fn(),
  generateEmbeddingsBatch: jest.fn(),
  calculateSimilarity: jest.fn(),
  testOpenAIConnection: jest.fn(),
}));

const { search, buildVectorPreFilter, buildVectorPostFilter, candidateWindow } = require('../services/productSearchService');
const Product = require('../models/Product');
const { generateEmbedding } = require('../utils/openai');

describe('productSearchService.search()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockProducts = [
    { _id: 'p1', name: 'iPhone 15', brand: 'apple', price: 20000000, isActive: true, inStock: 10, score: 0.85 },
    { _id: 'p2', name: 'Galaxy S24', brand: 'samsung', price: 18000000, isActive: true, inStock: 5, score: 0.72 },
  ];

  describe('vector search path', () => {
    beforeEach(() => {
      generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
      Product.aggregate.mockResolvedValue(mockProducts);
    });

    it('returns products with searchMode vector when vector search succeeds', async () => {
      const result = await search('iphone 15');

      expect(generateEmbedding).toHaveBeenCalledWith('iphone 15');
      expect(Product.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $vectorSearch: expect.objectContaining({
              index: 'vector_index',
              path: 'embedding_vector',
              limit: 10,
            }),
          }),
        ])
      );
      expect(result.products).toEqual(mockProducts);
      expect(result.searchMode).toBe('vector');
    });

    it('excludes embedding_vector from aggregate projection', async () => {
      await search('test');

      const pipeline = Product.aggregate.mock.calls[0][0];
      const projectStage = pipeline.find((s) => s.$project);
      expect(projectStage.$project.embedding_vector).toBe(0);
    });

    it('filters by isActive in vector search pipeline', async () => {
      await search('test');

      const pipeline = Product.aggregate.mock.calls[0][0];
      const matchStage = pipeline.find((s) => s.$match);
      expect(matchStage.$match.isActive).toBe(true);
    });
  });

  describe('fallback to text search', () => {
    beforeEach(() => {
      generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
      Product.aggregate.mockResolvedValue([]);
      Product.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockProducts),
      });
    });

    it('falls back to $text search when vector search returns empty', async () => {
      const result = await search('iphone');

      expect(result.searchMode).toBe('text');
      expect(result.products).toEqual(mockProducts);
    });

    it('excludes embedding_vector in text fallback', async () => {
      await search('iphone');

      const selectMock = Product.find.mock.results[0].value.select;
      expect(selectMock).toHaveBeenCalledWith('-embedding_vector');
    });
  });

  describe('fallback to latest products', () => {
    beforeEach(() => {
      generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
      Product.aggregate.mockResolvedValue([]);
      const textFind = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      Product.find.mockImplementationOnce(() => textFind());
      Product.find.mockImplementationOnce(() => ({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockProducts),
      }));
    });

    it('falls back to latest in-stock products when text search also returns empty', async () => {
      const result = await search('unknown');

      expect(result.searchMode).toBe('fallback');
      expect(result.products).toEqual(mockProducts);
    });

    it('filters by inStock > 0 in final fallback', async () => {
      await search('unknown');

      expect(Product.find).toHaveBeenLastCalledWith(
        expect.objectContaining({ inStock: { $gt: 0 }, isActive: true })
      );
    });
  });

  describe('error handling', () => {
    it('falls back to text search when generateEmbedding fails', async () => {
      generateEmbedding.mockRejectedValue(new Error('Gemini API error'));
      Product.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockProducts),
      });

      const result = await search('test');

      expect(result.searchMode).toBe('text');
      expect(result.products).toEqual(mockProducts);
    });

    it('falls back to latest products when vector search throws', async () => {
      generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
      Product.aggregate.mockRejectedValue(new Error('$vectorSearch failed'));
      Product.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockProducts),
      });

      const result = await search('test');

      expect(result.searchMode).toBe('text');
      expect(result.products).toEqual(mockProducts);
    });

    it('returns empty products when all fallbacks fail', async () => {
      generateEmbedding.mockRejectedValue(new Error('Gemini API error'));
      Product.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockRejectedValue(new Error('DB error')),
      });

      const result = await search('test');

      expect(result.searchMode).toBe('fallback');
      expect(result.products).toEqual([]);
    });
  });

  describe('limit handling', () => {
    beforeEach(() => {
      generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
      Product.aggregate.mockResolvedValue(mockProducts);
    });

    it('defaults to 10', async () => {
      await search('test');

      expect(Product.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $vectorSearch: expect.objectContaining({ limit: 10 }),
          }),
        ])
      );
    });

    it('caps at 50', async () => {
      await search('test', 100);

      expect(Product.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $vectorSearch: expect.objectContaining({ limit: 50 }),
          }),
        ])
      );
    });

    it('uses passed limit when within range', async () => {
      await search('test', 5);

      expect(Product.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $vectorSearch: expect.objectContaining({ limit: 5 }),
          }),
        ])
      );
    });
  });

  describe('products without embedding_vector', () => {
    it('does not crash when aggregate omits embedding_vector', async () => {
      generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
      const incompleteProduct = { _id: 'p1', name: 'No Embed', isActive: true, score: 0.6 };
      Product.aggregate.mockResolvedValue([incompleteProduct]);

      const result = await search('test');

      expect(result.products).toHaveLength(1);
      expect(result.searchMode).toBe('vector');
    });
  });

  describe('vector search pre-filter ($vectorSearch.filter)', () => {
    beforeEach(() => {
      generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
    });

    it('A. pushes supported constraints (brand, price, isActive) into $vectorSearch.filter', async () => {
      Product.aggregate.mockResolvedValue(mockProducts);

      await search('samsung duoi 15 trieu', 5, {
        brands: ['samsung'],
        maxPrice: 15_000_000,
      });

      const pipeline = Product.aggregate.mock.calls[0][0];
      const vs = pipeline.find((s) => s.$vectorSearch);
      expect(vs.$vectorSearch.filter).toEqual({
        brand: 'samsung',
        price: { $lte: 15_000_000 },
        isActive: true,
      });
    });

    it('A2. uses $in form when multiple brands are constrained', async () => {
      Product.aggregate.mockResolvedValue(mockProducts);

      await search('samsung hoac apple', 5, {
        brands: ['samsung', 'apple'],
      });

      const pipeline = Product.aggregate.mock.calls[0][0];
      const vs = pipeline.find((s) => s.$vectorSearch);
      expect(vs.$vectorSearch.filter.brand).toEqual({ $in: ['samsung', 'apple'] });
      expect(vs.$vectorSearch.filter.isActive).toBe(true);
    });

    it('B. keeps unsupported constraints (inStock, excludedBrands) in post-$match', async () => {
      Product.aggregate.mockResolvedValue(mockProducts);

      await search('samsung con hang', 5, {
        brands: ['samsung'],
        excludedBrands: ['apple'],
        inStock: true,
      });

      const pipeline = Product.aggregate.mock.calls[0][0];
      const vs = pipeline.find((s) => s.$vectorSearch);

      // inStock and excludedBrands are NOT declared as Atlas filter fields:
      // they must stay out of $vectorSearch.filter.
      expect(vs.$vectorSearch.filter.inStock).toBeUndefined();
      expect(vs.$vectorSearch.filter.brand).toBe('samsung');

      // They remain as a post-retrieval $match (multi-condition $and form).
      const matchStages = pipeline.filter((s) => s.$match);
      const postMatch = matchStages[matchStages.length - 1];
      expect(postMatch.$match).toEqual({
        $and: [
          { brand: { $nin: ['apple'] } },
          { inStock: { $gt: 0 } },
        ],
      });
    });

    it('B2. does not emit an empty filter when no supported constraint applies', async () => {
      Product.aggregate.mockResolvedValue(mockProducts);

      // inStock-only constraint: no Atlas filter field is involved.
      await search('con hang', 5, { inStock: true });

      const pipeline = Product.aggregate.mock.calls[0][0];
      const vs = pipeline.find((s) => s.$vectorSearch);
      expect(vs.$vectorSearch.filter).toBeUndefined();
    });

    it('C. stock safety remains intact in the vector post-$match', async () => {
      Product.aggregate.mockResolvedValue(mockProducts);

      await search('con hang', 5, { inStock: true });

      const pipeline = Product.aggregate.mock.calls[0][0];
      const matchStages = pipeline.filter((s) => s.$match);
      const postMatch = matchStages[matchStages.length - 1];
      expect(postMatch.$match.inStock).toEqual({ $gt: 0 });
      // isActive defense-in-depth stays in the pipeline.
      expect(matchStages.some((s) => s.$match.isActive === true)).toBe(true);
    });

    it('D. keeps brand/price in the text and latest fallback filters', async () => {
      Product.aggregate.mockResolvedValue([]);
      const textFind = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });
      Product.find.mockImplementationOnce(() => textFind());
      Product.find.mockImplementationOnce(() => ({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockProducts),
      }));

      await search('samsung duoi 15 trieu', 5, {
        brands: ['samsung'],
        maxPrice: 15_000_000,
      });

      expect(Product.find).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isActive: true,
          inStock: { $gt: 0 },
          $and: expect.arrayContaining([
            { brand: { $in: ['samsung'] } },
            { price: { $lte: 15_000_000 } },
          ]),
        })
      );
    });

    it('E. constrained query whose candidates all satisfy the constraint does not fall back', async () => {
      // Simulate Atlas applying the pre-filter: it returns only samsung products.
      Product.aggregate.mockResolvedValue([
        { _id: 'p1', name: 'Galaxy S24', brand: 'samsung', price: 12_000_000, isActive: true, inStock: 10, score: 0.9 },
      ]);

      const result = await search('samsung duoi 15 trieu', 5, {
        brands: ['samsung'],
        maxPrice: 15_000_000,
      });

      expect(result.searchMode).toBe('vector');
      expect(result.products).toHaveLength(1);
    });

    it('F. numCandidates is deterministic and bounded by the request size', async () => {
      Product.aggregate.mockResolvedValue(mockProducts);

      // K=10 -> W = min(max(30,12),50)=30 -> numCandidates = max(300,100)=300
      await search('test', 10, { brands: ['samsung'] });
      let pipeline = Product.aggregate.mock.calls[0][0];
      let vs = pipeline.find((s) => s.$vectorSearch);
      expect(vs.$vectorSearch.limit).toBe(30);
      expect(vs.$vectorSearch.numCandidates).toBe(300);

      // K=50 -> W = min(max(150,12),50)=50 -> numCandidates = max(500,100)=500
      await search('test', 50, { brands: ['samsung'] });
      pipeline = Product.aggregate.mock.calls[1][0];
      vs = pipeline.find((s) => s.$vectorSearch);
      expect(vs.$vectorSearch.limit).toBe(50);
      expect(vs.$vectorSearch.numCandidates).toBe(500);

      // Direct helper: bounded, deterministic.
      expect(candidateWindow(1)).toEqual({ W: 12, numCandidates: 120 });
      expect(candidateWindow(5)).toEqual({ W: 15, numCandidates: 150 });
      expect(candidateWindow(100)).toEqual({ W: 50, numCandidates: 500 });
    });

    it('G. fallback still triggers when the vector tier genuinely returns nothing', async () => {
      generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
      Product.aggregate.mockResolvedValue([]);
      Product.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockProducts),
      });

      const result = await search('samsung duoi 15 trieu', 5, {
        brands: ['samsung'],
        maxPrice: 15_000_000,
      });

      expect(result.searchMode).toBe('text');
      expect(result.products).toEqual(mockProducts);
    });
  });

  describe('buildVectorPreFilter / buildVectorPostFilter unit behavior', () => {
    it('pre-filter returns null when only unsupported fields apply', () => {
      expect(buildVectorPreFilter({ inStock: true })).toBeNull();
      expect(buildVectorPreFilter({ excludedBrands: ['apple'] })).toBeNull();
      expect(buildVectorPreFilter(null)).toBeNull();
      expect(buildVectorPreFilter({})).toBeNull();
    });

    it('pre-filter maps single brand to exact equality', () => {
      expect(buildVectorPreFilter({ brands: ['samsung'] })).toEqual({
        brand: 'samsung',
        isActive: true,
      });
    });

    it('pre-filter maps price range', () => {
      expect(buildVectorPreFilter({ minPrice: 5_000_000, maxPrice: 15_000_000 })).toEqual({
        price: { $gte: 5_000_000, $lte: 15_000_000 },
        isActive: true,
      });
    });

    it('post-filter keeps only inStock and excludedBrands', () => {
      expect(buildVectorPostFilter({
        brands: ['samsung'],
        maxPrice: 15_000_000,
        excludedBrands: ['apple'],
        inStock: true,
      })).toEqual({
        $and: [
          { brand: { $nin: ['apple'] } },
          { inStock: { $gt: 0 } },
        ],
      });
      expect(buildVectorPostFilter({ brands: ['samsung'], maxPrice: 15_000_000 })).toBeNull();
      expect(buildVectorPostFilter(null)).toBeNull();
    });
  });

  describe('vector relevance threshold (MIN_VECTOR_SCORE = 0.45)', () => {
    it('filters out results with score below 0.45', async () => {
      generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
      Product.aggregate.mockResolvedValue([
        { _id: 'p1', name: 'Match', score: 0.6 },
        { _id: 'p2', name: 'Weak', score: 0.3 },
      ]);

      const result = await search('test query');

      expect(result.searchMode).toBe('vector');
      expect(result.products).toHaveLength(1);
      expect(result.products[0]._id).toBe('p1');
    });

    it('retains result with score exactly 0.45', async () => {
      generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
      Product.aggregate.mockResolvedValue([
        { _id: 'p1', name: 'Exact Boundary', score: 0.45 },
      ]);

      const result = await search('test query');

      expect(result.searchMode).toBe('vector');
      expect(result.products).toHaveLength(1);
      expect(result.products[0].score).toBe(0.45);
    });

    it('retains results with score above 0.45', async () => {
      generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
      Product.aggregate.mockResolvedValue([
        { _id: 'p1', name: 'Strong', score: 0.9 },
        { _id: 'p2', name: 'Good', score: 0.55 },
      ]);

      const result = await search('test query');

      expect(result.searchMode).toBe('vector');
      expect(result.products).toHaveLength(2);
    });

    it('triggers existing fallback when all results are below threshold', async () => {
      generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
      Product.aggregate.mockResolvedValue([
        { _id: 'p1', name: 'Weak1', score: 0.2 },
        { _id: 'p2', name: 'Weak2', score: 0.1 },
      ]);
      Product.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockProducts),
      });

      const result = await search('test query');

      expect(result.searchMode).toBe('text');
      expect(result.products).toEqual(mockProducts);
    });

    it('preserves score field in returned products', async () => {
      generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
      Product.aggregate.mockResolvedValue([
        { _id: 'p1', name: 'Scored', score: 0.72 },
      ]);

      const result = await search('test query');

      expect(result.products[0].score).toBe(0.72);
    });

    it('does not let products with missing/undefined score pass threshold', async () => {
      generateEmbedding.mockResolvedValue(new Array(1536).fill(0.1));
      Product.aggregate.mockResolvedValue([
        { _id: 'p1', name: 'No Score' },
        { _id: 'p2', name: 'Null Score', score: null },
        { _id: 'p3', name: 'NaN Score', score: NaN },
      ]);
      Product.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      const result = await search('test query');

      // All should be filtered out — none have a valid numeric score >= 0.45
      expect(result.products).toHaveLength(0);
    });
  });
});
