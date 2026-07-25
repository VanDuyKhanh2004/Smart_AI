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
  return MockProduct;
});

jest.mock('../models/Review', () => ({}));

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
class MockProductImageValidationError extends Error {
  constructor(message) { super(message); this.name = 'ProductImageValidationError'; this.statusCode = 400; this.code = 'INVALID_PRODUCT_IMAGE'; }
}
jest.mock('../services/productImageService', () => ({
  uploadProductImageIfNeeded: mockUploadProductImageIfNeeded,
  ProductImageValidationError: MockProductImageValidationError,
}));

const { createProduct, updateProduct } = require('../controllers/productController');
const Product = require('../models/Product');
const cache = require('../services/cacheService');
const logger = require('../utils/logger');

const mockJson = jest.fn();
const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
const mockRes = () => ({ status: mockStatus, json: mockJson });

function mockReq(body, params = {}, query = {}) {
  return { body, params, query, requestId: 'test-cid' };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockComputeContentHash.mockReturnValue('changed-hash');
  mockUploadProductImageIfNeeded.mockResolvedValue({ imageUrl: '', imagePublicId: null });
});

describe('createProduct', () => {
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

  it('logs error with logger.error on failure', async () => {
    Product.findOne.mockRejectedValue(new Error('DB down'));

    const req = mockReq({ name: 'X', brand: 'Y', price: 1, description: 'D' });
    const res = mockRes();

    await createProduct(req, res);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.objectContaining({ message: 'DB down' }) }),
      'Failed to create product',
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

  it('logs error with logger.error on failure', async () => {
    Product.findById.mockRejectedValue(new Error('Find failed'));

    const req = mockReq({ name: 'X', brand: 'Y', price: 1, description: 'D' }, { id: 'prod-err' });
    const res = mockRes();

    await updateProduct(req, res);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.objectContaining({ message: 'Find failed' }) }),
      'Failed to update product',
    );
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
    await createProduct(req, res);

    expect(mockSave).not.toHaveBeenCalled();
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_PRODUCT_IMAGE' }),
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
    await createProduct(req, res);

    expect(mockStatus).toHaveBeenCalledWith(500);
  });

  it('returns controlled error when Cloudinary upload fails', async () => {
    mockUploadProductImageIfNeeded.mockRejectedValue(new Error('Cloudinary is not configured'));
    Product.findOne.mockResolvedValue(null);
    const mockSave = jest.fn();
    const ProductMock = require('../models/Product');
    ProductMock.mockImplementation((data) => ({ ...data, _id: 'id', save: mockSave }));

    const req = mockReq({ name: 'Phone', brand: 'Test', price: 200, description: 'Desc', image: 'data:image/jpeg;base64,/9j/4AAQ' });
    const res = mockRes();
    await createProduct(req, res);

    expect(mockSave).not.toHaveBeenCalled();
    expect(mockStatus).toHaveBeenCalledWith(500);
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

  it('does not update product when upload validation fails — returns 400 with INVALID_PRODUCT_IMAGE', async () => {
    const { ProductImageValidationError } = require('../services/productImageService');
    mockUploadProductImageIfNeeded.mockRejectedValue(new ProductImageValidationError('HTTP image URLs are not allowed'));
    Product.findById.mockResolvedValue({ ...existingProduct });

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'http://example.com/bad.jpg' }, { id: 'prod-update-img' });
    const res = mockRes();
    await updateProduct(req, res);

    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_PRODUCT_IMAGE' }),
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
    await updateProduct(req, res);

    expect(mockStatus).toHaveBeenCalledWith(500);
  });

  it('leaves existing image unchanged on Cloudinary failure', async () => {
    mockUploadProductImageIfNeeded.mockRejectedValue(new Error('Cloudinary is not configured'));
    Product.findById.mockResolvedValue({ ...existingProduct });

    const req = mockReq({ name: 'Old Phone', brand: 'test', price: 100, description: 'Updated', image: 'data:image/jpeg;base64,/9j/4AAQ' }, { id: 'prod-update-img' });
    const res = mockRes();
    await updateProduct(req, res);

    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(mockStatus).toHaveBeenCalledWith(500);
  });
});
