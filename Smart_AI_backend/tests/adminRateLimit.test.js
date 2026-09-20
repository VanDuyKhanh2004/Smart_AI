/* ------------------------------------------------------------------ */
/*  Admin endpoint rate limiter tests                                   */
/*                                                                      */
/*  Verifies that all admin-only endpoints are rate-limited per         */
/*  authenticated admin user, returning HTTP 429 when the limit is      */
/*  exceeded, and that rate-limited requests never reach controllers.   */
/*                                                                      */
/*  Uses RATE_LIMIT_ADMIN_MAX=5 to keep tests fast.                    */
/* ------------------------------------------------------------------ */

// Set low limit BEFORE any module requires rateLimiters
process.env.RATE_LIMIT_ADMIN_MAX = '5';

const express = require('express');
const request = require('supertest');

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

// Mock auth middleware — attaches a user from x-test-user-id header
jest.mock('../middlewares/authMiddleware', () => ({
  protect: (req, res, next) => {
    const userId = req.headers['x-test-user-id'];
    if (!userId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    }
    req.user = { _id: userId, role: 'admin' };
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));

jest.mock('../middlewares/adminMiddleware', () => ({
  adminMiddleware: (req, res, next) => next(),
}));

// Mock upload middleware (no-op)
jest.mock('../middlewares/uploadMiddleware', () => ({
  uploadProductImage: (req, res, next) => next(),
}));

jest.mock('../middlewares/errorResponseFormat', () => () => (req, res, next) => next());

const mockCreateProduct = jest.fn((req, res) => {
  res.status(201).json({ success: true, data: { _id: 'prod-001', name: 'Test Product' } });
});

const mockGetAllProducts = jest.fn((req, res) => {
  res.status(200).json({ success: true, data: [] });
});

const mockUpdateProduct = jest.fn((req, res) => {
  res.status(200).json({ success: true, data: { _id: req.params.id } });
});

const mockDeleteProduct = jest.fn((req, res) => {
  res.status(200).json({ success: true, message: 'Deleted' });
});

jest.mock('../controllers/productController', () => ({
  createProduct: (...args) => mockCreateProduct(...args),
  getAllProducts: (...args) => mockGetAllProducts(...args),
  getProductMeta: (req, res) => res.status(200).json({ success: true, data: {} }),
  searchSemantic: (req, res) => res.status(200).json({ success: true, data: [] }),
  getProductById: (req, res) => res.status(200).json({ success: true, data: {} }),
  getRecommendations: (req, res) => res.status(200).json({ success: true, data: [] }),
  updateProduct: (...args) => mockUpdateProduct(...args),
  deleteProduct: (...args) => mockDeleteProduct(...args),
}));

const { resetRateLimiters } = require('../middlewares/rateLimiters');
const productRoutes = require('../routes/productRoutes');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/products', productRoutes);
  return app;
};

describe('Admin endpoint rate limiter', () => {
  let app;

  beforeEach(() => {
    resetRateLimiters();
    mockCreateProduct.mockClear();
    mockGetAllProducts.mockClear();
    mockUpdateProduct.mockClear();
    mockDeleteProduct.mockClear();
    app = buildApp();
  });

  it('allows requests within the configured limit (5 per 15 min)', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/products')
        .set('x-test-user-id', 'admin-ok')
        .send({ name: 'Product', price: 10000, category: 'test' });
      expect(res.status).toBe(201);
    }
    expect(mockCreateProduct).toHaveBeenCalledTimes(5);
  });

  it('returns HTTP 429 when the limit is exceeded', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/products')
        .set('x-test-user-id', 'admin-limit')
        .send({ name: 'Product', price: 10000, category: 'test' });
    }
    const blocked = await request(app)
      .post('/api/products')
      .set('x-test-user-id', 'admin-limit')
      .send({ name: 'Product', price: 10000, category: 'test' });

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.error.code).toBe('ADMIN_RATE_LIMITED');
  });

  it('rate-limited requests do not reach the controller', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/products')
        .set('x-test-user-id', 'admin-no-reach')
        .send({ name: 'Product', price: 10000, category: 'test' });
    }
    const beforeCount = mockCreateProduct.mock.calls.length;
    await request(app)
      .post('/api/products')
      .set('x-test-user-id', 'admin-no-reach')
      .send({ name: 'Product', price: 10000, category: 'test' });
    expect(mockCreateProduct).toHaveBeenCalledTimes(beforeCount);
  });

  it('returns Retry-After header on 429', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/products')
        .set('x-test-user-id', 'admin-retry')
        .send({ name: 'Product', price: 10000, category: 'test' });
    }
    const blocked = await request(app)
      .post('/api/products')
      .set('x-test-user-id', 'admin-retry')
      .send({ name: 'Product', price: 10000, category: 'test' });

    expect(blocked.headers['retry-after']).toBeDefined();
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(900);
  });

  it('returns standard rate-limit headers on successful requests', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('x-test-user-id', 'admin-headers')
      .send({ name: 'Product', price: 10000, category: 'test' });

    expect(res.status).toBe(201);
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
    expect(res.headers['ratelimit-reset']).toBeDefined();
  });

  it('different admins have independent rate limits', async () => {
    // Exhaust admin A's limit
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/products')
        .set('x-test-user-id', 'admin-a')
        .send({ name: 'Product', price: 10000, category: 'test' });
    }
    const blockedA = await request(app)
      .post('/api/products')
      .set('x-test-user-id', 'admin-a')
      .send({ name: 'Product', price: 10000, category: 'test' });
    expect(blockedA.status).toBe(429);

    // Admin B should still be able to create products
    const okB = await request(app)
      .post('/api/products')
      .set('x-test-user-id', 'admin-b')
      .send({ name: 'Product', price: 10000, category: 'test' });
    expect(okB.status).toBe(201);
  });

  it('does not rate-limit public product read endpoints', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .get('/api/products')
        .set('x-test-user-id', 'admin-get');
      expect(res.status).toBe(200);
    }
  });

  it('DELETE admin endpoint is also rate-limited', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .delete('/api/products/prod-001')
        .set('x-test-user-id', 'admin-del');
    }
    const blocked = await request(app)
      .delete('/api/products/prod-001')
      .set('x-test-user-id', 'admin-del');

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('ADMIN_RATE_LIMITED');
  });
});
