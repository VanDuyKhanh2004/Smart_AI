"use strict";

const { verifyCsrfToken } = require("../utils/csrf");
const { timingSafeEqualStrings } = require("../utils/tokenHash");
const { isOriginAllowed } = require("../configs/frontendConfig");
const { REFRESH_COOKIE_NAME } = require("../configs/authCookies");
const {
  CSRF_COOKIE_NAME,
  getCookie,
  getBearerToken,
  isCookieAuthenticatedRequest,
} = require("./cookieAuth");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const REFRESH_PATH = "/api/auth/refresh";

// Public auth endpoints are exempt during Wave 1. Login/register are public and
// their CSRF enforcement is deferred to Wave 2, when the frontend can always
// send X-CSRF-Token. `/api/auth/refresh` is listed for the legacy body-token
// client only: the cookie refresh path is enforced separately below and never
// inherits this exemption.
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

/**
 * The legacy frontend sends the refresh token in the JSON body and never
 * relies on the HttpOnly refresh cookie. That path keeps its documented
 * transition exception from CSRF, while a cookie-only refresh is protected.
 *
 * The controller gives the body token precedence, so a request that carries a
 * body token cannot use the cookie refresh path (and vice versa).
 */
function isLegacyBodyRefresh(req) {
  return Boolean(
    req.body &&
      typeof req.body.refreshToken === "string" &&
      req.body.refreshToken.trim().length > 0,
  );
}

function isCookieRefreshRequest(req) {
  return Boolean(getCookie(req, REFRESH_COOKIE_NAME));
}

function reject(res, code, message) {
  return res.status(403).json({
    success: false,
    error: { code, message },
  });
}

function enforceOriginAndToken(req, res) {
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

  return null;
}

/**
 * CSRF protection for cookie-authenticated unsafe requests.
 *
 * - Safe methods are never blocked.
 * - Cookie-only `/api/auth/refresh` always requires Origin + signed
 *   double-submit token, regardless of being a public endpoint or carrying a
 *   stray Bearer header.
 * - Legacy body-token refresh remains exempt (documented transition).
 * - Bearer-authenticated non-refresh requests are exempt (Wave 1 compat).
 * - Public auth endpoints are exempt (login CSRF is Wave 2).
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

    const path = requestPath(req);

    if (
      path === REFRESH_PATH &&
      isCookieRefreshRequest(req) &&
      !isLegacyBodyRefresh(req)
    ) {
      const rejected = enforceOriginAndToken(req, res);
      return rejected || next();
    }

    if (getBearerToken(req)) {
      return next();
    }

    if (PUBLIC_AUTH_PATHS.has(path)) {
      return next();
    }

    if (!isCookieAuthenticatedRequest(req)) {
      return next();
    }

    const rejected = enforceOriginAndToken(req, res);
    return rejected || next();
  };
}

module.exports = {
  csrfProtection,
  SAFE_METHODS,
  PUBLIC_AUTH_PATHS,
};
