const AppError = require('./AppError');

class NotFoundError extends AppError {
  constructor(message = 'Không tìm thấy tài nguyên', code = 'NOT_FOUND', responseFormat = 'centralized') {
    super(message, 404, code, undefined, responseFormat);
  }
}

module.exports = NotFoundError;
