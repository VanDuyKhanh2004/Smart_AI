const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');

const VALID_FORMATS = ['centralized', 'legacy-top-level-message'];

const isDevelopment = process.env.NODE_ENV !== 'production';

const resolveFormat = (error, req) => {
  return error.responseFormat || req.errorResponseFormat || 'centralized';
};

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
    details = Object.values(error.errors).map((e) => ({ field: e.path, message: e.message }));
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

  const resolvedFormat = resolveFormat(error, req);
  if (!VALID_FORMATS.includes(resolvedFormat)) {
    log.warn({ resolvedFormat }, 'Unknown error response format, falling back to centralized');
  }

  const format = VALID_FORMATS.includes(resolvedFormat) ? resolvedFormat : 'centralized';

  let body;
  if (format === 'legacy-top-level-message') {
    if (statusCode >= 500) {
      message = 'Đã xảy ra lỗi, vui lòng thử lại';
    }
    body = { success: false, message };
    if (details) {
      body.errors = Array.isArray(details) && details[0] && typeof details[0] === 'object' && 'message' in details[0]
        ? details.map((d) => d.message)
        : details;
    }
  } else {
    if (!isDevelopment && statusCode >= 500) {
      message = 'Lỗi server nội bộ';
      details = undefined;
    }
    body = {
      success: false,
      error: { message, code },
    };
    if (details) {
      body.error.details = details;
    }
    if (!isDevelopment) {
      body.error.timestamp = new Date().toISOString();
    }
  }

  res.status(statusCode).json(body);
};

module.exports = errorHandler;
