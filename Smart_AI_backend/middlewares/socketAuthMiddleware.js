const User = require('../models/User');
const { verifyAccessToken } = require('../utils/jwt');
const logger = require('../utils/logger');

const SOCKET_AUTH_REQUIRED = 'SOCKET_AUTH_REQUIRED';
const SOCKET_AUTH_INVALID = 'SOCKET_AUTH_INVALID';
const SOCKET_AUTH_EXPIRED = 'SOCKET_AUTH_EXPIRED';
const SOCKET_USER_NOT_FOUND = 'SOCKET_USER_NOT_FOUND';

const createAuthError = (code, message) => {
  const err = new Error(message);
  err.data = { code };
  return err;
};

const extractToken = (socket) => {
  const auth = socket.handshake && socket.handshake.auth;
  if (auth && typeof auth.token === 'string' && auth.token.length > 0) {
    return auth.token;
  }

  const authorization = socket.handshake && socket.handshake.headers && socket.handshake.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice(7).trim();
  }

  return null;
};

/**
 * Socket.IO handshake authentication middleware.
 * Requires a valid access token via `socket.handshake.auth.token` or an
 * `Authorization: Bearer <token>` header. Access tokens are verified with the
 * same secret as REST endpoints; refresh tokens are rejected.
 * On success, `socket.data.user` is populated with `{ id, email, role }` only.
 */
const authenticateSocket = async (socket, next) => {
  const token = extractToken(socket);

  if (!token) {
    return next(createAuthError(SOCKET_AUTH_REQUIRED, 'Socket authentication required'));
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      return next(createAuthError(SOCKET_AUTH_EXPIRED, 'Socket access token expired'));
    }
    return next(createAuthError(SOCKET_AUTH_INVALID, 'Socket access token invalid'));
  }

  try {
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(createAuthError(SOCKET_USER_NOT_FOUND, 'Socket user not found'));
    }

    socket.data.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    return next();
  } catch (error) {
    logger.error({ err: error }, 'Socket user lookup failed');
    return next(createAuthError(SOCKET_AUTH_INVALID, 'Socket authentication failed'));
  }
};

module.exports = {
  authenticateSocket,
  SOCKET_AUTH_REQUIRED,
  SOCKET_AUTH_INVALID,
  SOCKET_AUTH_EXPIRED,
  SOCKET_USER_NOT_FOUND,
};
