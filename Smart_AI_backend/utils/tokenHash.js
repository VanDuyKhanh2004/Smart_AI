"use strict";

const crypto = require("crypto");

// Hash a raw email-verification/unlock token before persisting or matching it.
// Only the SHA-256 digest is ever stored in the database; the raw token only
// ever appears in the emailed link.
function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Constant-time comparison for two equal-purpose strings (e.g. two hex
 * digests). Returns false instead of throwing when either value is missing or
 * the lengths differ, so callers can treat malformed stored values as a
 * non-match without leaking timing information.
 */
function timingSafeEqualStrings(left, right) {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }

  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Compare a raw refresh token against a stored SHA-256 digest without ever
 * persisting the raw value. Uses a constant-time digest comparison.
 */
function hashMatches(rawToken, storedHash) {
  if (typeof rawToken !== "string" || typeof storedHash !== "string" || storedHash.length === 0) {
    return false;
  }

  return timingSafeEqualStrings(hashToken(rawToken), storedHash);
}

module.exports = { hashToken, timingSafeEqualStrings, hashMatches };
