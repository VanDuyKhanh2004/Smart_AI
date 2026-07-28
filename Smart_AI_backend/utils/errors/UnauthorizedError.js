const AppError = require('./AppError');

class UnauthorizedError extends AppError {
  constructor(message = 'Vui lòng đăng nhập để truy cập', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

module.exports = UnauthorizedError;
