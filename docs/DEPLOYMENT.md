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

# API info
curl https://your-app.onrender.com/api/info
```

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

## Docker Deployment

Full application with all services:

```bash
# 1. Configure environment
cd Smart_AI_backend
cp .env.docker.example .env.docker
# Edit .env.docker with your API keys.
# The example file contains SMTP vars but the app uses Brevo API.
# Add these if needed:
#   BREVO_API_KEY
#   BREVO_FROM_NAME
#   BREVO_FROM_EMAIL
#   REDIS_URL=redis://redis:6379
#   CLOUDINARY_CLOUD_NAME
#   CLOUDINARY_API_KEY
#   CLOUDINARY_API_SECRET
#   GEMINI_API_KEY

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
