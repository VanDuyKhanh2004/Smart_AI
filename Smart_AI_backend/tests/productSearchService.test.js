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

const { search } = require('../services/productSearchService');
const Product = require('../models/Product');
const { generateEmbedding } = require('../utils/openai');

describe('productSearchService.search()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockProducts = [
    { _id: 'p1', name: 'iPhone 15', brand: 'apple', price: 20000000, isActive: true, inStock: 10 },
    { _id: 'p2', name: 'Galaxy S24', brand: 'samsung', price: 18000000, isActive: true, inStock: 5 },
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
      const incompleteProduct = { _id: 'p1', name: 'No Embed', isActive: true };
      Product.aggregate.mockResolvedValue([incompleteProduct]);

      const result = await search('test');

      expect(result.products).toHaveLength(1);
      expect(result.searchMode).toBe('vector');
    });
  });
});
