const { rateLimit, MemoryStore, ipKeyGenerator } = require('express-rate-limit');

const WINDOW_MINUTES = 15;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

const DEFAULT_RATE_LIMIT_CODE = 'TOO_MANY_REQUESTS';
const DEFAULT_RATE_LIMIT_MESSAGE = 'Ban da gui qua nhieu yeu cau. Vui long thu lai sau.';

const readLimit = (envName, fallback) => {
  const parsed = Number(process.env[envName]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const makeRateLimitHandler = ({ code = DEFAULT_RATE_LIMIT_CODE, message = DEFAULT_RATE_LIMIT_MESSAGE } = {}) =>
  (req, res, _next, options) => {
    res.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)));
    res.status(options.statusCode).json({
      success: false,
      error: { code, message },
    });
  };

const handleRateLimitExceeded = makeRateLimitHandler();

const createRateLimiter = ({ windowMs, limit, store, code, message }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) =>
      ipKeyGenerator(req.ip || req.socket?.remoteAddress || '0.0.0.0'),
    handler: makeRateLimitHandler({ code, message }),
    store,
  });

// Per-user order creation store — declared before `stores` so it can be referenced.
const orderCreationStore = new MemoryStore();

// Per-admin-user store for admin endpoint rate limiting.
const adminStore = new MemoryStore();

const stores = {
  authSession: new MemoryStore(),
  registration: new MemoryStore(),
  emailAction: new MemoryStore(),
  resendVerification: new MemoryStore(),
  tokenAction: new MemoryStore(),
  semanticSearch: new MemoryStore(),
  orderCreation: orderCreationStore,
  admin: adminStore,
};

const authSessionLimiter = createRateLimiter({
  windowMs: WINDOW_MS,
  limit: readLimit('RATE_LIMIT_AUTH_SESSION_MAX', 15),
  store: stores.authSession,
});

const registrationLimiter = createRateLimiter({
  windowMs: WINDOW_MS,
  limit: readLimit('RATE_LIMIT_REGISTRATION_MAX', 5),
  store: stores.registration,
});

const emailActionLimiter = createRateLimiter({
  windowMs: WINDOW_MS,
  limit: readLimit('RATE_LIMIT_EMAIL_ACTION_MAX', 5),
  store: stores.emailAction,
});

// Coarse per-IP abuse wrapper for the resend-verification route. Its threshold
// must stay clearly above the per-account 5-successful-resends/15-min policy so
// a legitimate account can always reach the account-level limiter.
const resendVerificationLimiter = createRateLimiter({
  windowMs: WINDOW_MS,
  limit: readLimit('RATE_LIMIT_RESEND_VERIFICATION_MAX', 30),
  store: stores.resendVerification,
  code: 'VERIFICATION_EMAIL_IP_RATE_LIMITED',
  message: 'Ban da gui qua nhieu yeu cau gui lai email xac nhan. Vui long thu lai sau.',
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

// Per-user order creation limiter — keyed on authenticated user ID, not IP.
// Requires the `protect` middleware to have run first so req.user is available.
const orderCreationLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: readLimit('RATE_LIMIT_ORDER_CREATION_MAX', 5),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user && req.user._id;
    if (!userId) return '_anonymous_fallback';
    return `user:${userId}`;
  },
  handler: makeRateLimitHandler({
    code: 'ORDER_CREATION_RATE_LIMITED',
    message: 'Ban da tao qua nhieu don hang. Vui long thu lai sau.',
  }),
  store: orderCreationStore,
});

// Per-admin-user rate limiter — keyed on authenticated user ID, not IP.
// Requires the `protect` middleware to have run first so req.user is available.
// Covers all admin-only endpoints: CRUD operations, dashboard aggregations,
// and security-sensitive actions like admin-unlock.
const adminLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: readLimit('RATE_LIMIT_ADMIN_MAX', 120),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user && req.user._id;
    if (!userId) return '_anonymous_fallback';
    return `user:${userId}`;
  },
  handler: makeRateLimitHandler({
    code: 'ADMIN_RATE_LIMITED',
    message: 'Ban da gui qua nhieu yeu cau admin. Vui long thu lai sau.',
  }),
  store: adminStore,
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
  registrationLimiter,
  emailActionLimiter,
  resendVerificationLimiter,
  tokenActionLimiter,
  semanticSearchLimiter,
  orderCreationLimiter,
  adminLimiter,
  resetRateLimiters,
  handleRateLimitExceeded,
};
