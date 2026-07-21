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

  it('redacts sensitive query parameters (token, email) from log url', async () => {
    const correlationId = require('../middlewares/correlationId');
    const requestLogger = require('../middlewares/requestLogger');
    app.use(correlationId);
    app.use(requestLogger);
    app.get('/api/auth/verify-email', (req, res) => res.json({ ok: true }));

    await request(app)
      .get('/api/auth/verify-email?token=abc123&email=user@example.com&source=web');

    const call = pinoInfo.mock.calls.find(
      (args) => args[0] && args[0].url === '/api/auth/verify-email?token=[REDACTED]&email=[REDACTED]&source=web',
    );
    expect(call).toBeDefined();
    expect(call[0].url).not.toContain('abc123');
    expect(call[0].url).not.toContain('user@example.com');
  });

  it('redacts accessToken and refreshToken query parameters', async () => {
    const correlationId = require('../middlewares/correlationId');
    const requestLogger = require('../middlewares/requestLogger');
    app.use(correlationId);
    app.use(requestLogger);
    app.get('/api/auth/refresh', (req, res) => res.json({ ok: true }));

    await request(app)
      .get('/api/auth/refresh?accessToken=eyJhbGci&refreshToken=eyJhbGci');

    const call = pinoInfo.mock.calls.find(
      (args) => args[0] && args[0].url.startsWith('/api/auth/refresh'),
    );
    expect(call).toBeDefined();
    expect(call[0].url).toContain('accessToken=[REDACTED]');
    expect(call[0].url).toContain('refreshToken=[REDACTED]');
    expect(call[0].url).not.toContain('eyJhbGci');
  });

  it('preserves non-sensitive query parameters unchanged', async () => {
    const correlationId = require('../middlewares/correlationId');
    const requestLogger = require('../middlewares/requestLogger');
    app.use(correlationId);
    app.use(requestLogger);
    app.get('/api/products', (req, res) => res.json({ ok: true }));

    await request(app)
      .get('/api/products?page=2&limit=20&category=phones');

    const call = pinoInfo.mock.calls.find(
      (args) => args[0] && args[0].url === '/api/products?page=2&limit=20&category=phones',
    );
    expect(call).toBeDefined();
  });

  it('logs URL without query string unchanged', async () => {
    const correlationId = require('../middlewares/correlationId');
    const requestLogger = require('../middlewares/requestLogger');
    app.use(correlationId);
    app.use(requestLogger);
    app.get('/api/health', (req, res) => res.json({ ok: true }));

    await request(app).get('/api/health');

    const call = pinoInfo.mock.calls.find(
      (args) => args[0] && args[0].url === '/api/health',
    );
    expect(call).toBeDefined();
  });

  it('redacts password query parameter', async () => {
    const correlationId = require('../middlewares/correlationId');
    const requestLogger = require('../middlewares/requestLogger');
    app.use(correlationId);
    app.use(requestLogger);
    app.get('/api/auth/reset-password', (req, res) => res.json({ ok: true }));

    await request(app)
      .get('/api/auth/reset-password?token=abc&password=newpass123');

    const call = pinoInfo.mock.calls.find(
      (args) => args[0] && args[0].url.startsWith('/api/auth/reset-password'),
    );
    expect(call).toBeDefined();
    expect(call[0].url).toContain('password=[REDACTED]');
    expect(call[0].url).not.toContain('newpass123');
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

describe('404 response body sanitization', () => {
  let app;

  function pathnameOnly(url) {
    const qIndex = url.indexOf('?');
    return qIndex === -1 ? url : url.slice(0, qIndex);
  }

  beforeEach(() => {
    jest.resetModules();
    app = express();
  });

  it('does not include query parameters in 404 response message', async () => {
    app.use('*', (req, res) => {
      const pn = pathnameOnly(req.originalUrl);
      res.status(404).json({
        error: {
          message: `Route ${pn} not found`,
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
    });

    const res = await request(app).get('/api/unknown?token=abc123&email=x@y.com');
    expect(res.status).toBe(404);
    expect(res.body.error.message).not.toContain('token=');
    expect(res.body.error.message).not.toContain('email=');
    expect(res.body.error.message).not.toContain('abc123');
    expect(res.body.error.message).not.toContain('x@y.com');
    expect(res.body.error.message).toBe('Route /api/unknown not found');
  });

  it('returns pathname only for route without query string', async () => {
    app.use('*', (req, res) => {
      const pn = pathnameOnly(req.originalUrl);
      res.status(404).json({
        error: {
          message: `Route ${pn} not found`,
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
    });

    const res = await request(app).get('/api/not-found');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Route /api/not-found not found');
  });
});

describe('sanitizeUrl utility', () => {
  let sanitizeUrl;

  beforeEach(() => {
    jest.resetModules();
    sanitizeUrl = require('../utils/sanitizeUrl');
  });

  it('redacts token query parameter', () => {
    const result = sanitizeUrl('/api/auth/verify-email?token=abc123&email=user@example.com');
    expect(result).toBe('/api/auth/verify-email?token=[REDACTED]&email=[REDACTED]');
    expect(result).not.toContain('abc123');
    expect(result).not.toContain('user@example.com');
  });

  it('redacts resetToken query parameter', () => {
    const result = sanitizeUrl('/auth/reset?resetToken=xyz789');
    expect(result).toBe('/auth/reset?resetToken=[REDACTED]');
    expect(result).not.toContain('xyz789');
  });

  it('redacts verificationToken query parameter', () => {
    const result = sanitizeUrl('/auth/verify?verificationToken=abc');
    expect(result).toBe('/auth/verify?verificationToken=[REDACTED]');
  });

  it('redacts accessToken and refreshToken', () => {
    const result = sanitizeUrl('/api/auth/refresh?accessToken=eyJhbG&refreshToken=eyJhbG');
    expect(result).toContain('accessToken=[REDACTED]');
    expect(result).toContain('refreshToken=[REDACTED]');
    expect(result).not.toContain('eyJhbG');
  });

  it('redacts credential parameter (Google token)', () => {
    const result = sanitizeUrl('/api/auth/google-login?credential=google-jwt-token');
    expect(result).toBe('/api/auth/google-login?credential=[REDACTED]');
  });

  it('redacts apiKey and key parameters', () => {
    const result = sanitizeUrl('/api/data?apiKey=sk-123&key=456');
    expect(result).toContain('apiKey=[REDACTED]');
    expect(result).toContain('key=[REDACTED]');
  });

  it('redacts secret parameter', () => {
    const result = sanitizeUrl('/api/config?secret=super-secret-value');
    expect(result).toBe('/api/config?secret=[REDACTED]');
  });

  it('redacts code parameter (OAuth callback)', () => {
    const result = sanitizeUrl('/callback?code=oauth-code-123');
    expect(result).toBe('/callback?code=[REDACTED]');
  });

  it('redacts password query parameter', () => {
    const result = sanitizeUrl('/api/auth/reset-password?token=t1&password=newpass');
    expect(result).toContain('token=[REDACTED]');
    expect(result).toContain('password=[REDACTED]');
  });

  it('redacts case-insensitive sensitive keys (TOKEN, Token)', () => {
    const result = sanitizeUrl('/auth?TOKEN=abc&Token=def&email=g@h.com');
    expect(result).toContain('TOKEN=[REDACTED]');
    expect(result).toContain('Token=[REDACTED]');
    expect(result).toContain('email=[REDACTED]');
  });

  it('preserves non-sensitive query parameters', () => {
    const result = sanitizeUrl('/api/products?page=2&limit=20&category=phones');
    expect(result).toBe('/api/products?page=2&limit=20&category=phones');
  });

  it('preserves URL without query string unchanged', () => {
    const result = sanitizeUrl('/api/health');
    expect(result).toBe('/api/health');
  });

  it('handles empty input gracefully', () => {
    expect(sanitizeUrl('')).toBe('/');
    expect(sanitizeUrl(null)).toBe('/');
    expect(sanitizeUrl(undefined)).toBe('/');
  });

  it('redacts repeated sensitive parameters', () => {
    const result = sanitizeUrl('/auth?token=a&token=b&email=c');
    expect(result).toBe('/auth?token=[REDACTED]&token=[REDACTED]&email=[REDACTED]');
  });
});
