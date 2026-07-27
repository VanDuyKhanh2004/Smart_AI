# Security Policy

## Supported Versions

Only the latest commit on the `main` branch is supported. There are no versioned releases.

| Version | Supported |
|---------|-----------|
| `main` (latest) | ✅ |
| Other branches | ❌ |

## Reporting a Vulnerability

Report security vulnerabilities by emailing **duykhanhpro04@gmail.com**.

Do not open public GitHub issues for security vulnerabilities.

I aim to acknowledge valid security reports within 5 business days. If the vulnerability is confirmed, a fix will be prioritized and deployed promptly. The reporter will be credited (unless anonymity is requested).

This address is public. Reporters may alternatively use GitHub private vulnerability reporting if it is enabled for the repository.

## Secrets Management

- **No secrets in code** — API keys, database credentials, JWT secrets, and OAuth client secrets must never be committed to the repository.
- **Environment variables** — All secrets are injected via environment variables at runtime or build time.
- **`.env.example` files** — Contain placeholder values only. Never commit real `.env` files.
- **Git history** — If a secret is accidentally committed, rotate it immediately and rewrite history (`git filter-repo` or `git rebase`). Assume the exposed secret is compromised.

## Environment Variables

### Backend Secrets

| Variable | Sensitivity | Notes |
|----------|-------------|-------|
| `MONGO_CONNECTION_STRING` | Critical | Full database access. Use a dedicated user with least-privilege roles. |
| `REDIS_URL` | Critical | Full cache and queue access. Include password if using Redis ACL. |
| `JWT_SECRET` | Critical | Access token signing key. Minimum 256-bit (32 chars) random string. |
| `JWT_REFRESH_SECRET` | Critical | Refresh token signing key. Must be different from `JWT_SECRET`. |
| `OPENAI_API_KEY` | Critical | Billed by usage. Restrict to production API key, not org key. |
| `GEMINI_API_KEY` | Critical | Billed by usage. Restrict API key scope if possible. |
| `CLOUDINARY_API_KEY` | Critical | Image upload access. Use separate API key per environment. |
| `CLOUDINARY_API_SECRET` | Critical | Paired with `CLOUDINARY_API_KEY`. |
| `BREVO_API_KEY` | Critical | Email sending capability. |
| `GOOGLE_CLIENT_ID` | Sensitive | OAuth client identifier. |
| `GOOGLE_CLIENT_SECRET` | Critical | OAuth client secret. |

### Frontend (VITE_*)

- `VITE_*` variables are embedded in the client bundle at build time.
- **Never expose backend secrets** (API keys, JWT secrets, database credentials) in `VITE_*` variables.
- Only include values that are safe for public disclosure (e.g., API base URLs, Google Client ID).

## JWT Secret Requirements

- `JWT_SECRET` and `JWT_REFRESH_SECRET` must be different values.
- Minimum length: 32 characters (256 bits).
- Use a cryptographically random generator:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  # => 64-character hex string
  ```
- Rotate periodically (every 6 months) and immediately after any suspected leak.
- `JWT_EXPIRE`: 15 minutes (default) for access tokens.
- `JWT_REFRESH_EXPIRE`: 7 days (default) for refresh tokens.
- Shorter expiry limits exposure window if a token is stolen.

## MongoDB Security

- **Atlas only** — The application requires MongoDB Atlas for `$vectorSearch`. Atlas provides network isolation, encryption at rest, and automated backups.
- **Connection string** — Include username, password, and cluster name. Use a database user with minimal required privileges (readWrite on the application database only).
- **IP allowlist** — Restrict MongoDB Atlas network access to trusted origins or stable outbound IP ranges where the selected hosting plan supports them.
- **TLS/SSL** — Atlas connections use TLS by default. Do not set `tls=false` or `ssl=false`.
- **Vector search** — The `embedding_vector` index is defined in the schema. Ensure the index exists on the target cluster before enabling embedding jobs.
- **No direct client access** — The frontend never connects to MongoDB. All database access is through the backend API.

## Redis Security

- **Password** — Use `REDIS_URL` with embedded password: `redis://:password@host:6379`.
- **ACL** — Use a Redis user with minimal permissions (access to relevant keyspaces only).
- **Network isolation** — Do not expose Redis to the public internet. Use private networking (VPC, internal network).
- **`reconnectStrategy`** — Currently set to `false`. Redis connection loss requires application restart. A reconnect strategy should be implemented in production.
- **Data classification** — Redis stores: cached product queries (non-sensitive), rate limit counters, chat context (potentially includes user messages), BullMQ job data (includes email content). Ensure Redis is in a trusted network.

## Cloudinary Credentials

- Use separate Cloudinary API keys for development and production environments.
- Rotate API keys if compromised.
- The `smart-ai/products` upload folder is configured in `configs/cloudinary.js`.
- The application performs signed server-side uploads. Do not enable unsigned upload presets unless explicitly required and tightly restricted.
- All uploads use `secure: true` (HTTPS URLs only).

## Third-Party API Keys

| Service | Key | Recommended rotation | Notes |
|---------|-----|----------|-------|
| OpenAI | `OPENAI_API_KEY` | Every 6 months | Monitor usage for unexpected spikes. Set spending limits in OpenAI dashboard. |
| Gemini | `GEMINI_API_KEY` | Every 6 months | Used for embeddings and chat fallback. |
| Brevo | `BREVO_API_KEY` | Every 12 months | Email sending. Monitor send volumes for abuse. |
| Cloudinary | `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` | Every 12 months | Image upload. Set upload limits in dashboard. |
| Google OAuth | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Every 12 months | OAuth login. Restrict redirect URIs to production frontend URL. |

## Production Deployment Recommendations

1. **Environment separation** — Use separate API keys, databases, and Redis instances for development and production.
2. **HTTPS only** — The production backend must be served over HTTPS (handled by Render). The frontend on Vercel is HTTPS by default.
3. **CORS hardening** — `FRONTEND_URL` must be set to the exact production frontend origin. Do not use wildcard `*` in production.
4. **Rate limiting** — Currently only on the login endpoint (Redis-backed). Add rate limiting on admin endpoints and general API in production.
5. **Error handler middleware** — `middlewares/errorHandler.js` is empty. Error handling is inlined in `index.js`. Implement the middleware for consistent error responses.
6. **Redis auto-reconnect** — `reconnectStrategy = false` means Redis connection loss requires a restart. Implement auto-reconnect for production resilience.
7. **No SMS fallback** — Email-only via Brevo. If SMS is added later, manage credentials separately.
8. **Graceful shutdown** — SIGTERM/SIGINT handlers close BullMQ workers, disconnect Socket.IO, stop HTTP server, disconnect Redis and MongoDB, then exit.
9. **Health checks** — Endpoints: `GET /health` (liveness), `GET /health/readiness` (dependencies). Use these in Render health check configuration.
10. **Logging** — Pino structured logging with `LOG_LEVEL` configuration. Sensitive data redaction is configured in `utils/logger.js`.

## Dependency Update Policy

- **Minor and patch updates** — Apply regularly via `npm update` or Dependabot. Review changelogs for breaking changes.
- **Major version updates** — Evaluate for breaking changes before upgrading. Update one major version at a time.
- **Security advisories** — Monitor `npm audit` output. Critical and high severity advisories should be addressed within 7 days.
- **Automated tools** — Dependabot or Renovate should be configured for automated dependency PRs.
- **Pin exact versions** in `package.json` only when a known breaking change exists in a newer patch. Otherwise, use semver ranges (caret `^`).
- After any dependency update:
  - Run the full test suite
  - Run the frontend TypeScript check
  - Verify the production build
