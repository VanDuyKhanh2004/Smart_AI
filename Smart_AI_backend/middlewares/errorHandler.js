const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

const isDevelopment = process.env.NODE_ENV !== 'production';

const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const log = req.logger || logger;

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Lỗi server nội bộ';
  let details = undefined;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error.name === 'ValidationError' && error.errors) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Dữ liệu không hợp lệ';
    details = Object.values(error.errors).map((e) => e.message);
  } else if (error.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'ID không hợp lệ';
  } else if (error.code === 11000 || error.code === 11001) {
    statusCode = 409;
    code = 'DUPLICATE_KEY';
    message = 'Tài nguyên đã tồn tại';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Token đã hết hạn';
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Token không hợp lệ';
  }

  const correlationId = req.requestId;

  if (statusCode >= 500) {
    log.error(
      { err: error, requestId: correlationId, statusCode },
      error.message || 'Internal server error',
    );
  } else if (statusCode >= 400) {
    log.warn(
      { err: error, requestId: correlationId, statusCode, code },
      error.message || 'Client error',
    );
  }

  if (!isDevelopment && statusCode >= 500) {
    message = 'Lỗi server nội bộ';
    details = undefined;
  }

  const body = {
    success: false,
    error: { message, code },
  };

  if (details) {
    body.error.details = details;
  }

  if (!isDevelopment) {
    body.error.timestamp = new Date().toISOString();
  }

  res.status(statusCode).json(body);
};

module.exports = errorHandler;
