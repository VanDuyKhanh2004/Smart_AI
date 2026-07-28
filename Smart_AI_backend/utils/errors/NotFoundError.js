const AppError = require('./AppError');

class NotFoundError extends AppError {
  constructor(message = 'Không tìm thấy tài nguyên', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

module.exports = NotFoundError;
