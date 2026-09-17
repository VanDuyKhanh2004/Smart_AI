/* ------------------------------------------------------------------ */
/*  Order creation rate limiter tests                                    */
/*                                                                      */
/*  Verifies that POST /api/orders is rate-limited per authenticated    */
/*  user, returning HTTP 429 when the limit is exceeded, and that       */
/*  rate-limited requests never reach the createOrder controller.       */
/* ------------------------------------------------------------------ */

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
    req.user = { _id: userId, role: 'user' };
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));

jest.mock('../middlewares/adminMiddleware', () => ({
  adminMiddleware: (req, res, next) => next(),
}));

const mockCreateOrder = jest.fn((req, res) => {
  res.status(201).json({ success: true, data: { orderNumber: 'ORD-TEST-001' } });
});

jest.mock('../controllers/orderController', () => ({
  createOrder: mockCreateOrder,
  getUserOrders: (req, res) => res.json({ success: true, data: [] }),
  getOrderById: (req, res) => res.json({ success: true, data: {} }),
  getAllOrders: (req, res) => res.json({ success: true, data: [] }),
  getOrderStats: (req, res) => res.json({ success: true, data: {} }),
  updateOrderStatus: (req, res) => res.json({ success: true }),
  cancelOrder: (req, res) => res.json({ success: true }),
}));

const { resetRateLimiters } = require('../middlewares/rateLimiters');
const orderRoutes = require('../routes/orderRoutes');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', orderRoutes);
  return app;
};

describe('Order creation rate limiter', () => {
  let app;

  beforeEach(() => {
    resetRateLimiters();
    mockCreateOrder.mockClear();
    app = buildApp();
  });

  it('allows requests within the configured limit (5 per 15 min)', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/orders')
        .set('x-test-user-id', 'user-ok')
        .send({ shippingAddress: { fullName: 'Test', phone: '0901234567', address: '123 St', ward: 'Ward', district: 'Dist', city: 'City' } });
      expect(res.status).toBe(201);
    }
    expect(mockCreateOrder).toHaveBeenCalledTimes(5);
  });

  it('returns HTTP 429 when the limit is exceeded', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/orders')
        .set('x-test-user-id', 'user-limit')
        .send({ shippingAddress: { fullName: 'Test', phone: '0901234567', address: '123 St', ward: 'Ward', district: 'Dist', city: 'City' } });
    }
    // 6th request should be rate limited
    const blocked = await request(app)
      .post('/api/orders')
      .set('x-test-user-id', 'user-limit')
      .send({ shippingAddress: { fullName: 'Test', phone: '0901234567', address: '123 St', ward: 'Ward', district: 'Dist', city: 'City' } });

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.error.code).toBe('ORDER_CREATION_RATE_LIMITED');
  });

  it('rate-limited requests do not reach createOrder', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/orders')
        .set('x-test-user-id', 'user-no-reach')
        .send({ shippingAddress: { fullName: 'Test', phone: '0901234567', address: '123 St', ward: 'Ward', district: 'Dist', city: 'City' } });
    }
    const beforeCount = mockCreateOrder.mock.calls.length;
    await request(app)
      .post('/api/orders')
      .set('x-test-user-id', 'user-no-reach')
      .send({ shippingAddress: { fullName: 'Test', phone: '0901234567', address: '123 St', ward: 'Ward', district: 'Dist', city: 'City' } });
    // createOrder should not have been called for the 6th request
    expect(mockCreateOrder).toHaveBeenCalledTimes(beforeCount);
  });

  it('returns Retry-After header on 429', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/orders')
        .set('x-test-user-id', 'user-retry-after')
        .send({ shippingAddress: { fullName: 'Test', phone: '0901234567', address: '123 St', ward: 'Ward', district: 'Dist', city: 'City' } });
    }
    const blocked = await request(app)
      .post('/api/orders')
      .set('x-test-user-id', 'user-retry-after')
      .send({ shippingAddress: { fullName: 'Test', phone: '0901234567', address: '123 St', ward: 'Ward', district: 'Dist', city: 'City' } });

    expect(blocked.headers['retry-after']).toBeDefined();
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(900); // 15 min = 900s
  });

  it('returns standard rate-limit headers on successful requests', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('x-test-user-id', 'user-headers')
      .send({ shippingAddress: { fullName: 'Test', phone: '0901234567', address: '123 St', ward: 'Ward', district: 'Dist', city: 'City' } });

    expect(res.status).toBe(201);
    // express-rate-limit with standardHeaders: true sends these
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
    expect(res.headers['ratelimit-reset']).toBeDefined();
  });

  it('different users have independent rate limits', async () => {
    // Exhaust user A's limit
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/orders')
        .set('x-test-user-id', 'user-a')
        .send({ shippingAddress: { fullName: 'Test', phone: '0901234567', address: '123 St', ward: 'Ward', district: 'Dist', city: 'City' } });
    }
    // User A is now rate limited
    const blockedA = await request(app)
      .post('/api/orders')
      .set('x-test-user-id', 'user-a')
      .send({ shippingAddress: { fullName: 'Test', phone: '0901234567', address: '123 St', ward: 'Ward', district: 'Dist', city: 'City' } });
    expect(blockedA.status).toBe(429);

    // User B should still be able to create orders
    const okB = await request(app)
      .post('/api/orders')
      .set('x-test-user-id', 'user-b')
      .send({ shippingAddress: { fullName: 'Test', phone: '0901234567', address: '123 St', ward: 'Ward', district: 'Dist', city: 'City' } });
    expect(okB.status).toBe(201);
  });

  it('unauthenticated requests are rejected by auth middleware before rate limiter', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ shippingAddress: { fullName: 'Test', phone: '0901234567', address: '123 St', ward: 'Ward', district: 'Dist', city: 'City' } });

    expect(res.status).toBe(401);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it('does not rate-limit GET /api/orders or other order endpoints', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .get('/api/orders')
        .set('x-test-user-id', 'user-get');
      expect(res.status).toBe(200);
    }
  });
});
