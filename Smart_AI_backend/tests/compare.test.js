const jwt = require('jsonwebtoken');
const request = require('supertest');

const TEST_SECRET = 'test-compare-secret';
process.env.JWT_SECRET = TEST_SECRET;

const USER_ID = '507f191e810c19729de860ea';
const OTHER_USER_ID = '507f191e810c19729de860eb';
const USER_TOKEN = jwt.sign({ id: USER_ID, email: 'user@test.com' }, TEST_SECRET);
const OTHER_TOKEN = jwt.sign({ id: OTHER_USER_ID, email: 'other@test.com' }, TEST_SECRET);

const VALID_PRODUCT_1 = '507f191e810c19729de860e1';
const VALID_PRODUCT_2 = '507f191e810c19729de860e2';
const VALID_PRODUCT_3 = '507f191e810c19729de860e3';

const mockUser = {
  _id: USER_ID,
  email: 'user@test.com',
  role: 'user',
  name: 'Test User',
};

jest.mock('../models/User', () => {
  const thenableChainable = (result) => ({
    select: jest.fn().mockResolvedValue(result),
    then(resolve) { return Promise.resolve(result).then(resolve); },
  });
  return {
    findById: jest.fn((id) => {
      if (id === USER_ID) return thenableChainable(mockUser);
      if (id === OTHER_USER_ID) return thenableChainable({ ...mockUser, _id: OTHER_USER_ID });
      return thenableChainable(null);
    }),
  };
});

const mockProduct1 = { _id: VALID_PRODUCT_1, name: 'Product 1', image: 'img1.jpg', price: 100 };
const mockProduct2 = { _id: VALID_PRODUCT_2, name: 'Product 2', image: 'img2.jpg', price: 200 };
const mockProduct3 = { _id: VALID_PRODUCT_3, name: 'Product 3', image: 'img3.jpg', price: 300 };

const mockCompareEntry = {
  _id: '507f191e810c19729de860f1',
  user: USER_ID,
  products: [VALID_PRODUCT_1, VALID_PRODUCT_2],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  save: jest.fn().mockResolvedValue(true),
};

const mockPopulatedEntry = {
  _id: '507f191e810c19729de860f1',
  user: USER_ID,
  products: [mockProduct1, mockProduct2],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn().mockResolvedValue(true),
  abortTransaction: jest.fn().mockResolvedValue(true),
  endSession: jest.fn().mockResolvedValue(true),
  withTransaction: jest.fn(async (fn) => fn(mockSession)),
};

jest.mock('mongoose', () => ({
  startSession: jest.fn().mockResolvedValue(mockSession),
  Schema: jest.requireActual('mongoose').Schema,
  model: jest.requireActual('mongoose').model,
  Types: jest.requireActual('mongoose').Types,
}));

jest.mock('../models/CompareHistory', () => {
  const MockCompareHistory = jest.fn().mockImplementation(function (data) {
    Object.assign(this, data);
    this._id = '507f191e810c19729de860f1';
    this.save = jest.fn(function () { return Promise.resolve(this); });
    return this;
  });
  MockCompareHistory.find = jest.fn();
  MockCompareHistory.findById = jest.fn();
  MockCompareHistory.findOne = jest.fn();
  MockCompareHistory.findByIdAndDelete = jest.fn();
  MockCompareHistory.countDocuments = jest.fn();
  MockCompareHistory.create = jest.fn();
  return MockCompareHistory;
});

jest.mock('../models/Product', () => ({
  find: jest.fn(),
}));

const mongoose = require('mongoose');
const CompareHistory = require('../models/CompareHistory');
const Product = require('../models/Product');
const compareRoutes = require('../routes/compareRoutes');
const errorHandler = require('../middlewares/errorHandler');
const express = require('express');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/compare', compareRoutes);
  app.use(errorHandler);
  return app;
}

const chainableFind = (result) => ({
  sort: jest.fn(function () { return this; }),
  limit: jest.fn(function () { return this; }),
  populate: jest.fn(function () { return this; }),
  select: jest.fn(function () { return this; }),
  then: jest.fn(function (resolve) { resolve(result); }),
});

const chainableById = (result) => ({
  populate: jest.fn(function () { return this; }),
  then: jest.fn(function (resolve) { resolve(result); }),
});

const withSession = (result) => ({
  sort: jest.fn(function () { return this; }),
  session: jest.fn().mockResolvedValue(result),
  then: jest.fn(function (resolve) { resolve(result); }),
});

describe('Compare Controller — centralized error handling', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
  });

  /* ==================================
   * GET /api/compare/products (public)
   * ================================== */
  describe('GET /api/compare/products', () => {
    it('should return products for valid ids', async () => {
      Product.find.mockReturnValue(chainableFind([mockProduct1, mockProduct2]));

      const res = await request(app)
        .get(`/api/compare/products?ids=${VALID_PRODUCT_1},${VALID_PRODUCT_2}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });

    it('should return 400 when ids param is missing', async () => {
      const res = await request(app).get('/api/compare/products');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PRODUCTS');
    });

    it('should return 400 when fewer than 2 ids', async () => {
      const res = await request(app)
        .get(`/api/compare/products?ids=${VALID_PRODUCT_1}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MIN_PRODUCTS_REQUIRED');
    });

    it('should return 400 when more than 4 ids', async () => {
      const ids = 'a,b,c,d,e';
      const res = await request(app)
        .get(`/api/compare/products?ids=${ids}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MAX_PRODUCTS_EXCEEDED');
    });

    it('should return 400 when ids contain invalid ObjectId', async () => {
      const res = await request(app)
        .get(`/api/compare/products?ids=${VALID_PRODUCT_1},invalid-id`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PRODUCTS');
    });

    it('should return 404 when no products found', async () => {
      Product.find.mockReturnValue(chainableFind([]));

      const res = await request(app)
        .get(`/api/compare/products?ids=${VALID_PRODUCT_1},${VALID_PRODUCT_2}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PRODUCTS');
    });
  });

  /* ==================================
   * POST /api/compare/history (auth)
   * ================================== */
  describe('POST /api/compare/history', () => {
    it('should save a comparison and return 201', async () => {
      CompareHistory.findOne.mockReturnValue(withSession(null));
      CompareHistory.countDocuments.mockReturnValue(withSession(0));
      CompareHistory.findByIdAndDelete.mockReturnValue(withSession(true));
      CompareHistory.create.mockResolvedValue([mockCompareEntry]);
      CompareHistory.findById.mockReturnValue(chainableById(mockPopulatedEntry));
      Product.find.mockReturnValue(chainableFind([
        { _id: VALID_PRODUCT_1 },
        { _id: VALID_PRODUCT_2 },
      ]));

      const res = await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: [VALID_PRODUCT_1, VALID_PRODUCT_2] });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/compare/history')
        .send({ products: [VALID_PRODUCT_1, VALID_PRODUCT_2] });

      expect(res.status).toBe(401);
    });

    it('should return 400 when products is not an array', async () => {
      const res = await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: 'not-an-array' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PRODUCTS');
    });

    it('should return 400 when fewer than 2 products', async () => {
      const res = await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: [VALID_PRODUCT_1] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MIN_PRODUCTS_REQUIRED');
    });

    it('should return 400 when more than 4 products', async () => {
      const res = await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: ['a', 'b', 'c', 'd', 'e'] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MAX_PRODUCTS_EXCEEDED');
    });

    it('should return 400 when products contain invalid ObjectIds', async () => {
      const res = await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: [VALID_PRODUCT_1, 'invalid-id'] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PRODUCTS');
    });

    it('should return 400 when some products do not exist', async () => {
      Product.find.mockReturnValue(chainableFind([{ _id: VALID_PRODUCT_1 }]));

      const res = await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: [VALID_PRODUCT_1, VALID_PRODUCT_2] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PRODUCTS');
    });

    it('should update existing duplicate comparison and return 200', async () => {
      const existing = {
        _id: '507f191e810c19729de860f1',
        user: USER_ID,
        products: [VALID_PRODUCT_1, VALID_PRODUCT_2],
        updatedAt: new Date('2026-01-01'),
        save: jest.fn().mockResolvedValue(true),
      };
      CompareHistory.findOne.mockReturnValue(withSession(existing));
      CompareHistory.findById.mockReturnValue(chainableById(mockPopulatedEntry));
      Product.find.mockReturnValue(chainableFind([
        { _id: VALID_PRODUCT_1 },
        { _id: VALID_PRODUCT_2 },
      ]));

      const res = await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: [VALID_PRODUCT_1, VALID_PRODUCT_2] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đã cập nhật lịch sử so sánh');
    });

    it('uses withTransaction for compare-history writes (race-safe)', async () => {
      CompareHistory.findOne.mockReturnValue(withSession(null));
      CompareHistory.countDocuments.mockReturnValue(withSession(2));
      CompareHistory.findByIdAndDelete.mockReturnValue(withSession(true));
      CompareHistory.create.mockResolvedValue([mockCompareEntry]);
      CompareHistory.findById.mockReturnValue(chainableById(mockPopulatedEntry));
      Product.find.mockReturnValue(chainableFind([
        { _id: VALID_PRODUCT_1 },
        { _id: VALID_PRODUCT_2 },
      ]));

      await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: [VALID_PRODUCT_1, VALID_PRODUCT_2] });

      expect(mongoose.startSession).toHaveBeenCalled();
      expect(mockSession.withTransaction).toHaveBeenCalled();
      expect(CompareHistory.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ user: USER_ID, productsKey: expect.any(String) })
      );
      expect(CompareHistory.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ user: USER_ID })
      );
      expect(CompareHistory.create).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ user: USER_ID })]),
        expect.objectContaining({ session: expect.any(Object) })
      );
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('creates a new comparison when no duplicate exists (count < 20)', async () => {
      CompareHistory.findOne.mockReturnValue(withSession(null));
      CompareHistory.countDocuments.mockReturnValue(withSession(5));
      CompareHistory.findByIdAndDelete.mockReturnValue(withSession(true));
      CompareHistory.create.mockResolvedValue([mockCompareEntry]);
      CompareHistory.findById.mockReturnValue(chainableById(mockPopulatedEntry));
      Product.find.mockReturnValue(chainableFind([
        { _id: VALID_PRODUCT_1 },
        { _id: VALID_PRODUCT_2 },
      ]));

      const res = await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: [VALID_PRODUCT_1, VALID_PRODUCT_2] });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(CompareHistory.create).toHaveBeenCalled();
    });

    it('evicts the oldest entry when history count reaches 20', async () => {
      const oldestEntry = { _id: '507f191e810c19729de860ff' };
      CompareHistory.findOne
        .mockReturnValueOnce(withSession(null))
        .mockReturnValueOnce(withSession(oldestEntry));
      CompareHistory.countDocuments.mockReturnValue(withSession(20));
      CompareHistory.findByIdAndDelete.mockReturnValue(withSession(true));
      CompareHistory.create.mockResolvedValue([mockCompareEntry]);
      CompareHistory.findById.mockReturnValue(chainableById(mockPopulatedEntry));
      Product.find.mockReturnValue(chainableFind([
        { _id: VALID_PRODUCT_1 },
        { _id: VALID_PRODUCT_2 },
      ]));

      await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: [VALID_PRODUCT_1, VALID_PRODUCT_2] });

      expect(CompareHistory.findByIdAndDelete).toHaveBeenCalledWith(oldestEntry._id);
      expect(CompareHistory.create).toHaveBeenCalled();
    });

    it('does not evict when history count is below 20', async () => {
      CompareHistory.findOne.mockReturnValue(withSession(null));
      CompareHistory.countDocuments.mockReturnValue(withSession(10));
      CompareHistory.findByIdAndDelete.mockReturnValue(withSession(true));
      CompareHistory.create.mockResolvedValue([mockCompareEntry]);
      CompareHistory.findById.mockReturnValue(chainableById(mockPopulatedEntry));
      Product.find.mockReturnValue(chainableFind([
        { _id: VALID_PRODUCT_1 },
        { _id: VALID_PRODUCT_2 },
      ]));

      await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: [VALID_PRODUCT_1, VALID_PRODUCT_2] });

      expect(CompareHistory.findByIdAndDelete).not.toHaveBeenCalled();
      expect(CompareHistory.create).toHaveBeenCalled();
    });

    it('aborts transaction and rethrows when create fails', async () => {
      CompareHistory.findOne.mockReturnValue(withSession(null));
      CompareHistory.countDocuments.mockReturnValue(withSession(5));

      CompareHistory.create.mockRejectedValue(new Error('DB write failed'));

      Product.find.mockReturnValue(chainableFind([
        { _id: VALID_PRODUCT_1 },
        { _id: VALID_PRODUCT_2 },
      ]));

      const res = await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: [VALID_PRODUCT_1, VALID_PRODUCT_2] });

      expect(res.status).toBe(500);
      expect(mockSession.withTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('uses productsKey for duplicate lookup (index-backed)', async () => {
      const existing = {
        _id: '507f191e810c19729de860f1',
        user: USER_ID,
        products: [VALID_PRODUCT_1, VALID_PRODUCT_2],
        updatedAt: new Date('2026-01-01'),
        save: jest.fn().mockResolvedValue(true),
      };
      CompareHistory.findOne.mockReturnValue(withSession(existing));
      CompareHistory.findById.mockReturnValue(chainableById(mockPopulatedEntry));
      Product.find.mockReturnValue(chainableFind([
        { _id: VALID_PRODUCT_1 },
        { _id: VALID_PRODUCT_2 },
      ]));

      await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: [VALID_PRODUCT_1, VALID_PRODUCT_2] });

      expect(CompareHistory.findOne).toHaveBeenCalledWith({
        user: USER_ID,
        productsKey: [VALID_PRODUCT_1, VALID_PRODUCT_2].sort().join('|'),
      });
    });

    it('retries on transient error and finds duplicate on re-read', async () => {
      const existing = {
        _id: '507f191e810c19729de860f1',
        user: USER_ID,
        products: [VALID_PRODUCT_1, VALID_PRODUCT_2],
        updatedAt: new Date('2026-01-01'),
        save: jest.fn().mockResolvedValue(true),
      };

      let callCount = 0;
      mockSession.withTransaction.mockImplementationOnce(async (fn) => {
        const result = await fn(mockSession);
        return result;
      });

      CompareHistory.findOne.mockReturnValue(withSession(existing));
      CompareHistory.findById.mockReturnValue(chainableById(mockPopulatedEntry));
      Product.find.mockReturnValue(chainableFind([
        { _id: VALID_PRODUCT_1 },
        { _id: VALID_PRODUCT_2 },
      ]));

      const res = await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: [VALID_PRODUCT_1, VALID_PRODUCT_2] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(existing.save).toHaveBeenCalled();
    });

    it('returns 400 when products is not an array (before transaction)', async () => {
      const res = await request(app)
        .post('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ products: 'not-an-array' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_PRODUCTS');
      expect(mockSession.withTransaction).not.toHaveBeenCalled();
    });
  });

  /* ==================================
   * GET /api/compare/history (auth)
   * ================================== */
  describe('GET /api/compare/history', () => {
    it('should return user comparison history', async () => {
      CompareHistory.find.mockReturnValue(chainableFind([mockPopulatedEntry]));

      const res = await request(app)
        .get('/api/compare/history')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/compare/history');

      expect(res.status).toBe(401);
    });
  });

  /* =============================================
   * DELETE /api/compare/history/:id (auth)
   * ============================================= */
  describe('DELETE /api/compare/history/:id', () => {
    it('should delete a comparison owned by the user', async () => {
      CompareHistory.findById.mockResolvedValue(mockCompareEntry);
      CompareHistory.findByIdAndDelete.mockResolvedValue(true);

      const res = await request(app)
        .delete(`/api/compare/history/${mockCompareEntry._id}`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .delete(`/api/compare/history/${mockCompareEntry._id}`);

      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid id format', async () => {
      const res = await request(app)
        .delete('/api/compare/history/invalid-id')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ID');
    });

    it('should return 404 when comparison not found', async () => {
      CompareHistory.findById.mockResolvedValue(null);

      const res = await request(app)
        .delete(`/api/compare/history/${VALID_PRODUCT_1}`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('HISTORY_NOT_FOUND');
    });

    it('should return 403 when comparison belongs to another user', async () => {
      CompareHistory.findById.mockResolvedValue(mockCompareEntry);

      const res = await request(app)
        .delete(`/api/compare/history/${mockCompareEntry._id}`)
        .set('Authorization', `Bearer ${OTHER_TOKEN}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_OWNER');
    });
  });
});
