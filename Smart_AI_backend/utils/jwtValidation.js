"use strict";

const MIN_SECRET_LENGTH = 32;

const JWT_PLACEHOLDER_PATTERNS = [
  'YOUR_JWT_SECRET',
  'YOUR_REFRESH_SECRET',
  'replace_with_a_strong_jwt_secret',
  'replace_with_a_strong_refresh_secret',
];

/**
 * Validate JWT_SECRET and JWT_REFRESH_SECRET environment variables.
 * Returns an array of error strings; empty array means valid.
 */
function validateJwtSecrets({ secret, refreshSecret } = {}) {
  const errors = [];

  if (!secret || secret.trim().length === 0) {
    errors.push('JWT_SECRET is missing or empty');
  } else if (secret.length < MIN_SECRET_LENGTH) {
    errors.push(`JWT_SECRET is too short (${secret.length} chars, minimum ${MIN_SECRET_LENGTH})`);
  } else if (JWT_PLACEHOLDER_PATTERNS.includes(secret)) {
    errors.push('JWT_SECRET is a placeholder value');
  }

  if (!refreshSecret || refreshSecret.trim().length === 0) {
    errors.push('JWT_REFRESH_SECRET is missing or empty');
  } else if (refreshSecret.length < MIN_SECRET_LENGTH) {
    errors.push(`JWT_REFRESH_SECRET is too short (${refreshSecret.length} chars, minimum ${MIN_SECRET_LENGTH})`);
  } else if (JWT_PLACEHOLDER_PATTERNS.includes(refreshSecret)) {
    errors.push('JWT_REFRESH_SECRET is a placeholder value');
  }

  return errors;
}

module.exports = { validateJwtSecrets, MIN_SECRET_LENGTH, JWT_PLACEHOLDER_PATTERNS };
