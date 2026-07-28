const AppError = require('./AppError');

class UnauthorizedError extends AppError {
  constructor(message = 'Vui lòng đăng nhập để truy cập', code = 'UNAUTHORIZED', responseFormat = 'centralized') {
    super(message, 401, code, undefined, responseFormat);
  }
}

module.exports = UnauthorizedError;
