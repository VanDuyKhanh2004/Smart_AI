const AppError = require('./AppError');

class RateLimitError extends AppError {
  constructor(message = 'Quá nhiều yêu cầu, vui lòng thử lại sau', code = 'TOO_MANY_REQUESTS', retryAfterSeconds) {
    super(message, 429, code, undefined, 'centralized');
    this.retryAfterSeconds = retryAfterSeconds;
    this.data = retryAfterSeconds !== undefined ? { retryAfterSeconds } : undefined;
  }
}

module.exports = RateLimitError;