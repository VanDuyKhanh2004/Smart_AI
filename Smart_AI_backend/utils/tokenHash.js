"use strict";

const crypto = require("crypto");

// Hash a raw email-verification/unlock token before persisting or matching it.
// Only the SHA-256 digest is ever stored in the database; the raw token only
// ever appears in the emailed link.
function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

module.exports = { hashToken };