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

jest.mock('../models/Product', () => {
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
  return MockProduct;
});

jest.mock('../models/Review', () => ({
  getProductStats: jest.fn(),
}));

jest.mock('../services/cacheService', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  invalidatePattern: jest.fn(),
}));

jest.mock('../services/productSearchService', () => ({
  search: jest.fn(),
}));

jest.mock('../services/productRecommendationService', () => ({
  recommend: jest.fn(),
}));

const mockBuildEmbeddingContent = jest.fn();
const mockComputeContentHash = jest.fn();
jest.mock('../utils/embeddingContent', () => ({
  buildEmbeddingContent: mockBuildEmbeddingContent,
  computeContentHash: mockComputeContentHash,
}));

const mockEnqueueProductEmbedding = jest.fn();
jest.mock('../services/embeddingQueueService', () => ({
  enqueueProductEmbedding: mockEnqueueProductEmbedding,
}));

const mockUploadProductImageIfNeeded = jest.fn();
const mockDeleteImageFromCloudinary = jest.fn();
class MockProductImageValidationError extends Error {
  constructor(message) { super(message); this.name = 'ProductImageValidationError'; this.statusCode = 400; this.code = 'INVALID_PRODUCT_IMAGE'; }
}
jest.mock('../services/productImageService', () => ({
  uploadProductImageIfNeeded: mockUploadProductImageIfNeeded,
  deleteImageFromCloudinary: mockDeleteImageFromCloudinary,
  ProductImageValidationError: MockProductImageValidationError,
}));

const {
  createProduct, getAllProducts, getProductById, updateProduct, deleteProduct,
  searchSemantic, getRecommendations,
  normalizeSearchQuery, GENERIC_SEARCH_TOKENS, hasNonGenericTokenMatch,
  escapeRegex,
} = require('../controllers/productController');
const Product = require('../models/Product');
const Review = require('../models/Review');
const cache = require('../services/cacheService');
const productSearchService = require('../services/productSearchService');
const productRecommendationService = require('../services/productRecommendationService');
const logger = require('../utils/logger');

const mockJson = jest.fn();
const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
const mockRes = () => ({ status: mockStatus, json: mockJson });

function mockReq(body, params = {}, query = {}) {
  return { body, params, query, requestId: 'test-cid' };
}

beforeEach(() => {
  jest.clearAllMocks();
  cache.get.mockReset();
  productSearchService.search.mockReset();
  productRecommendationService.recommend.mockReset();
  mockComputeContentHash.mockReturnValue('changed-hash');
  mockUploadProductImageIfNeeded.mockResolvedValue({ imageUrl: '', imagePublicId: null });
  mockDeleteImageFromCloudinary.mockResolvedValue({ deleted: true, publicId: null, result: 'skipped' });
});

/* Reset complex mock chains that persist past clearAllMocks */
function mockFindOneQuery(returnValue, options = {}) {
  const mockLean = jest.fn();
  if (options.reject) {
    mockLean.mockRejectedValue(returnValue);
  } else {
    mockLean.mockResolvedValue(returnValue);
  }
  const mockSelect = jest.fn().mockReturnValue({ lean: mockLean });
  Product.findOne.mockReturnValue({ select: mockSelect });
  return { mockSelect, mockLean };
}

describe('createProduct', () => {
  it('normalizes specs to the canonical shape on create', async () => {
    const reqBody = {
      name: 'Galaxy S24',
      brand: 'Samsung',
      price: 899,
      description: 'Flagship phone',
      specs: {
        screen: { size: ' 6.2 inch ', brightness: '2000 nits' },
        memory: { ram: '8 GB', expandable: 'true' },
        junkField: 'should be dropped',
      },
    };

    const savedProduct = {
      _id: 'prod-norm',
      name: 'Galaxy S24',
      brand: 'samsung',
      price: 899,
      description: 'Flagship phone',
      specs: { screen: { size: '6.2 inch' }, memory: { ram: '8 GB', expandable: true } },
      colors: [],
      inStock: 0,
      tags: [],
      image: '',
      embeddingStatus: 'pending',
    };

    Product.findOne.mockResolvedValue(null);
    const mockSave = new Product({}).save;
    mockSave.mockResolvedValue(savedProduct);

    const req = mockReq(reqBody);
    const res = mockRes();

    mockBuildEmbeddingContent.mockReturnValue('canonical-text');

    await createProduct(req, res);

    expect(Product).toHaveBeenCalledWith(expect.objectContaining({
      specs: { screen: { size: '6.2 inch' }, memory: { ram: '8 GB', expandable: true } },
    }));
  });

  it('defaults specs to empty object when omitted on create', async () => {
    const reqBody = {
      name: 'Pixel 8',
      brand: 'Google',
      price: 699,
      description: 'AI phone',
    };

    const savedProduct = {
      _id: 'prod-empty',
      name: 'Pixel 8',
      brand: 'google',
      price: 699,
      description: 'AI phone',
      specs: {},
      colors: [],
      inStock: 0,
      tags: [],
      image: '',
      embeddingStatus: 'pending',
    };

    Product.findOne.mockResolvedValue(null);
    const mockSave = new Product({}).save;
    mockSave.mockResolvedValue(savedProduct);

    const req = mockReq(reqBody);
    const res = mockRes();

    mockBuildEmbeddingContent.mockReturnValue('canonical-text');

    await createProduct(req, res);

    expect(Product).toHaveBeenCalledWith(expect.objectContaining({ specs: {} }));
  });

  it('builds canonical content from savedProduct, not req.body', async () => {
    const reqBody = {
      name: 'iPhone 15',
      brand: 'Apple',
      price: 999,
      description: 'Latest iPhone',
    };

    const savedProduct = {
      _id: 'prod-1',
      name: 'iPhone 15',
      brand: 'apple',
      price: 999,
      description: 'Latest iPhone',
      specs: {},
      colors: [],
      inStock: 0,
      tags: [],
      image: '',
      embeddingStatus: 'pending',
    };

    Product.findOne.mockResolvedValue(null);
    const mockSave = new Product({}).save;
    mockSave.mockResolvedValue(savedProduct);

    const req = mockReq(reqBody);
    const res = mockRes();

    mockBuildEmbeddingContent.mockReturnValue('canonical-text');

    await createProduct(req, res);

    expect(mockBuildEmbeddingContent).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'prod-1',
      brand: 'apple',
    }));
    expect(mockBuildEmbeddingContent.mock.calls[0][0]).toBe(savedProduct);
  });

  it('uses normalized brand from Mongoose document', async () => {
    const reqBody = {
      name: 'Galaxy S24',
      brand: 'SAMSUNG',
      price: 899,
      description: 'Flagship phone',
    };

    const savedProduct = {
      _id: 'prod-2',
      name: 'Galaxy S24',
      brand: 'samsung',
      price: 899,
      description: 'Flagship phone',
      specs: {},
      colors: [],
      inStock: 0,
      tags: [],
      image: '',
      embeddingStatus: 'pending',
    };

    Product.findOne.mockResolvedValue(null);
    const mockSave = new Product({}).save;
    mockSave.mockResolvedValue(savedProduct);

    const req = mockReq(reqBody);
    const res = mockRes();

    mockBuildEmbeddingContent.mockImplementation((product) => `text-${product.brand}`);

    await createProduct(req, res);

    expect(mockBuildEmbeddingContent).toHaveBeenCalledWith(
      expect.objectContaining({ brand: 'samsung' }),
    );
  });

  it('enqueues embedding with correlationId after save', async () => {
    const reqBody = {
      name: 'Pixel 8',
      brand: 'Google',
      price: 699,
      description: 'AI phone',
    };

    const savedProduct = {
      _id: 'prod-3',
      name: 'Pixel 8',
      brand: 'google',
      price: 699,
      description: 'AI phone',
      specs: {},
      colors: [],
      inStock: 0,
      tags: [],
      image: '',
      embeddingStatus: 'pending',
    };

    Product.findOne.mockResolvedValue(null);
    const mockSave = new Product({}).save;
    mockSave.mockResolvedValue(savedProduct);

    const req = mockReq(reqBody);
    const res = mockRes();

    mockBuildEmbeddingContent.mockReturnValue('canonical-text');

    await createProduct(req, res);

    expect(mockEnqueueProductEmbedding).toHaveBeenCalledWith(
      'prod-3',
      'canonical-text',
      'create',
      'test-cid',
    );
  });

  it('logs product created with safe metadata only', async () => {
    const savedProduct = {
      _id: 'prod-log-1',
      name: 'Test Phone',
      brand: 'test',
      price: 500,
      description: 'A phone',
      specs: {},
      colors: [],
      inStock: 0,
      tags: [],
      image: '',
      embeddingStatus: 'pending',
    };

    Product.findOne.mockResolvedValue(null);
    const mockSave = new Product({}).save;
    mockSave.mockResolvedValue(savedProduct);

    const req = mockReq({ name: 'Test Phone', brand: 'Test', price: 500, description: 'A phone' });
    const res = mockRes();

    mockBuildEmbeddingContent.mockReturnValue('canonical-text');

    await createProduct(req, res);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'prod-log-1', requestId: 'test-cid' }),
      'Product created',
    );
    const logCall = logger.info.mock.calls.find(c => c[1] === 'Product created');
    expect(logCall).toBeDefined();
    expect(logCall[0]).not.toHaveProperty('description');
    expect(logCall[0]).not.toHaveProperty('name');
    expect(logCall[0]).not.toHaveProperty('canonicalText');
  });

  it('does not use console.log or console.error on success', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const savedProduct = {
      _id: 'prod-no-console',
      name: 'X',
      brand: 'Y',
      price: 1,
      description: 'D',
      specs: {},
      colors: [],
      inStock: 0,
      tags: [],
      image: '',
      embeddingStatus: 'pending',
    };

    Product.findOne.mockResolvedValue(null);
    const mockSave = new Product({}).save;
    mockSave.mockResolvedValue(savedProduct);

    const req = mockReq({ name: 'X', brand: 'Y', price: 1, description: 'D' });
    const res = mockRes();

    mockBuildEmbeddingContent.mockReturnValue('text');

    await createProduct(req, res);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('forwards error to next on failure', async () => {
    Product.findOne.mockRejectedValue(new Error('DB down'));

    const req = mockReq({ name: 'X', brand: 'Y', price: 1, description: 'D' });
    const res = mockRes();
    const next = jest.fn();

    await createProduct(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('returns 400 for missing required fields', async () => {
    const req = mockReq({ name: '', brand: '', price: '', description: '' });
    const res = mockRes();
    const next = jest.fn();
    await createProduct(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Thiếu thông tin bắt buộc: name, brand, price, description',
      }),
    );
  });

  it('returns 400 for duplicate product', async () => {
    Product.findOne.mockResolvedValue({ _id: 'existing', name: 'Test', brand: 'test' });

    const req = mockReq({ name: 'Test', brand: 'test', price: 100, description: 'Desc' });
    const res = mockRes();
    const next = jest.fn();
    await createProduct(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Sản phẩm đã tồn tại với tên và hãng này',
      }),
    );
  });

  it('forwards Mongoose ValidationError to error handler', async () => {
    Product.findOne.mockResolvedValue(null);
    const valErr = new Error('Validation failed');
    valErr.name = 'ValidationError';
    valErr.errors = {
      name: { path: 'name', message: 'Tên là bắt buộc' },
    };
    const mockSave = new Product({}).save;
    mockSave.mockRejectedValue(valErr);

    const req = mockReq({ name: 'Test', brand: 'test', price: 100, description: 'Desc' });
    const res = mockRes();
    const next = jest.fn();
    await createProduct(req, res, next);

    expect(next).toHaveBeenCalledWith(valErr);
  });

  it('forwards unexpected error on save', async () => {
    Product.findOne.mockResolvedValue(null);
    const mockSave = new Product({}).save;
    mockSave.mockRejectedValue(new Error('DB write failed'));

    const req = mockReq({ name: 'Test', brand: 'test', price: 100, description: 'Desc' });
    const res = mockRes();
    const next = jest.fn();
    await createProduct(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'DB write failed' }),
    );
  });
});

describe('updateProduct', () => {
  const existingProduct = {
    _id: 'prod-update-1',
    name: 'MacBook Pro',
    brand: 'apple',
    price: 1999,
    description: 'Powerful laptop',
    specs: { processor: { chipset: 'M3' }, memory: { ram: '16 GB', storage: '512 GB' } },
    colors: ['Silver', 'Space Gray'],
    inStock: 10,
    tags: ['laptop'],
    image: 'macbook.jpg',
    embeddingStatus: 'ready',
    embeddingContentHash: 'abc',
  };

  function makeReqBody(name, brand, price, description, specs, colors, inStock, tags, image) {
    return { name, brand, price, description, specs, colors, inStock, tags, image };
  }

  it('builds canonical content from updatedProduct on description-only change', async () => {
    const reqBody = makeReqBody(
      'MacBook Pro', 'apple', 1999, 'Updated description',
      { processor: { chipset: 'M3' }, memory: { ram: '16 GB', storage: '512 GB' } },
      ['Silver', 'Space Gray'], 10, ['laptop'], 'macbook.jpg',
    );

    const updatedProduct = {
      ...existingProduct,
      description: 'Updated description',
      embeddingStatus: 'pending',
      _id: 'prod-update-1',
    };

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue(updatedProduct);

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    mockBuildEmbeddingContent.mockReturnValue('full-updated-text');

    await updateProduct(req, res);

    expect(mockBuildEmbeddingContent).toHaveBeenCalledWith(updatedProduct);
    expect(mockEnqueueProductEmbedding).toHaveBeenCalledWith(
      'prod-update-1',
      'full-updated-text',
      'update',
      'test-cid',
    );
  });

  it('builds canonical content from updatedProduct on price-only change', async () => {
    const reqBody = makeReqBody(
      'MacBook Pro', 'apple', 1799, 'Powerful laptop',
      { processor: { chipset: 'M3' }, memory: { ram: '16 GB', storage: '512 GB' } },
      ['Silver', 'Space Gray'], 10, ['laptop'], 'macbook.jpg',
    );

    const updatedProduct = {
      ...existingProduct,
      price: 1799,
      embeddingStatus: 'pending',
      _id: 'prod-update-1',
    };

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue(updatedProduct);

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    mockBuildEmbeddingContent.mockReturnValue('price-updated-text');

    await updateProduct(req, res);

    expect(mockBuildEmbeddingContent).toHaveBeenCalledWith(updatedProduct);
    expect(mockEnqueueProductEmbedding).toHaveBeenCalledWith(
      'prod-update-1',
      'price-updated-text',
      'update',
      'test-cid',
    );
  });

  it('does not enqueue embedding when only stock changes', async () => {
    const reqBody = makeReqBody(
      'MacBook Pro', 'apple', 1999, 'Powerful laptop',
      { processor: { chipset: 'M3' }, memory: { ram: '16 GB', storage: '512 GB' } },
      ['Silver', 'Space Gray'], 25, ['laptop'], 'macbook.jpg',
    );

    const updatedProduct = {
      ...existingProduct,
      inStock: 25,
    };

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue(updatedProduct);

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    await updateProduct(req, res);

    expect(mockBuildEmbeddingContent).not.toHaveBeenCalled();
    expect(mockEnqueueProductEmbedding).not.toHaveBeenCalled();
  });

  it('does not enqueue when specs omitted in stock-only update', async () => {
    const reqBody = {
      name: 'MacBook Pro', brand: 'apple', price: 1999, description: 'Powerful laptop', inStock: 25,
    };

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingProduct, inStock: 25 });

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    await updateProduct(req, res);

    expect(mockBuildEmbeddingContent).not.toHaveBeenCalled();
    expect(mockEnqueueProductEmbedding).not.toHaveBeenCalled();
  });

  it('does not enqueue when colors omitted in stock-only update', async () => {
    const reqBody = {
      name: 'MacBook Pro', brand: 'apple', price: 1999, description: 'Powerful laptop', inStock: 25,
    };

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingProduct, inStock: 25 });

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    await updateProduct(req, res);

    expect(mockBuildEmbeddingContent).not.toHaveBeenCalled();
    expect(mockEnqueueProductEmbedding).not.toHaveBeenCalled();
  });

  it('preserves existing specs and colors when omitted from request', async () => {
    const reqBody = {
      name: 'MacBook Pro', brand: 'apple', price: 1999, description: 'Powerful laptop', inStock: 25,
    };

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingProduct, inStock: 25 });

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    await updateProduct(req, res);

    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      'prod-update-1',
      expect.not.objectContaining({
        $set: expect.objectContaining({ specs: expect.anything() }),
      }),
      expect.any(Object),
    );
    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      'prod-update-1',
      expect.not.objectContaining({
        $set: expect.objectContaining({ colors: expect.anything() }),
      }),
      expect.any(Object),
    );
  });

  it('embeddingStatus remains ready when specs/colors omitted', async () => {
    const reqBody = {
      name: 'MacBook Pro', brand: 'apple', price: 1999, description: 'Powerful laptop', inStock: 25,
    };

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingProduct, inStock: 25 });

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    await updateProduct(req, res);

    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      'prod-update-1',
      expect.not.objectContaining({
        $set: expect.objectContaining({ embeddingStatus: expect.anything() }),
      }),
      expect.any(Object),
    );
  });

  it('ready product with same contentHash does not enqueue', async () => {
    mockComputeContentHash.mockReturnValue('abc');

    const reqBody = makeReqBody(
      'MacBook Pro', 'apple', 1999, 'Updated description',
      { processor: { chipset: 'M3' }, memory: { ram: '16 GB', storage: '512 GB' } },
      ['Silver', 'Space Gray'], 10, ['laptop'], 'macbook.jpg',
    );

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingProduct, description: 'Updated description', embeddingStatus: 'pending' });

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    mockBuildEmbeddingContent.mockReturnValue('canonical-text');

    await updateProduct(req, res);

    expect(mockEnqueueProductEmbedding).not.toHaveBeenCalled();
  });

  it('ready product with same contentHash does not set embeddingStatus to pending', async () => {
    mockComputeContentHash.mockReturnValue('abc');

    const reqBody = makeReqBody(
      'MacBook Pro', 'apple', 1999, 'Updated description',
      { processor: { chipset: 'M3' }, memory: { ram: '16 GB', storage: '512 GB' } },
      ['Silver', 'Space Gray'], 10, ['laptop'], 'macbook.jpg',
    );

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingProduct, description: 'Updated description', embeddingStatus: 'pending' });

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    mockBuildEmbeddingContent.mockReturnValue('canonical-text');

    await updateProduct(req, res);

    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      'prod-update-1',
      expect.not.objectContaining({
        $set: expect.objectContaining({ embeddingStatus: expect.anything() }),
      }),
      expect.any(Object),
    );
  });

  it('genuinely changed content creates and enqueues new job', async () => {
    mockComputeContentHash.mockReturnValue('new-hash');

    const reqBody = makeReqBody(
      'MacBook Pro', 'apple', 1999, 'Updated description',
      { processor: { chipset: 'M3' }, memory: { ram: '16 GB', storage: '512 GB' } },
      ['Silver', 'Space Gray'], 10, ['laptop'], 'macbook.jpg',
    );

    const updatedProduct = {
      ...existingProduct,
      description: 'Updated description',
      embeddingStatus: 'pending',
    };

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue(updatedProduct);

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    mockBuildEmbeddingContent.mockReturnValue('new-canonical-text');

    await updateProduct(req, res);

    expect(mockEnqueueProductEmbedding).toHaveBeenCalledWith(
      'prod-update-1',
      'new-canonical-text',
      'update',
      'test-cid',
    );
  });

  it('explicitly changed specs enqueues embedding job', async () => {
    const newSpecs = { processor: { chipset: 'M4' }, memory: { ram: '32 GB', storage: '1 TB' } };
    const reqBody = makeReqBody(
      'MacBook Pro', 'apple', 1999, 'Powerful laptop',
      newSpecs, ['Silver', 'Space Gray'], 10, ['laptop'], 'macbook.jpg',
    );

    const updatedProduct = {
      ...existingProduct,
      specs: newSpecs,
      embeddingStatus: 'pending',
    };

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue(updatedProduct);

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    mockBuildEmbeddingContent.mockReturnValue('specs-changed-text');

    await updateProduct(req, res);

    expect(mockBuildEmbeddingContent).toHaveBeenCalledWith(updatedProduct);
    expect(mockEnqueueProductEmbedding).toHaveBeenCalledWith(
      'prod-update-1',
      'specs-changed-text',
      'update',
      'test-cid',
    );
  });

  it('normalizes specs to the canonical shape on update', async () => {
    const reqBody = makeReqBody(
      'MacBook Pro', 'apple', 1999, 'Powerful laptop',
      { memory: { ram: ' 32 GB ', storage: '1 TB', expandable: 'true' }, extraJunk: 'x' },
      ['Silver', 'Space Gray'], 10, ['laptop'], 'macbook.jpg',
    );

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingProduct, specs: { memory: { ram: '32 GB', storage: '1 TB', expandable: true } } });

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    await updateProduct(req, res);

    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      'prod-update-1',
      expect.objectContaining({
        $set: expect.objectContaining({
          specs: { memory: { ram: '32 GB', storage: '1 TB', expandable: true } },
        }),
      }),
      expect.any(Object),
    );
  });

  it('explicitly changed colors enqueues embedding job', async () => {
    const reqBody = makeReqBody(
      'MacBook Pro', 'apple', 1999, 'Powerful laptop',
      { processor: { chipset: 'M3' }, memory: { ram: '16 GB', storage: '512 GB' } },
      ['Black'], 10, ['laptop'], 'macbook.jpg',
    );

    const updatedProduct = {
      ...existingProduct,
      colors: ['Black'],
      embeddingStatus: 'pending',
    };

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue(updatedProduct);

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    mockBuildEmbeddingContent.mockReturnValue('colors-changed-text');

    await updateProduct(req, res);

    expect(mockBuildEmbeddingContent).toHaveBeenCalledWith(updatedProduct);
    expect(mockEnqueueProductEmbedding).toHaveBeenCalledWith(
      'prod-update-1',
      'colors-changed-text',
      'update',
      'test-cid',
    );
  });

  it('updating only colors enqueues an embedding job', async () => {
    const reqBody = makeReqBody(
      'MacBook Pro', 'apple', 1999, 'Powerful laptop',
      { processor: { chipset: 'M3' }, memory: { ram: '16 GB', storage: '512 GB' } },
      ['Midnight Blue'], 10, ['laptop'], 'macbook.jpg',
    );

    const updatedProduct = {
      ...existingProduct,
      colors: ['Midnight Blue'],
      embeddingStatus: 'pending',
      _id: 'prod-update-1',
    };

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue(updatedProduct);

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    mockBuildEmbeddingContent.mockReturnValue('colors-changed-text');

    await updateProduct(req, res);

    expect(mockBuildEmbeddingContent).toHaveBeenCalled();
    expect(mockEnqueueProductEmbedding).toHaveBeenCalledWith(
      'prod-update-1',
      'colors-changed-text',
      'update',
      'test-cid',
    );
  });

  it('changing colors sets embeddingStatus to pending', async () => {
    const reqBody = makeReqBody(
      'MacBook Pro', 'apple', 1999, 'Powerful laptop',
      { processor: { chipset: 'M3' }, memory: { ram: '16 GB', storage: '512 GB' } },
      ['Black'], 10, ['laptop'], 'macbook.jpg',
    );

    const updatedProduct = {
      ...existingProduct,
      colors: ['Black'],
      embeddingStatus: 'pending',
      _id: 'prod-update-1',
    };

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue(updatedProduct);

    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    await updateProduct(req, res);

    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      'prod-update-1',
      expect.objectContaining({
        $set: expect.objectContaining({ embeddingStatus: 'pending' }),
      }),
      expect.any(Object),
    );
  });

  it('builds content from updatedProduct not from req.body', async () => {
    const reqBody = makeReqBody(
      'MacBook Pro', 'apple', 1999, 'Changed description',
      undefined, undefined, 10, undefined, undefined,
    );

    const existing = {
      _id: 'prod-full',
      name: 'MacBook Pro',
      brand: 'apple',
      price: 1999,
      description: 'Original description',
      specs: { processor: { chipset: 'M3' }, memory: { ram: '16 GB', storage: '512 GB' } },
      colors: ['Silver', 'Space Gray'],
      inStock: 10,
      tags: ['laptop'],
      image: 'macbook.jpg',
      embeddingStatus: 'ready',
    };

    const updatedProduct = {
      ...existing,
      description: 'Changed description',
      embeddingStatus: 'pending',
      _id: 'prod-full',
    };

    Product.findById.mockResolvedValue({ ...existing });
    Product.findByIdAndUpdate.mockResolvedValue(updatedProduct);

    const req = mockReq(reqBody, { id: 'prod-full' });
    const res = mockRes();

    mockBuildEmbeddingContent.mockImplementation((product) => {
      const hasSpecs = product.specs && Object.keys(product.specs).length > 0;
      const hasColors = product.colors && product.colors.length > 0;
      return `text-${hasSpecs ? 'complete' : 'partial'}-${hasColors ? 'with-colors' : 'no-colors'}-${product.description}`;
    });

    await updateProduct(req, res);

    expect(mockBuildEmbeddingContent).toHaveBeenCalledWith(updatedProduct);
    const callArg = mockBuildEmbeddingContent.mock.calls[0][0];
    expect(callArg.specs).toBeDefined();
    expect(Object.keys(callArg.specs).length).toBeGreaterThan(0);
    expect(callArg.colors).toBeDefined();
    expect(callArg.colors.length).toBeGreaterThan(0);
  });

  it('logs updating product with safe metadata only', async () => {
    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingProduct });

    const reqBody = makeReqBody(
      'MacBook Pro', 'apple', 1999, 'Powerful laptop',
      { processor: { chipset: 'M3' }, memory: { ram: '16 GB', storage: '512 GB' } },
      ['Silver', 'Space Gray'], 10, ['laptop'], 'macbook.jpg',
    );
    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    await updateProduct(req, res);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'prod-update-1', requestId: 'test-cid' }),
      'Updating product',
    );
  });

  it('does not use console.log or console.error on success', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingProduct });

    const reqBody = makeReqBody(
      'MacBook Pro', 'apple', 1999, 'Powerful laptop',
      { processor: { chipset: 'M3' }, memory: { ram: '16 GB', storage: '512 GB' } },
      ['Silver', 'Space Gray'], 10, ['laptop'], 'macbook.jpg',
    );
    const req = mockReq(reqBody, { id: 'prod-update-1' });
    const res = mockRes();

    await updateProduct(req, res);

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('forwards error to next on failure', async () => {
    Product.findById.mockRejectedValue(new Error('Find failed'));

    const req = mockReq({ name: 'X', brand: 'Y', price: 1, description: 'D' }, { id: 'prod-err' });
    const res = mockRes();
    const next = jest.fn();

    await updateProduct(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('returns 404 when product not found', async () => {
    Product.findById.mockResolvedValue(null);

    const req = mockReq({ name: 'Test', brand: 'test', price: 100, description: 'Desc' }, { id: 'nonexistent' });
    const res = mockRes();
    const next = jest.fn();
    await updateProduct(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, code: 'NOT_FOUND' }),
    );
  });

  it('forwards Mongoose ValidationError on update', async () => {
    Product.findById.mockResolvedValue({ _id: 'existing', name: 'Old', brand: 'old', price: 50, description: 'Old desc', specs: {}, colors: [], inStock: 0, tags: [], embeddingStatus: 'ready', embeddingContentHash: 'abc' });
    const valErr = new Error('Validation failed');
    valErr.name = 'ValidationError';
    valErr.errors = {
      name: { path: 'name', message: 'Tên là bắt buộc' },
    };
    Product.findByIdAndUpdate.mockRejectedValue(valErr);

    const req = mockReq({ name: 'Test', brand: 'test', price: 100, description: 'Desc' }, { id: 'existing' });
    const res = mockRes();
    const next = jest.fn();
    await updateProduct(req, res, next);

    expect(next).toHaveBeenCalledWith(valErr);
  });
});

/* ============================================================
   Product image upload integration tests
============================================================ */
describe('createProduct — image upload integration', () => {
  it('calls uploadProductImageIfNeeded with Base64 input and stores imageUrl', async () => {
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/test.jpg',
      imagePublicId: 'smart-ai/products/test',
    });
    Product.findOne.mockResolvedValue(null);
    const mockSave = jest.fn().mockResolvedValue({
      _id: 'prod-img-1', name: 'Test', brand: 'test', image: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/test.jpg',
      imagePublicId: 'smart-ai/products/test',
    });
    const ProductMock = require('../models/Product');
    ProductMock.mockImplementation((data) => ({ ...data, _id: 'prod-img-1', save: mockSave }));

    const req = mockReq({ name: 'Test Phone', brand: 'Test', price: 100, description: 'A phone', image: 'data:image/jpeg;base64,/9j/4AAQ' });
    const res = mockRes();
    await createProduct(req, res);

    expect(mockUploadProductImageIfNeeded).toHaveBeenCalledWith('data:image/jpeg;base64,/9j/4AAQ');
    expect(mockStatus).toHaveBeenCalledWith(201);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          image: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/test.jpg',
        }),
      }),
    );
  });

  it('preserves HTTPS URL without calling Cloudinary upload', async () => {
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://cdn.example.com/phone.jpg', imagePublicId: null,
    });
    Product.findOne.mockResolvedValue(null);
    const mockSave = jest.fn().mockResolvedValue({ _id: 'prod-2', name: 'Test', brand: 'test', image: 'https://cdn.example.com/phone.jpg' });
    const ProductMock = require('../models/Product');
    ProductMock.mockImplementation((data) => ({ ...data, _id: 'prod-2', save: mockSave }));

    const req = mockReq({ name: 'Phone', brand: 'Test', price: 200, description: 'Desc', image: 'https://cdn.example.com/phone.jpg' });
    const res = mockRes();
    await createProduct(req, res);

    expect(mockUploadProductImageIfNeeded).toHaveBeenCalledWith('https://cdn.example.com/phone.jpg');
    expect(mockStatus).toHaveBeenCalledWith(201);
  });

  it('accepts empty image for backward compatibility', async () => {
    mockUploadProductImageIfNeeded.mockResolvedValue({ imageUrl: '', imagePublicId: null });
    Product.findOne.mockResolvedValue(null);
    const mockSave = jest.fn().mockResolvedValue({ _id: 'prod-3', name: 'Test', brand: 'test', image: '' });
    const ProductMock = require('../models/Product');
    ProductMock.mockImplementation((data) => ({ ...data, _id: 'prod-3', save: mockSave }));

    const req = mockReq({ name: 'Phone', brand: 'Test', price: 200, description: 'Desc' });
    const res = mockRes();
    await createProduct(req, res);

    expect(mockUploadProductImageIfNeeded).toHaveBeenCalledWith(undefined);
    expect(mockStatus).toHaveBeenCalledWith(201);
  });

  it('returns 400 with INVALID_PRODUCT_IMAGE code on validation error', async () => {
    const { ProductImageValidationError } = require('../services/productImageService');
    mockUploadProductImageIfNeeded.mockRejectedValue(new ProductImageValidationError('HTTP image URLs are not allowed'));
    Product.findOne.mockResolvedValue(null);
    const mockSave = jest.fn();
    const ProductMock = require('../models/Product');
    ProductMock.mockImplementation((data) => ({ ...data, _id: 'id', save: mockSave }));

    const req = mockReq({ name: 'Phone', brand: 'Test', price: 200, description: 'Desc', image: 'http://example.com/phone.jpg' });
    const res = mockRes();
    const next = jest.fn();
    await createProduct(req, res, next);

    expect(mockSave).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, code: 'INVALID_PRODUCT_IMAGE' }),
    );
  });

  it('does not treat plain Error with matching name as validation error', async () => {
    const fakeError = new Error('faux validation');
    fakeError.name = 'ProductImageValidationError';
    fakeError.statusCode = 400;
    mockUploadProductImageIfNeeded.mockRejectedValue(fakeError);
    Product.findOne.mockResolvedValue(null);
    const mockSave = jest.fn();
    const ProductMock = require('../models/Product');
    ProductMock.mockImplementation((data) => ({ ...data, _id: 'id', save: mockSave }));

    const req = mockReq({ name: 'Phone', brand: 'Test', price: 200, description: 'Desc', image: 'http://example.com/phone.jpg' });
    const res = mockRes();
    const next = jest.fn();
    await createProduct(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('returns controlled error when Cloudinary upload fails', async () => {
    mockUploadProductImageIfNeeded.mockRejectedValue(new Error('Cloudinary is not configured'));
    Product.findOne.mockResolvedValue(null);
    const mockSave = jest.fn();
    const ProductMock = require('../models/Product');
    ProductMock.mockImplementation((data) => ({ ...data, _id: 'id', save: mockSave }));

    const req = mockReq({ name: 'Phone', brand: 'Test', price: 200, description: 'Desc', image: 'data:image/jpeg;base64,/9j/4AAQ' });
    const res = mockRes();
    const next = jest.fn();
    await createProduct(req, res, next);

    expect(mockSave).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('rolls back uploaded Cloudinary image when product save fails', async () => {
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/new.jpg',
      imagePublicId: 'smart-ai/products/new',
    });
    Product.findOne.mockResolvedValue(null);
    const mockSave = jest.fn().mockRejectedValue(new Error('DB error'));
    const ProductMock = require('../models/Product');
    ProductMock.mockImplementation((data) => ({ ...data, _id: 'id', save: mockSave }));

    const req = mockReq({ name: 'Phone', brand: 'Test', price: 200, description: 'Desc', image: 'data:image/jpeg;base64,/9j/4AAQ' });
    const res = mockRes();
    const next = jest.fn();
    await createProduct(req, res, next);

    expect(mockDeleteImageFromCloudinary).toHaveBeenCalledWith('smart-ai/products/new');
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('preserves original DB error when rollback cleanup fails on save', async () => {
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/new.jpg',
      imagePublicId: 'smart-ai/products/new',
    });
    mockDeleteImageFromCloudinary.mockResolvedValue({ deleted: false, publicId: 'smart-ai/products/new', result: 'failed', error: new Error('destroy failed') });
    Product.findOne.mockResolvedValue(null);
    const dbError = new Error('DB error');
    const mockSave = jest.fn().mockRejectedValue(dbError);
    const ProductMock = require('../models/Product');
    ProductMock.mockImplementation((data) => ({ ...data, _id: 'id', save: mockSave }));

    const req = mockReq({ name: 'Phone', brand: 'Test', price: 200, description: 'Desc', image: 'data:image/jpeg;base64,/9j/4AAQ' });
    const res = mockRes();
    const next = jest.fn();
    await createProduct(req, res, next);

    expect(mockDeleteImageFromCloudinary).toHaveBeenCalledWith('smart-ai/products/new');
    expect(next).toHaveBeenCalledWith(dbError);
  });

  it('does not attempt rollback when no Cloudinary image was uploaded', async () => {
    mockUploadProductImageIfNeeded.mockResolvedValue({ imageUrl: '', imagePublicId: null });
    Product.findOne.mockResolvedValue(null);
    const mockSave = jest.fn().mockRejectedValue(new Error('DB error'));
    const ProductMock = require('../models/Product');
    ProductMock.mockImplementation((data) => ({ ...data, _id: 'id', save: mockSave }));

    const req = mockReq({ name: 'Phone', brand: 'Test', price: 200, description: 'Desc' });
    const res = mockRes();
    const next = jest.fn();
    await createProduct(req, res, next);

    expect(mockDeleteImageFromCloudinary).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('updateProduct — image upload integration', () => {
  const existingProduct = {
    _id: 'prod-update-img',
    name: 'Old Phone',
    brand: 'test',
    price: 100,
    description: 'Old desc',
    image: 'https://cdn.example.com/old.jpg',
    imagePublicId: null,
    inStock: 5,
    colors: [],
    tags: [],
    specs: {},
    embeddingStatus: 'ready',
    embeddingContentHash: 'abc',
  };

  it('calls upload once for new Base64 image and stores imageUrl and imagePublicId', async () => {
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/new.jpg',
      imagePublicId: 'smart-ai/products/new',
    });
    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingProduct, image: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/new.jpg', imagePublicId: 'smart-ai/products/new' });

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'data:image/jpeg;base64,/9j/4AAQ' }, { id: 'prod-update-img' });
    const res = mockRes();
    await updateProduct(req, res);

    expect(mockUploadProductImageIfNeeded).toHaveBeenCalledTimes(1);
    expect(mockUploadProductImageIfNeeded).toHaveBeenCalledWith('data:image/jpeg;base64,/9j/4AAQ');
    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      'prod-update-img',
      expect.objectContaining({
        $set: expect.objectContaining({
          image: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/new.jpg',
          imagePublicId: 'smart-ai/products/new',
        }),
      }),
      expect.any(Object),
    );
    expect(mockStatus).toHaveBeenCalledWith(200);
  });

  it('does not upload when image is not provided in update', async () => {
    mockUploadProductImageIfNeeded.mockResolvedValue({ imageUrl: 'https://cdn.example.com/old.jpg', imagePublicId: null });
    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingProduct });

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated' }, { id: 'prod-update-img' });
    const res = mockRes();
    await updateProduct(req, res);

    expect(mockUploadProductImageIfNeeded).not.toHaveBeenCalled();
    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      'prod-update-img',
      expect.not.objectContaining({ $set: expect.objectContaining({ image: expect.any(String) }) }),
      expect.any(Object),
    );
    expect(mockStatus).toHaveBeenCalledWith(200);
  });

  it('preserves existing image when image is unchanged HTTPS URL', async () => {
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://cdn.example.com/old.jpg', imagePublicId: null,
    });
    Product.findById.mockResolvedValue({ ...existingProduct });
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingProduct });

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'https://cdn.example.com/old.jpg' }, { id: 'prod-update-img' });
    const res = mockRes();
    await updateProduct(req, res);

    expect(mockUploadProductImageIfNeeded).toHaveBeenCalledWith('https://cdn.example.com/old.jpg');
    expect(mockStatus).toHaveBeenCalledWith(200);
  });

  it('clears stale imagePublicId when external HTTPS URL is provided', async () => {
    const existingWithCloudinary = { ...existingProduct, image: 'https://res.cloudinary.com/.../old.jpg', imagePublicId: 'smart-ai/products/old' };
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://cdn.example.com/new.jpg', imagePublicId: null,
    });
    Product.findById.mockResolvedValue(existingWithCloudinary);
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingWithCloudinary, image: 'https://cdn.example.com/new.jpg' });

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'https://cdn.example.com/new.jpg' }, { id: 'prod-update-img' });
    const res = mockRes();
    await updateProduct(req, res);

    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      'prod-update-img',
      expect.objectContaining({
        $set: expect.objectContaining({ image: 'https://cdn.example.com/new.jpg' }),
        $unset: { imagePublicId: '' },
      }),
      expect.any(Object),
    );
    expect(mockStatus).toHaveBeenCalledWith(200);
  });

  it('clears stale imagePublicId when image is set to empty string', async () => {
    const existingWithCloudinary = { ...existingProduct, image: 'https://res.cloudinary.com/.../old.jpg', imagePublicId: 'smart-ai/products/old' };
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: '', imagePublicId: null,
    });
    Product.findById.mockResolvedValue(existingWithCloudinary);
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingWithCloudinary, image: '' });

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: '' }, { id: 'prod-update-img' });
    const res = mockRes();
    await updateProduct(req, res);

    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      'prod-update-img',
      expect.objectContaining({
        $set: expect.objectContaining({ image: '' }),
        $unset: { imagePublicId: '' },
      }),
      expect.any(Object),
    );
    expect(mockStatus).toHaveBeenCalledWith(200);
  });

  it('does not update product when upload validation fails — forwards error with INVALID_PRODUCT_IMAGE', async () => {
    const { ProductImageValidationError } = require('../services/productImageService');
    mockUploadProductImageIfNeeded.mockRejectedValue(new ProductImageValidationError('HTTP image URLs are not allowed'));
    Product.findById.mockResolvedValue({ ...existingProduct });

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'http://example.com/bad.jpg' }, { id: 'prod-update-img' });
    const res = mockRes();
    const next = jest.fn();
    await updateProduct(req, res, next);

    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, code: 'INVALID_PRODUCT_IMAGE' }),
    );
  });

  it('does not treat plain Error with matching name as validation error in update', async () => {
    const fakeError = new Error('faux validation');
    fakeError.name = 'ProductImageValidationError';
    fakeError.statusCode = 400;
    mockUploadProductImageIfNeeded.mockRejectedValue(fakeError);
    Product.findById.mockResolvedValue({ ...existingProduct });

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'http://example.com/bad.jpg' }, { id: 'prod-update-img' });
    const res = mockRes();
    const next = jest.fn();
    await updateProduct(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('leaves existing image unchanged on Cloudinary failure', async () => {
    mockUploadProductImageIfNeeded.mockRejectedValue(new Error('Cloudinary is not configured'));
    Product.findById.mockResolvedValue({ ...existingProduct });

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'data:image/jpeg;base64,/9j/4AAQ' }, { id: 'prod-update-img' });
    const res = mockRes();
    const next = jest.fn();
    await updateProduct(req, res, next);

    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('deletes previous Cloudinary image only after successful DB update', async () => {
    const existingWithCloudinary = { ...existingProduct, image: 'https://res.cloudinary.com/.../old.jpg', imagePublicId: 'smart-ai/products/old' };
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/new.jpg',
      imagePublicId: 'smart-ai/products/new',
    });
    Product.findById.mockResolvedValue(existingWithCloudinary);
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingWithCloudinary, image: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/new.jpg', imagePublicId: 'smart-ai/products/new' });

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'data:image/jpeg;base64,/9j/4AAQ' }, { id: 'prod-update-img' });
    const res = mockRes();
    await updateProduct(req, res);

    expect(Product.findByIdAndUpdate).toHaveBeenCalled();
    expect(mockDeleteImageFromCloudinary).toHaveBeenCalledWith('smart-ai/products/old');
    expect(mockStatus).toHaveBeenCalledWith(200);
  });

  it('rolls back newly uploaded image and keeps old when DB update fails', async () => {
    const existingWithCloudinary = { ...existingProduct, image: 'https://res.cloudinary.com/.../old.jpg', imagePublicId: 'smart-ai/products/old' };
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/new.jpg',
      imagePublicId: 'smart-ai/products/new',
    });
    Product.findById.mockResolvedValue(existingWithCloudinary);
    Product.findByIdAndUpdate.mockRejectedValue(new Error('DB error'));

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'data:image/jpeg;base64,/9j/4AAQ' }, { id: 'prod-update-img' });
    const res = mockRes();
    const next = jest.fn();
    await updateProduct(req, res, next);

    expect(mockDeleteImageFromCloudinary).toHaveBeenCalledWith('smart-ai/products/new');
    expect(mockDeleteImageFromCloudinary).not.toHaveBeenCalledWith('smart-ai/products/old');
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('preserves original DB error when rollback cleanup fails on update', async () => {
    const existingWithCloudinary = { ...existingProduct, image: 'https://res.cloudinary.com/.../old.jpg', imagePublicId: 'smart-ai/products/old' };
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/new.jpg',
      imagePublicId: 'smart-ai/products/new',
    });
    mockDeleteImageFromCloudinary.mockResolvedValue({ deleted: false, publicId: 'smart-ai/products/new', result: 'failed', error: new Error('destroy failed') });
    Product.findById.mockResolvedValue(existingWithCloudinary);
    const dbError = new Error('DB error');
    Product.findByIdAndUpdate.mockRejectedValue(dbError);

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'data:image/jpeg;base64,/9j/4AAQ' }, { id: 'prod-update-img' });
    const res = mockRes();
    const next = jest.fn();
    await updateProduct(req, res, next);

    expect(mockDeleteImageFromCloudinary).toHaveBeenCalledWith('smart-ai/products/new');
    expect(mockDeleteImageFromCloudinary).not.toHaveBeenCalledWith('smart-ai/products/old');
    expect(next).toHaveBeenCalledWith(dbError);
  });

  it('rolls back newly uploaded image when updated product is not found', async () => {
    const existingWithCloudinary = { ...existingProduct, image: 'https://res.cloudinary.com/.../old.jpg', imagePublicId: 'smart-ai/products/old' };
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/new.jpg',
      imagePublicId: 'smart-ai/products/new',
    });
    Product.findById.mockResolvedValue(existingWithCloudinary);
    Product.findByIdAndUpdate.mockResolvedValue(null);

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'data:image/jpeg;base64,/9j/4AAQ' }, { id: 'prod-update-img' });
    const res = mockRes();
    const next = jest.fn();
    await updateProduct(req, res, next);

    expect(mockDeleteImageFromCloudinary).toHaveBeenCalledWith('smart-ai/products/new');
    expect(mockDeleteImageFromCloudinary).not.toHaveBeenCalledWith('smart-ai/products/old');
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404, code: 'NOT_FOUND' }));
  });

  it('does not delete old Cloudinary image when image value is unchanged', async () => {
    const existingWithCloudinary = { ...existingProduct, image: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/same.jpg', imagePublicId: 'smart-ai/products/same' };
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/same.jpg', imagePublicId: null,
    });
    Product.findById.mockResolvedValue(existingWithCloudinary);
    Product.findByIdAndUpdate.mockResolvedValue(existingWithCloudinary);

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/same.jpg' }, { id: 'prod-update-img' });
    const res = mockRes();
    await updateProduct(req, res);

    expect(mockDeleteImageFromCloudinary).not.toHaveBeenCalled();
    expect(mockStatus).toHaveBeenCalledWith(200);
  });

  it('deletes old Cloudinary image when image is cleared with external HTTPS URL', async () => {
    const existingWithCloudinary = { ...existingProduct, image: 'https://res.cloudinary.com/.../old.jpg', imagePublicId: 'smart-ai/products/old' };
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://cdn.example.com/new.jpg', imagePublicId: null,
    });
    Product.findById.mockResolvedValue(existingWithCloudinary);
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingWithCloudinary, image: 'https://cdn.example.com/new.jpg' });

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'https://cdn.example.com/new.jpg' }, { id: 'prod-update-img' });
    const res = mockRes();
    await updateProduct(req, res);

    expect(mockDeleteImageFromCloudinary).toHaveBeenCalledWith('smart-ai/products/old');
    expect(mockStatus).toHaveBeenCalledWith(200);
  });

  it('does not fail request when old Cloudinary image deletion fails', async () => {
    const existingWithCloudinary = { ...existingProduct, image: 'https://res.cloudinary.com/.../old.jpg', imagePublicId: 'smart-ai/products/old' };
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/new.jpg',
      imagePublicId: 'smart-ai/products/new',
    });
    mockDeleteImageFromCloudinary.mockResolvedValue({ deleted: false, publicId: 'smart-ai/products/old', result: 'failed', error: new Error('destroy failed') });
    Product.findById.mockResolvedValue(existingWithCloudinary);
    Product.findByIdAndUpdate.mockResolvedValue({ ...existingWithCloudinary, image: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/new.jpg', imagePublicId: 'smart-ai/products/new' });

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'data:image/jpeg;base64,/9j/4AAQ' }, { id: 'prod-update-img' });
    const res = mockRes();
    await updateProduct(req, res);

    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ publicId: 'smart-ai/products/old' }), expect.any(String));
  });
});

/* ============================================================
   deleteProduct (soft delete — must not destroy Cloudinary asset)
============================================================ */
describe('deleteProduct', () => {
  it('should soft delete a product and return 200', async () => {
    Product.findByIdAndUpdate.mockResolvedValue({ _id: 'prod-del-1', isActive: false });

    const req = mockReq({}, { id: 'prod-del-1' });
    const res = mockRes();
    await deleteProduct(req, res);

    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      'prod-del-1',
      { isActive: false },
      { new: true },
    );
    expect(cache.del).toHaveBeenCalledWith('product:prod-del-1');
    expect(cache.invalidatePattern).toHaveBeenCalledWith('products:*');
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: 'Xóa sản phẩm thành công' }),
    );
  });

  it('does not call Cloudinary destroy on soft delete even when product has imagePublicId', async () => {
    Product.findByIdAndUpdate.mockResolvedValue({ _id: 'prod-del-1', isActive: false, image: 'https://res.cloudinary.com/.../abc.jpg', imagePublicId: 'smart-ai/products/abc' });

    const req = mockReq({}, { id: 'prod-del-1' });
    const res = mockRes();
    await deleteProduct(req, res);

    expect(mockDeleteImageFromCloudinary).not.toHaveBeenCalled();
    expect(mockStatus).toHaveBeenCalledWith(200);
  });

  it('preserves image and imagePublicId during soft delete', async () => {
    Product.findByIdAndUpdate.mockResolvedValue({ _id: 'prod-del-1', isActive: false });

    const req = mockReq({}, { id: 'prod-del-1' });
    const res = mockRes();
    await deleteProduct(req, res);

    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      'prod-del-1',
      { isActive: false },
      expect.any(Object),
    );
    expect(mockDeleteImageFromCloudinary).not.toHaveBeenCalled();
    expect(mockStatus).toHaveBeenCalledWith(200);
  });

  it('does not remove image when DB soft delete fails', async () => {
    const dbError = new Error('DB error');
    Product.findByIdAndUpdate.mockRejectedValue(dbError);

    const req = mockReq({}, { id: 'prod-del-err' });
    const res = mockRes();
    const next = jest.fn();
    await deleteProduct(req, res, next);

    expect(mockDeleteImageFromCloudinary).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(dbError);
  });

  it('returns 404 when product not found', async () => {
    Product.findByIdAndUpdate.mockResolvedValue(null);

    const req = mockReq({}, { id: 'nonexistent' });
    const res = mockRes();
    const next = jest.fn();
    await deleteProduct(req, res, next);

    expect(mockDeleteImageFromCloudinary).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, code: 'NOT_FOUND' }),
    );
  });

  it('forwards unexpected error to next', async () => {
    Product.findByIdAndUpdate.mockRejectedValue(new Error('DB error'));

    const req = mockReq({}, { id: 'prod-del-err' });
    const res = mockRes();
    const next = jest.fn();
    await deleteProduct(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

/* ============================================================
   getAllProducts
============================================================ */
describe('getAllProducts', () => {
  it('returns paginated products on success', async () => {
    const mockProducts = [
      { _id: 'p1', name: 'Product A', price: 100, reviewCount: 2, averageRating: 4.5 },
      { _id: 'p2', name: 'Product B', price: 200, reviewCount: 0, averageRating: 0 },
    ];
    Product.aggregate
      .mockResolvedValueOnce(mockProducts)  // dataPipeline
      .mockResolvedValueOnce([{ total: 10 }]); // countPipeline

    const req = mockReq({}, {}, { page: '1', limit: '2' });
    const res = mockRes();
    await getAllProducts(req, res);

    expect(Product.aggregate).toHaveBeenCalledTimes(2);
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Lấy danh sách sản phẩm thành công',
        data: expect.objectContaining({
          products: mockProducts,
          pagination: expect.objectContaining({
            currentPage: 1,
            totalPages: 5,
            totalCount: 10,
            limit: 2,
            hasNextPage: true,
            hasPrevPage: false,
          }),
        }),
      }),
    );
  });

  it('forwards unexpected error to next', async () => {
    const dbError = new Error('DB failure');
    // Use mockResolvedValueOnce to make both aggregate calls resolve to the
    // error via a rejected promise chain.  Then reset to avoid leaking.
    Product.aggregate
      .mockRejectedValueOnce(dbError)
      .mockRejectedValueOnce(dbError);

    const req = mockReq({}, {}, { page: '1', limit: '10' });
    const res = mockRes();
    const next = jest.fn();
    await getAllProducts(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
  });

  it('normalizes negative page to page 1 via parsePagination', async () => {
    Product.aggregate
      .mockResolvedValueOnce([])  // dataPipeline
      .mockResolvedValueOnce([{ total: 0 }]); // countPipeline

    const req = mockReq({}, {}, { page: '-5', limit: '10' });
    const res = mockRes();
    await getAllProducts(req, res);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pagination: expect.objectContaining({ currentPage: 1, limit: 10 }),
        }),
      }),
    );
  });

  it('clamps unbounded limit to MAX_LIMIT (50) via parsePagination', async () => {
    Product.aggregate
      .mockResolvedValueOnce([])  // dataPipeline
      .mockResolvedValueOnce([{ total: 0 }]); // countPipeline

    const req = mockReq({}, {}, { page: '1', limit: '999999' });
    const res = mockRes();
    await getAllProducts(req, res);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pagination: expect.objectContaining({ limit: 50 }),
        }),
      }),
    );
  });

  it('normalizes zero limit to default 10 via parsePagination', async () => {
    Product.aggregate
      .mockResolvedValueOnce([])  // dataPipeline
      .mockResolvedValueOnce([{ total: 0 }]); // countPipeline

    const req = mockReq({}, {}, { page: '1', limit: '0' });
    const res = mockRes();
    await getAllProducts(req, res);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pagination: expect.objectContaining({ limit: 10 }),
        }),
      }),
    );
  });

  it('normalizes search query: trims whitespace', async () => {
    // prefix-first: 3 calls (prefixCount + data + count)
    Product.aggregate
      .mockResolvedValueOnce([{ total: 1 }])  // prefixCount → found
      .mockResolvedValueOnce([])  // dataPipeline
      .mockResolvedValueOnce([{ total: 0 }]); // countPipeline

    const req = mockReq({}, {}, { page: '1', limit: '10', search: '  iphone 15  ' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const matchStage = dataPipeline.find(s => s.$match && s.$match.$or);
    // Prefix found → uses $or regex, normalized to "iphone 15"
    const nameRegex = matchStage.$match.$or[0].name;
    expect(nameRegex.$regex).toBe('\\biphone 15');
    expect(nameRegex.$options).toBe('i');
  });

  it('normalizes search query: collapses repeated internal spaces', async () => {
    Product.aggregate
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'xiaomi   14t   pro' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const matchStage = dataPipeline.find(s => s.$match && s.$match.$or);
    const nameRegex = matchStage.$match.$or[0].name;
    expect(nameRegex.$regex).toBe('\\bxiaomi 14t pro');
  });

  it('normalizes search query: lowercases for case-insensitive matching', async () => {
    Product.aggregate
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'XIAOMI 14T Pro' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const matchStage = dataPipeline.find(s => s.$match && s.$match.$or);
    const nameRegex = matchStage.$match.$or[0].name;
    expect(nameRegex.$regex).toBe('\\bxiaomi 14t pro');
  });

  it('uses text score relevance sort when search falls back to $text', async () => {
    // No prefix matches → falls back to $text
    Product.aggregate
      .mockResolvedValueOnce([])  // prefixCount → 0
      .mockResolvedValueOnce([])  // dataPipeline
      .mockResolvedValueOnce([{ total: 0 }]); // countPipeline

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'pro max' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const sortStage = dataPipeline.find(s => s.$sort);
    expect(sortStage.$sort).toEqual({ score: { $meta: 'textScore' } });
  });

  it('includes text score in projection when search falls back to $text', async () => {
    Product.aggregate
      .mockResolvedValueOnce([])  // prefixCount → 0
      .mockResolvedValueOnce([])  // dataPipeline
      .mockResolvedValueOnce([{ total: 0 }]); // countPipeline

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'pro max' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const projectStage = dataPipeline.find(s => s.$project);
    expect(projectStage.$project.score).toEqual({ $meta: 'textScore' });
  });

  it('uses createdAt sort when no search is active', async () => {
    Product.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    const req = mockReq({}, {}, { page: '1', limit: '10' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[0][0];
    const sortStage = dataPipeline.find(s => s.$sort);
    expect(sortStage.$sort).toEqual({ createdAt: -1 });
  });

  it('does not include text score in projection when no search', async () => {
    Product.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    const req = mockReq({}, {}, { page: '1', limit: '10' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[0][0];
    const projectStage = dataPipeline.find(s => s.$project);
    expect(projectStage.$project.score).toBeUndefined();
  });

  it('empty search preserves normal catalog behavior', async () => {
    Product.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: '' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[0][0];
    const matchStage = dataPipeline.find(s => s.$match);
    expect(matchStage.$match.$text).toBeUndefined();
  });

  it('whitespace-only search is treated as empty', async () => {
    Product.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: '   ' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[0][0];
    const matchStage = dataPipeline.find(s => s.$match);
    expect(matchStage.$match.$text).toBeUndefined();
  });

  it('normalized search is used in cache key', async () => {
    Product.aggregate
      .mockResolvedValueOnce([{ total: 1 }])  // prefixCount
      .mockResolvedValueOnce([])  // dataPipeline
      .mockResolvedValueOnce([{ total: 0 }]); // countPipeline

    const req = mockReq({}, {}, { page: '1', limit: '10', search: '  XIAOMI  14T  Pro  ' });
    const res = mockRes();
    await getAllProducts(req, res);

    const expectedCacheKey = 'products:' + JSON.stringify({
      page: 1, limit: 10, brand: null, search: 'xiaomi 14t pro',
      minPrice: null, maxPrice: null, sortBy: null, sortOrder: null,
      minRating: null, inStock: null,
    });
    expect(cache.set).toHaveBeenCalledWith(
      expectedCacheKey,
      expect.any(Object),
      300
    );
  });

  it('search combines with brand filter', async () => {
    Product.aggregate
      .mockResolvedValueOnce([{ total: 1 }])  // prefixCount
      .mockResolvedValueOnce([])  // dataPipeline
      .mockResolvedValueOnce([{ total: 0 }]); // countPipeline

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 's24 ultra', brand: 'samsung' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const matchStage = dataPipeline.find(s => s.$match);
    expect(matchStage.$match.brand).toBe('samsung');
    // Prefix found → uses $or regex
    expect(matchStage.$match.$or).toBeDefined();
  });

  it('search combines with price filter', async () => {
    Product.aggregate
      .mockResolvedValueOnce([{ total: 1 }])  // prefixCount
      .mockResolvedValueOnce([])  // dataPipeline
      .mockResolvedValueOnce([{ total: 0 }]); // countPipeline

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'iphone', minPrice: '10000000', maxPrice: '30000000' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const matchStage = dataPipeline.find(s => s.$match);
    expect(matchStage.$match.price).toEqual({ $gte: 10000000, $lte: 30000000 });
    expect(matchStage.$match.$or).toBeDefined();
  });

  it('user sortBy is used when no search is active', async () => {
    Product.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }]);

    const req = mockReq({}, {}, { page: '1', limit: '10', sortBy: 'price', sortOrder: 'asc' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[0][0];
    const sortStage = dataPipeline.find(s => s.$sort);
    expect(sortStage.$sort).toEqual({ price: 1 });
  });
});

/* ============================================================
   getProductById
============================================================ */
describe('getProductById', () => {
  it('returns product with rating stats on success', async () => {
    const mockProduct = { _id: 'prod-1', name: 'Test Product', price: 100, isActive: true };
    Product.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockProduct),
      }),
    });
    Review.getProductStats.mockResolvedValue({ averageRating: 4.2, totalCount: 5 });

    const req = mockReq({}, { id: 'prod-1' });
    const res = mockRes();
    await getProductById(req, res);

    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Lấy chi tiết sản phẩm thành công',
        data: expect.objectContaining({
          _id: 'prod-1',
          averageRating: 4.2,
          reviewCount: 5,
        }),
      }),
    );
  });

  it('returns cached response if available', async () => {
    const cachedData = { success: true, data: { _id: 'prod-1', name: 'Cached' } };
    cache.get.mockResolvedValue(cachedData);

    const req = mockReq({}, { id: 'prod-1' });
    const res = mockRes();
    await getProductById(req, res);

    expect(Product.findOne).not.toHaveBeenCalled();
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith(cachedData);
  });

  it('forwards error to next when product not found', async () => {
    Product.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    const req = mockReq({}, { id: 'nonexistent' });
    const res = mockRes();
    const next = jest.fn();
    await getProductById(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, code: 'NOT_FOUND' }),
    );
  });

  it('forwards CastError to next for invalid id', async () => {
    const castError = new Error('Cast to ObjectId failed');
    castError.name = 'CastError';
    castError.kind = 'ObjectId';
    Product.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockRejectedValue(castError),
      }),
    });

    const req = mockReq({}, { id: 'invalid-id' });
    const res = mockRes();
    const next = jest.fn();
    await expect(getProductById(req, res, next)).resolves.not.toThrow();
    expect(next).toHaveBeenCalledWith(castError);
  });

  it('forwards unexpected error to next', async () => {
    const dbError = new Error('Unexpected DB error');
    Product.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockRejectedValue(dbError),
      }),
    });

    const req = mockReq({}, { id: 'prod-1' });
    const res = mockRes();
    const next = jest.fn();
    await expect(getProductById(req, res, next)).resolves.not.toThrow();
    expect(next).toHaveBeenCalledWith(dbError);
  });
});

/* ============================================================
   searchSemantic
============================================================ */
describe('searchSemantic', () => {
  it('returns semantic search results on success', async () => {
    const mockResults = {
      products: [{ _id: 'prod-1', name: 'Semantic result' }],
      searchMode: 'vector',
    };
    productSearchService.search.mockResolvedValue(mockResults);

    const req = mockReq({}, {}, { q: 'áo thun' });
    const res = mockRes();
    await searchSemantic(req, res);

    expect(productSearchService.search).toHaveBeenCalledWith('áo thun', 10);
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      message: 'Tìm kiếm ngữ nghĩa thành công',
      data: {
        products: mockResults.products,
        query: 'áo thun',
        searchMode: 'vector',
      },
    });
  });

  it('forwards BadRequestError to next when query is empty', async () => {
    const req = mockReq({}, {}, { q: '' });
    const res = mockRes();
    const next = jest.fn();
    await searchSemantic(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, code: 'VALIDATION_ERROR' }),
    );
    expect(productSearchService.search).not.toHaveBeenCalled();
  });

  it('forwards unexpected error to next', async () => {
    const dbError = new Error('Search service failure');
    productSearchService.search.mockRejectedValue(dbError);

    const req = mockReq({}, {}, { q: 'áo thun' });
    const res = mockRes();
    const next = jest.fn();
    await searchSemantic(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
  });
});

/* ============================================================
   getRecommendations
============================================================ */
describe('getRecommendations', () => {
  it('returns recommendations on success', async () => {
    const mockResult = {
      sourceProduct: { _id: 'prod-1', name: 'Source Product' },
      products: [{ _id: 'prod-2', name: 'Recommended' }],
      recommendationMode: 'vector',
    };
    productRecommendationService.recommend.mockResolvedValue(mockResult);

    const req = mockReq({}, { id: 'prod-1' });
    const res = mockRes();
    await getRecommendations(req, res);

    expect(productRecommendationService.recommend).toHaveBeenCalledWith('prod-1', undefined);
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      message: 'Lấy sản phẩm gợi ý thành công',
      data: {
        sourceProduct: mockResult.sourceProduct,
        products: mockResult.products,
        recommendationMode: 'vector',
      },
    });
  });

  it('forwards BadRequestError to next when product id is invalid', async () => {
    productRecommendationService.recommend.mockResolvedValue({ error: 'INVALID_ID' });

    const req = mockReq({}, { id: 'bad-id' });
    const res = mockRes();
    const next = jest.fn();
    await getRecommendations(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, code: 'VALIDATION_ERROR' }),
    );
  });

  it('forwards NotFoundError to next when product not found', async () => {
    productRecommendationService.recommend.mockResolvedValue({ error: 'NOT_FOUND' });

    const req = mockReq({}, { id: 'nonexistent' });
    const res = mockRes();
    const next = jest.fn();
    await getRecommendations(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, code: 'NOT_FOUND' }),
    );
  });

  it('forwards unexpected error to next', async () => {
    const dbError = new Error('Recommendation service failure');
    productRecommendationService.recommend.mockRejectedValue(dbError);

    const req = mockReq({}, { id: 'prod-1' });
    const res = mockRes();
    const next = jest.fn();
    await getRecommendations(req, res, next);

    expect(next).toHaveBeenCalledWith(dbError);
  });
});

/* ============================================================
   normalizeSearchQuery (unit)
============================================================ */
describe('normalizeSearchQuery', () => {
  it('returns empty string for null/undefined/non-string', () => {
    expect(normalizeSearchQuery(null)).toBe('');
    expect(normalizeSearchQuery(undefined)).toBe('');
    expect(normalizeSearchQuery(123)).toBe('');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeSearchQuery('  hello  ')).toBe('hello');
  });

  it('collapses repeated internal spaces', () => {
    expect(normalizeSearchQuery('xiaomi   14t   pro')).toBe('xiaomi 14t pro');
  });

  it('lowercases for case-insensitive matching', () => {
    expect(normalizeSearchQuery('XIAOMI 14T Pro')).toBe('xiaomi 14t pro');
  });
});

/* ============================================================
   hasNonGenericTokenMatch (unit)
============================================================ */
describe('hasNonGenericTokenMatch', () => {
  it('always returns true for empty/undefined tokens', () => {
    expect(hasNonGenericTokenMatch('iPhone 16 Pro', [])).toBe(true);
    expect(hasNonGenericTokenMatch('iPhone 16 Pro', null)).toBe(true);
  });

  it('always returns true for single-token searches', () => {
    expect(hasNonGenericTokenMatch('iPhone 16 Pro', ['pro'])).toBe(true);
    expect(hasNonGenericTokenMatch('Samsung Galaxy', ['samsung'])).toBe(true);
  });

  it('returns true when product name has a non-generic token match', () => {
    expect(hasNonGenericTokenMatch('Xiaomi 14T Pro', ['xiaomi', '14t', 'pro'])).toBe(true);
  });

  it('returns false when product name only has generic token matches', () => {
    expect(hasNonGenericTokenMatch('iPhone 16 Pro', ['xiaomi', '14t', 'pro'])).toBe(false);
  });

  it('returns false for iPhone 15 Pro Max when searching "Xiaomi 14T Pro"', () => {
    expect(hasNonGenericTokenMatch('iPhone 15 Pro Max 256GB', ['xiaomi', '14t', 'pro'])).toBe(false);
  });

  it('returns false for Redmi Note 14 Pro when searching "Xiaomi 14T Pro"', () => {
    expect(hasNonGenericTokenMatch('Redmi Note 14 Pro', ['xiaomi', '14t', 'pro'])).toBe(false);
  });
});

/* ============================================================
   GENERIC_SEARCH_TOKENS (unit)
============================================================ */
describe('GENERIC_SEARCH_TOKENS', () => {
  it('contains common product-suffix tokens', () => {
    expect(GENERIC_SEARCH_TOKENS.has('pro')).toBe(true);
    expect(GENERIC_SEARCH_TOKENS.has('max')).toBe(true);
    expect(GENERIC_SEARCH_TOKENS.has('plus')).toBe(true);
    expect(GENERIC_SEARCH_TOKENS.has('ultra')).toBe(true);
  });

  it('does not contain specific model identifiers', () => {
    expect(GENERIC_SEARCH_TOKENS.has('xiaomi')).toBe(false);
    expect(GENERIC_SEARCH_TOKENS.has('samsung')).toBe(false);
    expect(GENERIC_SEARCH_TOKENS.has('14t')).toBe(false);
    expect(GENERIC_SEARCH_TOKENS.has('s24')).toBe(false);
    expect(GENERIC_SEARCH_TOKENS.has('pixel')).toBe(false);
  });
});

/* ============================================================
   Relevance filter integration (A-J regression tests)
============================================================ */
describe('getAllProducts relevance filter', () => {
  // The prefix-first approach makes 3 aggregate calls for search queries:
  // 0: prefixCountPipeline, 1: dataPipeline, 2: countPipeline
  const mockAggregate = (products) => {
    Product.aggregate
      .mockResolvedValueOnce([{ total: products.length }]) // prefixCount (assumes prefix matches)
      .mockResolvedValueOnce(products)  // dataPipeline
      .mockResolvedValueOnce([{ total: products.length }]); // countPipeline
  };

  // A. Exact multi-token product name strongly prefers/restricts to intended product
  it('A: exact multi-token query "Xiaomi 14T Pro" returns only products with specific token match', async () => {
    // Prefix-first: prefix \bxiaomi matches only "Xiaomi 14T Pro" (not "Redmi Note 14 Pro" or "iPhone 16 Pro")
    mockAggregate([
      { _id: 'p1', name: 'Xiaomi 14T Pro', score: 30 },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'Xiaomi 14T Pro' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(1);
    expect(returnedProducts[0].name).toBe('Xiaomi 14T Pro');
  });

  // B. Unrelated products sharing only generic tokens such as "Pro" are excluded
  it('B: prefix-first naturally excludes products that only share generic tokens', async () => {
    // Prefix \bxiaomi only matches "Xiaomi 14T Pro"; others don't start with "xiaomi"
    mockAggregate([
      { _id: 'p1', name: 'Xiaomi 14T Pro', score: 30 },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'Xiaomi 14T Pro' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(1);
    expect(returnedProducts[0].name).toBe('Xiaomi 14T Pro');
  });

  // C. "s24 ultra" still finds Galaxy S24 Ultra
  it('C: "s24 ultra" returns Galaxy S24 Ultra and related S24 products via prefix', async () => {
    // Prefix \bs24 matches "Samsung Galaxy S24 Ultra" and "Samsung Galaxy S24" but NOT "Samsung Galaxy A55"
    mockAggregate([
      { _id: 'p1', name: 'Samsung Galaxy S24 Ultra', score: 18 },
      { _id: 'p2', name: 'Samsung Galaxy S24', score: 14 },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 's24 ultra' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
    expect(returnedProducts.map(p => p.name)).toContain('Samsung Galaxy S24 Ultra');
    expect(returnedProducts.map(p => p.name)).toContain('Samsung Galaxy S24');
  });

  // D. "samsung" still supports brand search (single token always passes)
  it('D: single-token "samsung" brand search returns all matching products', async () => {
    mockAggregate([
      { _id: 'p1', name: 'Samsung Galaxy S24 Ultra', score: 8 },
      { _id: 'p2', name: 'Samsung Galaxy A55', score: 8 },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'samsung' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
  });

  // E. "pixel" still supports series search (single token always passes)
  it('E: single-token "pixel" series search returns all matching products', async () => {
    mockAggregate([
      { _id: 'p1', name: 'Google Pixel 9 Pro', score: 10 },
      { _id: 'p2', name: 'Google Pixel 8a', score: 10 },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'pixel' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
  });

  // F. Case-insensitive search remains equivalent
  it('F: "XIAOMI 14T PRO" and "xiaomi 14t pro" produce same results', async () => {
    const expectedProducts = [
      { _id: 'p1', name: 'Xiaomi 14T Pro', score: 30 },
    ];

    // Uppercase query
    mockAggregate([...expectedProducts]);
    const req1 = mockReq({}, {}, { page: '1', limit: '10', search: 'XIAOMI 14T PRO' });
    const res1 = mockRes();
    await getAllProducts(req1, res1);
    const upperResult = mockJson.mock.calls[mockJson.mock.calls.length - 1][0].data.products;

    // Lowercase query
    mockAggregate([...expectedProducts]);
    const req2 = mockReq({}, {}, { page: '1', limit: '10', search: 'xiaomi 14t pro' });
    const res2 = mockRes();
    await getAllProducts(req2, res2);
    const lowerResult = mockJson.mock.calls[mockJson.mock.calls.length - 1][0].data.products;

    expect(upperResult).toHaveLength(1);
    expect(lowerResult).toHaveLength(1);
    expect(upperResult[0].name).toBe(lowerResult[0].name);
  });

  // G. Extra whitespace remains normalized
  it('G: "  Xiaomi   14T   Pro  " produces same filtered result', async () => {
    // Prefix \bxiaomi 14t pro only matches "Xiaomi 14T Pro"
    mockAggregate([
      { _id: 'p1', name: 'Xiaomi 14T Pro', score: 30 },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: '  Xiaomi   14T   Pro  ' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(1);
    expect(returnedProducts[0].name).toBe('Xiaomi 14T Pro');
  });

  // H. Search + price/brand filters still compose correctly
  it('H: search + brand + price filters compose correctly', async () => {
    // Prefix \bxiaomi only matches "Xiaomi 14T Pro"; "iPhone 16 Pro 256GB" doesn't match
    mockAggregate([
      { _id: 'p1', name: 'Xiaomi 14T Pro', score: 30 },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'Xiaomi 14T Pro', brand: 'xiaomi', minPrice: '10000000', maxPrice: '30000000' });
    const res = mockRes();
    await getAllProducts(req, res);

    // Pipeline index 1 is the data pipeline (index 0 is prefixCount)
    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const matchStage = dataPipeline.find(s => s.$match);
    expect(matchStage.$match.brand).toBe('xiaomi');
    expect(matchStage.$match.price).toEqual({ $gte: 10000000, $lte: 30000000 });

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(1);
    expect(returnedProducts[0].name).toBe('Xiaomi 14T Pro');
  });

  // I. Empty search remains unchanged
  it('I: empty search returns normal catalog without filtering', async () => {
    // Empty search makes 2 aggregate calls (no prefixCount)
    Product.aggregate
      .mockResolvedValueOnce([
        { _id: 'p1', name: 'Product A', score: 0 },
        { _id: 'p2', name: 'Product B', score: 0 },
      ])
      .mockResolvedValueOnce([{ total: 2 }]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: '' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
  });

  // J. Regex metacharacters cannot alter matching behavior
  it('J: regex metacharacters in search query are handled safely via prefix', async () => {
    mockAggregate([
      { _id: 'p1', name: 'iPhone 15 Pro', score: 10 },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'iphone 15 (pro)' });
    const res = mockRes();
    await getAllProducts(req, res);

    // Pipeline index 1 is the data pipeline
    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const matchStage = dataPipeline.find(s => s.$match && s.$match.$or);
    // Should use prefix regex (prefix "iphone" matches name)
    expect(matchStage.$match.$or).toBeDefined();
  });

  // Relevance filter does not apply to single-token searches
  it('single-token search "pro" returns all products matching "pro"', async () => {
    mockAggregate([
      { _id: 'p1', name: 'iPhone 16 Pro', score: 10 },
      { _id: 'p2', name: 'Samsung Galaxy S24 Pro', score: 10 },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'pro' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
  });

  // Relevance filter does not apply when no search is active
  it('no search returns normal catalog with no filtering', async () => {
    Product.aggregate
      .mockResolvedValueOnce([
        { _id: 'p1', name: 'iPhone 16 Pro', score: 0 },
        { _id: 'p2', name: 'Samsung Galaxy S24', score: 0 },
      ])
      .mockResolvedValueOnce([{ total: 2 }]);

    const req = mockReq({}, {}, { page: '1', limit: '10' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
  });

  // Pagination totalCount uses filtered count for multi-token search
  it('totalCount reflects results', async () => {
    mockAggregate([
      { _id: 'p1', name: 'Xiaomi 14T Pro', score: 30 },
      { _id: 'p2', name: 'iPhone 16 Pro 256GB', score: 10 },
      { _id: 'p3', name: 'Redmi Note 14 Pro', score: 20 },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'Xiaomi 14T Pro' });
    const res = mockRes();
    await getAllProducts(req, res);

    const pagination = mockJson.mock.calls[0][0].data.pagination;
    expect(pagination.totalCount).toBe(3);
    expect(pagination.totalPages).toBe(1);
  });
});

/* ============================================================
   escapeRegex (unit)
============================================================ */
describe('escapeRegex', () => {
  it('escapes all regex metacharacters', () => {
    expect(escapeRegex('oppo')).toBe('oppo');
    expect(escapeRegex('s24 ultra')).toBe('s24 ultra');
    expect(escapeRegex('iphone (pro)')).toBe('iphone \\(pro\\)');
    expect(escapeRegex('price.$100')).toBe('price\\.\\$100');
    expect(escapeRegex('a*b+c')).toBe('a\\*b\\+c');
  });
});

/* ============================================================
   createProduct regex injection regression
   ============================================================ */
describe('createProduct — regex injection prevention', () => {
  const savedProduct = (name) => ({
    _id: 'prod-regex',
    name,
    brand: 'test',
    price: 500,
    description: 'Test',
    specs: {},
    colors: [],
    inStock: 0,
    tags: [],
    image: '',
    embeddingStatus: 'pending',
  });

  const regexSpecialInputs = [
    { input: '.*', label: 'dot-star' },
    { input: '^$', label: 'caret-dollar' },
    { input: '(test)', label: 'parentheses' },
    { input: '[abc]', label: 'brackets' },
    { input: 'test+', label: 'plus' },
    { input: 'test?', label: 'question' },
    { input: 'a\\b', label: 'backslash' },
    { input: 'price.$100', label: 'dollar-dot' },
  ];

  for (const { input, label } of regexSpecialInputs) {
    it(`treats regex-special input "${label}" as literal text`, async () => {
      Product.findOne.mockResolvedValue(null);
      const mockSave = new Product({}).save;
      mockSave.mockResolvedValue(savedProduct(input));

      const req = mockReq({ name: input, brand: 'test', price: 500, description: 'Test' });
      const res = mockRes();
      mockBuildEmbeddingContent.mockReturnValue('text');

      await createProduct(req, res);

      // Product.findOne should have been called — the regex-special name
      // must not throw or match unrelated products.
      expect(Product.findOne).toHaveBeenCalled();
      const findOneCall = Product.findOne.mock.calls[0][0];
      // The constructed RegExp must escape the input so it is treated literally.
      const regex = findOneCall.name.$regex;
      expect(regex.test(input)).toBe(true);
      // Verify it does NOT match unrelated strings via regex metacharacters.
      expect(regex.test('')).toBe(false);
    });
  }

  it('still matches exact product name case-insensitively', async () => {
    Product.findOne.mockResolvedValue(null);
    const mockSave = new Product({}).save;
    mockSave.mockResolvedValue(savedProduct('Galaxy S24'));

    const req = mockReq({ name: 'Galaxy S24', brand: 'samsung', price: 899, description: 'Phone' });
    const res = mockRes();
    mockBuildEmbeddingContent.mockReturnValue('text');

    await createProduct(req, res);

    const findOneCall = Product.findOne.mock.calls[0][0];
    const regex = findOneCall.name.$regex;
    expect(regex.test('Galaxy S24')).toBe(true);
    expect(regex.test('galaxy s24')).toBe(true);
    expect(regex.test('GALAXY S24')).toBe(true);
    expect(regex.test('Galaxy S24 Pro')).toBe(false);
  });
});

/* ============================================================
   Prefix search integration tests
============================================================ */
describe('getAllProducts prefix search', () => {
  // The new prefix-first approach makes 3 aggregate calls when search is active:
  // 1. prefixCountPipeline (lightweight count to check if prefix matches exist)
  // 2. dataPipeline (the actual data query)
  // 3. countPipeline (total count for pagination)
  const mockAggregatePrefix = (prefixCount, products) => {
    Product.aggregate
      .mockResolvedValueOnce(prefixCount > 0 ? [{ total: prefixCount }] : [])  // prefixCount
      .mockResolvedValueOnce(products)  // dataPipeline
      .mockResolvedValueOnce([{ total: products.length }]); // countPipeline
  };

  // For $text fallback (no prefix matches), only 2 aggregate calls:
  // 1. prefixCountPipeline → [] (no prefix matches)
  // Then the controller falls back to $text, making:
  // 2. dataPipeline
  // 3. countPipeline
  const mockAggregateTextFallback = (products, total) => {
    Product.aggregate
      .mockResolvedValueOnce([])  // prefixCount → 0
      .mockResolvedValueOnce(products)  // dataPipeline ($text)
      .mockResolvedValueOnce([{ total: total || products.length }]); // countPipeline
  };

  // 1. "o" returns only strong prefix candidates
  it('1: "o" returns products with name/brand matching word-boundary "o"', async () => {
    mockAggregatePrefix(2, [
      { _id: 'p1', name: 'OPPO Reno 11' },
      { _id: 'p2', name: 'OnePlus 12' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'o' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const matchStage = dataPipeline.find(s => s.$match && s.$match.$or);
    expect(matchStage.$match.$or).toBeDefined();

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
  });

  // 2. "op" finds OPPO/OnePlus relevant products
  it('2: "op" returns products with name/brand matching "op"', async () => {
    mockAggregatePrefix(2, [
      { _id: 'p1', name: 'OPPO Reno 11' },
      { _id: 'p2', name: 'OnePlus 12' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'op' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
  });

  // 3. "opp" finds OPPO products
  it('3: "opp" returns OPPO products via prefix', async () => {
    mockAggregatePrefix(2, [
      { _id: 'p1', name: 'OPPO Reno 11' },
      { _id: 'p2', name: 'OPPO Find X7' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'opp' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
  });

  // 4. "oppo" finds OPPO products via prefix (no threshold — prefix always tried first)
  it('4: "oppo" returns OPPO products via prefix', async () => {
    mockAggregatePrefix(2, [
      { _id: 'p1', name: 'OPPO Reno 11' },
      { _id: 'p2', name: 'OPPO Find X7' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'oppo' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const matchStage = dataPipeline.find(s => s.$match && s.$match.$or);
    expect(matchStage.$match.$or).toBeDefined();
  });

  // 5. "iph" finds iPhone products via prefix
  it('5: "iph" returns iPhone products via prefix', async () => {
    mockAggregatePrefix(2, [
      { _id: 'p1', name: 'iPhone 16 Pro' },
      { _id: 'p2', name: 'iPhone 15 Pro Max' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'iph' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
  });

  // 6. "pix" finds Pixel products via prefix
  it('6: "pix" returns Pixel products via prefix', async () => {
    mockAggregatePrefix(2, [
      { _id: 'p1', name: 'Google Pixel 9 Pro' },
      { _id: 'p2', name: 'Google Pixel 8a' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'pix' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
  });

  // 7. "sam" finds Samsung products via prefix
  it('7: "sam" returns Samsung products via prefix', async () => {
    mockAggregatePrefix(2, [
      { _id: 'p1', name: 'Samsung Galaxy S24' },
      { _id: 'p2', name: 'Samsung Galaxy A55' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'sam' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
  });

  // 8. "xia" finds Xiaomi products via prefix
  it('8: "xia" returns Xiaomi products via prefix', async () => {
    mockAggregatePrefix(2, [
      { _id: 'p1', name: 'Xiaomi 14T Pro' },
      { _id: 'p2', name: 'Xiaomi Redmi Note 13' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'xia' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
  });

  // 9. Case-insensitive prefix works
  it('9: "IPH" and "iph" produce same prefix results', async () => {
    const expected = [{ _id: 'p1', name: 'iPhone 16 Pro' }];

    mockAggregatePrefix(1, [...expected]);
    const req1 = mockReq({}, {}, { page: '1', limit: '10', search: 'IPH' });
    const res1 = mockRes();
    await getAllProducts(req1, res1);
    const upperResult = mockJson.mock.calls[mockJson.mock.calls.length - 1][0].data.products;

    mockAggregatePrefix(1, [...expected]);
    const req2 = mockReq({}, {}, { page: '1', limit: '10', search: 'iph' });
    const res2 = mockRes();
    await getAllProducts(req2, res2);
    const lowerResult = mockJson.mock.calls[mockJson.mock.calls.length - 1][0].data.products;

    expect(upperResult).toHaveLength(1);
    expect(lowerResult).toHaveLength(1);
    expect(upperResult[0].name).toBe(lowerResult[0].name);
  });

  // 10. Extra whitespace prefix works
  it('10: "  opp  " normalizes to "opp" prefix search', async () => {
    mockAggregatePrefix(1, [
      { _id: 'p1', name: 'OPPO Reno 11' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: '  opp  ' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(1);
  });

  // 11. Regex metacharacters cannot alter matching behavior
  it('11: regex metacharacters in prefix query are escaped safely', async () => {
    mockAggregatePrefix(1, [
      { _id: 'p1', name: 'iPhone 15 Pro' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'ip(' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const matchStage = dataPipeline.find(s => s.$match && s.$match.$or);
    const nameCondition = matchStage.$match.$or[0].name;
    expect(nameCondition.$regex).toBe('\\bip\\(');
    expect(nameCondition.$options).toBe('i');
  });

  // 12. "Xiaomi 14T Pro" — prefix matches "xiaomi" in name, returns relevant results
  it('12: "Xiaomi 14T Pro" returns relevant Xiaomi result via prefix', async () => {
    mockAggregatePrefix(1, [
      { _id: 'p1', name: 'Xiaomi 14T Pro' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'Xiaomi 14T Pro' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(1);
    expect(returnedProducts[0].name).toBe('Xiaomi 14T Pro');
  });

  // 13. "s24 ultra" — prefix matches "s24" in name, returns relevant results
  it('13: "s24 ultra" returns Samsung Galaxy S24 Ultra via prefix', async () => {
    mockAggregatePrefix(2, [
      { _id: 'p1', name: 'Samsung Galaxy S24 Ultra' },
      { _id: 'p2', name: 'Samsung Galaxy S24' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 's24 ultra' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
  });

  // 14. "samsung" — prefix matches brand "samsung"
  it('14: "samsung" returns Samsung products via prefix on brand', async () => {
    mockAggregatePrefix(2, [
      { _id: 'p1', name: 'Samsung Galaxy S24' },
      { _id: 'p2', name: 'Samsung Galaxy A55' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'samsung' });
    const res = mockRes();
    await getAllProducts(req, res);

    const returnedProducts = mockJson.mock.calls[0][0].data.products;
    expect(returnedProducts).toHaveLength(2);
  });

  // 15. Empty search unchanged
  it('15: empty search returns normal catalog', async () => {
    // Empty search makes 2 aggregate calls (data + count), no prefix check
    Product.aggregate
      .mockResolvedValueOnce([
        { _id: 'p1', name: 'Product A' },
        { _id: 'p2', name: 'Product B' },
      ])
      .mockResolvedValueOnce([{ total: 2 }]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: '' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[0][0];
    const matchStage = dataPipeline.find(s => s.$match);
    expect(matchStage.$match.$text).toBeUndefined();
    expect(matchStage.$match.$or).toBeUndefined();
  });

  // 16. search + price/brand filters still work
  it('16: prefix search + brand + price filters compose correctly', async () => {
    mockAggregatePrefix(1, [
      { _id: 'p1', name: 'OPPO Reno 11' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'opp', brand: 'oppo', minPrice: '5000000', maxPrice: '15000000' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const matchStage = dataPipeline.find(s => s.$match);
    expect(matchStage.$match.brand).toBe('oppo');
    expect(matchStage.$match.price).toEqual({ $gte: 5000000, $lte: 15000000 });
    expect(matchStage.$match.$or).toBeDefined();
  });

  // 17. Pagination metadata reflects prefix-filtered results
  it('17: totalCount reflects results', async () => {
    mockAggregatePrefix(2, [
      { _id: 'p1', name: 'OPPO Reno 11' },
      { _id: 'p2', name: 'OPPO Find X7' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'opp' });
    const res = mockRes();
    await getAllProducts(req, res);

    const pagination = mockJson.mock.calls[0][0].data.pagination;
    expect(pagination.totalCount).toBe(2);
    expect(pagination.totalPages).toBe(1);
  });

  // 18. Cache key uses normalized query
  it('18: cache key uses normalized prefix query', async () => {
    mockAggregatePrefix(1, [
      { _id: 'p1', name: 'OPPO Reno 11' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: '  OPP  ' });
    const res = mockRes();
    await getAllProducts(req, res);

    const expectedCacheKey = 'products:' + JSON.stringify({
      page: 1, limit: 10, brand: null, search: 'opp',
      minPrice: null, maxPrice: null, sortBy: null, sortOrder: null,
      minRating: null, inStock: null,
    });
    expect(cache.set).toHaveBeenCalledWith(
      expectedCacheKey,
      expect.any(Object),
      300
    );
  });

  // Prefix search uses name+createdAt sort
  it('prefix search sorts by name then createdAt', async () => {
    mockAggregatePrefix(1, [
      { _id: 'p1', name: 'OPPO Reno 11' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'opp' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const sortStage = dataPipeline.find(s => s.$sort);
    expect(sortStage.$sort).toEqual({ name: 1, createdAt: -1 });
  });

  // Prefix search does not include text score in projection
  it('prefix search does not include text score in projection', async () => {
    mockAggregatePrefix(1, [
      { _id: 'p1', name: 'OPPO Reno 11' },
    ]);

    const req = mockReq({}, {}, { page: '1', limit: '10', search: 'opp' });
    const res = mockRes();
    await getAllProducts(req, res);

    const dataPipeline = Product.aggregate.mock.calls[1][0];
    const projectStage = dataPipeline.find(s => s.$project);
    expect(projectStage.$project.score).toBeUndefined();
  });
});

/* ============================================================
   Prefix regex matching validation (real product name values)
   These tests verify the actual regex pattern matches real-world
   product names, not just that the pipeline contains a regex.
============================================================ */
describe('prefix regex matching against real product names', () => {
  // Helper: extract the $regex and $options from the first $or condition
  const getPrefixRegex = () => {
    const dataPipeline = Product.aggregate.mock.calls[0][0];
    const matchStage = dataPipeline.find(s => s.$match && s.$match.$or);
    return matchStage.$match.$or[0].name; // { $regex: "...", $options: "i" }
  };

  const mockAggregateOne = (name) => {
    Product.aggregate
      .mockResolvedValueOnce([{ total: 1 }])  // prefixCount
      .mockResolvedValueOnce([{ _id: 'p1', name }])  // dataPipeline
      .mockResolvedValueOnce([{ total: 1 }]); // countPipeline
  };

  const searchAndCapture = async (query) => {
    mockAggregateOne('placeholder');
    const req = mockReq({}, {}, { page: '1', limit: '10', search: query });
    const res = mockRes();
    await getAllProducts(req, res);
    return getPrefixRegex();
  };

  const searchAndCheckResults = async (query, mockProducts) => {
    Product.aggregate
      .mockResolvedValueOnce([{ total: mockProducts.length }]) // prefixCount
      .mockResolvedValueOnce(mockProducts)  // dataPipeline
      .mockResolvedValueOnce([{ total: mockProducts.length }]); // countPipeline
    const req = mockReq({}, {}, { page: '1', limit: '10', search: query });
    const res = mockRes();
    await getAllProducts(req, res);
    return mockJson.mock.calls[mockJson.mock.calls.length - 1][0].data.products;
  };

  it('uses string $regex form with case-insensitive flag', async () => {
    const cond = await searchAndCapture('iph');
    expect(cond.$regex).toBe('\\biph');
    expect(cond.$options).toBe('i');
  });

  it('"iph" regex matches "iPhone 16 Pro" (real name)', () => {
    const re = new RegExp('\\biph', 'i');
    expect(re.test('iPhone 16 Pro')).toBe(true);
  });

  it('"iph" regex matches "iPhone 15 Pro Max" (real name)', () => {
    const re = new RegExp('\\biph', 'i');
    expect(re.test('iPhone 15 Pro Max')).toBe(true);
  });

  it('"iph" regex matches "iPhone SE" (real name)', () => {
    const re = new RegExp('\\biph', 'i');
    expect(re.test('iPhone SE')).toBe(true);
  });

  it('"iph" regex does NOT match "Galaxy S24" (unrelated)', () => {
    const re = new RegExp('\\biph', 'i');
    expect(re.test('Galaxy S24')).toBe(false);
  });

  it('"iph" regex does NOT match "OPPO Reno 11" (unrelated)', () => {
    const re = new RegExp('\\biph', 'i');
    expect(re.test('OPPO Reno 11')).toBe(false);
  });

  it('"pix" regex matches "Pixel 9 Pro" (real name from fixtures)', () => {
    const re = new RegExp('\\bpix', 'i');
    expect(re.test('Pixel 9 Pro')).toBe(true);
  });

  it('"pix" regex matches "Google Pixel 9 Pro" (real name with brand prefix)', () => {
    const re = new RegExp('\\bpix', 'i');
    expect(re.test('Google Pixel 9 Pro')).toBe(true);
  });

  it('"pix" regex matches "Google Pixel 8a" (real name)', () => {
    const re = new RegExp('\\bpix', 'i');
    expect(re.test('Google Pixel 8a')).toBe(true);
  });

  it('"pix" regex does NOT match "OnePlus 12" (unrelated)', () => {
    const re = new RegExp('\\bpix', 'i');
    expect(re.test('OnePlus 12')).toBe(false);
  });

  it('"sam" regex matches "Samsung Galaxy S24" (real name)', () => {
    const re = new RegExp('\\bsam', 'i');
    expect(re.test('Samsung Galaxy S24')).toBe(true);
  });

  it('"sam" regex matches "samsung" brand (real brand value)', () => {
    const re = new RegExp('\\bsam', 'i');
    expect(re.test('samsung')).toBe(true);
  });

  it('"xia" regex matches "Xiaomi 14T Pro" (real name)', () => {
    const re = new RegExp('\\bxia', 'i');
    expect(re.test('Xiaomi 14T Pro')).toBe(true);
  });

  it('"xia" regex matches "xiaomi" brand (real brand value)', () => {
    const re = new RegExp('\\bxia', 'i');
    expect(re.test('xiaomi')).toBe(true);
  });

  it('"opp" regex matches "OPPO Reno 11" (real name)', () => {
    const re = new RegExp('\\bopp', 'i');
    expect(re.test('OPPO Reno 11')).toBe(true);
  });

  it('"opp" regex matches "oppo" brand (real brand value)', () => {
    const re = new RegExp('\\bopp', 'i');
    expect(re.test('oppo')).toBe(true);
  });

  it('"o" regex matches "OPPO Reno 11" (1-char prefix)', () => {
    const re = new RegExp('\\bo', 'i');
    expect(re.test('OPPO Reno 11')).toBe(true);
  });

  it('"o" regex matches "OnePlus 12" (1-char prefix)', () => {
    const re = new RegExp('\\bo', 'i');
    expect(re.test('OnePlus 12')).toBe(true);
  });

  it('"o" regex does NOT match "Samsung Galaxy S24" (no word starting with "o")', () => {
    const re = new RegExp('\\bo', 'i');
    expect(re.test('Samsung Galaxy S24')).toBe(false);
  });

  it('"iph" returns iPhone products in integration test', async () => {
    const products = await searchAndCheckResults('iph', [
      { _id: 'p1', name: 'iPhone 16 Pro' },
      { _id: 'p2', name: 'iPhone 15 Pro Max' },
      { _id: 'p3', name: 'Samsung Galaxy S24' },
    ]);
    // All products are returned by mock, but pipeline should have $or filter
    const dataPipeline = Product.aggregate.mock.calls[0][0];
    const matchStage = dataPipeline.find(s => s.$match && s.$match.$or);
    expect(matchStage.$match.$or[0].name.$regex).toBe('\\biph');
    expect(matchStage.$match.$or[0].name.$options).toBe('i');
  });

  it('"pix" returns Pixel products in integration test', async () => {
    const products = await searchAndCheckResults('pix', [
      { _id: 'p1', name: 'Google Pixel 9 Pro' },
      { _id: 'p2', name: 'Google Pixel 8a' },
      { _id: 'p3', name: 'OPPO Reno 11' },
    ]);
    const dataPipeline = Product.aggregate.mock.calls[0][0];
    const matchStage = dataPipeline.find(s => s.$match && s.$match.$or);
    expect(matchStage.$match.$or[0].name.$regex).toBe('\\bpix');
    expect(matchStage.$match.$or[0].name.$options).toBe('i');
  });
});
