const request = require('supertest');

process.env.JWT_SECRET = 'test-token-version-secret';
process.env.JWT_REFRESH_SECRET = 'test-token-version-refresh-secret';
process.env.JWT_REFRESH_EXPIRE = '7d';
process.env.LOG_LEVEL = 'silent';

jest.mock('pino', () => {
  const mockInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => mockInstance),
  };
  return jest.fn(() => mockInstance);
});

jest.mock('../services/emailQueueService', () => ({
  enqueueWelcomeEmail: jest.fn(),
  enqueueVerificationEmail: jest.fn(),
  enqueuePasswordResetEmail: jest.fn(),
  enqueueUnlockAccountEmail: jest.fn(),
}));

jest.mock('../services/verificationResendService', () => ({
  claimResendCooldown: jest.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 60 }),
  startResendCooldown: jest.fn(),
  releaseResendCooldown: jest.fn(),
  checkLongWindow: jest.fn().mockResolvedValue({ allowed: true }),
  incrementLongWindow: jest.fn(),
  getCooldownSeconds: jest.fn(() => 60),
}));

const mockVerifyRefreshToken = jest.fn();

jest.mock('../utils/jwt', () => {
  const actualJwt = jest.requireActual('jsonwebtoken');
  return {
    generateAccessToken: jest.fn((user) =>
      actualJwt.sign({ id: user._id, email: user.email, tokenVersion: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { expiresIn: '15m' })
    ),
    generateRefreshToken: jest.fn((user) =>
      actualJwt.sign({ id: user._id, email: user.email, tokenVersion: user.tokenVersion ?? 0 }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' })
    ),
    verifyAccessToken: (token) => actualJwt.verify(token, process.env.JWT_SECRET),
    verifyRefreshToken: (token) => mockVerifyRefreshToken(token),
  };
});

const USER_ID = '507f191e810c19729de860ea';

const mockUser = {
  _id: USER_ID,
  email: 'user@test.com',
  role: 'user',
  name: 'Test User',
  phone: '0123456789',
  avatar: null,
  emailVerified: true,
  tokenVersion: 0,
  refreshToken: 'valid-refresh-token',
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
  comparePassword: jest.fn(),
  save: jest.fn().mockResolvedValue(true),
};

function thenableChainable(result) {
  return {
    select: jest.fn().mockResolvedValue(result),
    then(resolve) { return Promise.resolve(result).then(resolve); },
  };
}

jest.mock('../models/User', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn(),
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

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const profileRoutes = require('../routes/profileRoutes');
const authRoutes = require('../routes/authRoutes');
const errorHandler = require('../middlewares/errorHandler');
const { resetRateLimiters } = require('../middlewares/rateLimiters');
const express = require('express');

function buildProfileApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/profile', profileRoutes);
  app.use(errorHandler);
  return app;
}

function buildAuthApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

describe('Token version — password change invalidation (HTTP)', () => {
  let profileApp;

  beforeAll(() => {
    profileApp = buildProfileApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser.tokenVersion = 0;
    mockUser.refreshToken = 'valid-refresh-token';
    User.findById.mockReset();
    User.findById.mockImplementation((id) => thenableChainable(mockUser));
  });

  it('increments tokenVersion on password change', async () => {
    mockUser.comparePassword
      .mockResolvedValueOnce(true)   // currentPassword matches
      .mockResolvedValueOnce(false); // newPassword is different
    mockUser.tokenVersion = 0;

    const res = await request(profileApp)
      .put('/api/profile/password')
      .set('Authorization', `Bearer ${jwt.sign({ id: USER_ID, email: 'user@test.com', tokenVersion: 0 }, process.env.JWT_SECRET)}`)
      .send({
        currentPassword: 'old_pass',
        newPassword: 'new_pass_123',
        confirmPassword: 'new_pass_123',
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockUser.tokenVersion).toBe(1);
    expect(mockUser.refreshToken).toBeNull();
    expect(mockUser.save).toHaveBeenCalled();
  });

  it('rejects old access token after password change', async () => {
    const oldToken = jwt.sign(
      { id: USER_ID, email: 'user@test.com', tokenVersion: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    mockUser.tokenVersion = 1;

    const res = await request(profileApp)
      .get('/api/profile')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(401);

    expect(res.body.error.code).toBe('TOKEN_REVOKED');
  });

  it('accepts new access token after password change', async () => {
    mockUser.tokenVersion = 1;

    const newToken = jwt.sign(
      { id: USER_ID, email: 'user@test.com', tokenVersion: 1 },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const res = await request(profileApp)
      .get('/api/profile')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('legacy JWT without tokenVersion remains valid when user.tokenVersion === 0', async () => {
    const legacyToken = jwt.sign(
      { id: USER_ID, email: 'user@test.com' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    mockUser.tokenVersion = 0;

    const res = await request(profileApp)
      .get('/api/profile')
      .set('Authorization', `Bearer ${legacyToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('legacy/version-0 token rejected when user.tokenVersion === 1', async () => {
    const legacyToken = jwt.sign(
      { id: USER_ID, email: 'user@test.com' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    mockUser.tokenVersion = 1;

    const res = await request(profileApp)
      .get('/api/profile')
      .set('Authorization', `Bearer ${legacyToken}`)
      .expect(401);

    expect(res.body.error.code).toBe('TOKEN_REVOKED');
  });

  it('tokenVersion 0 in JWT rejected when user.tokenVersion is 1', async () => {
    const oldToken = jwt.sign(
      { id: USER_ID, email: 'user@test.com', tokenVersion: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    mockUser.tokenVersion = 1;

    const res = await request(profileApp)
      .get('/api/profile')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(401);

    expect(res.body.error.code).toBe('TOKEN_REVOKED');
  });

  it('tokenVersion 1 in JWT accepted when user.tokenVersion is 1', async () => {
    const newToken = jwt.sign(
      { id: USER_ID, email: 'user@test.com', tokenVersion: 1 },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    mockUser.tokenVersion = 1;

    const res = await request(profileApp)
      .get('/api/profile')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });
});

describe('Token version — refresh token flow', () => {
  let authApp;

  beforeAll(() => {
    authApp = buildAuthApp();
  });

  beforeEach(() => {
    resetRateLimiters();
    jest.clearAllMocks();
    mockUser.tokenVersion = 0;
    mockUser.refreshToken = 'valid-refresh-token';
    User.findById.mockReset();
    User.findById.mockImplementation(() => thenableChainable(mockUser));
  });

  it('rejects old refresh token after password change', async () => {
    mockVerifyRefreshToken.mockReturnValue({
      id: USER_ID,
      email: 'user@test.com',
      tokenVersion: 0,
    });

    mockUser.tokenVersion = 1;
    // The refresh token in the DB must match the token sent (passes the
    // stored-token check), but tokenVersion mismatch triggers TOKEN_REVOKED.
    mockUser.refreshToken = 'old-refresh-token';

    const res = await request(authApp)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'old-refresh-token' })
      .expect(401);

    expect(res.body.error.code).toBe('TOKEN_REVOKED');
  });

  it('accepts new refresh token after password change', async () => {
    mockVerifyRefreshToken.mockReturnValue({
      id: USER_ID,
      email: 'user@test.com',
      tokenVersion: 1,
    });

    mockUser.tokenVersion = 1;
    mockUser.refreshToken = 'new-refresh-token';

    const res = await request(authApp)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'new-refresh-token' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('legacy refresh token without tokenVersion accepted when user.tokenVersion === 0', async () => {
    mockVerifyRefreshToken.mockReturnValue({
      id: USER_ID,
      email: 'user@test.com',
    });

    mockUser.tokenVersion = 0;

    const res = await request(authApp)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-refresh-token' })
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('legacy refresh token rejected when user.tokenVersion === 1', async () => {
    mockVerifyRefreshToken.mockReturnValue({
      id: USER_ID,
      email: 'user@test.com',
    });

    mockUser.tokenVersion = 1;
    // Must pass the stored-token check so tokenVersion check is reached.
    mockUser.refreshToken = 'some-token';

    const res = await request(authApp)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'some-token' })
      .expect(401);

    expect(res.body.error.code).toBe('TOKEN_REVOKED');
  });
});

describe('Token version — password reset', () => {
  let profileApp;
  let authApp;

  beforeAll(() => {
    profileApp = buildProfileApp();
    authApp = buildAuthApp();
  });

  beforeEach(() => {
    resetRateLimiters();
    jest.clearAllMocks();
    mockUser.tokenVersion = 0;
    mockUser.refreshToken = 'valid-refresh-token';
    mockUser.passwordResetToken = undefined;
    mockUser.passwordResetExpires = undefined;
    User.findById.mockReset();
    User.findById.mockImplementation(() => thenableChainable(mockUser));
  });

  it('increments tokenVersion on password reset', async () => {
    const crypto = require('crypto');
    const resetToken = 'valid-reset-token';
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    mockUser.passwordResetToken = hashedToken;
    mockUser.passwordResetExpires = new Date(Date.now() + 3600000);
    mockUser.tokenVersion = 0;

    // resetPassword uses User.findOne({...}).select('+password')
    User.findOne.mockReset();
    const chainable = {
      select: jest.fn().mockResolvedValue(mockUser),
      then(resolve) { return Promise.resolve(mockUser).then(resolve); },
    };
    User.findOne.mockReturnValue(chainable);

    const res = await request(authApp)
      .post('/api/auth/reset-password')
      .send({ token: resetToken, password: 'new_password_123' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockUser.tokenVersion).toBe(1);
    expect(mockUser.refreshToken).toBeNull();
  });

  it('rejects old access token after password reset', async () => {
    const oldToken = jwt.sign(
      { id: USER_ID, email: 'user@test.com', tokenVersion: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    mockUser.tokenVersion = 1;

    const res = await request(profileApp)
      .get('/api/profile')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(401);

    expect(res.body.error.code).toBe('TOKEN_REVOKED');
  });
});
