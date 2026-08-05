# Deployment

## Backend (Render)

The backend detects Render environment via `RENDER_EXTERNAL_URL` in `index.js` for production URL display.

### Build Command
```bash
npm ci
```

### Start Command
```bash
node index.js
```

### Environment Variables (Backend)

| Variable | Condition | Description |
|----------|-----------|-------------|
| `PORT` | Optional | Server port (default: 5000) |
| `NODE_ENV` | Optional | Environment: `development` or `production` (default: development) |
| `MONGO_CONNECTION_STRING` | **Required** | MongoDB connection URI |
| `REDIS_URL` | Required when BullMQ, chat context, cache, or Redis rate limiting are enabled | Redis connection URL |
| `JWT_SECRET` | **Required** | JWT access token signing secret |
| `JWT_REFRESH_SECRET` | **Required** | JWT refresh token signing secret |
| `JWT_EXPIRE` | Optional | Access token expiry (default: 15m) |
| `JWT_REFRESH_EXPIRE` | Optional | Refresh token expiry (default: 7d) |
| `CLOUDINARY_CLOUD_NAME` | Required for Base64 product image upload and migration | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Required for Base64 product image upload and migration | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Required for Base64 product image upload and migration | Cloudinary API secret |
| `OPENAI_API_KEY` | **Required** for AI chat (primary chat provider) | OpenAI API key |
| `GEMINI_API_KEY` | Required for embeddings and Gemini chat fallback | Google Gemini API key |
| `BREVO_API_KEY` | Required when transactional emails are enabled | Brevo (Sendinblue) API key |
| `BREVO_FROM_EMAIL` | Required when transactional emails are enabled | Sender email address for transactional emails |
| `BREVO_FROM_NAME` | Required when transactional emails are enabled | Sender display name |
| `GOOGLE_CLIENT_ID` | Required for Google OAuth login | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Required for Google OAuth login | Google OAuth client secret |
| `FRONTEND_URL` | **Required in production** | Frontend URL for CORS and Socket.IO origin |
| `BULLMQ_ENABLED` | Optional | Enable BullMQ queues (default: true) |
| `EMAIL_QUEUE_ENABLED` | Optional | Enable email queue (default: true) |
| `EMAIL_QUEUE_CONCURRENCY` | Optional | Email worker concurrency (default: 2) |
| `EMBEDDING_QUEUE_ENABLED` | Optional | Enable embedding queue (default: true) |
| `EMBEDDING_QUEUE_CONCURRENCY` | Optional | Embedding worker concurrency (default: 2) |
| `EMBEDDING_WORKER_LOCK_DURATION` | Optional | Embedding job lock duration in ms (default: 60000) |
| `LOG_LEVEL` | Optional | Pino log level (default: info) |
| `LOGIN_MAX_ATTEMPTS` | Optional | Max login attempts before lockout (default: 5) |
| `LOGIN_LOCK_MINUTES` | Optional | Lockout duration in minutes (default: 15) |
| `RENDER_EXTERNAL_URL` | Set by Render automatically | Used for production URL display |

### Verifying Deployment
```bash
# Health check (liveness)
curl https://your-app.onrender.com/health

# Readiness check (dependencies: MongoDB, Redis)
curl https://your-app.onrender.com/health/ready

# API info
curl https://your-app.onrender.com/api/info
```

Use `GET /health` (liveness) and `GET /health/ready` (readiness) as Render health checks.

## Frontend (Vercel)

> **Vite env-var note**: `VITE_*` values are injected at build time. Environment changes require a fresh build (`npm run build`). Redeploying an existing prebuilt deployment may retain old values. Never expose backend secrets (API keys, JWT secrets, database credentials) in `VITE_*` variables — they are embedded in the client bundle.

Deployed automatically via GitHub Actions (`.github/workflows/deploy-frontend.yml`) on push to `main` when changes affect `Smart_AI_frontend/**`.

### Build Settings (Vercel Dashboard)
- **Framework**: Vite
- **Root Directory**: `Smart_AI_frontend`
- **Build Command**: `npm run build` (runs `tsc -b && vite build`)
- **Output Directory**: `dist`
- **Node Version**: 24

### Environment Variables (Frontend)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | **Yes** | Backend API base URL (absolute, http/https, not matching frontend origin) |
| `VITE_API_URL` | No | Backend API URL for non-API endpoints |
| `VITE_GOOGLE_CLIENT_ID` | No | Google OAuth client ID |

### Deployment Flow
1. Push to `main` with frontend changes triggers `deploy-frontend.yml`
2. GitHub Actions checks out code, installs Vercel CLI
3. `vercel pull` fetches environment from Vercel project
4. `vercel build --prod` builds the project
5. `vercel deploy --prebuilt --prod` deploys to production
6. Secrets `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN` required in GitHub Actions secrets

## MongoDB

- **Recommended**: MongoDB Atlas (required for `$vectorSearch` support)
- **Connection options** (from `configs/database.js`):
  - `serverSelectionTimeoutMS`: 5000
  - `socketTimeoutMS`: 45000
  - `maxPoolSize`: 10
  - `minPoolSize`: 0
  - `maxIdleTimeMS`: 30000
- **Indexes**: Must be created on the target database (text indexes, vector index on `embedding_vector`, compound indexes on orders)

### Chat Conversation Ownership Index Migration

Per-user chat ownership enforces uniqueness on the pair `{ userId, sessionId }`. On databases that predate this change, the **legacy globally-unique `sessionId_1` index must be removed** — a code/schema deployment alone does not drop it, and a stale unique `sessionId_1` index would reject two users owning the same client-visible `sessionId`. Run the repository migration **before** (or concurrently with) deploying the ownership code:

```bash
# From Smart_AI_backend, with MONGO_CONNECTION_STRING set (.env)

# 1. Dry run — connects, inspects, and reports only; makes no DB changes
npm run migrate:conversation-ownership-index:dry-run

# 2. Review the plan: it will abort (no index change) if duplicate
#    { userId, sessionId } pairs exist or the target index is not unique,
#    and it will report legacy documents without a userId without touching them.

# 3. Live run — creates userId_1_sessionId_1 (unique), verifies it, then
#    drops sessionId_1, then verifies the final state. Idempotent: re-running
#    after success is a no-op ("already migrated").
npm run migrate:conversation-ownership-index
```

- **Safety order**: create the target unique index → verify it exists and is unique → drop the legacy index → verify the final state. Any failure before the drop leaves the legacy index untouched; the script exits non-zero on real failures and closes the connection cleanly.
- **Legacy conversations**: documents without a `userId` are never auto-claimed or modified by this migration; they remain visible to no authenticated owner until a policy decision is made.
- **Deployment order**: `dry-run` → review output → `migrate` → deploy the ownership code (or verify the two are mutually compatible; both are required for the feature to function).

## Redis

- **Version**: Redis 7
- **Connection**: Via `REDIS_URL`
- **Usage**: Cache, BullMQ queue backend, login rate limiting, chat context storage
- **Reconnect**: Exponential backoff auto-reconnect (`min(500 × 2^attempt, 30000)ms`, infinite retries). Graceful shutdown disables reconnect via `setShuttingDown()`.

## Cloudinary

- **Configuration**: Lazy-initialized singleton (`configs/cloudinary.js`)
- **Upload folder**: `smart-ai/products`
- **Returns null** if `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, or `CLOUDINARY_API_SECRET` are not set
- All uploads use `secure: true` (HTTPS URLs)

## Brevo (Transactional Email)

- **Transport**: Brevo API only (`@getbrevo/brevo` `transactionalEmails.sendTransacEmail`) — no SMTP.
- **Config**: `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`.
- **Email types**: welcome, verification, password-reset, unlock-account, order-confirmation.
- **Queue**: BullMQ `emailQueue` with direct fallback. If any Brevo var is missing, emails are silently skipped — ensure all three are set in production.
- Missing Brevo config does **not** block boot; verify with a sign-up or password-reset flow.

## Google OAuth

- Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from the Google Cloud Console.
- Authorized redirect origins must include the production frontend origin (Vercel) and `http://localhost:5173` for local dev.
- The frontend loads the Google Identity Services script at runtime; `VITE_GOOGLE_CLIENT_ID` must be set at build time.
- If `GOOGLE_CLIENT_ID` is unset, Google login returns a 500 (logged), other auth flows still work.

## Docker Deployment

Full application with all services:

```bash
# 1. Configure environment (local only; .env.docker is gitignored)
cd Smart_AI_backend
cp .env.docker.example .env.docker
# Edit .env.docker with your API keys.
# Email is sent via the Brevo API — set:
#   BREVO_API_KEY
#   BREVO_FROM_NAME
#   BREVO_FROM_EMAIL
# (No SMTP_* variables are used.)
# Required for the stack:
#   OPENAI_API_KEY, GEMINI_API_KEY, JWT_SECRET, JWT_REFRESH_SECRET
#   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
#   REDIS_URL=redis://redis:6379

# 2. Build and start
cd ..
docker compose up --build
```

### Docker Services
| Service | Image | Port | Dependencies |
|---------|-------|------|-------------|
| mongodb | mongo:7 | 27017 | — |
| redis | redis:7-alpine | 6379 | — |
| backend | Node.js (custom) | 5000 | mongodb (healthy), redis (healthy) |
| frontend | nginx (custom) | 3000 | backend |

### Docker Compose Configuration

```yaml
services:
  mongodb:
    image: mongo:7
    healthcheck: mongosh ping
    volumes: mongo_data

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    healthcheck: redis-cli ping
    volumes: redis_data

  backend:
    build: ./Smart_AI_backend
    env_file: ./Smart_AI_backend/.env.docker
    environment:
      MONGO_CONNECTION_STRING: mongodb://mongodb:27017/smart_ai
      REDIS_URL: redis://redis:6379
    volumes: uploads

  frontend:
    build:
      context: ./Smart_AI_frontend
      args:
        VITE_API_BASE_URL: http://localhost:5000/api
        VITE_API_URL: http://localhost:5000
        VITE_GOOGLE_CLIENT_ID: ""
```

## Rollback Checklist

### Frontend (Vercel)
1. Go to Vercel dashboard → project → Deployments
2. Find the last known-good deployment
3. Click "..." → "Promote to Production"
4. Verify the frontend loads and critical flows work (login, product browse, order)

### Backend (Render)
1. Go to Render dashboard → project → Deployments
2. Find the last known-good deployment
3. Click "..." → "Deploy" for that version
4. Verify health endpoint: `GET /health`
5. Test critical API endpoints (auth login, product list, order creation)

### Database (MongoDB)
1. No automated schema rollback — manual migration steps required
2. Restore from backup if data corruption occurred
3. Verify data integrity after restore

### Full Rollback (Docker)
1. Stop containers: `docker compose down`
2. Revert to previous code: `git checkout <previous-tag-or-commit>`
3. Restore database from backup if needed
4. Start containers: `docker compose up -d --build`
5. Verify health endpoint returns 200
6. Run smoke tests on critical paths
