const jwt = require('jsonwebtoken');
const request = require('supertest');

const TEST_SECRET = 'test-address-secret';
process.env.JWT_SECRET = TEST_SECRET;

const USER_ID = '507f191e810c19729de860ea';
const OTHER_USER_ID = '507f191e810c19729de860eb';
const USER_TOKEN = jwt.sign({ id: USER_ID, email: 'user@test.com' }, TEST_SECRET);

const mockUser = {
  _id: USER_ID,
  email: 'user@test.com',
  role: 'user',
  name: 'Test User',
};

jest.mock('../models/User', () => ({
  findById: jest.fn((id) => {
    if (id === USER_ID) return Promise.resolve(mockUser);
    if (id === OTHER_USER_ID) return Promise.resolve({ ...mockUser, _id: OTHER_USER_ID });
    return Promise.resolve(null);
  }),
}));

const mockAddress = {
  _id: '507f191e810c19729de860f1',
  user: USER_ID,
  label: 'Home',
  fullName: 'Test User',
  phone: '0123456789',
  address: '123 Street',
  ward: 'Ward 1',
  district: 'District 1',
  city: 'City',
  isDefault: true,
  save: jest.fn().mockResolvedValue(true),
};

const otherAddress = {
  _id: '507f191e810c19729de860f2',
  user: OTHER_USER_ID,
  label: 'Other',
  fullName: 'Other User',
  phone: '0987654321',
  address: '456 Other St',
  ward: 'Ward 2',
  district: 'District 2',
  city: 'Other City',
  isDefault: false,
};

const mockAddresses = [mockAddress];

jest.mock('../models/Address', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndDelete: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn(),
  updateMany: jest.fn(),
}));

const Address = require('../models/Address');
const addressRoutes = require('../routes/addressRoutes');
const errorHandler = require('../middlewares/errorHandler');
const express = require('express');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/addresses', addressRoutes);
  app.use(errorHandler);
  return app;
}

describe('Address Controller — centralized error handling', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/addresses', () => {
    it('returns 200 with user addresses', async () => {
      const q = Promise.resolve(mockAddresses);
      q.sort = jest.fn().mockReturnValue(q);
      Address.find.mockReturnValue(q);

      const res = await request(app)
        .get('/api/addresses')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('returns empty array when user has no addresses', async () => {
      const q = Promise.resolve([]);
      q.sort = jest.fn().mockReturnValue(q);
      Address.find.mockReturnValue(q);

      const res = await request(app)
        .get('/api/addresses')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /api/addresses', () => {
    it('returns 201 when address is created', async () => {
      Address.countDocuments.mockResolvedValue(2);
      Address.create.mockResolvedValue(mockAddress);

      const res = await request(app)
        .post('/api/addresses')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({
          label: 'Home',
          fullName: 'Test User',
          phone: '0123456789',
          address: '123 Street',
          ward: 'Ward 1',
          district: 'District 1',
          city: 'City',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đã thêm địa chỉ mới');
    });

    it('returns 400 when address limit exceeded', async () => {
      Address.countDocuments.mockResolvedValue(5);

      const res = await request(app)
        .post('/api/addresses')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({
          fullName: 'Test',
          phone: '0123456789',
          address: '123 St',
          ward: 'W1',
          district: 'D1',
          city: 'C',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Bạn chỉ có thể lưu tối đa 5 địa chỉ');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });
  });

  describe('PUT /api/addresses/:id', () => {
    it('returns 200 when address is updated', async () => {
      Address.findById.mockResolvedValue(mockAddress);

      const res = await request(app)
        .put('/api/addresses/507f191e810c19729de860f1')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({
          fullName: 'Updated Name',
          phone: '0987654321',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đã cập nhật địa chỉ');
    });

    it('returns 404 when address not found', async () => {
      Address.findById.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/addresses/507f191e810c19729de860ff')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ fullName: 'N' })
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không tìm thấy địa chỉ');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });

    it('returns 403 when address belongs to another user', async () => {
      Address.findById.mockResolvedValue(otherAddress);

      const res = await request(app)
        .put('/api/addresses/507f191e810c19729de860f2')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ fullName: 'N' })
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Bạn không có quyền truy cập địa chỉ này');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });
  });

  describe('DELETE /api/addresses/:id', () => {
    it('returns 200 when address is deleted', async () => {
      const deletableAddress = { ...mockAddress, isDefault: false };
      Address.findById.mockResolvedValue(deletableAddress);
      Address.findByIdAndDelete.mockResolvedValue(deletableAddress);

      const res = await request(app)
        .delete('/api/addresses/507f191e810c19729de860f1')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('returns 404 when address not found', async () => {
      Address.findById.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/addresses/507f191e810c19729de860ff')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không tìm thấy địa chỉ');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });

    it('returns 403 when address belongs to another user', async () => {
      Address.findById.mockResolvedValue(otherAddress);

      const res = await request(app)
        .delete('/api/addresses/507f191e810c19729de860f2')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Bạn không có quyền truy cập địa chỉ này');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });

    it('reassigns default when deleting the default address with other addresses', async () => {
      const defaultAddr = { ...mockAddress, isDefault: true, save: jest.fn().mockResolvedValue(true) };
      Address.findById.mockResolvedValue(defaultAddr);
      Address.findByIdAndDelete.mockResolvedValue(defaultAddr);
      const remainingAddr = { ...mockAddress, _id: 'newid', isDefault: false, save: jest.fn().mockResolvedValue(true) };
      const findOneQ = Promise.resolve(remainingAddr);
      findOneQ.sort = jest.fn().mockReturnValue(findOneQ);
      Address.findOne.mockReturnValue(findOneQ);

      const res = await request(app)
        .delete('/api/addresses/507f191e810c19729de860f1')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Address.findOne).toHaveBeenCalled();
      expect(remainingAddr.save).toHaveBeenCalled();
    });
  });

  describe('PUT /api/addresses/:id/default', () => {
    it('returns 200 when default address is set', async () => {
      const targetAddress = { ...mockAddress, isDefault: false, save: jest.fn().mockResolvedValue(true) };
      Address.findById.mockResolvedValue(targetAddress);
      Address.updateMany.mockResolvedValue({});

      const res = await request(app)
        .put('/api/addresses/507f191e810c19729de860f1/default')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Đã đặt làm địa chỉ mặc định');
      expect(Address.updateMany).toHaveBeenCalledWith(
        { user: USER_ID },
        { isDefault: false }
      );
    });

    it('returns 404 when address not found', async () => {
      Address.findById.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/addresses/507f191e810c19729de860ff/default')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không tìm thấy địa chỉ');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });

    it('returns 403 when address belongs to another user', async () => {
      Address.findById.mockResolvedValue(otherAddress);

      const res = await request(app)
        .put('/api/addresses/507f191e810c19729de860f2/default')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(403);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Bạn không có quyền truy cập địa chỉ này');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });
  });

  describe('Unauthenticated access', () => {
    it('returns 401 when no token', async () => {
      const res = await request(app)
        .get('/api/addresses')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/addresses')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('Unexpected error reaches global errorHandler', () => {
    it('returns 500 when Address.find throws', async () => {
      const errQ = Promise.reject(new Error('DB error'));
      errQ.sort = jest.fn().mockReturnValue(errQ);
      Address.find.mockReturnValue(errQ);

      const res = await request(app)
        .get('/api/addresses')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(500);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Đã xảy ra lỗi, vui lòng thử lại');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });
  });
});
