const AppError = require('./AppError');

class ConflictError extends AppError {
  constructor(message = 'Tài nguyên đã tồn tại', code = 'CONFLICT') {
    super(message, 409, code);
  }
}

module.exports = ConflictError;
