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

function getFrontendBaseUrl() {
  const raw = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL;
  return String(raw).trim().replace(/\/+$/, "");
}

module.exports = { getFrontendBaseUrl, DEFAULT_FRONTEND_URL };