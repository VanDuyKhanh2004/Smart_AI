"use strict";

const { parseCookieHeader } = require("../utils/cookies");
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
 * Access token resolution for protect/optionalAuth. Bearer remains the legacy
 * transport and always wins; the HttpOnly access cookie is the fallback.
 */
function extractAccessToken(req) {
  return getBearerToken(req) || getCookie(req, ACCESS_COOKIE_NAME) || null;
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
  extractAccessToken,
  hasAuthCookies,
  isCookieAuthenticatedRequest,
  noStoreAuthResponses,
  CSRF_COOKIE_NAME,
};
