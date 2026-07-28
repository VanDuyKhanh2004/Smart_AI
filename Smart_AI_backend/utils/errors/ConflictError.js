const AppError = require('./AppError');

class ConflictError extends AppError {
  constructor(message = 'Tài nguyên đã tồn tại', code = 'CONFLICT', responseFormat = 'centralized') {
    super(message, 409, code, undefined, responseFormat);
  }
}

module.exports = ConflictError;
