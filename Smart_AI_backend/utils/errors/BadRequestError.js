const AppError = require('./AppError');

class BadRequestError extends AppError {
  constructor(message = 'Dữ liệu không hợp lệ', code = 'VALIDATION_ERROR', details, responseFormat = 'centralized') {
    super(message, 400, code, details, responseFormat);
  }
}

module.exports = BadRequestError;
