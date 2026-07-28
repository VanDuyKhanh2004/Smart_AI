/* ============================================================
   Error Handling Infrastructure Tests
   ============================================================ */

const {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} = require('../utils/errors');

const asyncHandler = require('../utils/asyncHandler');
const errorHandler = require('../middlewares/errorHandler');

// ============================================================
// Part 1 — Error Classes
// ============================================================

describe('AppError', () => {
  it('creates an error with default values', () => {
    const err = new AppError('Something went wrong');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Something went wrong');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.isOperational).toBe(true);
  });

  it('creates an error with custom statusCode and code', () => {
    const err = new AppError('Not found', 404, 'NOT_FOUND');
    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('creates an error with details', () => {
    const err = new AppError('Validation failed', 400, 'VALIDATION_ERROR', ['field1 is required']);
    expect(err.details).toEqual(['field1 is required']);
  });

  it('preserves stack trace', () => {
    const err = new AppError('Test');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('Error');
  });
});

describe('BadRequestError', () => {
  it('has default statusCode 400', () => {
    const err = new BadRequestError();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Dữ liệu không hợp lệ');
  });

  it('accepts custom message and code', () => {
    const err = new BadRequestError('Invalid ID', 'INVALID_ID');
    expect(err.message).toBe('Invalid ID');
    expect(err.code).toBe('INVALID_ID');
  });
});

describe('UnauthorizedError', () => {
  it('has default statusCode 401', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });
});

describe('ForbiddenError', () => {
  it('has default statusCode 403', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });
});

describe('NotFoundError', () => {
  it('has default statusCode 404', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('accepts custom code', () => {
    const err = new NotFoundError('Complaint not found', 'COMPLAINT_NOT_FOUND');
    expect(err.message).toBe('Complaint not found');
    expect(err.code).toBe('COMPLAINT_NOT_FOUND');
  });
});

describe('ConflictError', () => {
  it('has default statusCode 409', () => {
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });
});

// ============================================================
// Part 2 — asyncHandler
// ============================================================

describe('asyncHandler', () => {
  it('calls the handler and sends response on success', async () => {
    const handler = asyncHandler(async (req, res) => {
      res.json({ ok: true });
    });

    const req = {};
    const res = { json: jest.fn() };
    const next = jest.fn();

    await handler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards rejected promise to next(error)', async () => {
    const testError = new Error('async error');
    const handler = asyncHandler(async () => {
      throw testError;
    });

    const req = {};
    const res = {};
    const next = jest.fn();

    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(testError);
  });

  it('forwards rejected promise from async operation', (done) => {
    const testError = new Error('db error');
    const handler = asyncHandler(async () => {
      await Promise.reject(testError);
    });

    const req = {};
    const res = {};
    const next = jest.fn((err) => {
      expect(err).toBe(testError);
      done();
    });

    handler(req, res, next);
  });
});

// ============================================================
// Part 3 — errorHandler Middleware
// ============================================================

describe('errorHandler', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { requestId: 'test-request-id', logger: { warn: jest.fn(), error: jest.fn() } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      headersSent: false,
    };
    next = jest.fn();
  });

  it('delegates to next(error) if headersSent', () => {
    res.headersSent = true;
    const error = new Error('test');
    errorHandler(error, req, res, next);
    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('maps AppError to correct status and code', () => {
    const error = new NotFoundError('Not found', 'CUSTOM_NOT_FOUND');
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { message: 'Not found', code: 'CUSTOM_NOT_FOUND' },
    });
  });

  it('maps BadRequestError to 400', () => {
    const error = new BadRequestError('Invalid', 'INVALID_INPUT', ['field x is wrong']);
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { message: 'Invalid', code: 'INVALID_INPUT', details: ['field x is wrong'] },
    });
  });

  it('maps unauthorized error with correct status', () => {
    const error = new UnauthorizedError();
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { message: 'Vui lòng đăng nhập để truy cập', code: 'UNAUTHORIZED' },
    });
  });

  it('maps forbidden error with correct status', () => {
    const error = new ForbiddenError();
    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  describe('Mongoose error normalization', () => {
    it('maps ValidationError to 400', () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      error.errors = {
        name: { message: 'Name is required' },
        email: { message: 'Email is invalid' },
      };

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Dữ liệu không hợp lệ',
          code: 'VALIDATION_ERROR',
          details: ['Name is required', 'Email is invalid'],
        },
      });
    });

    it('maps CastError to 400', () => {
      const error = new Error('Cast to ObjectId failed');
      error.name = 'CastError';

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'ID không hợp lệ', code: 'INVALID_ID' },
      });
    });

    it('maps duplicate key error (11000) to 409', () => {
      const error = new Error('E11000 duplicate key');
      error.code = 11000;

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Tài nguyên đã tồn tại', code: 'DUPLICATE_KEY' },
      });
    });
  });

  describe('JWT error normalization', () => {
    it('maps TokenExpiredError to 401', () => {
      const error = new Error('jwt expired');
      error.name = 'TokenExpiredError';

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Token đã hết hạn', code: 'TOKEN_EXPIRED' },
      });
    });

    it('maps JsonWebTokenError to 401', () => {
      const error = new Error('invalid token');
      error.name = 'JsonWebTokenError';

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Token không hợp lệ', code: 'INVALID_TOKEN' },
      });
    });
  });

  describe('Unknown errors', () => {
    const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    });

    it('returns generic 500 for unknown errors in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Database connection timeout');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Lỗi server nội bộ', code: 'INTERNAL_ERROR' },
      });
    });

    it('preserves original message in development/test', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Specific debug message');
      error.code = 11000;

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: { message: 'Tài nguyên đã tồn tại', code: 'DUPLICATE_KEY' },
      });
    });
  });

  describe('Logging', () => {
    it('logs 5xx errors at error level', () => {
      const error = new Error('server crash');
      errorHandler(error, req, res, next);

      expect(req.logger.error).toHaveBeenCalled();
    });

    it('logs 4xx errors at warn level', () => {
      const error = new BadRequestError('bad input');
      errorHandler(error, req, res, next);

      expect(req.logger.warn).toHaveBeenCalled();
    });

    it('includes requestId in log context', () => {
      const error = new AppError('test', 500);
      errorHandler(error, req, res, next);

      expect(req.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'test-request-id' }),
        expect.any(String),
      );
    });
  });
});

// ============================================================
// Part 4 — notFoundHandler
// ============================================================

describe('notFoundHandler', () => {
  const notFoundHandler = require('../middlewares/notFoundHandler');

  it('returns 404 with not-found message', () => {
    const req = {
      originalUrl: '/api/nonexistent',
      method: 'GET',
      requestId: 'test-id',
      logger: { warn: jest.fn() },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    notFoundHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { message: 'Route /api/nonexistent not found', code: 'NOT_FOUND' },
    });
  });

  it('strips query string from path in message', () => {
    const req = {
      originalUrl: '/api/test?foo=bar',
      method: 'GET',
      requestId: 'test-id',
      logger: { warn: jest.fn() },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    notFoundHandler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { message: 'Route /api/test not found', code: 'NOT_FOUND' },
    });
  });
});

// ============================================================
// Part 5 — Integration with Express app
// ============================================================

describe('Error handling integration', () => {
  const express = require('express');
  const request = require('supertest');
  const notFoundHandler = require('../middlewares/notFoundHandler');
  const errorHandler = require('../middlewares/errorHandler');

  function buildApp() {
    const app = express();
    app.use(express.json());

    app.get('/api/ok', (req, res) => res.json({ ok: true }));
    app.get('/api/throw-app-error', () => { throw new NotFoundError('Item not found', 'ITEM_NOT_FOUND'); });
    app.get('/api/throw-generic', () => { throw new Error('raw error'); });

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
  }

  let app;

  beforeAll(() => {
    app = buildApp();
  });

  it('returns 200 for known routes', async () => {
    const res = await request(app).get('/api/ok').expect(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/unknown').expect(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('maps AppError to correct status via global errorHandler', async () => {
    const res = await request(app).get('/api/throw-app-error').expect(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe('Item not found');
    expect(res.body.error.code).toBe('ITEM_NOT_FOUND');
  });

  it('returns generic 500 for unknown errors', async () => {
    const res = await request(app).get('/api/throw-generic').expect(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('health-like route unaffected', async () => {
    const res = await request(app).get('/api/ok').expect(200);
    expect(res.body.ok).toBe(true);
  });
});
