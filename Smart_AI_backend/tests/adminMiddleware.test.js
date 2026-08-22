/* ------------------------------------------------------------------ */
/*  Direct unit tests for middlewares/adminMiddleware.js               */
/*                                                                     */
/*  Tests the REAL adminMiddleware implementation.                     */
/*  No production code is modified.                                    */
/* ------------------------------------------------------------------ */

const { adminMiddleware } = require('../middlewares/adminMiddleware');

function mockReq(user) {
  const req = {};
  if (user !== undefined) req.user = user;
  return req;
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

describe('adminMiddleware', () => {
  it('returns 401 UNAUTHORIZED when req.user is missing', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await adminMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Vui lòng đăng nhập để truy cập',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 FORBIDDEN when user role is not admin', async () => {
    const req = mockReq({ _id: 'u1', role: 'user' });
    const res = mockRes();
    const next = jest.fn();

    await adminMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Bạn không có quyền truy cập chức năng này',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() exactly once when user has admin role', async () => {
    const req = mockReq({ _id: 'u1', role: 'admin' });
    const res = mockRes();
    const next = jest.fn();

    await adminMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
