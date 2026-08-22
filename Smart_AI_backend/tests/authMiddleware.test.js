/* ------------------------------------------------------------------ */
/*  Direct unit tests for middlewares/authMiddleware.js                */
/*                                                                     */
/*  Tests the REAL protect and optionalAuth implementations.           */
/*  Mocks: User model, jwt.verifyAccessToken, logger.                  */
/*  No production code is modified.                                    */
/* ------------------------------------------------------------------ */

jest.mock('../models/User', () => ({
  findById: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  error: jest.fn(),
}));

const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');
const logger = require('../utils/logger');
const { protect, optionalAuth } = require('../middlewares/authMiddleware');

jest.mock('../utils/jwt', () => ({
  verifyAccessToken: jest.fn(),
}));

function mockReq({ authorization } = {}) {
  const headers = {};
  if (authorization !== undefined) headers.authorization = authorization;
  return { headers, requestId: 'test-req-1' };
}

function mockRes() {
  const res = { _status: null, _body: null };
  res.status = jest.fn((code) => { res._status = code; return res; });
  res.json = jest.fn((body) => { res._body = body; return res; });
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

/* ======================== protect ======================== */

describe('protect', () => {
  it('returns 401 TOKEN_EXPIRED when verifyAccessToken throws TokenExpiredError', async () => {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    verifyAccessToken.mockImplementation(() => { throw err; });

    const req = mockReq({ authorization: 'Bearer expired-token' });
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'TOKEN_EXPIRED', message: 'Token đã hết hạn' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 UNAUTHORIZED when verifyAccessToken succeeds but User.findById returns null', async () => {
    verifyAccessToken.mockReturnValue({ id: 'user-not-exist', email: 'x@test.com' });
    User.findById.mockResolvedValue(null);

    const req = mockReq({ authorization: 'Bearer valid-token' });
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Người dùng không tồn tại' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 UNAUTHORIZED when Authorization header is not Bearer', async () => {
    const req = mockReq({ authorization: 'Basic abc123' });
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập để truy cập' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 UNAUTHORIZED when Authorization is "Bearer " (empty token)', async () => {
    const req = mockReq({ authorization: 'Bearer ' });
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập để truy cập' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 SERVER_ERROR when User.findById throws', async () => {
    verifyAccessToken.mockReturnValue({ id: 'user-1', email: 'u@test.com' });
    User.findById.mockRejectedValue(new Error('db connection lost'));

    const req = mockReq({ authorization: 'Bearer valid-token' });
    const res = mockRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Lỗi server' },
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Auth middleware error',
    );
    expect(next).not.toHaveBeenCalled();
  });
});

/* ======================== optionalAuth ======================== */

describe('optionalAuth', () => {
  it('calls next() without req.user when no token', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });

  it('attaches req.user when token and user are valid', async () => {
    const fakeUser = { _id: 'u1', email: 'a@b.com', role: 'user' };
    verifyAccessToken.mockReturnValue({ id: 'u1', email: 'a@b.com' });
    User.findById.mockResolvedValue(fakeUser);

    const req = mockReq({ authorization: 'Bearer good-token' });
    const res = mockRes();
    const next = jest.fn();

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBe(fakeUser);
  });

  it('calls next() without req.user when token is invalid', async () => {
    verifyAccessToken.mockImplementation(() => { throw new Error('jwt malformed'); });

    const req = mockReq({ authorization: 'Bearer bad-token' });
    const res = mockRes();
    const next = jest.fn();

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
  });
});
