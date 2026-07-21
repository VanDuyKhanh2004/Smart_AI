const express = require('express');
const request = require('supertest');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

jest.mock('pino', () => {
  const mockInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => mockInstance),
  };
  return jest.fn(() => mockInstance);
});

jest.mock('mongoose', () => {
  const Schema = function() {};
  Schema.prototype.pre = jest.fn().mockReturnThis();
  Schema.prototype.virtual = jest.fn().mockReturnValue({ get: jest.fn() });
  Schema.prototype.index = jest.fn().mockReturnThis();
  Schema.prototype.statics = {};
  Schema.prototype.methods = {};
  Schema.Types = { ObjectId: String, Number: Number, String: String, Boolean: Boolean, Date: Date };
  const model = jest.fn(() => {
    function Model(doc) { if (doc) Object.assign(this, doc); }
    Model.findById = jest.fn();
    Model.findByIdAndUpdate = jest.fn();
    Model.findOne = jest.fn();
    Model.aggregate = jest.fn();
    Model.countDocuments = jest.fn();
    Model.prototype.validateSync = jest.fn();
    Model.prototype.save = jest.fn().mockResolvedValue(true);
    return Model;
  });
  return { connection: { readyState: 1 }, Schema, model };
});

jest.mock('../configs/redis', () => ({
  getRedisClient: jest.fn(),
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn(),
  Worker: jest.fn(),
}));

const mockPino = () => require('pino')();

describe('Liveness endpoint', () => {
  let app;
  let correlationId;
  let live;

  beforeEach(() => {
    jest.resetModules();
    mockPino().info.mockClear();
    mockPino().warn.mockClear();
    mockPino().error.mockClear();
    app = express();
    correlationId = require('../middlewares/correlationId');
    live = require('../controllers/healthController').live;
  });

  it('GET /health returns 200', async () => {
    app.use(correlationId);
    app.get('/health', live);

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('GET /health includes success, status, service, environment, uptimeSeconds, timestamp, requestId', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    app.use(correlationId);
    app.get('/health', live);

    const res = await request(app).get('/health');
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('OK');
    expect(res.body.message).toBe('Smart AI Backend is running');
    expect(res.body.service).toBe('smart-ai-backend');
    expect(res.body.environment).toBe('development');

    process.env.NODE_ENV = origEnv;
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.requestId).toMatch(UUID_REGEX);
  });

  it('GET /health preserves legacy message and uptime fields', async () => {
    app.use(correlationId);
    app.get('/health', live);

    const res = await request(app).get('/health');
    expect(res.body.message).toBe('Smart AI Backend is running');
    expect(res.body).toHaveProperty('uptime');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('GET /health does not perform dependency checks', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 0;

    app.use(correlationId);
    app.get('/health', live);

    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).not.toHaveProperty('dependencies');
  });

  it('GET /api/health/live behaves identically to /health', async () => {
    app.use(correlationId);
    app.get('/api/health/live', live);

    const res = await request(app).get('/api/health/live');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('OK');
    expect(res.body.requestId).toMatch(UUID_REGEX);
  });

  it('returns requestId matching X-Request-ID response header', async () => {
    app.use(correlationId);
    app.get('/health', live);

    const res = await request(app).get('/health');
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });
});

describe('Overall health endpoint GET /api/health', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    mockPino().info.mockClear();
    mockPino().warn.mockClear();
    mockPino().error.mockClear();
    app = express();
  });

  const buildApp = async () => {
    const correlationId = require('../middlewares/correlationId');
    const { health } = require('../controllers/healthController');
    app.use(correlationId);
    app.get('/api/health', health);
  };

  it('returns 200 when MongoDB and Redis are up', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    const { getRedisClient } = require('../configs/redis');
    const redisClient = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    getRedisClient.mockReturnValue(redisClient);

    await buildApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('healthy');
  });

  it('returns 503 when MongoDB is down', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 0;
    const { getRedisClient } = require('../configs/redis');
    const redisClient = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    getRedisClient.mockReturnValue(redisClient);

    await buildApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('unhealthy');
    expect(res.body.dependencies.mongodb.status).toBe('down');
    expect(res.body.dependencies.redis.status).toBe('up');
  });

  it('returns 503 when Redis is down', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    const { getRedisClient } = require('../configs/redis');
    getRedisClient.mockReturnValue(null);

    await buildApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.dependencies.redis.status).toBe('down');
    expect(res.body.dependencies.mongodb.status).toBe('up');
  });

  it('includes dependency responseTimeMs as numbers', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    const { getRedisClient } = require('../configs/redis');
    const redisClient = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    getRedisClient.mockReturnValue(redisClient);

    await buildApp();
    const res = await request(app).get('/api/health');

    expect(typeof res.body.dependencies.mongodb.responseTimeMs).toBe('number');
    expect(typeof res.body.dependencies.redis.responseTimeMs).toBe('number');
    expect(typeof res.body.totalDurationMs).toBe('number');
  });

  it('includes AI config without exposing keys', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.GEMINI_API_KEY = 'gemini-test';

    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    const { getRedisClient } = require('../configs/redis');
    const redisClient = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    getRedisClient.mockReturnValue(redisClient);

    await buildApp();
    const res = await request(app).get('/api/health');

    expect(res.body.dependencies.ai.openaiConfigured).toBe(true);
    expect(res.body.dependencies.ai.geminiConfigured).toBe(true);
    expect(res.body.dependencies.ai).not.toHaveProperty('openaiKey');
    expect(res.body.dependencies.ai).not.toHaveProperty('geminiKey');
    expect(res.body.dependencies.ai).not.toHaveProperty('apiKey');

    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it('reports AI not configured when env vars are missing', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    const { getRedisClient } = require('../configs/redis');
    const redisClient = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    getRedisClient.mockReturnValue(redisClient);

    await buildApp();
    const res = await request(app).get('/api/health');

    expect(res.body.dependencies.ai.openaiConfigured).toBe(false);
    expect(res.body.dependencies.ai.geminiConfigured).toBe(false);
  });

  it('returns requestId in response', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    const { getRedisClient } = require('../configs/redis');
    const redisClient = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    getRedisClient.mockReturnValue(redisClient);

    await buildApp();
    const res = await request(app).get('/api/health');

    expect(res.body.requestId).toMatch(UUID_REGEX);
  });

  it('does not require authentication', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    const { getRedisClient } = require('../configs/redis');
    const redisClient = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    getRedisClient.mockReturnValue(redisClient);

    await buildApp();
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe('Readiness endpoint GET /api/health/ready', () => {
  let app;
  let pinoWarn;

  beforeEach(() => {
    jest.resetModules();
    pinoWarn = mockPino().warn;
    pinoWarn.mockClear();
    mockPino().info.mockClear();
    mockPino().error.mockClear();
    app = express();
  });

  const buildApp = async () => {
    const correlationId = require('../middlewares/correlationId');
    const ready = require('../controllers/healthController').ready;
    app.use(correlationId);
    app.get('/api/health/ready', ready);
  };

  it('returns 200 and status "ready" when all dependencies are up', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    const { getRedisClient } = require('../configs/redis');
    const redisClient = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    getRedisClient.mockReturnValue(redisClient);

    await buildApp();
    const res = await request(app).get('/api/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('ready');
  });

  it('returns 503 and status "not_ready" when MongoDB is down', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 0;
    const { getRedisClient } = require('../configs/redis');
    const redisClient = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    getRedisClient.mockReturnValue(redisClient);

    await buildApp();
    const res = await request(app).get('/api/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe('not_ready');
  });

  it('returns 503 when Redis is down', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    const { getRedisClient } = require('../configs/redis');
    getRedisClient.mockReturnValue(null);

    await buildApp();
    const res = await request(app).get('/api/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
  });

  it('logs a structured warning when unhealthy', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 0;
    const { getRedisClient } = require('../configs/redis');
    const redisClient = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    getRedisClient.mockReturnValue(redisClient);

    await buildApp();
    await request(app).get('/api/health/ready');

    const warnCall = pinoWarn.mock.calls.find(
      (args) => typeof args[0] === 'object' && args[0].dependencies,
    );
    expect(warnCall).toBeDefined();
    expect(warnCall[0].dependencies.mongodb.status).toBe('down');
    expect(warnCall[0].dependencies.redis.status).toBe('up');
    expect(typeof warnCall[0].totalDurationMs).toBe('number');
    expect(warnCall[0].requestId).toMatch(UUID_REGEX);
  });

  it('does not log a warning when healthy', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    const { getRedisClient } = require('../configs/redis');
    const redisClient = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    getRedisClient.mockReturnValue(redisClient);

    await buildApp();
    await request(app).get('/api/health/ready');

    const warnCalls = pinoWarn.mock.calls.filter(
      (args) => typeof args[0] === 'object' && args[0].dependencies,
    );
    expect(warnCalls).toHaveLength(0);
  });

  it('includes dependency responseTimeMs as numbers', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    const { getRedisClient } = require('../configs/redis');
    const redisClient = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    getRedisClient.mockReturnValue(redisClient);

    await buildApp();
    const res = await request(app).get('/api/health/ready');

    expect(typeof res.body.dependencies.mongodb.responseTimeMs).toBe('number');
    expect(typeof res.body.dependencies.redis.responseTimeMs).toBe('number');
    expect(typeof res.body.totalDurationMs).toBe('number');
  });

  it('does not require authentication', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    const { getRedisClient } = require('../configs/redis');
    const redisClient = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    getRedisClient.mockReturnValue(redisClient);

    await buildApp();
    const res = await request(app).get('/api/health/ready');

    expect(res.status).toBe(200);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe('Health endpoints reuse existing connections', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    app = express();
  });

  it('reuses Redis client via getRedisClient() and calls ping on it', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    const { getRedisClient } = require('../configs/redis');
    const pingMock = jest.fn().mockResolvedValue('PONG');
    const redisClient = { isOpen: true, ping: pingMock };
    getRedisClient.mockReturnValue(redisClient);

    const correlationId = require('../middlewares/correlationId');
    const { health } = require('../controllers/healthController');
    app.use(correlationId);
    app.get('/api/health', health);

    await request(app).get('/api/health');

    expect(getRedisClient).toHaveBeenCalled();
    expect(pingMock).toHaveBeenCalled();
  });

  it('reads existing mongoose.connection.readyState', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 1;
    const { getRedisClient } = require('../configs/redis');
    const redisClient = { isOpen: true, ping: jest.fn().mockResolvedValue('PONG') };
    getRedisClient.mockReturnValue(redisClient);

    const correlationId = require('../middlewares/correlationId');
    const { health } = require('../controllers/healthController');
    app.use(correlationId);
    app.get('/api/health', health);

    const res = await request(app).get('/api/health');

    expect(res.body.dependencies.mongodb.readyState).toBe('connected');
    expect(res.status).toBe(200);
  });
});
