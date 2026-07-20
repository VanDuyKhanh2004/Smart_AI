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

const mockPino = () => require('pino')();

describe('correlationId middleware', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    mockPino().info.mockClear();
    mockPino().warn.mockClear();
    mockPino().error.mockClear();
    app = express();
  });

  it('generates a UUID when no X-Request-ID header is present', async () => {
    const correlationId = require('../middlewares/correlationId');
    app.use(correlationId);
    app.get('/test', (req, res) => res.json({ rid: req.requestId }));

    const res = await request(app).get('/test');
    expect(res.body.rid).toMatch(UUID_REGEX);
    expect(res.headers['x-request-id']).toBe(res.body.rid);
  });

  it('preserves a valid incoming X-Request-ID UUID', async () => {
    const correlationId = require('../middlewares/correlationId');
    app.use(correlationId);
    app.get('/test', (req, res) => res.json({ rid: req.requestId }));

    const id = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(app).get('/test').set('X-Request-ID', id);
    expect(res.body.rid).toBe(id);
    expect(res.headers['x-request-id']).toBe(id);
  });

  it('replaces an invalid incoming X-Request-ID with a new UUID', async () => {
    const correlationId = require('../middlewares/correlationId');
    app.use(correlationId);
    app.get('/test', (req, res) => res.json({ rid: req.requestId }));

    const res = await request(app).get('/test').set('X-Request-ID', 'not-a-uuid');
    expect(res.body.rid).toMatch(UUID_REGEX);
    expect(res.body.rid).not.toBe('not-a-uuid');
  });

  it('replaces a numeric X-Request-ID with a new UUID', async () => {
    const correlationId = require('../middlewares/correlationId');
    app.use(correlationId);
    app.get('/test', (req, res) => res.json({ rid: req.requestId }));

    const res = await request(app).get('/test').set('X-Request-ID', '12345');
    expect(res.body.rid).toMatch(UUID_REGEX);
  });

  it('makes req.requestId available to downstream middleware', async () => {
    const correlationId = require('../middlewares/correlationId');
    app.use(correlationId);
    app.use((req, res, next) => {
      req.checkId = req.requestId;
      next();
    });
    app.get('/test', (req, res) => res.json({ rid: req.checkId }));

    const res = await request(app).get('/test');
    expect(res.body.rid).toMatch(UUID_REGEX);
  });

  it('makes req.logger available to downstream middleware', async () => {
    const correlationId = require('../middlewares/correlationId');
    app.use(correlationId);
    app.get('/test', (req, res) => {
      expect(typeof req.logger.info).toBe('function');
      expect(typeof req.logger.warn).toBe('function');
      expect(typeof req.logger.error).toBe('function');
      res.json({ ok: true });
    });

    await request(app).get('/test');
  });

  it('sets X-Request-ID response header', async () => {
    const correlationId = require('../middlewares/correlationId');
    app.use(correlationId);
    app.get('/test', (req, res) => res.json({ ok: true }));

    const res = await request(app).get('/test');
    expect(res.headers['x-request-id']).toMatch(UUID_REGEX);
  });
});

describe('requestLogger middleware', () => {
  let app;
  let pinoInfo;
  let pinoWarn;
  let pinoError;

  beforeEach(() => {
    jest.resetModules();
    pinoInfo = mockPino().info;
    pinoWarn = mockPino().warn;
    pinoError = mockPino().error;
    pinoInfo.mockClear();
    pinoWarn.mockClear();
    pinoError.mockClear();
    app = express();
  });

  it('logs request completion with requestId, method, url, statusCode, durationMs, ip, userAgent', async () => {
    const correlationId = require('../middlewares/correlationId');
    const requestLogger = require('../middlewares/requestLogger');
    app.use(correlationId);
    app.use(requestLogger);
    app.get('/api/products', (req, res) => res.json({ ok: true }));

    await request(app)
      .get('/api/products')
      .set('User-Agent', 'supertest');

    const call = pinoInfo.mock.calls.find(
      (args) => args[0] && args[0].url === '/api/products',
    );
    expect(call).toBeDefined();
    expect(call[0].requestId).toMatch(UUID_REGEX);
    expect(call[0].method).toBe('GET');
    expect(call[0].url).toBe('/api/products');
    expect(call[0].statusCode).toBe(200);
    expect(typeof call[0].durationMs).toBe('number');
    expect(call[0].ip).toBeDefined();
    expect(call[0].userAgent).toBe('supertest');
  });

  it('logs at warn level for 4xx responses', async () => {
    const correlationId = require('../middlewares/correlationId');
    const requestLogger = require('../middlewares/requestLogger');
    app.use(correlationId);
    app.use(requestLogger);
    app.get('/bad', (req, res) => res.status(400).json({ error: 'bad' }));

    await request(app).get('/bad');

    const call = pinoWarn.mock.calls.find(
      (args) => args[0] && args[0].url === '/bad',
    );
    expect(call).toBeDefined();
    expect(call[0].statusCode).toBe(400);
  });

  it('logs at error level for 5xx responses', async () => {
    const correlationId = require('../middlewares/correlationId');
    const requestLogger = require('../middlewares/requestLogger');
    app.use(correlationId);
    app.use(requestLogger);
    app.get('/crash', (req, res) => res.status(500).json({ error: 'oops' }));

    await request(app).get('/crash');

    const call = pinoError.mock.calls.find(
      (args) => args[0] && args[0].url === '/crash',
    );
    expect(call).toBeDefined();
    expect(call[0].statusCode).toBe(500);
  });

  it('includes userId when req.user is set', async () => {
    const correlationId = require('../middlewares/correlationId');
    const requestLogger = require('../middlewares/requestLogger');
    app.use(correlationId);
    app.use((req, res, next) => {
      req.user = { _id: 'user123' };
      next();
    });
    app.use(requestLogger);
    app.get('/me', (req, res) => res.json({ ok: true }));

    await request(app).get('/me');

    const call = pinoInfo.mock.calls.find(
      (args) => args[0] && args[0].url === '/me',
    );
    expect(call[0].userId).toBe('user123');
  });

  it('does not include authorization header in log payload', async () => {
    const correlationId = require('../middlewares/correlationId');
    const requestLogger = require('../middlewares/requestLogger');
    app.use(correlationId);
    app.use(requestLogger);
    app.get('/test', (req, res) => res.json({ ok: true }));

    await request(app)
      .get('/test')
      .set('Authorization', 'Bearer my-secret-token');

    const call = pinoInfo.mock.calls.find(
      (args) => args[0] && args[0].url === '/test',
    );
    expect(call).toBeDefined();
    expect(call[0]).not.toHaveProperty('authorization');
  });

  it('does not include request body in log payload', async () => {
    const correlationId = require('../middlewares/correlationId');
    const requestLogger = require('../middlewares/requestLogger');
    app.use(correlationId);
    app.use(express.json());
    app.use(requestLogger);
    app.post('/submit', (req, res) => res.json({ ok: true }));

    await request(app)
      .post('/submit')
      .send({ password: 'secret123', name: 'test' });

    const call = pinoInfo.mock.calls.find(
      (args) => args[0] && args[0].url === '/submit',
    );
    expect(call).toBeDefined();
    expect(call[0]).not.toHaveProperty('body');
    expect(call[0]).not.toHaveProperty('password');
  });

  it('includes contentLength when the response has a content-length header', async () => {
    const correlationId = require('../middlewares/correlationId');
    const requestLogger = require('../middlewares/requestLogger');
    app.use(correlationId);
    app.use(requestLogger);
    app.get('/data', (req, res) => {
      const body = JSON.stringify({ data: 'x'.repeat(100) });
      res.setHeader('content-length', Buffer.byteLength(body));
      res.json({ data: 'x'.repeat(100) });
    });

    await request(app).get('/data');

    const call = pinoInfo.mock.calls.find(
      (args) => args[0] && args[0].url === '/data',
    );
    expect(call[0].contentLength).toBeGreaterThan(0);
  });
});
