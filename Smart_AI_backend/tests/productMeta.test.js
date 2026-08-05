process.env.LOG_LEVEL = 'silent';

jest.mock('pino', () => {
  const mockInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => mockInstance),
  };
  return jest.fn(() => mockInstance);
});

const mockSave = jest.fn();
const MockProduct = jest.fn().mockImplementation((data) => ({
  ...data,
  _id: 'mock-product-id',
  save: mockSave,
}));
MockProduct.findOne = jest.fn();
MockProduct.findById = jest.fn();
MockProduct.findByIdAndUpdate = jest.fn();
MockProduct.aggregate = jest.fn();
MockProduct.distinct = jest.fn();
jest.mock('../models/Product', () => MockProduct);

jest.mock('../models/Review', () => ({
  getProductStats: jest.fn(),
}));

jest.mock('../services/cacheService', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  invalidatePattern: jest.fn(),
}));

jest.mock('../services/productSearchService', () => ({ search: jest.fn() }));

jest.mock('../services/productRecommendationService', () => ({ recommend: jest.fn() }));

jest.mock('../utils/embeddingContent', () => ({
  buildEmbeddingContent: jest.fn(() => 'canonical-text'),
  computeContentHash: jest.fn(() => 'hash'),
}));

jest.mock('../services/embeddingQueueService', () => ({
  enqueueProductEmbedding: jest.fn(),
}));

const mockUploadProductImageIfNeeded = jest.fn();
const mockUploadProductImageBuffer = jest.fn();
const mockDeleteImageFromCloudinary = jest.fn();
class MockProductImageValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProductImageValidationError';
    this.statusCode = 400;
    this.code = 'INVALID_PRODUCT_IMAGE';
  }
}
jest.mock('../services/productImageService', () => ({
  uploadProductImageIfNeeded: mockUploadProductImageIfNeeded,
  uploadProductImageBuffer: mockUploadProductImageBuffer,
  deleteImageFromCloudinary: mockDeleteImageFromCloudinary,
  ProductImageValidationError: MockProductImageValidationError,
}));

const mockAuthUser = { _id: '507f191e810c19729de860ea', role: 'admin' };
jest.mock('../middlewares/authMiddleware', () => ({
  protect: (req, res, next) => {
    req.user = mockAuthUser;
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));

const { getProductMeta, createProduct, updateProduct, deleteProduct } = require('../controllers/productController');
const Product = require('../models/Product');
const cache = require('../services/cacheService');
const logger = require('../utils/logger');

const productRoutes = require('../routes/productRoutes');
const errorHandler = require('../middlewares/errorHandler');
const request = require('supertest');
const express = require('express');

const mockJson = jest.fn();
const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
const mockRes = () => ({ status: mockStatus, json: mockJson });

function mockReq(body, params = {}, query = {}) {
  return { body, params, query, requestId: 'test-cid', logger };
}

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/products', productRoutes);
  app.use(errorHandler);
  return app;
};

beforeEach(() => {
  jest.clearAllMocks();
  cache.get.mockReset();
  cache.set.mockReset();
  cache.del.mockReset();
  cache.invalidatePattern.mockReset();
  Product.distinct.mockReset();
  Product.findOne.mockReset();
  Product.findById.mockReset();
  Product.findByIdAndUpdate.mockReset();
  Product.aggregate.mockReset();
  mockUploadProductImageIfNeeded.mockResolvedValue({ imageUrl: '', imagePublicId: null });
  mockDeleteImageFromCloudinary.mockResolvedValue({ deleted: true, publicId: null, result: 'skipped' });
});

describe('getProductMeta', () => {
  it('returns normalized, unique, sorted active brands on cache miss and caches result', async () => {
    Product.distinct.mockResolvedValue(['  Apple ', 'Samsung', 'Apple', null, '', '  ', 'xiaomi', 'Samsung']);
    cache.get.mockResolvedValue(null);

    const req = mockReq({}, {}, {});
    await getProductMeta(req, mockRes());

    expect(Product.distinct).toHaveBeenCalledWith('brand', { isActive: true });
    expect(cache.set).toHaveBeenCalledWith(
      'product-meta',
      { success: true, data: { brands: ['apple', 'samsung', 'xiaomi'] } },
      300,
    );
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { brands: ['apple', 'samsung', 'xiaomi'] },
    });
  });

  it('excludes null, empty, and whitespace-only brands', async () => {
    Product.distinct.mockResolvedValue(['apple', null, '', '   ', 'samsung', undefined, '  hp  ']);
    cache.get.mockResolvedValue(null);

    await getProductMeta(mockReq({}, {}, {}), mockRes());

    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { brands: ['apple', 'hp', 'samsung'] },
    });
  });

  it('normalizes casing and trims whitespace following the schema lowercase convention', async () => {
    Product.distinct.mockResolvedValue(['  APPLE  ', 'Samsung', 'GOOGLE ']);
    cache.get.mockResolvedValue(null);

    await getProductMeta(mockReq({}, {}, {}), mockRes());

    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: { brands: ['apple', 'google', 'samsung'] },
    });
  });

  it('sorts the brand list alphabetically', async () => {
    Product.distinct.mockResolvedValue(['Zebra', 'Apple', 'Mango', 'Banana']);
    cache.get.mockResolvedValue(null);

    await getProductMeta(mockReq({}, {}, {}), mockRes());

    expect(mockJson.mock.calls[0][0].data.brands).toEqual(['apple', 'banana', 'mango', 'zebra']);
  });

  it('returns empty brands array when no active products exist', async () => {
    Product.distinct.mockResolvedValue([]);
    cache.get.mockResolvedValue(null);

    await getProductMeta(mockReq({}, {}, {}), mockRes());

    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith({ success: true, data: { brands: [] } });
  });

  it('serves cached response without querying Mongo on cache hit', async () => {
    const cached = { success: true, data: { brands: ['apple', 'dell'] } };
    cache.get.mockResolvedValue(cached);

    await getProductMeta(mockReq({}, {}, {}), mockRes());

    expect(Product.distinct).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith(cached);
  });

  it('recomputes from Mongo when cached value is malformed (no brands array)', async () => {
    cache.get.mockResolvedValue({ success: true, data: { brands: 'not-an-array' } });
    Product.distinct.mockResolvedValue(['apple', 'dell']);

    await getProductMeta(mockReq({}, {}, {}), mockRes());

    expect(Product.distinct).toHaveBeenCalled();
    expect(mockJson).toHaveBeenCalledWith({ success: true, data: { brands: ['apple', 'dell'] } });
  });

  it('still returns 200 when Redis is unavailable (cache get returns null)', async () => {
    Product.distinct.mockResolvedValue(['apple', 'dell']);
    cache.get.mockResolvedValue(null);
    cache.set.mockResolvedValue(undefined);

    await getProductMeta(mockReq({}, {}, {}), mockRes());

    expect(Product.distinct).toHaveBeenCalled();
    expect(cache.set).toHaveBeenCalled();
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith({ success: true, data: { brands: ['apple', 'dell'] } });
  });

  it('still returns 200 when cache.set fails internally', async () => {
    Product.distinct.mockResolvedValue(['apple']);
    cache.get.mockResolvedValue(null);
    cache.set.mockRejectedValue(new Error('redis down'));

    await getProductMeta(mockReq({}, {}, {}), mockRes());

    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith({ success: true, data: { brands: ['apple'] } });
  });

  it('forwards unexpected error to next', async () => {
    const dbError = new Error('DB failure');
    Product.distinct.mockRejectedValue(dbError);

    const next = jest.fn();
    await getProductMeta(mockReq({}, {}, {}), mockRes(), next);

    expect(next).toHaveBeenCalledWith(dbError);
  });

  it('does not use console.log or console.error on success', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    Product.distinct.mockResolvedValue(['apple']);
    cache.get.mockResolvedValue(null);

    await getProductMeta(mockReq({}, {}, {}), mockRes());

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('product-meta cache invalidation on product writes', () => {
  it('createProduct invalidates product-meta', async () => {
    Product.findOne.mockResolvedValue(null);
    const savedProduct = { _id: 'p1', name: 'X', brand: 'x', price: 1, description: 'd', specs: {}, colors: [], inStock: 0, tags: [], image: '', embeddingStatus: 'pending' };
    mockSave.mockResolvedValue(savedProduct);

    const req = mockReq({ name: 'X', brand: 'x', price: 1, description: 'd' });
    const res = mockRes();
    await createProduct(req, res);

    expect(cache.invalidatePattern).toHaveBeenCalledWith('products:*');
    expect(cache.del).toHaveBeenCalledWith('product-meta');
  });

  it('updateProduct invalidates product-meta', async () => {
    const existing = { _id: 'p1', name: 'X', brand: 'x', price: 1, description: 'old', specs: {}, colors: [], inStock: 0, tags: [], image: '', embeddingStatus: 'ready', embeddingContentHash: 'abc' };
    Product.findById.mockResolvedValue({ ...existing });
    Product.findByIdAndUpdate.mockResolvedValue({ ...existing, description: 'new' });

    const req = mockReq({ name: 'X', brand: 'x', price: 1, description: 'new' }, { id: 'p1' });
    const res = mockRes();
    await updateProduct(req, res);

    expect(cache.del).toHaveBeenCalledWith('product:p1');
    expect(cache.invalidatePattern).toHaveBeenCalledWith('products:*');
    expect(cache.del).toHaveBeenCalledWith('product-meta');
  });

  it('deleteProduct invalidates product-meta', async () => {
    Product.findByIdAndUpdate.mockResolvedValue({ _id: 'p1', isActive: false });

    const req = mockReq({}, { id: 'p1' });
    const res = mockRes();
    await deleteProduct(req, res);

    expect(cache.del).toHaveBeenCalledWith('product:p1');
    expect(cache.invalidatePattern).toHaveBeenCalledWith('products:*');
    expect(cache.del).toHaveBeenCalledWith('product-meta');
  });
});

describe('GET /api/products/meta route (supertest)', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
  });

  it('returns 200 with brands for the meta endpoint', async () => {
    Product.distinct.mockResolvedValue(['Apple', 'Samsung']);
    cache.get.mockResolvedValue(null);

    const res = await request(app).get('/api/products/meta').expect(200);

    expect(res.body).toEqual({ success: true, data: { brands: ['apple', 'samsung'] } });
  });

  it('/meta is not treated as /:id — returns metadata, not a product lookup error', async () => {
    Product.distinct.mockResolvedValue(['Apple']);
    cache.get.mockResolvedValue(null);

    const res = await request(app).get('/api/products/meta').expect(200);

    expect(Product.findOne).not.toHaveBeenCalled();
    expect(Product.findById).not.toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(res.body.error).toBeUndefined();
  });

  it('semantic search route remains reachable', async () => {
    const productSearchService = require('../services/productSearchService');
    productSearchService.search.mockResolvedValue({
      products: [{ _id: 'p1', name: 'Result' }],
      searchMode: 'vector',
    });

    const res = await request(app)
      .get('/api/products/search/semantic')
      .query({ q: 'iphone' })
      .expect(200);

    expect(res.body.data.products).toHaveLength(1);
  });

  it('GET /api/products list response is unchanged', async () => {
    Product.aggregate
      .mockResolvedValueOnce([{ _id: 'p1', name: 'Product' }])
      .mockResolvedValueOnce([{ total: 5 }]);

    const res = await request(app).get('/api/products').query({ page: '1', limit: '1' }).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.products).toHaveLength(1);
    expect(res.body.data.pagination.totalCount).toBe(5);
  });
});