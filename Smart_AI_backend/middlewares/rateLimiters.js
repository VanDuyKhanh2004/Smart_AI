const { rateLimit, MemoryStore, ipKeyGenerator } = require('express-rate-limit');

const WINDOW_MINUTES = 15;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

const readLimit = (envName, fallback) => {
  const parsed = Number(process.env[envName]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const handleRateLimitExceeded = (req, res, _next, options) => {
  res.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)));
  res.status(options.statusCode).json({
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Ban da gui qua nhieu yeu cau. Vui long thu lai sau.',
    },
  });
};

const createRateLimiter = ({ windowMs, limit, store }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) =>
      ipKeyGenerator(req.ip || req.socket?.remoteAddress || '0.0.0.0'),
    handler: handleRateLimitExceeded,
    store,
  });

const stores = {
  authSession: new MemoryStore(),
  emailAction: new MemoryStore(),
  tokenAction: new MemoryStore(),
  semanticSearch: new MemoryStore(),
};

const authSessionLimiter = createRateLimiter({
  windowMs: WINDOW_MS,
  limit: readLimit('RATE_LIMIT_AUTH_SESSION_MAX', 15),
  store: stores.authSession,
});

const emailActionLimiter = createRateLimiter({
  windowMs: WINDOW_MS,
  limit: readLimit('RATE_LIMIT_EMAIL_ACTION_MAX', 5),
  store: stores.emailAction,
});

const tokenActionLimiter = createRateLimiter({
  windowMs: WINDOW_MS,
  limit: readLimit('RATE_LIMIT_TOKEN_ACTION_MAX', 10),
  store: stores.tokenAction,
});

const semanticSearchLimiter = createRateLimiter({
  windowMs: WINDOW_MS,
  limit: readLimit('RATE_LIMIT_SEMANTIC_SEARCH_MAX', 30),
  store: stores.semanticSearch,
});

const resetRateLimiters = () => {
  Object.values(stores).forEach((store) => {
    if (typeof store.resetAll === 'function') {
      store.resetAll();
    }
  });
};

module.exports = {
  createRateLimiter,
  authSessionLimiter,
  emailActionLimiter,
  tokenActionLimiter,
  semanticSearchLimiter,
  resetRateLimiters,
  handleRateLimitExceeded,
};
