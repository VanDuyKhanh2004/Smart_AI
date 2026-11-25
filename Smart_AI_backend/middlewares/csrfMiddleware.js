"use strict";

const { verifyCsrfToken } = require("../utils/csrf");
const { timingSafeEqualStrings } = require("../utils/tokenHash");
const { isOriginAllowed } = require("../configs/frontendConfig");
const {
  CSRF_COOKIE_NAME,
  getCookie,
  getBearerToken,
  isCookieAuthenticatedRequest,
} = require("./cookieAuth");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Public auth endpoints are exempt during Wave 1. Login/register are public and
// their CSRF enforcement is deferred to Wave 2, when the frontend can always
// send X-CSRF-Token. `/api/auth/refresh` must stay usable by the legacy
// body-token client and by the cookie client (which sends its signed cookie).
const PUBLIC_AUTH_PATHS = new Set([
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/google-login",
  "/api/auth/refresh",
  "/api/auth/verify-email",
  "/api/auth/resend-verification",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/request-unlock",
  "/api/auth/unlock-account",
  "/api/auth/csrf",
]);

function requestPath(req) {
  return (req.originalUrl || req.url || "").split("?")[0];
}

function reject(res, code, message) {
  return res.status(403).json({
    success: false,
    error: { code, message },
  });
}

/**
 * CSRF protection for cookie-authenticated unsafe requests.
 *
 * - Safe methods are never blocked.
 * - Bearer-authenticated requests are exempt (legacy Wave 1 compatibility).
 * - Public auth endpoints are exempt (transitional; login CSRF is Wave 2).
 * - Requests without an auth cookie are not cookie-authenticated and pass
 *   through to the route/middleware that will decide whether auth is required.
 * - Cookie-authenticated unsafe requests require both an exact allowlisted
 *   Origin and a signed double-submit token whose header matches the cookie.
 */
function csrfProtection() {
  return function csrfMiddleware(req, res, next) {
    if (SAFE_METHODS.has(req.method)) {
      return next();
    }

    if (getBearerToken(req)) {
      return next();
    }

    if (PUBLIC_AUTH_PATHS.has(requestPath(req))) {
      return next();
    }

    if (!isCookieAuthenticatedRequest(req)) {
      return next();
    }

    const origin = req.headers && req.headers.origin;
    if (!origin || !isOriginAllowed(origin)) {
      return reject(
        res,
        "CSRF_ORIGIN_INVALID",
        "Yêu cầu không đến từ origin được phép",
      );
    }

    const headerToken = req.headers && req.headers["x-csrf-token"];
    const cookieToken = getCookie(req, CSRF_COOKIE_NAME);

    if (
      typeof headerToken !== "string" ||
      typeof cookieToken !== "string" ||
      !timingSafeEqualStrings(headerToken, cookieToken) ||
      !verifyCsrfToken(cookieToken)
    ) {
      return reject(
        res,
        "CSRF_TOKEN_INVALID",
        "CSRF token không hợp lệ hoặc bị thiếu",
      );
    }

    return next();
  };
}

module.exports = {
  csrfProtection,
  SAFE_METHODS,
  PUBLIC_AUTH_PATHS,
};
