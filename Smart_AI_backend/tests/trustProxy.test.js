const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const request = require('supertest');
const { MemoryStore } = require('express-rate-limit');

let mockCapturedLog = null;
jest.mock('pino', () => {
  const instance = {
    info: jest.fn((logData) => {
      mockCapturedLog = logData;
    }),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => instance),
  };
  return jest.fn(() => instance);
});

const {
  parseTrustProxyHops,
  trustProxyHops,
  DEFAULT_TRUST_PROXY_HOPS,
  MAX_TRUST_PROXY_HOPS,
} = require('../configs/trustProxy');
const { createRateLimiter } = require('../middlewares/rateLimiters');
const correlationId = require('../middlewares/correlationId');
const requestLogger = require('../middlewares/requestLogger');

describe('parseTrustProxyHops', () => {
  test('defaults to 0 for empty or missing input', () => {
    expect(parseTrustProxyHops(undefined)).toBe(DEFAULT_TRUST_PROXY_HOPS);
    expect(parseTrustProxyHops(null)).toBe(DEFAULT_TRUST_PROXY_HOPS);
    expect(parseTrustProxyHops('')).toBe(DEFAULT_TRUST_PROXY_HOPS);
  });

  test('parses bounded non-negative integer hop counts', () => {
    expect(parseTrustProxyHops('0')).toBe(0);
    expect(parseTrustProxyHops('1')).toBe(1);
    expect(parseTrustProxyHops('2')).toBe(2);
    expect(parseTrustProxyHops(String(MAX_TRUST_PROXY_HOPS))).toBe(MAX_TRUST_PROXY_HOPS);
  });

  test('safely falls back to 0 for invalid, negative, non-integer, or oversized values', () => {
    const invalid = [
      'true',
      'false',
      '1.5',
      '-1',
      'abc',
      'NaN',
      'Infinity',
      String(MAX_TRUST_PROXY_HOPS + 1),
      '999',
    ];
    for (const value of invalid) {
      expect(parseTrustProxyHops(value)).toBe(DEFAULT_TRUST_PROXY_HOPS);
    }
  });

  test('never returns a boolean and never produces an unrestricted trust value', () => {
    for (const value of [undefined, '', 'true', '2']) {
      const result = parseTrustProxyHops(value);
      expect(typeof result).toBe('number');
      expect(Number.isInteger(result)).toBe(true);
      expect(result).not.toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
    }
  });

  test('resolved module value is a bounded integer in test environment', () => {
    expect(Number.isInteger(trustProxyHops)).toBe(true);
    expect(trustProxyHops).toBeGreaterThanOrEqual(0);
    expect(trustProxyHops).toBeLessThanOrEqual(MAX_TRUST_PROXY_HOPS);
    expect(trustProxyHops).not.toBe(true);
  });
});

describe('app.set trust proxy behavior', () => {
  const buildApp = (hops) => {
    const app = express();
    app.set('trust proxy', hops);
    app.get('/', (req, res) => res.json({ ip: req.ip }));
    return app;
  };

  test('no trust proxy uses the socket remote address and ignores X-Forwarded-For', async () => {
    const res = await request(buildApp(0)).get('/');
    expect(res.body.ip).toBe('::ffff:127.0.0.1');
    const withXff = await request(buildApp(0)).get('/').set('X-Forwarded-For', '1.2.3.4');
    expect(withXff.body.ip).toBe('::ffff:127.0.0.1');
  });

  test('bounded trust proxy derives the client IP from a controlled X-Forwarded-For chain', async () => {
    const one = await request(buildApp(1)).get('/').set('X-Forwarded-For', '1.2.3.4');
    expect(one.body.ip).toBe('1.2.3.4');
    const two = await request(buildApp(2))
      .get('/')
      .set('X-Forwarded-For', '1.2.3.4, 5.6.7.8');
    expect(two.body.ip).toBe('1.2.3.4');
  });

  test('a spoofed extra leftmost X-Forwarded-For value cannot bypass the configured hop count', async () => {
    const res = await request(buildApp(2))
      .get('/')
      .set('X-Forwarded-For', 'spoofed.example, 1.2.3.4, 5.6.7.8');
    expect(res.body.ip).toBe('1.2.3.4');
    expect(res.body.ip).not.toBe('spoofed.example');
  });

  test('the configured value is never the unrestricted boolean true', () => {
    const invalid = express();
    invalid.set('trust proxy', parseTrustProxyHops('true'));
    expect(invalid.get('trust proxy')).toBe(0);
    expect(invalid.get('trust proxy')).not.toBe(true);

    const valid = express();
    valid.set('trust proxy', parseTrustProxyHops('2'));
    expect(valid.get('trust proxy')).toBe(2);
    expect(valid.get('trust proxy')).not.toBe(true);
  });
});

describe('rate limiter buckets keyed on the resolved client IP', () => {
  const makeLimiter = () =>
    createRateLimiter({ windowMs: 60000, limit: 2, store: new MemoryStore() });

  test('two different trusted client IPs receive separate buckets', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.get('/limited', makeLimiter(), (req, res) => res.json({ ip: req.ip }));

    const clientA = () => request(app).get('/limited').set('X-Forwarded-For', '1.2.3.4');
    const clientB = () => request(app).get('/limited').set('X-Forwarded-For', '5.6.7.8');

    expect((await clientA()).status).toBe(200);
    expect((await clientA()).status).toBe(200);
    expect((await clientA()).status).toBe(429);
    expect((await clientB()).status).toBe(200);
  });

  test('the same client IP shares one bucket', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.get('/limited', makeLimiter(), (req, res) => res.json({ ip: req.ip }));

    const send = () => request(app).get('/limited').set('X-Forwarded-For', '1.2.3.4');
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
  });
});

describe('login rate limiter alignment', () => {
  test('no longer manually parses X-Forwarded-For and uses req.ip', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'middlewares', 'loginRateLimitMiddleware.js'),
      'utf8',
    );
    expect(source.toLowerCase()).not.toContain('x-forwarded-for');
    expect(source).toContain('req.ip');
  });
});

describe('request logger reports the normalized req.ip', () => {
  test('logs the trust-proxy-resolved client IP', async () => {
    mockCapturedLog = null;
    const app = express();
    app.set('trust proxy', 1);
    app.use(correlationId);
    app.use(requestLogger);
    app.get('/', (req, res) => res.json({ ok: true }));

    const res = await request(app).get('/').set('X-Forwarded-For', '1.2.3.4');
    expect(res.status).toBe(200);
    expect(mockCapturedLog).not.toBeNull();
    expect(mockCapturedLog.ip).toBe('1.2.3.4');
    expect(mockCapturedLog.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
