"use strict";

const crypto = require("crypto");

const CSRF_SECRET_ENV = "CSRF_SECRET";
const CSRF_SECRET_MIN_LENGTH = 32;
const TOKEN_SEPARATOR = ".";

// Development/test fallback only. Production must provide CSRF_SECRET; the
// startup validation in index.js refuses to boot production without it.
let ephemeralSecret = null;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function isConfiguredSecretUsable(value) {
  return typeof value === "string" && value.trim().length >= CSRF_SECRET_MIN_LENGTH;
}

function getCsrfSecret() {
  const configured = process.env[CSRF_SECRET_ENV];

  if (isConfiguredSecretUsable(configured)) {
    return configured.trim();
  }

  if (isProduction()) {
    // Callers on the request path already passed startup validation, but this
    // guard prevents an unsigned/unknown key from ever being used.
    throw new Error(`CSRF_SECRET must be at least ${CSRF_SECRET_MIN_LENGTH} characters in production`);
  }

  if (!ephemeralSecret) {
    ephemeralSecret = crypto.randomBytes(32).toString("hex");
  }

  return ephemeralSecret;
}

/**
 * Startup check used by index.js. Returns a list of human-readable errors so
 * the process can fail fast before connecting to the database.
 */
function validateCsrfSecret() {
  if (!isProduction()) {
    return [];
  }

  const configured = process.env[CSRF_SECRET_ENV];
  if (!configured || configured.trim().length < CSRF_SECRET_MIN_LENGTH) {
    return [
      `CSRF_SECRET must be set to at least ${CSRF_SECRET_MIN_LENGTH} characters in production`,
    ];
  }

  return [];
}

function signValue(value, secret = getCsrfSecret()) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

/**
 * Create a signed double-submit token: `<random>.<hmac>`.
 * The value is opaque and safe to store in a non-HttpOnly cookie as well as
 * echo back through the X-CSRF-Token header.
 */
function generateCsrfToken() {
  const nonce = crypto.randomBytes(32).toString("hex");
  return `${nonce}${TOKEN_SEPARATOR}${signValue(nonce)}`;
}

/**
 * Verify that a token was issued by this server. Compares the signature in
 * constant time. Returns false for any malformed value.
 */
function verifyCsrfToken(token) {
  if (typeof token !== "string") {
    return false;
  }

  const parts = token.split(TOKEN_SEPARATOR);
  if (parts.length !== 2) {
    return false;
  }

  const [nonce, signature] = parts;
  if (!nonce || !signature) {
    return false;
  }

  let expected;
  try {
    expected = signValue(nonce);
  } catch {
    return false;
  }

  if (expected.length !== signature.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}

module.exports = {
  CSRF_SECRET_ENV,
  CSRF_SECRET_MIN_LENGTH,
  generateCsrfToken,
  verifyCsrfToken,
  validateCsrfSecret,
  getCsrfSecret,
};
