const jwt = require('jsonwebtoken');

/**
 * Generate access token for user
 * @param {Object} user - User object with _id and email
 * @returns {string} JWT access token
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      email: user.email 
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: process.env.JWT_EXPIRE || '15m' 
    }
  );
};

/**
 * Generate refresh token for user
 * @param {Object} user - User object with _id and email
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      email: user.email 
    },
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
 * Verify refresh token
 * @param {string} token - JWT refresh token
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
