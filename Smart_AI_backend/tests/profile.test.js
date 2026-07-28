const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.LOG_LEVEL = 'silent';

const TEST_SECRET = 'test-profile-secret';
process.env.JWT_SECRET = TEST_SECRET;

jest.mock('pino', () => {
  const mockInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => mockInstance),
  };
  return jest.fn(() => mockInstance);
});

const USER_ID = '507f191e810c19729de860ea';
const USER_TOKEN = jwt.sign({ id: USER_ID, email: 'user@test.com' }, TEST_SECRET);

const mockUser = {
  _id: USER_ID,
  email: 'user@test.com',
  role: 'user',
  name: 'Test User',
  phone: '0123456789',
  avatar: null,
  emailVerified: true,
  loginMethod: 'password',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  toJSON: function () {
    return {
      _id: this._id,
      email: this.email,
      role: this.role,
      name: this.name,
      phone: this.phone,
      avatar: this.avatar,
      emailVerified: this.emailVerified,
      loginMethod: this.loginMethod,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  },
};

const mockUserWithPassword = {
  ...mockUser,
  password: 'hashed_current_password',
  comparePassword: jest.fn(),
  save: jest.fn().mockResolvedValue(true),
};

jest.mock('../models/User', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock('fs', () => ({
  unlinkSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(false),
}));

jest.mock('../middlewares/uploadMiddleware', () => {
  return jest.fn((req, res, next) => {
    req.file = {
      fieldname: 'avatar',
      originalname: 'test.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      destination: 'uploads/avatars',
      filename: `${USER_ID}-1234567890.jpg`,
      path: 'uploads/avatars/test.jpg',
      size: 1024,
    };
    next();
  });
});

const User = require('../models/User');
const fs = require('fs');
const profileRoutes = require('../routes/profileRoutes');
const errorHandler = require('../middlewares/errorHandler');
const express = require('express');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/profile', profileRoutes);
  app.use(errorHandler);
  return app;
}

describe('Profile Controller — centralized error handling', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/profile', () => {
    it('returns 200 with user profile', async () => {
      User.findById.mockResolvedValue(mockUser);

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test User');
      expect(res.body.data).not.toHaveProperty('password');
    });

    it('returns 404 when user not found', async () => {
      User.findById
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không tìm thấy người dùng');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });
  });

  describe('PUT /api/profile', () => {
    it('returns 200 when profile is updated', async () => {
      const updatedUser = { ...mockUser, name: 'New Name', toJSON: mockUser.toJSON };
      User.findById.mockResolvedValue(mockUser);
      User.findByIdAndUpdate.mockResolvedValue(updatedUser);

      const res = await request(app)
        .put('/api/profile')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ name: 'New Name' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Cập nhật thông tin thành công');
    });

    it('returns 400 when name is too short', async () => {
      User.findById.mockResolvedValue(mockUser);

      const res = await request(app)
        .put('/api/profile')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ name: 'A' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Tên phải có ít nhất 2 ký tự');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });

    it('returns 400 when phone is invalid', async () => {
      User.findById.mockResolvedValue(mockUser);

      const res = await request(app)
        .put('/api/profile')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ phone: '123' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Số điện thoại phải có 10-11 chữ số');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });

    it('returns 404 when user not found after update', async () => {
      User.findById.mockResolvedValue(mockUser);
      User.findByIdAndUpdate.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/profile')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ name: 'Valid Name' })
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không tìm thấy người dùng');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });
  });

  describe('POST /api/profile/avatar', () => {
    it('returns 200 when avatar is uploaded', async () => {
      User.findById.mockResolvedValue({ ...mockUser, save: jest.fn().mockResolvedValue(true) });

      const res = await request(app)
        .post('/api/profile/avatar')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Cập nhật ảnh đại diện thành công');
    });

    it('does not delete uploaded file on success', async () => {
      User.findById.mockResolvedValue({ ...mockUser, save: jest.fn().mockResolvedValue(true) });

      const res = await request(app)
        .post('/api/profile/avatar')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(200);

      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('returns 404 when user not found and cleans up file', async () => {
      User.findById
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(null);
      fs.existsSync.mockReturnValue(true);

      const res = await request(app)
        .post('/api/profile/avatar')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Không tìm thấy người dùng');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
      expect(fs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('PUT /api/profile/password', () => {
    it('returns 200 when password is changed', async () => {
      const userWithPw = {
        ...mockUserWithPassword,
        comparePassword: jest.fn()
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false),
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockResolvedValue(userWithPw);
      User.findById.mockReturnValue({ ...userWithPw, select: jest.fn().mockResolvedValue(userWithPw) });

      const res = await request(app)
        .put('/api/profile/password')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({
          currentPassword: 'current_pass',
          newPassword: 'new_pass_123',
          confirmPassword: 'new_pass_123',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('returns 400 when fields are missing', async () => {
      const res = await request(app)
        .put('/api/profile/password')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ currentPassword: '', newPassword: '', confirmPassword: '' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Vui lòng điền đầy đủ thông tin');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });

    it('returns 400 when new password is too short', async () => {
      const res = await request(app)
        .put('/api/profile/password')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({
          currentPassword: 'pass',
          newPassword: '12345',
          confirmPassword: '12345',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Mật khẩu mới phải có ít nhất 6 ký tự');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });

    it('returns 400 when passwords do not match', async () => {
      const res = await request(app)
        .put('/api/profile/password')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({
          currentPassword: 'pass',
          newPassword: 'new_pass_123',
          confirmPassword: 'different_pass',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Mật khẩu xác nhận không khớp');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });

    it('returns 400 when current password is wrong', async () => {
      const userWithPw = {
        ...mockUserWithPassword,
        comparePassword: jest.fn().mockResolvedValue(false),
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockReturnValue({ ...userWithPw, select: jest.fn().mockResolvedValue(userWithPw) });

      const res = await request(app)
        .put('/api/profile/password')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({
          currentPassword: 'wrong_pass',
          newPassword: 'new_pass_123',
          confirmPassword: 'new_pass_123',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Mật khẩu hiện tại không đúng');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });

    it('returns 400 when new password is same as current', async () => {
      const userWithPw = {
        ...mockUserWithPassword,
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockReturnValue({ ...userWithPw, select: jest.fn().mockResolvedValue(userWithPw) });

      const res = await request(app)
        .put('/api/profile/password')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({
          currentPassword: 'current_pass',
          newPassword: 'current_pass',
          confirmPassword: 'current_pass',
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Mật khẩu mới phải khác mật khẩu hiện tại');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });
  });

  describe('Unexpected error reaches global errorHandler', () => {
    it('returns 500 when User.findById throws in controller', async () => {
      User.findById
        .mockResolvedValueOnce(mockUser)
        .mockRejectedValueOnce(new Error('DB error'));

      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .expect(500);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Đã xảy ra lỗi, vui lòng thử lại');
      expect(res.body).not.toHaveProperty('error');
    });

    it('returns 500 when User.findByIdAndUpdate throws', async () => {
      User.findById.mockResolvedValue(mockUser);
      User.findByIdAndUpdate.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .put('/api/profile')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ name: 'Valid Name' })
        .expect(500);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Đã xảy ra lỗi, vui lòng thử lại');
      expect(res.body).not.toHaveProperty('code');
      expect(res.body).not.toHaveProperty('error');
    });

    it('does not expose password in error response', async () => {
      const userWithPw = {
        ...mockUserWithPassword,
        comparePassword: jest.fn().mockRejectedValue(new Error('compare error')),
      };
      User.findById.mockReturnValue({ ...userWithPw, select: jest.fn().mockResolvedValue(userWithPw) });

      const res = await request(app)
        .put('/api/profile/password')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({
          currentPassword: 'pass',
          newPassword: 'new_pass_123',
          confirmPassword: 'new_pass_123',
        })
        .expect(500);

      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });
  });

  describe('Unauthenticated access', () => {
    it('returns 401 when no token', async () => {
      const res = await request(app)
        .get('/api/profile')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });
});
