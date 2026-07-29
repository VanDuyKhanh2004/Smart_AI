const jwt = require('jsonwebtoken');
const request = require('supertest');

const TEST_SECRET = 'test-store-secret';
process.env.JWT_SECRET = TEST_SECRET;

const ADMIN_ID = '507f191e810c19729de860ea';
const USER_ID = '507f191e810c19729de860eb';
const ADMIN_TOKEN = jwt.sign({ id: ADMIN_ID, email: 'admin@test.com', role: 'admin' }, TEST_SECRET);
const USER_TOKEN = jwt.sign({ id: USER_ID, email: 'user@test.com', role: 'user' }, TEST_SECRET);

const STORE_ID = '507f191e810c19729de860f1';
const MISSING_ID = '507f191e810c19729de860ff';

const mockAdmin = { _id: ADMIN_ID, email: 'admin@test.com', role: 'admin', name: 'Admin' };
const mockUser = { _id: USER_ID, email: 'user@test.com', role: 'user', name: 'User' };

jest.mock('../models/User', () => ({
  findById: jest.fn((id) => {
    if (id === ADMIN_ID) return Promise.resolve(mockAdmin);
    if (id === USER_ID) return Promise.resolve(mockUser);
    return Promise.resolve(null);
  }),
}));

const mockStore = {
  _id: STORE_ID,
  name: 'Test Store',
  address: { street: '123 St', district: 'D1', city: 'HCMC', fullAddress: '123 St, D1, HCMC' },
  location: { type: 'Point', coordinates: [106.7, 10.8] },
  phone: '0123456789',
  email: 'store@test.com',
  businessHours: {},
  images: [],
  description: 'A test store',
  isActive: true,
  save: jest.fn(function () { return Promise.resolve(this); }),
};

const chainableFind = (result) => ({
  sort: jest.fn(function () { return this; }),
  then: jest.fn(function (resolve) { resolve(result); }),
});

const storeInstanceSave = jest.fn().mockResolvedValue(mockStore);
const MockStore = jest.fn().mockImplementation(function (data) {
  Object.assign(this, data);
  this.save = storeInstanceSave;
});
MockStore.find = jest.fn();
MockStore.findOne = jest.fn();
MockStore.findById = jest.fn();
MockStore.findByIdAndDelete = jest.fn();
MockStore.aggregate = jest.fn();

jest.mock('../models/Store', () => MockStore);

const Store = require('../models/Store');
const storeRoutes = require('../routes/storeRoutes');
const errorHandler = require('../middlewares/errorHandler');
const express = require('express');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/stores', storeRoutes);
  app.use(errorHandler);
  return app;
}

describe('Store Controller — centralized error handling', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
  });

/* =========================================================
 * Shared validation / cast error helpers
 * ========================================================= */
const makeValidationError = (fieldMessages) => ({
  name: 'ValidationError',
  message: 'Store validation failed',
  errors: Object.fromEntries(
    Object.entries(fieldMessages).map(([field, msg]) => [field, { message: msg }])
  ),
});

const castError = { name: 'CastError', message: 'Cast to ObjectId failed' };

/* ================================
 * GET /api/stores (public)
 * ================================ */
  describe('GET /api/stores', () => {
    it('should return all active stores', async () => {
      Store.find.mockReturnValue(chainableFind([mockStore]));

      const res = await request(app).get('/api/stores');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should return stores with geo search when lat/lng provided', async () => {
      Store.aggregate.mockResolvedValue([{ ...mockStore, distance: 1000, distanceKm: 1 }]);

      const res = await request(app)
        .get('/api/stores?lat=10.8&lng=106.7');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when coordinates are invalid', async () => {
      const res = await request(app)
        .get('/api/stores?lat=invalid&lng=106.7');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  /* ====================================
   * GET /api/stores/:id (public)
   * ==================================== */
  describe('GET /api/stores/:id', () => {
    it('should return a store by id', async () => {
      Store.findOne.mockResolvedValue(mockStore);

      const res = await request(app)
        .get(`/api/stores/${STORE_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('should return 404 when store not found', async () => {
      Store.findOne.mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/stores/${MISSING_ID}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 with invalid ObjectId (CastError)', async () => {
      Store.findOne.mockRejectedValue(castError);

      const res = await request(app).get('/api/stores/invalid-id');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('ID không hợp lệ');
    });
  });

  /* ====================================
   * POST /api/stores (admin)
   * ==================================== */
  describe('POST /api/stores', () => {
    const validBody = {
      name: 'New Store',
      address: { street: '456 St', district: 'D2', city: 'HCMC', fullAddress: '456 St, D2, HCMC' },
      location: { coordinates: [106.8, 10.9] },
      phone: '0987654321',
    };

    it('should create a store and return 201', async () => {
      storeInstanceSave.mockResolvedValue(mockStore);

      const res = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when required fields missing', async () => {
      const res = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ name: 'Only Name' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 when address fields missing', async () => {
      const res = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ ...validBody, address: { street: '123' } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 when coordinates are missing', async () => {
      const res = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ ...validBody, location: {} });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 403 for non-admin users', async () => {
      const res = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send(validBody);

      expect(res.status).toBe(403);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/stores')
        .send(validBody);

      expect(res.status).toBe(401);
    });

    it('should return 400 with Mongoose ValidationError and errors array', async () => {
      storeInstanceSave.mockRejectedValueOnce(
        makeValidationError({
          name: 'Tên cửa hàng là bắt buộc',
          phone: 'Số điện thoại phải có 10-11 chữ số',
        })
      );

      const res = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send(validBody);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Dữ liệu không hợp lệ');
      expect(res.body.errors).toEqual([
        'Tên cửa hàng là bắt buộc',
        'Số điện thoại phải có 10-11 chữ số',
      ]);
    });
  });

  /* ====================================
   * PUT /api/stores/:id (admin)
   * ==================================== */
  describe('PUT /api/stores/:id', () => {
    it('should update a store and return 200', async () => {
      Store.findById.mockResolvedValue(mockStore);

      const res = await request(app)
        .put(`/api/stores/${STORE_ID}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 when store not found', async () => {
      Store.findById.mockResolvedValue(null);

      const res = await request(app)
        .put(`/api/stores/${MISSING_ID}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 403 for non-admin users', async () => {
      const res = await request(app)
        .put(`/api/stores/${STORE_ID}`)
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(403);
    });

    it('should return 400 with Mongoose ValidationError and errors array on save', async () => {
      const rejectSave = jest.fn().mockRejectedValueOnce(
        makeValidationError({
          name: 'Tên cửa hàng là bắt buộc',
        })
      );
      Store.findById.mockResolvedValue({ ...mockStore, save: rejectSave });

      const res = await request(app)
        .put(`/api/stores/${STORE_ID}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Dữ liệu không hợp lệ');
      expect(res.body.errors).toEqual(['Tên cửa hàng là bắt buộc']);
    });

    it('should return 400 with invalid ObjectId (CastError) on findById', async () => {
      Store.findById.mockRejectedValue(castError);

      const res = await request(app)
        .put('/api/stores/invalid-id')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('ID không hợp lệ');
    });
  });

  /* ====================================
   * DELETE /api/stores/:id (admin)
   * ==================================== */
  describe('DELETE /api/stores/:id', () => {
    it('should delete a store and return 200', async () => {
      Store.findByIdAndDelete.mockResolvedValue(mockStore);

      const res = await request(app)
        .delete(`/api/stores/${STORE_ID}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 when store not found', async () => {
      Store.findByIdAndDelete.mockResolvedValue(null);

      const res = await request(app)
        .delete(`/api/stores/${MISSING_ID}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 403 for non-admin users', async () => {
      const res = await request(app)
        .delete(`/api/stores/${STORE_ID}`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(403);
    });

    it('should return 400 with invalid ObjectId (CastError)', async () => {
      Store.findByIdAndDelete.mockRejectedValue(castError);

      const res = await request(app)
        .delete('/api/stores/invalid-id')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('ID không hợp lệ');
    });
  });

  /* =============================================
   * PATCH /api/stores/:id/toggle (admin)
   * ============================================= */
  describe('PATCH /api/stores/:id/toggle', () => {
    it('should toggle store active status', async () => {
      Store.findById.mockResolvedValue(mockStore);

      const res = await request(app)
        .patch(`/api/stores/${STORE_ID}/toggle`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 when store not found', async () => {
      Store.findById.mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/stores/${MISSING_ID}/toggle`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 403 for non-admin users', async () => {
      const res = await request(app)
        .patch(`/api/stores/${STORE_ID}/toggle`)
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(403);
    });

    it('should return 400 with invalid ObjectId (CastError) on findById', async () => {
      Store.findById.mockRejectedValue(castError);

      const res = await request(app)
        .patch('/api/stores/invalid-id/toggle')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('ID không hợp lệ');
    });
  });

  /* =============================================
   * GET /api/stores/admin/all (admin)
   * ============================================= */
  describe('GET /api/stores/admin/all', () => {
    it('should return all stores for admin', async () => {
      Store.find.mockReturnValue(chainableFind([mockStore]));

      const res = await request(app)
        .get('/api/stores/admin/all')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should return 403 for non-admin users', async () => {
      const res = await request(app)
        .get('/api/stores/admin/all')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(403);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/stores/admin/all');

      expect(res.status).toBe(401);
    });
  });
});
