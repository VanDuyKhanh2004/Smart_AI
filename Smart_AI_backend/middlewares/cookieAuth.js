"use strict";

const { parseCookieHeader } = require("../utils/cookies");
const { timingSafeEqualStrings } = require("../utils/tokenHash");
const {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
} = require("../configs/authCookies");

/**
 * Parse the Cookie request header once and expose it as `req.cookies`.
 * A null-prototype object is used by the parser so arbitrary cookie names
 * cannot mutate the prototype chain.
 */
function parseCookies(req, res, next) {
  if (!req.cookies) {
    req.cookies = parseCookieHeader(req.headers && req.headers.cookie);
  }

  next();
}

function getCookie(req, name) {
  if (!req || !req.cookies) {
    return undefined;
  }

  return req.cookies[name];
}

function getBearerToken(req) {
  const header = req && req.headers && req.headers.authorization;
  if (typeof header !== "string") {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return null;
  }

  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolve the access credential for protect/optionalAuth.
 *
 * Bearer remains the legacy transport and the HttpOnly access cookie is the
 * fallback, but the two are never silently mixed:
 * - Bearer only            -> bearer
 * - cookie only           -> cookie
 * - both, same token      -> both (accepted)
 * - both, different token -> conflict (must be rejected by the caller)
 *
 * A request that explicitly supplies an invalid Bearer token must never fall
 * back to the cookie, so callers only reuse `token` when `conflict` is false.
 */
function resolveAccessCredentials(req) {
  const bearerToken = getBearerToken(req);
  const cookieToken = getCookie(req, ACCESS_COOKIE_NAME) || null;
  const hasBearer = Boolean(bearerToken);
  const hasCookie = Boolean(cookieToken);

  if (hasBearer && hasCookie) {
    const matches = timingSafeEqualStrings(bearerToken, cookieToken);

    return {
      token: bearerToken,
      source: "both",
      hasBearer,
      hasCookie,
      conflict: !matches,
    };
  }

  if (hasBearer) {
    return {
      token: bearerToken,
      source: "bearer",
      hasBearer,
      hasCookie,
      conflict: false,
    };
  }

  if (hasCookie) {
    return {
      token: cookieToken,
      source: "cookie",
      hasBearer,
      hasCookie,
      conflict: false,
    };
  }

  return {
    token: null,
    source: "none",
    hasBearer,
    hasCookie,
    conflict: false,
  };
}

/**
 * Legacy helper kept for callers that only need the token value. Conflict
 * detection must use resolveAccessCredentials(); this returns the Bearer value
 * in the conflicting case and is never sufficient on its own.
 */
function extractAccessToken(req) {
  return resolveAccessCredentials(req).token;
}

function hasAuthCookies(req) {
  return Boolean(
    getCookie(req, ACCESS_COOKIE_NAME) || getCookie(req, REFRESH_COOKIE_NAME),
  );
}

/**
 * True when a request relies on cookies (and therefore needs CSRF + a valid
 * Origin for unsafe methods). A Bearer request is exempt during Wave 1.
 */
function isCookieAuthenticatedRequest(req) {
  return !getBearerToken(req) && hasAuthCookies(req);
}

/**
 * Auth and authenticated responses must never be stored by a browser, proxy or
 * CDN. Responses that depend on cookies also vary on Cookie.
 */
function noStoreAuthResponses(req, res, next) {
  const path = (req.originalUrl || req.url || "").split("?")[0];
  const isAuthRoute = path.startsWith("/api/auth");
  const cookieAuth = hasAuthCookies(req);

  if (isAuthRoute || cookieAuth || getBearerToken(req)) {
    res.set("Cache-Control", "no-store");

    if (cookieAuth && typeof res.vary === "function") {
      res.vary("Cookie");
    }
  }

  next();
}

module.exports = {
  parseCookies,
  getCookie,
  getBearerToken,
  resolveAccessCredentials,
  extractAccessToken,
  hasAuthCookies,
  isCookieAuthenticatedRequest,
  noStoreAuthResponses,
  CSRF_COOKIE_NAME,
};
