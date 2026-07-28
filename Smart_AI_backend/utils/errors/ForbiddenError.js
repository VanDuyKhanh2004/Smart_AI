const AppError = require('./AppError');

class ForbiddenError extends AppError {
  constructor(message = 'Bạn không có quyền truy cập chức năng này', code = 'FORBIDDEN', responseFormat = 'centralized') {
    super(message, 403, code, undefined, responseFormat);
  }
}

module.exports = ForbiddenError;
