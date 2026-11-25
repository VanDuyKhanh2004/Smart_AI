"use strict";

// Single source of truth for the public frontend origin used in emails and
// auth redirects. Must be the *frontend* origin (Vite dev server or the
// production SPA domain).
//
//   - Local dev:   FRONTEND_URL=http://localhost:5173
//   - Production:  FRONTEND_URL=https://<production-frontend-domain>
//
// The production domain is never hard-coded in code; it must be provided via
// the FRONTEND_URL environment variable at deploy time.
const DEFAULT_FRONTEND_URL = "http://localhost:5173";

// Vite's default dev/preview ports. Development uses an explicit allowlist
// instead of a wildcard so credentialed CORS and cookie auth keep working.
const DEV_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

const CORS_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Request-ID",
  "Idempotency-Key",
  "X-CSRF-Token",
];

const CORS_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

function normalizeOrigin(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\/+$/, "");
}

function getFrontendBaseUrl() {
  const raw = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL;
  return normalizeOrigin(raw);
}

function splitOriginList(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  return value
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

/**
 * Exact-origin allowlist used by CORS, Socket.IO CORS and CSRF Origin checks.
 * Production only trusts FRONTEND_URL plus any explicitly configured extra
 * origins; development additionally allows the standard Vite ports.
 */
function getAllowedOrigins() {
  const origins = new Set();

  const configuredFrontend = normalizeOrigin(process.env.FRONTEND_URL);
  if (configuredFrontend) {
    origins.add(configuredFrontend);
  } else if (process.env.NODE_ENV !== "production") {
    origins.add(DEFAULT_FRONTEND_URL);
  }

  for (const extra of splitOriginList(process.env.CORS_ALLOWED_ORIGINS)) {
    origins.add(extra);
  }

  if (process.env.NODE_ENV !== "production") {
    for (const devOrigin of DEV_ALLOWED_ORIGINS) {
      origins.add(devOrigin);
    }
  }

  return Array.from(origins);
}

function isOriginAllowed(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return false;
  }

  return getAllowedOrigins().includes(normalized);
}

/**
 * `cors` package origin callback. Requests without an Origin header (curl,
 * server-to-server, same-origin navigations) are not subject to CORS; browser
 * requests must match the exact allowlist.
 */
function corsOrigin(origin, callback) {
  if (!origin) {
    return callback(null, true);
  }

  return callback(null, isOriginAllowed(origin));
}

module.exports = {
  getFrontendBaseUrl,
  getAllowedOrigins,
  isOriginAllowed,
  corsOrigin,
  normalizeOrigin,
  DEFAULT_FRONTEND_URL,
  DEV_ALLOWED_ORIGINS,
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
};
