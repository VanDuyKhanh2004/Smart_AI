"use strict";

// Centralized token TTLs. Verified tokens and reset/unlock links are derived
// from the same constants so expiry values are never scattered through the
// controllers.
//
//   - EMAIL_VERIFICATION_TOKEN_TTL_HOURS (default 24) — email verification link
//   - PASSWORD_RESET_TOKEN_TTL_HOURS   (default 1)  — password reset link
//   - UNLOCK_TOKEN_TTL_HOURS           (default 1)  — account unlock link
//
// A token is valid only strictly before expiresAt = issuedAt + TTL.
const HOUR_MS = 60 * 60 * 1000;

function hoursFromEnv(envName, fallbackHours) {
  const parsed = Number(process.env[envName]);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed * HOUR_MS;
  }
  return fallbackHours * HOUR_MS;
}

const EMAIL_VERIFICATION_TOKEN_TTL_MS = hoursFromEnv("EMAIL_VERIFICATION_TOKEN_TTL_HOURS", 24);
const PASSWORD_RESET_TOKEN_TTL_MS = hoursFromEnv("PASSWORD_RESET_TOKEN_TTL_HOURS", 1);
const UNLOCK_TOKEN_TTL_MS = hoursFromEnv("UNLOCK_TOKEN_TTL_HOURS", 1);

module.exports = {
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
  UNLOCK_TOKEN_TTL_MS,
};