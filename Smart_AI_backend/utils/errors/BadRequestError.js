const AppError = require('./AppError');

class BadRequestError extends AppError {
  constructor(message = 'Dữ liệu không hợp lệ', code = 'VALIDATION_ERROR', details) {
    super(message, 400, code, details);
  }
}

module.exports = BadRequestError;
