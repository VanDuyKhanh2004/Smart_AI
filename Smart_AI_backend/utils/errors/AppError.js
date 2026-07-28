class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = undefined, responseFormat = 'centralized') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.responseFormat = responseFormat;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
