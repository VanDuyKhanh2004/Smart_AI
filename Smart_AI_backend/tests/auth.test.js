const request = require('supertest');
const { hashToken } = require('../utils/tokenHash');
const enqueueVerificationEmail = require('../services/emailQueueService').enqueueVerificationEmail;

process.env.JWT_SECRET = 'test-auth-secret';
process.env.JWT_REFRESH_SECRET = 'test-auth-refresh-secret';
process.env.JWT_REFRESH_EXPIRE = '7d';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.LOGIN_MAX_ATTEMPTS = '5';

const USER_ID = '507f191e810c19729de860ea';
const ADMIN_ID = '507f191e810c19729de860eb';
const mockJwt = require('jsonwebtoken');
const USER_TOKEN = mockJwt.sign({ id: USER_ID, email: 'user@test.com' }, process.env.JWT_SECRET);
const ADMIN_TOKEN = mockJwt.sign({ id: ADMIN_ID, email: 'admin@test.com' }, process.env.JWT_SECRET);

const thenableChainable = (result) => ({
  select: jest.fn(function () { return Promise.resolve(result); }),
  then: jest.fn(function (resolve) { resolve(result); }),
});

const mockUser = {
  _id: USER_ID,
  name: 'Test User',
  email: 'user@test.com',
  role: 'user',
  password: 'hashedpassword',
  googleId: null,
  emailVerified: true,
  emailVerificationToken: null,
  emailVerificationExpires: null,
  refreshToken: 'valid-refresh-token',
  welcomeEmailSent: true,
  loginAttempts: 0,
  lockUntil: null,
  firstLoginAt: null,
  avatar: null,
  get isLocked() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
  },
  toJSON: jest.fn().mockReturnValue({
    _id: USER_ID, name: 'Test User', email: 'user@test.com', role: 'user',
  }),
  save: jest.fn().mockResolvedValue(),
  comparePassword: jest.fn(),
  incrementLoginAttempts: jest.fn(),
  resetLoginAttempts: jest.fn(),
  createUnlockToken: jest.fn().mockReturnValue('unlock-raw-token'),
};

const mockUserUnverified = {
  ...mockUser,
  emailVerified: false,
  toJSON: jest.fn().mockReturnValue({
    _id: USER_ID, name: 'Test User', email: 'user@test.com', role: 'user',
  }),
};

const mockUserGoogleOnly = {
  ...mockUser,
  password: null,
  googleId: 'google-sub-123',
};

const mockUserLocked = {
  ...mockUser,
  loginAttempts: 5,
  lockUntil: Date.now() + 60000,
  get isLocked() {
    return true;
  },
};

const mockAdmin = {
  _id: ADMIN_ID,
  name: 'Admin',
  email: 'admin@test.com',
  role: 'admin',
};

jest.mock('../models/User', () => {
  const mockModule = {
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
    findByEmailWithPassword: jest.fn(),
    findByUnlockToken: jest.fn(),
  };
  return mockModule;
});

const User = require('../models/User');

jest.mock('../utils/jwt', () => ({
  generateAccessToken: jest.fn(() => 'new-access-token'),
  generateRefreshToken: jest.fn(() => 'new-refresh-token'),
  verifyRefreshToken: jest.fn(),
  verifyAccessToken: (token) => mockJwt.verify(token, process.env.JWT_SECRET),
}));

jest.mock('../services/emailQueueService', () => ({
  enqueueWelcomeEmail: jest.fn(),
  enqueueVerificationEmail: jest.fn(),
  enqueuePasswordResetEmail: jest.fn(),
  enqueueUnlockAccountEmail: jest.fn(),
}));

const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

const authRoutes = require('../routes/authRoutes');
const errorHandler = require('../middlewares/errorHandler');
const { resetRateLimiters } = require('../middlewares/rateLimiters');
const express = require('express');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

describe('Auth Controller — centralized error handling', () => {
  let app;
  let findOneQueue;
  let findByIdQueue;

  const mockFindOne = (...results) => { findOneQueue.push(...results); };
  const mockFindById = (...results) => { findByIdQueue.push(...results); };

  beforeEach(() => {
    resetRateLimiters();
    app = buildApp();
    jest.clearAllMocks();
    findOneQueue = [];
    findByIdQueue = [];
    mockUser.emailVerified = true;
    mockUser.password = 'hashedpassword';
    mockUser.googleId = null;
    mockUser.refreshToken = 'valid-refresh-token';
    mockUser.lockUntil = null;
    mockUser.loginAttempts = 0;
    Object.defineProperty(mockUser, 'isLocked', {
      get() { return !!(this.lockUntil && this.lockUntil > Date.now()); },
    });
    User.findById.mockReset();
    User.findById.mockImplementation((id) => {
      if (findByIdQueue.length > 0) return thenableChainable(findByIdQueue.shift());
      if (id === ADMIN_ID) return thenableChainable(mockAdmin);
      return thenableChainable(mockUser);
    });
    User.findOne.mockReset();
    User.findOne.mockImplementation(() => {
      const val = findOneQueue.length > 0 ? findOneQueue.shift() : null;
      return thenableChainable(val);
    });
    User.findByIdAndUpdate.mockResolvedValue({});
    User.create.mockResolvedValue(mockUser);
    User.findByEmailWithPassword.mockResolvedValue(null);
    User.findByUnlockToken.mockResolvedValue(null);
    mockVerifyIdToken.mockReset();
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => ({ sub: 'mock', email: 'mock@test.com', email_verified: true }) });
  });

  /* ================================
   * POST /api/auth/register
   * ================================ */
  describe('POST /api/auth/register', () => {
    it('should register a new user and return 201', async () => {
      mockFindOne(null);
      User.create.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test User', email: 'new@test.com', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
    });

    it('should return 409 when email already exists', async () => {
      mockFindOne(mockUser);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test User', email: 'existing@test.com', password: 'password123' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_EXISTS');
    });

    it('should return 400 on Mongoose ValidationError', async () => {
      mockFindOne(null);
      const valErr = new Error('Validation failed');
      valErr.name = 'ValidationError';
      valErr.errors = {
        name: { path: 'name', message: 'Tên là bắt buộc' },
        email: { path: 'email', message: 'Email là bắt buộc' },
      };
      User.create.mockRejectedValue(valErr);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: '', email: '', password: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.details).toEqual([
        { field: 'name', message: 'Tên là bắt buộc' },
        { field: 'email', message: 'Email là bắt buộc' },
      ]);
    });

    it('should create an unverified account and trigger a verification email', async () => {
      const { enqueueVerificationEmail } = require('../services/emailQueueService');
      const newUser = {
        ...mockUser,
        email: 'new@test.com',
        emailVerified: false,
        toJSON: jest.fn().mockReturnValue({
          id: USER_ID,
          name: 'Test User',
          email: 'new@test.com',
          emailVerified: false,
          loginMethod: 'password',
        }),
      };
      mockFindOne(null);
      User.create.mockResolvedValue(newUser);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test User', email: 'new@test.com', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('new@test.com');
      expect(res.body.data.requiresEmailVerification).toBe(true);
      expect(res.body.data.user.emailVerified).toBe(false);
      expect(enqueueVerificationEmail).toHaveBeenCalledTimes(1);
    });

    it('verification email URL uses the configured frontend base and /verify-email route', async () => {
      const { enqueueVerificationEmail } = require('../services/emailQueueService');
      const prev = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://app.example.com';
      try {
        const newUser = {
          ...mockUser,
          email: 'verify@test.com',
          emailVerified: false,
          toJSON: jest.fn().mockReturnValue({
            id: USER_ID,
            name: 'Test User',
            email: 'verify@test.com',
            emailVerified: false,
            loginMethod: 'password',
          }),
        };
        mockFindOne(null);
        User.create.mockResolvedValue(newUser);

        const res = await request(app)
          .post('/api/auth/register')
          .send({ name: 'Test User', email: 'verify@test.com', password: 'password123' });

        expect(res.status).toBe(201);
        expect(enqueueVerificationEmail).toHaveBeenCalledTimes(1);
        const [sentUser, verifyUrl] = enqueueVerificationEmail.mock.calls[0];
        expect(sentUser.email).toBe('verify@test.com');
        expect(verifyUrl).toMatch(/^https:\/\/app\.example\.com\/verify-email\?token=[0-9a-f]{64}&email=verify%40test\.com$/);
        expect(verifyUrl).not.toContain('localhost');
      } finally {
        if (prev) process.env.FRONTEND_URL = prev; else delete process.env.FRONTEND_URL;
      }
    });

    it('verification email URL url-encodes the email query param', async () => {
      const { enqueueVerificationEmail } = require('../services/emailQueueService');
      const prev = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://prod.shop.example';
      const email = 'plus+user@test.com';
      try {
        const newUser = {
          ...mockUser,
          email,
          emailVerified: false,
          toJSON: jest.fn().mockReturnValue({
            id: USER_ID,
            name: 'Test User',
            email,
            emailVerified: false,
            loginMethod: 'password',
          }),
        };
        mockFindOne(null);
        User.create.mockResolvedValue(newUser);

        await request(app)
          .post('/api/auth/register')
          .send({ name: 'Test User', email, password: 'password123' });

        expect(enqueueVerificationEmail).toHaveBeenCalledTimes(1);
        const [, verifyUrl] = enqueueVerificationEmail.mock.calls[0];
        expect(verifyUrl).toMatch(/^https:\/\/prod\.shop\.example\/verify-email\?token=[0-9a-f]{64}&email=plus%2Buser%40test\.com$/);
        expect(verifyUrl).toContain(`email=${encodeURIComponent(email)}`);
        expect(verifyUrl).not.toContain('plus+user@test.com');
      } finally {
        if (prev) process.env.FRONTEND_URL = prev; else delete process.env.FRONTEND_URL;
      }
    });

    it('verification URL normalizes a trailing-slash FRONTEND_URL', async () => {
      const { enqueueVerificationEmail } = require('../services/emailQueueService');
      const prev = process.env.FRONTEND_URL;
      process.env.FRONTEND_URL = 'https://app.example.com/';
      try {
        const newUser = {
          ...mockUser,
          email: 'trail@test.com',
          emailVerified: false,
          toJSON: jest.fn().mockReturnValue({
            id: USER_ID,
            name: 'Test User',
            email: 'trail@test.com',
            emailVerified: false,
            loginMethod: 'password',
          }),
        };
        mockFindOne(null);
        User.create.mockResolvedValue(newUser);

        await request(app)
          .post('/api/auth/register')
          .send({ name: 'Test User', email: 'trail@test.com', password: 'password123' });

        expect(enqueueVerificationEmail).toHaveBeenCalledTimes(1);
        const [, verifyUrl] = enqueueVerificationEmail.mock.calls[0];
        expect(verifyUrl).toMatch(/^https:\/\/app\.example\.com\/verify-email\?token=[0-9a-f]{64}&email=trail%40test\.com$/);
        expect(verifyUrl).not.toContain('//verify-email');
      } finally {
        if (prev) process.env.FRONTEND_URL = prev; else delete process.env.FRONTEND_URL;
      }
    });

    it('should not leak sensitive auth fields in the register response', async () => {
      const newUser = {
        ...mockUser,
        email: 'new@test.com',
        emailVerified: false,
        toJSON: jest.fn().mockReturnValue({
          id: USER_ID,
          name: 'Test User',
          email: 'new@test.com',
          emailVerified: false,
          loginMethod: 'password',
        }),
      };
      mockFindOne(null);
      User.create.mockResolvedValue(newUser);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test User', email: 'new@test.com', password: 'password123' });

      expect(res.status).toBe(201);
      const userPayload = res.body.data.user;
      expect(userPayload.password).toBeUndefined();
      expect(userPayload.refreshToken).toBeUndefined();
      expect(userPayload.emailVerificationToken).toBeUndefined();
      expect(userPayload.emailVerificationExpires).toBeUndefined();
      expect(userPayload.passwordResetToken).toBeUndefined();
      expect(userPayload.passwordResetExpires).toBeUndefined();
      expect(userPayload.loginMethod).toBe('password');
      expect(Object.keys(userPayload).sort()).toEqual(['email', 'emailVerified', 'id', 'loginMethod', 'name']);
    });
  });

  /* ================================
   * POST /api/auth/login
   * ================================ */
  describe('POST /api/auth/login', () => {
    it('should login successfully and return tokens', async () => {
      User.findByEmailWithPassword.mockResolvedValue(mockUser);
      mockUser.comparePassword.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'correct' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBe('new-access-token');
      expect(res.body.data.refreshToken).toBe('new-refresh-token');
    });

    it('should return 400 when email/password missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: '', password: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 when user not found', async () => {
      User.findByEmailWithPassword.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'unknown@test.com', password: 'pw' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should return 401 on wrong password', async () => {
      User.findByEmailWithPassword.mockResolvedValue(mockUser);
      mockUser.comparePassword.mockResolvedValue(false);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should return 429 when account is locked', async () => {
      User.findByEmailWithPassword.mockResolvedValue(mockUserLocked);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'pw' });

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
    });

    it('should return 409 for Google-only account', async () => {
      User.findByEmailWithPassword.mockResolvedValue(mockUserGoogleOnly);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'google@test.com', password: 'pw' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('GOOGLE_LOGIN_REQUIRED');
    });

    it('should return 403 when email not verified', async () => {
      const unverified = { ...mockUser, emailVerified: false };
      User.findByEmailWithPassword.mockResolvedValue(unverified);
      unverified.comparePassword = jest.fn().mockResolvedValue(true);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'unverified@test.com', password: 'pw' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });
  });

  /* ================================
   * POST /api/auth/logout
   * ================================ */
  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      User.findByIdAndUpdate.mockResolvedValue({});

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).post('/api/auth/logout');

      expect(res.status).toBe(401);
    });
  });

  /* ================================
   * POST /api/auth/refresh
   * ================================ */
  describe('POST /api/auth/refresh', () => {
    const { verifyRefreshToken } = require('../utils/jwt');

    it('should refresh access token successfully', async () => {
      verifyRefreshToken.mockReturnValue({ id: USER_ID, email: 'user@test.com' });
      User.findById.mockImplementation(() => thenableChainable(mockUser));

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBe('new-access-token');
    });

    it('should return 400 when refresh token missing', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 401 when refresh token is invalid', async () => {
      verifyRefreshToken.mockImplementation(() => { throw new Error('jwt malformed'); });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'bad-token' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    });

    it('should return 401 when refresh token does not match', async () => {
      verifyRefreshToken.mockReturnValue({ id: USER_ID });
      User.findById.mockImplementation(() => thenableChainable({ ...mockUser, refreshToken: 'different-token' }));

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'some-token' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    });
  });

  /* ================================
   * GET /api/auth/me
   * ================================ */
  describe('GET /api/auth/me', () => {
    it('should return current user', async () => {
      const mockSelect = jest.fn().mockReturnThis();
      const mockThenable = { then: jest.fn((resolve) => resolve(mockUser)), select: mockSelect };
      User.findById.mockReturnValue(mockThenable);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it('should return 404 when user not found', async () => {
      mockFindById(mockUser, null);

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
    });
  });

  /* ================================
   * POST /api/auth/google-login
   * ================================ */
  describe('POST /api/auth/google-login', () => {
    beforeEach(() => {
      mockVerifyIdToken.mockReset();
    });

    it('should create new user on first Google login', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-123',
          email: 'google@test.com',
          name: 'Google User',
          picture: 'https://pic.com/photo.jpg',
          email_verified: true,
        }),
      });
      mockFindOne(null);
      User.create.mockResolvedValue({ ...mockUser, googleId: 'google-sub-123', email: 'google@test.com', toJSON: mockUser.toJSON });

      const res = await request(app)
        .post('/api/auth/google-login')
        .send({ credential: 'google-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBe('new-access-token');
    });

    it('should link and login when email user exists with verified email', async () => {
      const unlinkedUser = { ...mockUser, googleId: null, emailVerified: true, email: 'existing@test.com' };
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-456',
          email: 'existing@test.com',
          name: 'Existing',
          email_verified: true,
        }),
      });
      mockFindOne(unlinkedUser);

      const res = await request(app)
        .post('/api/auth/google-login')
        .send({ credential: 'google-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(unlinkedUser.googleId).toBe('google-sub-456');
    });

    it('should return 403 when email user exists but unverified', async () => {
      const unverifiedUser = { ...mockUser, googleId: null, emailVerified: false, email: 'unverified@test.com' };
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-789',
          email: 'unverified@test.com',
          name: 'Unverified',
          email_verified: true,
        }),
      });
      mockFindOne(unverifiedUser);

      const res = await request(app)
        .post('/api/auth/google-login')
        .send({ credential: 'google-token' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('should login directly when Google already linked', async () => {
      const linkedUser = { ...mockUser, googleId: 'google-sub-999', email: 'linked@test.com' };
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-999',
          email: 'linked@test.com',
          name: 'Linked',
          email_verified: true,
        }),
      });
      mockFindOne(linkedUser);

      const res = await request(app)
        .post('/api/auth/google-login')
        .send({ credential: 'google-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when credential missing', async () => {
      const res = await request(app)
        .post('/api/auth/google-login')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 401 when Google token invalid', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const res = await request(app)
        .post('/api/auth/google-login')
        .send({ credential: 'bad-token' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  /* ================================
   * POST /api/auth/google-login — server config 500
   * ================================ */
  describe('POST /api/auth/google-login — server config 500', () => {
    const OLD_ENV = { ...process.env };

    afterAll(() => {
      process.env = { ...OLD_ENV };
      jest.resetModules();
    });

    it('should return 500 when GOOGLE_CLIENT_ID is unset', async () => {
      jest.resetModules();
      process.env.GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';
      process.env.JWT_SECRET = 'test-auth-secret';
      process.env.JWT_REFRESH_SECRET = 'test-auth-refresh-secret';
      process.env.JWT_REFRESH_EXPIRE = '7d';
      process.env.LOGIN_MAX_ATTEMPTS = '5';

      const localRoutes = require('../routes/authRoutes');
      const localErrorHandler = require('../middlewares/errorHandler');
      const localApp = express();
      localApp.use(express.json());
      localApp.use('/api/auth', localRoutes);
      localApp.use(localErrorHandler);

      const res = await request(localApp)
        .post('/api/auth/google-login')
        .send({ credential: 'token' });

      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe('GOOGLE_CLIENT_ID chưa được cấu hình trên server');
    });
  });

  /* ================================
   * POST /api/auth/forgot-password
   * ================================ */
  describe('POST /api/auth/forgot-password', () => {
    it('should send password reset email', async () => {
      mockFindOne(mockUser);

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'user@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 200 even when user not found (security)', async () => {
      mockFindOne(null);

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when email missing', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 for Google account', async () => {
      mockFindOne(mockUserGoogleOnly);

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'google@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('GOOGLE_ACCOUNT');
    });
  });

  /* ================================
   * POST /api/auth/reset-password
   * ================================ */
  describe('POST /api/auth/reset-password', () => {
    it('should reset password successfully', async () => {
      mockFindOne(mockUser);

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'valid-token', password: 'newpassword' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when token or password missing', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 on password mismatch', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 't', password: 'newpw', passwordConfirm: 'different' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PASSWORD_MISMATCH');
    });

    it('should return 400 when token invalid or expired', async () => {
      mockFindOne(null);

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'bad-token', password: 'newpassword' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  /* ================================
   * POST /api/auth/resend-verification
   * ================================ */
  describe('POST /api/auth/resend-verification', () => {
    it('should resend verification email', async () => {
      mockFindOne(mockUserUnverified);

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'unverified@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when email missing', async () => {
      const res = await request(app).post('/api/auth/resend-verification').send({});

      expect(res.status).toBe(400);
    });

    it('should return 404 when user not found', async () => {
      mockFindOne(null);

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'unknown@test.com' });

      expect(res.status).toBe(404);
    });

    it('should return 400 when already verified', async () => {
      mockFindOne(mockUser);

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .send({ email: 'verified@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_VERIFIED');
    });
  });

  /* ================================
   * GET /api/auth/verify-email (JSON)
   * ================================ */
  describe('GET /api/auth/verify-email', () => {
    it('should verify email successfully (JSON)', async () => {
      mockUserUnverified.emailVerificationExpires = new Date(Date.now() + 60 * 60 * 1000);
      mockFindOne(mockUserUnverified);

      const res = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: 'valid-token', email: 'user@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when token missing (JSON)', async () => {
      const res = await request(app).get('/api/auth/verify-email');

      expect(res.status).toBe(400);
    });

    it('should return 200 if already verified', async () => {
      mockFindOne(null, mockUser);

      const res = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: 'any', email: 'user@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should redirect on error for HTML requests', async () => {
      const res = await request(app)
        .get('/api/auth/verify-email')
        .set('Accept', 'text/html');

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('verify-email?status=error');
    });
  });

  /* =====================================================
   * Email verification token lifecycle
   * ===================================================== */
  describe('Email verification token lifecycle', () => {
    const HOUR = 60 * 60 * 1000;
    const extractToken = (url) => {
      const m = url.match(/[?&]token=([0-9a-f]{64})/);
      return m ? m[1] : null;
    };
    const safeToJSON = jest.fn().mockReturnValue({
      id: USER_ID,
      name: 'Lifecycle',
      email: 'lifecycle@test.com',
      emailVerified: false,
      loginMethod: 'password',
    });

    beforeEach(() => {
      enqueueVerificationEmail.mockClear();
    });

    it('registration stores the SHA-256 of the emailed raw token with a future expiry', async () => {
      const newUser = {
        ...mockUser,
        email: 'lifecycle@test.com',
        emailVerified: false,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        toJSON: safeToJSON,
      };
      mockFindOne(null);
      User.create.mockResolvedValue(newUser);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test User', email: 'lifecycle@test.com', password: 'password123' });

      expect(res.status).toBe(201);
      expect(enqueueVerificationEmail).toHaveBeenCalledTimes(1);
      const [sentUser, verifyUrl] = enqueueVerificationEmail.mock.calls[0];
      const raw = extractToken(verifyUrl);
      expect(raw).toMatch(/^[0-9a-f]{64}$/);
      expect(sentUser.emailVerificationToken).toBe(hashToken(raw));
      expect(sentUser.emailVerificationToken).not.toBe(raw);
      const ttlMs = new Date(sentUser.emailVerificationExpires).getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(0);
      expect(ttlMs).toBeLessThanOrEqual(24 * HOUR);
    });

    it('registration response does not expose token, hash or expiry', async () => {
      const newUser = {
        ...mockUser,
        email: 'lifecycle@test.com',
        emailVerified: false,
        emailVerificationToken: 'secret-stored-hash',
        emailVerificationExpires: new Date(Date.now() + HOUR),
        toJSON: safeToJSON,
      };
      mockFindOne(null);
      User.create.mockResolvedValue(newUser);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test User', email: 'lifecycle@test.com', password: 'password123' });

      expect(res.status).toBe(201);
      const payload = JSON.stringify(res.body);
      expect(payload).not.toContain('emailVerificationToken');
      expect(payload).not.toContain('emailVerificationExpires');
      expect(payload).not.toContain('deadbeef-stored-hash');
    });

    it('expired token returns VERIFICATION_TOKEN_EXPIRED and does not verify', async () => {
      const expired = {
        ...mockUserUnverified,
        emailVerified: false,
        emailVerificationToken: 'some-hash',
        emailVerificationExpires: new Date(Date.now() - 1000),
      };
      mockFindOne(expired);

      const res = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: 'some-token', email: 'user@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VERIFICATION_TOKEN_EXPIRED');
      expect(expired.emailVerified).toBe(false);
    });

    it('a token expiring exactly at now fails as expired', async () => {
      const exact = {
        ...mockUserUnverified,
        emailVerified: false,
        emailVerificationToken: 'some-hash',
        emailVerificationExpires: new Date(Date.now()),
      };
      mockFindOne(exact);

      const res = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: 'some-token', email: 'user@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VERIFICATION_TOKEN_EXPIRED');
    });

    it('verification succeeds within TTL and immediately clears the credential (one-time use)', async () => {
      const doc = {
        ...mockUserUnverified,
        emailVerified: false,
        emailVerificationToken: 'some-hash',
        emailVerificationExpires: new Date(Date.now() + HOUR),
        save: jest.fn().mockResolvedValue(),
      };
      mockFindOne(doc);

      const res = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: 'some-token', email: 'user@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(doc.emailVerified).toBe(true);
      expect(doc.emailVerificationToken).toBeUndefined();
      expect(doc.emailVerificationExpires).toBeUndefined();
      expect(doc.save).toHaveBeenCalledTimes(1);
    });

    it('replaying a consumed link returns ALREADY_VERIFIED (200) instead of re-verifying', async () => {
      mockFindOne(null, { ...mockUser, emailVerified: true });

      const res = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: 'old-consumed-token', email: 'user@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ALREADY_VERIFIED');
    });

    it('resend issues a new raw token and overwrites the stored credential', async () => {
      const user = { ...mockUserUnverified, emailVerified: false, email: 'resend@test.com' };

      mockFindOne(user);
      await request(app).post('/api/auth/resend-verification').send({ email: 'resend@test.com' });
      const tokenA = extractToken(enqueueVerificationEmail.mock.calls[0][1]);

      mockFindOne(user);
      await request(app).post('/api/auth/resend-verification').send({ email: 'resend@test.com' });
      const tokenB = extractToken(enqueueVerificationEmail.mock.calls[1][1]);

      expect(tokenA).not.toBe(tokenB);
      expect(user.emailVerificationToken).toBe(hashToken(tokenB));

      // the superseded A no longer exists in the DB -> invalid/superseded
      mockFindOne(null, { ...mockUser, emailVerified: false, email: 'resend@test.com' });
      const resA = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: tokenA, email: 'resend@test.com' });
      expect(resA.status).toBe(400);
      expect(resA.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');

      // the newest B still verifies
      mockFindOne(user);
      const resB = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: tokenB, email: 'resend@test.com' });
      expect(resB.status).toBe(200);
      expect(resB.body.success).toBe(true);
    });

    it('only the newest of several resends can verify', async () => {
      const user = { ...mockUserUnverified, emailVerified: false, email: 'multi@test.com' };
      const tokens = [];
      for (let i = 0; i < 3; i += 1) {
        mockFindOne(user);
        await request(app).post('/api/auth/resend-verification').send({ email: 'multi@test.com' });
        tokens.push(extractToken(enqueueVerificationEmail.mock.calls[i][1]));
      }
      expect(new Set(tokens).size).toBe(3);
      expect(user.emailVerificationToken).toBe(hashToken(tokens[2]));

      // an older link is already superseded -> invalid
      mockFindOne(null, { ...mockUser, emailVerified: false, email: 'multi@test.com' });
      const resOld = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: tokens[1], email: 'multi@test.com' });
      expect(resOld.status).toBe(400);
      expect(resOld.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');

      // newest link verifies
      mockFindOne(user);
      const resNew = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: tokens[2], email: 'multi@test.com' });
      expect(resNew.status).toBe(200);
      expect(resNew.body.success).toBe(true);
    });

    it('random or unknown token returns INVALID_VERIFICATION_TOKEN', async () => {
      mockFindOne(null);
      const res = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: 'garbage-not-a-token', email: 'user@test.com' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');
    });

    it('an account cannot be verified by another user\u2019s link', async () => {
      const victim = { ...mockUserUnverified, emailVerified: false, email: 'victim@test.com' };
      mockFindOne(null);

      const res = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: 'someone-elses-token', email: 'victim@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');
      expect(victim.emailVerified).toBe(false);
    });

    it('verification responses never expose the raw token, hash or expiry', async () => {
      const doc = {
        ...mockUserUnverified,
        emailVerificationToken: 'stored-hash',
        emailVerificationExpires: new Date(Date.now() + HOUR),
      };
      mockFindOne(doc);

      const res = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: 'some-token', email: 'user@test.com' });

      const payload = JSON.stringify(res.body);
      expect(res.status).toBe(200);
      expect(payload).not.toContain('stored-hash');
      expect(payload).not.toContain('emailVerificationExpires');

      mockFindOne(null);
      const bad = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: 'garbage', email: 'user@test.com' });
      const badPayload = JSON.stringify(bad.body);
      expect(bad.status).toBe(400);
      expect(badPayload).not.toContain('emailVerificationToken');
      expect(badPayload).not.toContain('emailVerificationExpires');
    });

    it('login succeeds once the account is verified', async () => {
      const verified = { ...mockUser, emailVerified: true };
      User.findByEmailWithPassword.mockResolvedValue(verified);
      verified.comparePassword = jest.fn().mockResolvedValue(true);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'pw' });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.success).toBe(true);
    });
  });

  /* ================================
   * POST /api/auth/request-unlock
   * ================================ */
  describe('POST /api/auth/request-unlock', () => {
    it('should send unlock email', async () => {
      mockFindOne(mockUserLocked);
      mockUserLocked.createUnlockToken = jest.fn().mockReturnValue('unlock-token');

      const res = await request(app)
        .post('/api/auth/request-unlock')
        .send({ email: 'locked@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 200 even when user not found (security)', async () => {
      mockFindOne(null);

      const res = await request(app)
        .post('/api/auth/request-unlock')
        .send({ email: 'unknown@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when email missing', async () => {
      const res = await request(app).post('/api/auth/request-unlock').send({});

      expect(res.status).toBe(400);
    });
  });

  /* ================================
   * POST /api/auth/unlock-account
   * ================================ */
  describe('POST /api/auth/unlock-account', () => {
    it('should unlock account successfully', async () => {
      User.findByUnlockToken.mockResolvedValue(mockUserLocked);

      const res = await request(app)
        .post('/api/auth/unlock-account')
        .send({ token: 'valid-unlock-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when token missing', async () => {
      const res = await request(app).post('/api/auth/unlock-account').send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 when token invalid', async () => {
      User.findByUnlockToken.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/unlock-account')
        .send({ token: 'bad-token' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  /* ================================
   * POST /api/auth/admin-unlock
   * ================================ */
  describe('POST /api/auth/admin-unlock', () => {
    it('should unlock account as admin', async () => {
      mockFindOne(mockUserLocked);

      const res = await request(app)
        .post('/api/auth/admin-unlock')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ email: 'locked@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 403 for non-admin user', async () => {
      const res = await request(app)
        .post('/api/auth/admin-unlock')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ email: 'locked@test.com' });

      expect(res.status).toBe(403);
    });

    it('should return 400 when email missing', async () => {
      const res = await request(app)
        .post('/api/auth/admin-unlock')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 404 when user not found', async () => {
      mockFindOne(null);

      const res = await request(app)
        .post('/api/auth/admin-unlock')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ email: 'unknown@test.com' });

      expect(res.status).toBe(404);
    });
  });

  /* ================================
   * POST /api/auth/link/google
   * ================================ */
  describe('POST /api/auth/link/google', () => {
    beforeEach(() => {
      mockVerifyIdToken.mockReset();
    });

    it('should link Google account successfully', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ sub: 'google-sub-789', email: 'user@test.com', picture: null }),
      });
      mockFindOne(null);
      User.findById.mockImplementation(() => thenableChainable(mockUser));

      const res = await request(app)
        .post('/api/auth/link/google')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ credential: 'google-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when credential missing', async () => {
      const res = await request(app)
        .post('/api/auth/link/google')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/auth/link/google')
        .send({ credential: 'token' });

      expect(res.status).toBe(401);
    });

    it('should return 200 when Google already linked (regardless of mismatch)', async () => {
      const linkedUser = { ...mockUser, googleId: 'existing-google-id' };
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ sub: 'different-google-id', email: 'user@test.com', picture: null }),
      });
      mockFindOne(null);
      User.findById.mockImplementation(() => thenableChainable(linkedUser));

      const res = await request(app)
        .post('/api/auth/link/google')
        .set('Authorization', `Bearer ${USER_TOKEN}`)
        .send({ credential: 'google-token' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Tài khoản Google đã được liên kết');
    });
  });

  /* ================================
   * DELETE /api/auth/unlink/google
   * ================================ */
  describe('DELETE /api/auth/unlink/google', () => {
    it('should unlink Google account successfully', async () => {
      const linkedUser = { ...mockUser, googleId: 'google-sub-123', password: 'hashed' };
      User.findById.mockImplementation(() => thenableChainable(linkedUser));

      const res = await request(app)
        .delete('/api/auth/unlink/google')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when not linked', async () => {
      User.findById.mockImplementation(() => thenableChainable(mockUser));

      const res = await request(app)
        .delete('/api/auth/unlink/google')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NOT_LINKED');
    });

    it('should return 400 when no password', async () => {
      const noPwUser = { ...mockUser, googleId: 'google-sub-123', password: null };
      User.findById.mockImplementation(() => thenableChainable(noPwUser));

      const res = await request(app)
        .delete('/api/auth/unlink/google')
        .set('Authorization', `Bearer ${USER_TOKEN}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NO_PASSWORD');
    });
  });
});
