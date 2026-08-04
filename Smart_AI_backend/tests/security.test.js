const express = require('express');
const request = require('supertest');
const { rateLimit, MemoryStore } = require('express-rate-limit');

jest.mock('pino', () => {
  const mockInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => mockInstance),
  };
  return jest.fn(() => mockInstance);
});

jest.mock('../controllers/authController', () => ({
  register: (req, res) => res.status(201).json({ ok: 'register' }),
  login: (req, res) => res.json({ ok: 'login' }),
  logout: (req, res) => res.json({ ok: 'logout' }),
  refreshToken: (req, res) => res.json({ ok: 'refresh' }),
  getMe: (req, res) => res.json({ ok: 'me' }),
  googleLogin: (req, res) => res.json({ ok: 'google-login' }),
  linkGoogle: (req, res) => res.json({ ok: 'link-google' }),
  unlinkGoogle: (req, res) => res.json({ ok: 'unlink-google' }),
  verifyEmail: (req, res) => res.json({ ok: 'verify-email' }),
  resendVerification: (req, res) => res.json({ ok: 'resend-verification' }),
  requestPasswordReset: (req, res) => res.json({ ok: 'forgot-password' }),
  resetPassword: (req, res) => res.json({ ok: 'reset-password' }),
  requestUnlockAccount: (req, res) => res.json({ ok: 'request-unlock' }),
  unlockAccount: (req, res) => res.json({ ok: 'unlock-account' }),
  adminUnlockAccount: (req, res) => res.json({ ok: 'admin-unlock' }),
}));

jest.mock('../middlewares/authMiddleware', () => ({
  protect: (req, res, next) => next(),
  optionalAuth: (req, res, next) => next(),
}));

jest.mock('../middlewares/adminMiddleware', () => ({
  adminMiddleware: (req, res, next) => next(),
}));

jest.mock('../controllers/productController', () => ({
  createProduct: (req, res) => res.status(201).json({ ok: 'create' }),
  getAllProducts: (req, res) => res.json({ ok: 'products' }),
  searchSemantic: (req, res) => res.json({ ok: 'semantic' }),
  getProductById: (req, res) => res.json({ ok: 'product' }),
  getRecommendations: (req, res) => res.json({ ok: 'recommendations' }),
  updateProduct: (req, res) => res.json({ ok: 'update' }),
  deleteProduct: (req, res) => res.json({ ok: 'delete' }),
}));

jest.mock('../controllers/healthController', () => ({
  live: (req, res) => res.json({ status: 'ok' }),
  health: (req, res) => res.json({ status: 'ok' }),
  ready: (req, res) => res.json({ status: 'ok' }),
}));

const authRoutes = require('../routes/authRoutes');
const productRoutes = require('../routes/productRoutes');
const healthRoutes = require('../routes/healthRoutes');
const securityHeaders = require('../middlewares/securityHeaders');
const {
  handleRateLimitExceeded,
  resetRateLimiters,
} = require('../middlewares/rateLimiters');
const swaggerSpec = require('../configs/swagger');

const buildApp = () => {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders());
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/health', healthRoutes);
  return app;
};

describe('HTTP security headers (helmet)', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
  });

  it('does not leak the X-Powered-By header', async () => {
    const res = await request(app).get('/api/products');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sends a Content-Security-Policy allowing Google Identity and HTTPS/data/blob images', async () => {
    const res = await request(app).get('/api/products');
    const csp = res.headers['content-security-policy'] || '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('https://accounts.google.com');
    expect(csp).toContain("img-src 'self' data: blob: https:");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-src 'self' https://accounts.google.com");
    expect(csp).toContain("object-src 'none'");
  });

  it('sends COOP same-origin-allow-popups, CORP cross-origin, nosniff, frame, and referrer headers', async () => {
    const res = await request(app).get('/api/products');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['cross-origin-embedder-policy']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('applies a strict CSP with HSTS in production (no unsafe-inline, upgrade-insecure-requests)', async () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const prodApp = buildApp();
      const res = await request(prodApp).get('/api/products');
      const csp = res.headers['content-security-policy'] || '';
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(csp).toMatch(/script-src[^;]*https:\/\/accounts\.google\.com/);
      expect(csp).toContain('upgrade-insecure-requests');
      expect(res.headers['strict-transport-security']).toContain('max-age=15552000');
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe('Content-Security-Policy script-src token separation', () => {
  const parseCsp = (csp) => {
    const directives = {};
    for (const part of csp.split(';')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const sep = trimmed.indexOf(' ');
      if (sep === -1) {
        directives[trimmed] = [];
        continue;
      }
      directives[trimmed.slice(0, sep)] = trimmed
        .slice(sep + 1)
        .split(/\s+/)
        .filter(Boolean);
    }
    return directives;
  };

  it('development script-src contains separate whitespace-delimited tokens and no concatenated sources', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/products');
    const csp = res.headers['content-security-policy'] || '';
    const directives = parseCsp(csp);

    expect(directives['script-src']).toEqual([
      "'self'",
      "'unsafe-inline'",
      'https://accounts.google.com',
      'https://cdn.socket.io',
    ]);
    expect(csp).not.toContain("'unsafe-inline'https://");

    expect(directives['default-src']).toEqual(["'self'"]);
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['img-src']).toEqual(["'self'", 'data:', 'blob:', 'https:']);
    expect(directives['frame-ancestors']).toEqual(["'self'"]);
    expect(csp).not.toContain(';;');
  });

  it('production script-src allows accounts.google.com and excludes unsafe-inline', async () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const prodApp = buildApp();
      const res = await request(prodApp).get('/api/products');
      const csp = res.headers['content-security-policy'] || '';
      const directives = parseCsp(csp);

      expect(directives['script-src']).toEqual(["'self'", 'https://accounts.google.com']);
      expect(directives['script-src']).not.toContain("'unsafe-inline'");
      expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(csp).not.toContain(';;');
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe('Swagger exposure', () => {
  it('serves /api-docs outside of production', () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      expect(swaggerSpec.shouldServeSwagger()).toBe(true);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('does not serve /api-docs in production', () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(swaggerSpec.shouldServeSwagger()).toBe(false);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe('Auth/session limiter (google-login, refresh, verify-email)', () => {
  let app;

  beforeEach(() => {
    resetRateLimiters();
    app = buildApp();
  });

  it('allows 15 requests to POST /api/auth/refresh then returns 429', async () => {
    for (let i = 1; i <= 15; i++) {
      const res = await request(app).post('/api/auth/refresh').send({});
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post('/api/auth/refresh').send({});
    expect(blocked.status).toBe(429);
  });

  it('returns the centralized error shape with Retry-After and standard rate-limit headers on 429', async () => {
    for (let i = 0; i < 15; i++) {
      await request(app).post('/api/auth/refresh').send({});
    }
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(typeof res.body.error.message).toBe('string');
    expect(res.body.error.message.length).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(res.headers['ratelimit-limit']).toBe('15');
    expect(Number(res.headers['ratelimit-remaining'])).toBeGreaterThanOrEqual(0);
    expect(res.headers['ratelimit-reset']).toBeDefined();
  });

  it('exposes standard rate-limit headers on successful requests', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBe('15');
    expect(res.headers['ratelimit-remaining']).toBe('14');
    expect(res.headers['ratelimit-reset']).toBeDefined();
  });

  it('shares one bucket across google-login, refresh, and verify-email', async () => {
    for (let i = 0; i < 14; i++) {
      await request(app).post('/api/auth/refresh').send({});
    }
    const google = await request(app).post('/api/auth/google-login').send({});
    expect(google.status).toBe(200);
    const verify = await request(app).post('/api/auth/verify-email').send({});
    expect(verify.status).toBe(429);
    const verifyGet = await request(app).get('/api/auth/verify-email');
    expect(verifyGet.status).toBe(429);
  });
});

describe('Email-action limiter (resend-verification, forgot-password, request-unlock)', () => {
  let app;

  beforeEach(() => {
    resetRateLimiters();
    app = buildApp();
  });

  it('allows 5 requests to POST /api/auth/resend-verification then returns 429', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/auth/resend-verification').send({});
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post('/api/auth/resend-verification').send({});
    expect(blocked.status).toBe(429);
    expect(blocked.headers['ratelimit-limit']).toBe('5');
  });

  it('shares one bucket across resend-verification, forgot-password, and request-unlock', async () => {
    for (let i = 0; i < 4; i++) {
      await request(app).post('/api/auth/resend-verification').send({});
    }
    const forgot = await request(app).post('/api/auth/forgot-password').send({});
    expect(forgot.status).toBe(200);
    const unlock = await request(app).post('/api/auth/request-unlock').send({});
    expect(unlock.status).toBe(429);
  });
});

describe('Token-action limiter (reset-password, unlock-account)', () => {
  let app;

  beforeEach(() => {
    resetRateLimiters();
    app = buildApp();
  });

  it('allows 10 requests to POST /api/auth/reset-password then returns 429', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/auth/reset-password').send({});
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post('/api/auth/reset-password').send({});
    expect(blocked.status).toBe(429);
    expect(blocked.headers['ratelimit-limit']).toBe('10');
  });

  it('shares one bucket across reset-password and unlock-account', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/reset-password').send({});
    }
    const unlock = await request(app).post('/api/auth/unlock-account').send({});
    expect(unlock.status).toBe(429);
  });
});

describe('Semantic-search limiter', () => {
  let app;

  beforeEach(() => {
    resetRateLimiters();
    app = buildApp();
  });

  it('allows 30 requests to GET /api/products/search/semantic then returns 429', async () => {
    for (let i = 0; i < 30; i++) {
      const res = await request(app).get('/api/products/search/semantic');
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).get('/api/products/search/semantic');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['ratelimit-limit']).toBe('30');
  });
});

describe('Unaffected public endpoints', () => {
  let app;

  beforeEach(() => {
    resetRateLimiters();
    app = buildApp();
  });

  it('does not rate limit normal product reads', async () => {
    for (let i = 0; i < 40; i++) {
      const list = await request(app).get('/api/products');
      expect(list.status).toBe(200);
      const detail = await request(app).get('/api/products/507f191e810c19729de860ea');
      expect(detail.status).toBe(200);
    }
  });

  it('does not rate limit health endpoints', async () => {
    for (let i = 0; i < 20; i++) {
      const live = await request(app).get('/api/health/live');
      expect(live.status).toBe(200);
      const health = await request(app).get('/api/health');
      expect(health.status).toBe(200);
    }
  });
});

describe('Login endpoint is not double-limited', () => {
  let app;

  beforeEach(() => {
    resetRateLimiters();
    app = buildApp();
  });

  it('does not attach a new generic limiter to POST /api/auth/login', async () => {
    for (let i = 0; i < 25; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'user@test.com', password: 'wrong-password' });
      expect(res.status).toBe(200);
    }
    const refresh = await request(app).post('/api/auth/refresh').send({});
    expect(refresh.status).toBe(200);
  });
});

describe('Rate-limit counter isolation', () => {
  beforeEach(() => {
    resetRateLimiters();
  });

  it('buckets counters per client key so one client cannot exhaust another client quota', async () => {
    const app = express();
    const limiter = rateLimit({
      windowMs: 60000,
      limit: 2,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.headers['x-test-client'] || 'default-client',
      handler: handleRateLimitExceeded,
      store: new MemoryStore(),
    });
    app.get('/limited', limiter, (req, res) => res.json({ ok: true }));

    const clientA = () => request(app).get('/limited').set('X-Test-Client', 'client-a');
    const clientB = () => request(app).get('/limited').set('X-Test-Client', 'client-b');

    expect((await clientA()).status).toBe(200);
    expect((await clientA()).status).toBe(200);
    expect((await clientA()).status).toBe(429);
    expect((await clientB()).status).toBe(200);
  });

  it('keeps separate limiter groups independent', async () => {
    const app = buildApp();
    for (let i = 0; i < 15; i++) {
      await request(app).post('/api/auth/refresh').send({});
    }
    const blockedRefresh = await request(app).post('/api/auth/refresh').send({});
    expect(blockedRefresh.status).toBe(429);
    const resend = await request(app).post('/api/auth/resend-verification').send({});
    expect(resend.status).toBe(200);
    const semantic = await request(app).get('/api/products/search/semantic');
    expect(semantic.status).toBe(200);
  });
});

describe('Sensitive data leakage', () => {
  let app;

  beforeEach(() => {
    resetRateLimiters();
    app = buildApp();
  });

  it('does not echo tokens, credentials, or request bodies in 429 responses', async () => {
    const secret = 'SUPERSECRET-TOKEN-abc123';
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/resend-verification')
        .set('Authorization', `Bearer ${secret}`)
        .set('X-Request-ID', 'security-test-request-id')
        .send({ email: 'user@test.com', refreshToken: secret, password: secret });
    }
    const blocked = await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', `Bearer ${secret}`)
      .set('X-Request-ID', 'security-test-request-id')
      .send({ email: 'user@test.com', refreshToken: secret, password: secret });

    expect(blocked.status).toBe(429);
    expect(JSON.stringify(blocked.body)).not.toContain(secret);
    expect(JSON.stringify(blocked.headers)).not.toContain(secret);
  });
});
