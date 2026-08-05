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

const request = require('supertest');
const express = require('express');

const ADMIN_ID = '507f191e810c19729de860ea';
const USER_ID = '507f191e810c19729de860eb';
const PRODUCT_ID = '507f191e810c19729de860f1';

/* --- Product model mock --- */
const mockSave = jest.fn();
const MockProduct = jest.fn().mockImplementation((data) => ({
  ...data,
  _id: PRODUCT_ID,
  save: mockSave,
}));
MockProduct.findOne = jest.fn();
MockProduct.findById = jest.fn();
MockProduct.findByIdAndUpdate = jest.fn();
MockProduct.aggregate = jest.fn();
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

jest.mock('../services/productSearchService', () => ({
  search: jest.fn(),
}));

jest.mock('../services/productRecommendationService', () => ({
  recommend: jest.fn(),
}));

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

/* --- Auth middleware: protect attaches a mutable user, adminMiddleware stays real --- */
const mockAuthUser = { _id: ADMIN_ID, role: 'admin' };
jest.mock('../middlewares/authMiddleware', () => ({
  protect: (req, res, next) => {
    req.user = mockAuthUser;
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));

const productRoutes = require('../routes/productRoutes');
const errorHandler = require('../middlewares/errorHandler');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/products', productRoutes);
  app.use(errorHandler);
  return app;
}

function jpegBuffer(length = 100) {
  const buf = Buffer.alloc(length, 0x00);
  buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff;
  return buf;
}

const cloudinaryResult = {
  imageUrl: 'https://res.cloudinary.com/demo/image/upload/smart-ai/products/new.jpg',
  imagePublicId: 'smart-ai/products/new',
};

const savedProduct = {
  _id: PRODUCT_ID,
  name: 'Test Phone',
  brand: 'test',
  price: 100,
  description: 'A test phone',
  inStock: 5,
  colors: ['Black'],
  tags: ['5G'],
  image: cloudinaryResult.imageUrl,
  imagePublicId: cloudinaryResult.imagePublicId,
};

describe('Product image upload — multipart routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockUploadProductImageIfNeeded.mockResolvedValue({ imageUrl: '', imagePublicId: null });
    mockUploadProductImageBuffer.mockResolvedValue(cloudinaryResult);
    mockDeleteImageFromCloudinary.mockResolvedValue({ deleted: true, publicId: null, result: 'skipped' });
    mockSave.mockResolvedValue(savedProduct);
  });

  it('multipart create stores image + imagePublicId', async () => {
    MockProduct.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/products')
      .field('name', 'Test Phone')
      .field('brand', 'Test')
      .field('price', '100')
      .field('description', 'A test phone')
      .field('inStock', '5')
      .field('colors', JSON.stringify(['Black']))
      .field('tags', JSON.stringify(['5G']))
      .attach('image', jpegBuffer(), {
        filename: 'phone.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    expect(mockUploadProductImageBuffer).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg');
    expect(mockUploadProductImageIfNeeded).not.toHaveBeenCalled();
    expect(res.body.data.image).toBe(cloudinaryResult.imageUrl);
    expect(res.body.data.imagePublicId).toBe(cloudinaryResult.imagePublicId);
  });

  it('multipart create with JSON array fields coerces strings correctly', async () => {
    MockProduct.findOne.mockResolvedValue(null);

    await request(app)
      .post('/api/products')
      .field('name', 'Phone 2')
      .field('brand', 'Test')
      .field('price', '250')
      .field('description', 'desc')
      .field('inStock', '3')
      .field('colors', JSON.stringify(['Blue', 'Red']))
      .field('tags', JSON.stringify(['5G', 'Flagship']))
      .attach('image', jpegBuffer(), { filename: 'p.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(MockProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 250,
        inStock: 3,
        colors: ['Blue', 'Red'],
        tags: ['5G', 'Flagship'],
      }),
    );
  });

  it('multipart update replaces image', async () => {
    const existing = {
      ...savedProduct,
      image: 'https://cdn.example.com/old.jpg',
      imagePublicId: 'smart-ai/products/old',
    };
    MockProduct.findById.mockResolvedValue(existing);
    MockProduct.findByIdAndUpdate.mockResolvedValue({
      ...existing,
      image: cloudinaryResult.imageUrl,
      imagePublicId: cloudinaryResult.imagePublicId,
    });

    await request(app)
      .put(`/api/products/${PRODUCT_ID}`)
      .field('name', 'Test Phone')
      .field('brand', 'Test')
      .field('price', '100')
      .field('description', 'A test phone')
      .attach('image', jpegBuffer(), { filename: 'new.jpg', contentType: 'image/jpeg' })
      .expect(200);

    expect(mockUploadProductImageBuffer).toHaveBeenCalled();
    expect(mockDeleteImageFromCloudinary).toHaveBeenCalledWith('smart-ai/products/old');
  });

  it('returns 400 IMAGE_SOURCE_CONFLICT when both file and URL image are supplied', async () => {
    MockProduct.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/products')
      .field('name', 'Phone 3')
      .field('brand', 'Test')
      .field('price', '100')
      .field('description', 'desc')
      .field('image', 'https://cdn.example.com/photo.jpg')
      .attach('image', jpegBuffer(), { filename: 'p.jpg', contentType: 'image/jpeg' })
      .expect(400);

    expect(res.body.error.code).toBe('IMAGE_SOURCE_CONFLICT');
    expect(mockUploadProductImageBuffer).not.toHaveBeenCalled();
  });

  it('JSON create remains supported (URL image)', async () => {
    MockProduct.findOne.mockResolvedValue(null);
    mockUploadProductImageIfNeeded.mockResolvedValue({
      imageUrl: 'https://cdn.example.com/photo.jpg',
      imagePublicId: null,
    });
    mockSave.mockResolvedValue({
      ...savedProduct,
      image: 'https://cdn.example.com/photo.jpg',
    });

    const res = await request(app)
      .post('/api/products')
      .send({
        name: 'Phone 4',
        brand: 'Test',
        price: 100,
        description: 'desc',
        image: 'https://cdn.example.com/photo.jpg',
      })
      .expect(201);

    expect(mockUploadProductImageIfNeeded).toHaveBeenCalledWith('https://cdn.example.com/photo.jpg');
    expect(mockUploadProductImageBuffer).not.toHaveBeenCalled();
    expect(res.body.data.image).toBe('https://cdn.example.com/photo.jpg');
  });

  it('JSON update with no image preserves existing image', async () => {
    const existing = {
      ...savedProduct,
      image: 'https://cdn.example.com/keep.jpg',
      imagePublicId: 'smart-ai/products/keep',
    };
    MockProduct.findById.mockResolvedValue(existing);
    MockProduct.findByIdAndUpdate.mockResolvedValue(existing);

    await request(app)
      .put(`/api/products/${PRODUCT_ID}`)
      .send({ name: 'Test Phone', brand: 'Test', price: 100, description: 'updated' })
      .expect(200);

    expect(mockUploadProductImageIfNeeded).not.toHaveBeenCalled();
    expect(mockUploadProductImageBuffer).not.toHaveBeenCalled();
    expect(mockDeleteImageFromCloudinary).not.toHaveBeenCalled();
  });

  it('JSON update with empty image clears imagePublicId', async () => {
    const existing = {
      ...savedProduct,
      image: 'https://res.cloudinary.com/.../old.jpg',
      imagePublicId: 'smart-ai/products/old',
    };
    MockProduct.findById.mockResolvedValue(existing);
    MockProduct.findByIdAndUpdate.mockResolvedValue({
      ...existing,
      image: '',
      imagePublicId: undefined,
    });
    mockUploadProductImageIfNeeded.mockResolvedValue({ imageUrl: '', imagePublicId: null });

    await request(app)
      .put(`/api/products/${PRODUCT_ID}`)
      .send({ name: 'Test Phone', brand: 'Test', price: 100, description: 'updated', image: '' })
      .expect(200);

    expect(mockUploadProductImageIfNeeded).toHaveBeenCalledWith('');
    const updateOp = MockProduct.findByIdAndUpdate.mock.calls[0][1];
    expect(updateOp.$unset.imagePublicId).toBe('');
  });

  it('rolls back newly uploaded Cloudinary image when DB create fails', async () => {
    MockProduct.findOne.mockResolvedValue(null);
    const dbError = new Error('DB error');
    mockSave.mockRejectedValue(dbError);

    const res = await request(app)
      .post('/api/products')
      .field('name', 'Phone 5')
      .field('brand', 'Test')
      .field('price', '100')
      .field('description', 'desc')
      .attach('image', jpegBuffer(), { filename: 'p.jpg', contentType: 'image/jpeg' })
      .expect(500);

    expect(mockDeleteImageFromCloudinary).toHaveBeenCalledWith('smart-ai/products/new');
    expect(res.body.success).toBe(false);
  });

  it('rolls back newly uploaded image and preserves old on DB update failure', async () => {
    const existing = {
      ...savedProduct,
      image: 'https://cdn.example.com/old.jpg',
      imagePublicId: 'smart-ai/products/old',
    };
    MockProduct.findById.mockResolvedValue(existing);
    MockProduct.findByIdAndUpdate.mockRejectedValue(new Error('DB error'));

    await request(app)
      .put(`/api/products/${PRODUCT_ID}`)
      .field('name', 'Test Phone')
      .field('brand', 'Test')
      .field('price', '100')
      .field('description', 'desc')
      .attach('image', jpegBuffer(), { filename: 'new.jpg', contentType: 'image/jpeg' })
      .expect(500);

    expect(mockDeleteImageFromCloudinary).toHaveBeenCalledWith('smart-ai/products/new');
    expect(mockDeleteImageFromCloudinary).not.toHaveBeenCalledWith('smart-ai/products/old');
  });

  it('does not fail successful update when old asset cleanup fails', async () => {
    const existing = {
      ...savedProduct,
      image: 'https://cdn.example.com/old.jpg',
      imagePublicId: 'smart-ai/products/old',
    };
    MockProduct.findById.mockResolvedValue(existing);
    MockProduct.findByIdAndUpdate.mockResolvedValue({
      ...existing,
      image: cloudinaryResult.imageUrl,
      imagePublicId: cloudinaryResult.imagePublicId,
    });
    mockDeleteImageFromCloudinary.mockResolvedValue({ deleted: false, publicId: 'smart-ai/products/old', result: 'failed', error: new Error('boom') });

    await request(app)
      .put(`/api/products/${PRODUCT_ID}`)
      .field('name', 'Test Phone')
      .field('brand', 'Test')
      .field('price', '100')
      .field('description', 'desc')
      .attach('image', jpegBuffer(), { filename: 'new.jpg', contentType: 'image/jpeg' })
      .expect(200);
  });

  it('returns 400 for malformed multipart JSON field', async () => {
    const res = await request(app)
      .post('/api/products')
      .field('name', 'Phone 6')
      .field('brand', 'Test')
      .field('price', '100')
      .field('description', 'desc')
      .field('colors', 'not-json{{{')
      .attach('image', jpegBuffer(), { filename: 'p.jpg', contentType: 'image/jpeg' })
      .expect(400);

    expect(res.body.error.code).toBe('INVALID_MULTIPART_FIELD');
  });

  it('returns 400 for non-numeric price in multipart', async () => {
    const res = await request(app)
      .post('/api/products')
      .field('name', 'Phone 7')
      .field('brand', 'Test')
      .field('price', 'abc')
      .field('description', 'desc')
      .attach('image', jpegBuffer(), { filename: 'p.jpg', contentType: 'image/jpeg' })
      .expect(400);

    expect(res.body.error.code).toBe('INVALID_MULTIPART_FIELD');
  });
});

describe('Product image upload — authorization', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  it('non-admin is forbidden (403)', async () => {
    mockAuthUser._id = USER_ID;
    mockAuthUser.role = 'user';

    try {
      const res = await request(app)
        .post('/api/products')
        .field('name', 'Phone X')
        .field('brand', 'Test')
        .field('price', '100')
        .field('description', 'desc')
        .attach('image', jpegBuffer(), { filename: 'p.jpg', contentType: 'image/jpeg' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    } finally {
      mockAuthUser._id = ADMIN_ID;
      mockAuthUser.role = 'admin';
    }
  });
});

describe('Product image upload — unaffected public routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  it('semantic-search route remains reachable', async () => {
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

  it('GET /api/products still works', async () => {
    const Product = require('../models/Product');
    Product.aggregate
      .mockResolvedValueOnce([{ _id: 'p1', name: 'Product' }])
      .mockResolvedValueOnce([{ total: 1 }]);

    const res = await request(app).get('/api/products').expect(200);
    expect(res.body.data.products).toHaveLength(1);
  });
});