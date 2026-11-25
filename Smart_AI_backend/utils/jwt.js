const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const REFRESH_TOKEN_TYPE = 'refresh';

/**
 * Generate access token for user
 * @param {Object} user - User object with _id and email
 * @returns {string} JWT access token
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      email: user.email,
      tokenVersion: user.tokenVersion ?? 0
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRE || '15m' 
    }
  );
};

/**
 * Generate refresh token for user.
 *
 * `jti` guarantees a new token even when two tokens are requested within the
 * same second, `type` prevents an access token from being replayed at the
 * refresh endpoint, and `sid` binds the token to the user's single session.
 *
 * @param {Object} user - User object with _id and email
 * @param {Object} [options]
 * @param {string} [options.sessionId] - Session id to bind the token to
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (user, { sessionId } = {}) => {
  const payload = {
    id: user._id,
    email: user.email,
    tokenVersion: user.tokenVersion ?? 0,
    jti: crypto.randomUUID(),
    type: REFRESH_TOKEN_TYPE,
  };

  if (sessionId) {
    payload.sid = sessionId;
  }

  return jwt.sign(
    payload,
    process.env.JWT_REFRESH_SECRET,
    { 
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' 
    }
  );
};

/**
 * Verify access token
 * @param {string} token - JWT access token
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Verify refresh token and enforce its token type. Tokens without
 * `type: "refresh"` (including access tokens and pre-rotation legacy tokens)
 * are rejected.
 *
 * @param {string} token - JWT refresh token
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid, expired, or not a refresh token
 */
const verifyRefreshToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

  if (!decoded || decoded.type !== REFRESH_TOKEN_TYPE) {
    const error = new Error('Invalid refresh token type');
    error.name = 'InvalidTokenTypeError';
    throw error;
  }

  return decoded;
};

module.exports = {
  REFRESH_TOKEN_TYPE,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
