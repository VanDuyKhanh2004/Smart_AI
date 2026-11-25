"use strict";

const crypto = require("crypto");

const ACCESS_COOKIE_NAME = "__sa_access";
const REFRESH_COOKIE_NAME = "__sa_refresh";
const CSRF_COOKIE_NAME = "__sa_csrf";

const ACCESS_COOKIE_PATH = "/api";
const REFRESH_COOKIE_PATH = "/api/auth";
const CSRF_COOKIE_PATH = "/";

const DEFAULT_ACCESS_TTL_MS = 15 * 60 * 1000;
const DEFAULT_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// A rotated-away token is recognised as a concurrent/retry conflict for this
// short window. It is never accepted (no grace period); it only lets the
// second request receive a deterministic 409 instead of destroying the newly
// rotated session. Outside this window an old token is treated as reuse.
const REFRESH_CONFLICT_WINDOW_MS = 10 * 1000;

const DURATION_UNITS_MS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Parse a JWT-style duration ("15m", "7d", "3600", "500ms") into
 * milliseconds. Invalid or non-positive values fall back to the supplied
 * default so cookie lifetime never becomes zero/negative.
 */
function parseDurationToMs(value, fallbackMs) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value * 1000;
  }

  if (typeof value !== "string") {
    return fallbackMs;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallbackMs;
  }

  if (/^\d+$/.test(trimmed)) {
    // jsonwebtoken treats a bare number as seconds.
    return Number(trimmed) * 1000;
  }

  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i.exec(trimmed);
  if (!match) {
    return fallbackMs;
  }

  const amount = Number(match[1]);
  const unitMs = DURATION_UNITS_MS[match[2].toLowerCase()];
  const ms = amount * unitMs;

  return Number.isFinite(ms) && ms > 0 ? ms : fallbackMs;
}

function getAccessTokenTtlMs() {
  return parseDurationToMs(process.env.JWT_EXPIRE, DEFAULT_ACCESS_TTL_MS);
}

function getRefreshTokenTtlMs() {
  return parseDurationToMs(
    process.env.JWT_REFRESH_EXPIRE,
    DEFAULT_REFRESH_TTL_MS,
  );
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function buildCookieOptions({ path, maxAge, httpOnly }) {
  return {
    httpOnly,
    secure: isProduction(),
    sameSite: "lax",
    path,
    maxAge,
  };
}

function setCsrfCookie(res, csrfToken) {
  if (typeof csrfToken !== "string" || csrfToken.length === 0) {
    return;
  }

  res.cookie(
    CSRF_COOKIE_NAME,
    csrfToken,
    buildCookieOptions({
      path: CSRF_COOKIE_PATH,
      maxAge: getRefreshTokenTtlMs(),
      httpOnly: false,
    }),
  );
}

function setAuthCookies(res, { accessToken, refreshToken, csrfToken }) {
  res.cookie(
    ACCESS_COOKIE_NAME,
    accessToken,
    buildCookieOptions({
      path: ACCESS_COOKIE_PATH,
      maxAge: getAccessTokenTtlMs(),
      httpOnly: true,
    }),
  );

  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    buildCookieOptions({
      path: REFRESH_COOKIE_PATH,
      maxAge: getRefreshTokenTtlMs(),
      httpOnly: true,
    }),
  );

  if (csrfToken) {
    setCsrfCookie(res, csrfToken);
  }
}

function clearAuthCookies(res) {
  const secure = isProduction();

  res.clearCookie(ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: ACCESS_COOKIE_PATH,
  });

  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
  });

  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: CSRF_COOKIE_PATH,
  });
}

function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * Store only the SHA-256 digest of the current refresh token plus the audit
 * fields needed for single-session rotation and reuse detection.
 */
function applyRefreshSession(user, { tokenHash, previousHash = null, sessionId, rotatedAt = new Date() }) {
  user.refreshTokenHash = tokenHash;
  user.refreshTokenPrevHash = previousHash;
  user.refreshTokenSessionId = sessionId;
  user.refreshTokenRotatedAt = rotatedAt;
}

function clearRefreshSession(user) {
  user.refreshTokenHash = null;
  user.refreshTokenPrevHash = null;
  user.refreshTokenSessionId = null;
  user.refreshTokenRotatedAt = null;
}

function isWithinRefreshConflictWindow(rotatedAt, now = Date.now()) {
  if (!rotatedAt) {
    return false;
  }

  const timestamp = rotatedAt instanceof Date ? rotatedAt.getTime() : new Date(rotatedAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return now - timestamp >= 0 && now - timestamp <= REFRESH_CONFLICT_WINDOW_MS;
}

module.exports = {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  ACCESS_COOKIE_PATH,
  REFRESH_COOKIE_PATH,
  CSRF_COOKIE_PATH,
  DEFAULT_ACCESS_TTL_MS,
  DEFAULT_REFRESH_TTL_MS,
  REFRESH_CONFLICT_WINDOW_MS,
  parseDurationToMs,
  getAccessTokenTtlMs,
  getRefreshTokenTtlMs,
  setAuthCookies,
  setCsrfCookie,
  clearAuthCookies,
  generateSessionId,
  applyRefreshSession,
  clearRefreshSession,
  isWithinRefreshConflictWindow,
};
