const request = require('supertest');
const express = require('express');

process.env.GOOGLE_CLIENT_ID = '';
process.env.JWT_SECRET = 'route-test-secret';

const USER_ID = '507f191e810c19729de860ea';

jest.mock('../models/User', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));

jest.mock('../services/emailQueueService', () => ({
  enqueueWelcomeEmail: jest.fn(),
  enqueueVerificationEmail: jest.fn(),
  enqueuePasswordResetEmail: jest.fn(),
  enqueueUnlockAccountEmail: jest.fn(),
}));

jest.mock('../configs/redis', () => ({
  getRedisClient: jest.fn(),
}));

const { getRedisClient } = require('../configs/redis');
const User = require('../models/User');
const { enqueueVerificationEmail } = require('../services/emailQueueService');
const { resendVerification, register } = require('../controllers/authController');
const errorHandler = require('../middlewares/errorHandler');

const makeUser = () => ({
  _id: USER_ID,
  name: 'Test User',
  email: 'pending@test.com',
  emailVerified: false,
  googleId: null,
  password: 'hashedpassword',
  emailVerificationToken: 'stored-hash',
  emailVerificationExpires: new Date(Date.now() + 60 * 60 * 1000),
  save: jest.fn().mockResolvedValue(),
  toJSON: jest.fn().mockReturnValue({ id: USER_ID, email: 'pending@test.com' }),
});

const makeClient = () => ({
  isOpen: true,
  isReady: true,
  set: jest.fn(),
  pTTL: jest.fn(),
  get: jest.fn(),
  ttl: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post('/api/auth/resend-verification', resendVerification);
  app.post('/api/auth/register', register);
  app.use(errorHandler);
  return app;
}

describe('POST /api/auth/resend-verification — Redis-unavailable fail-closed (route stack + error handler)', () => {
  let app;
  let user;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    user = makeUser();
    User.findOne.mockResolvedValue(user);
  });

  it('returns 503 VERIFICATION_THROTTLE_UNAVAILABLE when no Redis client exists', async () => {
    getRedisClient.mockReturnValue(null);

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'pending@test.com' });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VERIFICATION_THROTTLE_UNAVAILABLE');
    expect(res.body.error.message).toContain('chưa sẵn sàng');
  });

  it('returns 503 when the client is open but not ready (reconnecting) and mutates nothing', async () => {
    const client = makeClient();
    client.isReady = false;
    getRedisClient.mockReturnValue(client);

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'pending@test.com' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('VERIFICATION_THROTTLE_UNAVAILABLE');
    expect(enqueueVerificationEmail).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
    expect(user.emailVerificationToken).toBe('stored-hash');
    expect(user.emailVerified).toBe(false);
    expect(client.incr).not.toHaveBeenCalled();
  });

  it('wraps a raw socket/connection error into the 503 without leaking details', async () => {
    const client = makeClient();
    client.set.mockRejectedValue(new Error('Connection lost redis://localhost:6379 ECONNRESET'));
    getRedisClient.mockReturnValue(client);

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'pending@test.com' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('VERIFICATION_THROTTLE_UNAVAILABLE');
    expect(enqueueVerificationEmail).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('ECONNRESET');
    expect(JSON.stringify(res.body)).not.toContain('localhost');
    expect(JSON.stringify(res.body)).not.toContain('redis');
    expect(client.incr).not.toHaveBeenCalled();
  });

  it('a failure during the long-window read also maps to the 503 contract', async () => {
    const client = makeClient();
    client.set.mockResolvedValue('OK');
    client.get.mockRejectedValue(new Error('socket closed'));
    getRedisClient.mockReturnValue(client);

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'pending@test.com' });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('VERIFICATION_THROTTLE_UNAVAILABLE');
    expect(enqueueVerificationEmail).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
    expect(client.incr).not.toHaveBeenCalled();
  });

  it('recovers without a process restart: 503 while down, then 200 after Redis is ready again', async () => {
    const client = makeClient();
    client.isReady = false;
    getRedisClient.mockReturnValue(client);

    const down = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'pending@test.com' });
    expect(down.status).toBe(503);
    expect(down.body.error.code).toBe('VERIFICATION_THROTTLE_UNAVAILABLE');

    client.isReady = true;
    client.set.mockResolvedValue('OK');
    client.get.mockResolvedValue('0');
    client.incr.mockResolvedValue(1);
    client.expire.mockResolvedValue(1);

    const up = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'pending@test.com' });

    expect(up.status).toBe(200);
    expect(up.body.success).toBe(true);
    expect(enqueueVerificationEmail).toHaveBeenCalledTimes(1);
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(user.emailVerificationToken).not.toBe('stored-hash');
  });

  it('registration succeeds even when resend-throttle Redis is down (best-effort cooldown start)', async () => {
    getRedisClient.mockReturnValue(null);
    const newUser = {
      _id: USER_ID,
      name: 'New User',
      email: 'new@test.com',
      emailVerified: false,
      googleId: null,
      password: 'hashedpassword',
      save: jest.fn().mockResolvedValue(),
      toJSON: jest.fn().mockReturnValue({
        id: USER_ID,
        name: 'New User',
        email: 'new@test.com',
        emailVerified: false,
        loginMethod: 'password',
      }),
    };
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(newUser);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New User', email: 'new@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(enqueueVerificationEmail).toHaveBeenCalledTimes(1);
    expect(res.body.data.requiresEmailVerification).toBe(true);
  });
});
