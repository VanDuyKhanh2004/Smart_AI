# Smart AI Agent

> AI-powered E-commerce Platform

![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

### Authentication & Security
- JWT authentication with access/refresh tokens
- Google OAuth login
- Email verification flow
- Password reset with secure tokens
- Account lock protection (5 failed attempts, 15min lockout)
- Account unlock via email token
- Login rate limiting (Redis-backed, 20 attempts/15min)

### E-commerce Core
- Product catalog with image upload (Cloudinary)
- Semantic product search (vector + text + fallback)
- Product recommendations (vector + brand/price + fallback)
- Shopping cart (server + guest local cart merge on login)
- Checkout with idempotency (UUID v4 key, fingerprint validation)
- Order management (create/view/cancel; admin: list/stats/update status)
- Centralized order status transitions with validated rules
- Customer reviews with moderation (pending/approved/rejected)
- Wishlist
- Product comparison tool
- Promotion/discount application (percentage/fixed, date range, usage limits)
- Customer order detail page with loading skeleton and error states
- Order confirmation emails with safe HTTPS image rendering

### AI Chatbot
- RAG pipeline: intent classification (product_query|small_talk|complaint) → MongoDB Atlas `$vectorSearch` → text fallback → constraint parsing (price range, brands, specs) → ranking by soft preferences → response via OpenAI `gpt-4o` (primary) or Gemini `gemini-2.0-flash` (fallback), delivered as one complete response over real-time Socket.IO transport (single `aiResponse` emit; no token-by-token streaming)
- Multi-turn conversation context (Redis-backed, 30-min TTL, 20 max turns)
- Complaint handling agent (structured: priority, tags, contact info)
- Content-hash based embedding deduplication
- Offline evaluation framework at `evaluation/chatbot/` — 40 deterministic mocked scenarios covering constraint parsing, MRR/ranking, multi-turn context, and fallback behavior, with CLI thresholds (`--fail-under`); does not measure live chatbot accuracy or production latency

### Admin Dashboard
- Product management
- Order management with status transitions
- Review moderation
- Q&A management
- Promotion management
- Store management
- Appointment management
- Complaint management
- Charts and stats

### Infrastructure
- Docker Compose (MongoDB 7, Redis 7, backend, frontend with nginx)
- BullMQ job queues (email, embeddings, system ping) with concurrency control
- Graceful shutdown sequence
- Health check endpoints (liveness, readiness, dependency status)
- Correlation ID middleware for request tracing
- Pino structured logging with sensitive data redaction

---

## Tech Stack

### Frontend
| Package | Version |
|---------|---------|
| React | 18 |
| TypeScript | 5.8 (strict mode, `noUnusedLocals`, `noUnusedParameters`) |
| Vite | 7 |
| Tailwind CSS | 4 |
| shadcn/ui | Radix UI primitives + CVA + clsx + tailwind-merge |
| Zustand | 5 (auth, cart, compare, wishlist stores) |
| TanStack React Query | 5 (server state) |
| React Router DOM | 7 |
| Axios | 1 |
| Socket.IO Client | 4 |
| Recharts | 3 |
| React Markdown | 10 + remark-gfm + remark-math + rehype-katex |
| Lucide React | icons |
| embla-carousel-react | carousels |
| Vitest | 4 + @testing-library/react 16 + jsdom |

### Backend
| Package | Version |
|---------|---------|
| Express | 4 |
| Mongoose | 8 |
| BullMQ | 5 |
| Redis client (`redis`) | 6 |
| OpenAI | 5 |
| `@google/genai` / `@google/generative-ai` | 2 / 0.24 |
| Cloudinary | 2 |
| `@getbrevo/brevo` | 6 |
| Socket.IO | 4 |
| Pino | 10 |
| `jsonwebtoken` | 9 |
| `bcryptjs` | 3 |
| `google-auth-library` / `googleapis` | 10 / 171 |
| Jest | 30 + Supertest 7 |
| Docker | Compose |

### AI Provider Roles
- **OpenAI** (primary): chat completions (`gpt-4o`), intent classification, complaint handling — uses `openai` npm package (in `utils/gemini.js`)
- **Google Gemini**: embeddings (`gemini-embedding-001`, 1536-dim), chat fallback (`gemini-2.0-flash`) — uses `@google/genai` (in `utils/openai.js`)
- *Note: utility filenames are historically inverted relative to provider*

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend (React 18 + TS)                    │
│    Vite 7 · Tailwind 4 · shadcn/ui · Zustand 5               │
│    TanStack Query 5 · React Router DOM 7 · Axios             │
│    Socket.IO Client 4 · Recharts 3                           │
│    Features: auth, products, cart, checkout, orders,          │
│              chat, compare, wishlist, reviews, complaints,    │
│              stores, appointments, admin, addresses, profile  │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP (REST) / WebSocket (Socket.IO)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│               Backend (Express 4 + Node.js 18+)              │
│    Middleware: correlationId, cors, requestLogger, auth      │
│    Controllers: auth, product, order, cart, chat, review,    │
│                 promotion, store, appointment, complaint     │
│    Services: productImage, productSearch, productRanking,    │
│              recommendation, cache, conversationContext      │
│    BullMQ Workers: system (ping), email, embedding           │
│    Socket.IO Handlers: chat (single aiResponse), notifications │
└──────┬──────────────────┬──────────────────┬────────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│  MongoDB 7   │  │   Redis 7    │  │   Cloudinary     │
│ (Mongoose 8) │  │  (redis v6)  │  │  (Images CDN)    │
│              │  │              │  │                  │
│ Atlas for    │  │ Cache/Queue  │  │ smart-ai/products│
│ $vectorSearch│  │ Rate Limit   │  │                  │
│              │  │ Chat Context │  │                  │
└──────────────┘  └──────┬───────┘  └──────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │  BullMQ 5    │
                  │ (Redis-backed)│
                  │              │
                  │ systemQueue  │
                  │ emailQueue   │
                  │ embeddingQueue│
                  └──────────────┘
```

---

## Setup

### Prerequisites
- Node.js >= 18
- npm >= 9
- Docker Desktop (for Docker deployment)
- MongoDB Atlas cluster (for `$vectorSearch`)
- Redis instance (managed or local)

### Backend

```bash
cd Smart_AI_backend
npm install
# Create Smart_AI_backend/.env using the Environment Variables table below
npm run dev
```

The backend starts on `http://localhost:5000`.

### Frontend

```bash
cd Smart_AI_frontend
npm install
cp .env.example .env  # or create .env.local
# Set VITE_API_BASE_URL=http://localhost:5000/api
npm run dev
```

The frontend starts on `http://localhost:5173`.

### Docker

```bash
# 1. Configure environment
cd Smart_AI_backend
cp .env.docker.example .env.docker
# Edit .env.docker with your API keys.
# Add any missing vars not in the example (BREVO_API_KEY, etc.)

# 2. Build and start all services
cd ..
docker compose up --build
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`
- MongoDB: `localhost:27017`
- Redis: `localhost:6379`

### Environment Variables

> **Note**: `VITE_*` variables are injected at build time — never expose backend secrets in them.

#### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Optional (5000) | Server port |
| `NODE_ENV` | Optional | `development` or `production` |
| `MONGO_CONNECTION_STRING` | **Yes** | MongoDB URI (Atlas for vector search) |
| `REDIS_URL` | Conditional | Required when BullMQ, cache, rate limit, or chat context enabled |
| `JWT_SECRET` | **Yes** | Access token signing secret |
| `JWT_EXPIRE` | Optional (15m) | Access token expiry |
| `JWT_REFRESH_SECRET` | **Yes** | Refresh token signing secret |
| `JWT_REFRESH_EXPIRE` | Optional (7d) | Refresh token expiry |
| `OPENAI_API_KEY` | **Yes** | OpenAI API key (primary chat provider) |
| `GEMINI_API_KEY` | Conditional | Required for embeddings and Gemini fallback |
| `CLOUDINARY_CLOUD_NAME` | Conditional | Required for product image upload |
| `CLOUDINARY_API_KEY` | Conditional | Required for product image upload |
| `CLOUDINARY_API_SECRET` | Conditional | Required for product image upload |
| `BREVO_API_KEY` | Conditional | Required when transactional emails enabled |
| `BREVO_FROM_EMAIL` | Conditional | Sender email for transactional emails |
| `BREVO_FROM_NAME` | Conditional | Sender display name |
| `GOOGLE_CLIENT_ID` | Conditional | Required for Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Conditional | Required for Google OAuth |
| `FRONTEND_URL` | **Yes** in production | CORS and Socket.IO origin |
| `BULLMQ_ENABLED` | Optional (true) | Enable BullMQ queues |
| `EMAIL_QUEUE_ENABLED` | Optional (true) | Enable email queue |
| `EMBEDDING_QUEUE_ENABLED` | Optional (true) | Enable embedding queue |
| `LOG_LEVEL` | Optional (info) | Pino log level |

#### Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | **Yes** | Backend API base URL (absolute, http/https, not matching frontend origin) |
| `VITE_API_URL` | No | Backend URL for non-API endpoints (socket origin derivation) |
| `VITE_GOOGLE_CLIENT_ID` | Conditional | Google OAuth client ID |

---

## Deployment

### Frontend (Vercel)

- Auto-deployed via GitHub Actions (`.github/workflows/deploy-frontend.yml`) on push to `main` when `Smart_AI_frontend/**` changes
- Build: `npm run build` (runs `tsc -b && vite build`), output `dist/`
- Node version: 24
- `VITE_*` values set in Vercel dashboard — changes require a fresh build

### Backend (Render)

- Detects Render environment via `RENDER_EXTERNAL_URL`
- Build: `npm ci`
- Start: `node index.js`
- Environment variables configured in Render dashboard

### MongoDB Atlas

- Required for `$vectorSearch` functionality
- Connection via `MONGO_CONNECTION_STRING`
- Indexes: text indexes on `Product`, vector index on `embedding_vector`, compound indexes on orders

### Redis

- Managed Redis instance required for BullMQ, rate limiting, chat context
- Connection via `REDIS_URL`
- Note: Auto-reconnect with exponential backoff (`min(500 × 2^attempt, 30000)ms`, infinite retries) — disabled during graceful shutdown
- ERD: See `docs/ERD.md` for full database schema, relationships, indexes, and scaling recommendations

### Cloudinary

- Lazy-initialized singleton (`configs/cloudinary.js`)
- Upload folder: `smart-ai/products`
- Returns `null` if env vars not set
- All uploads use `secure: true` (HTTPS)

### Brevo

- Transactional emails: welcome, verification, password-reset, unlock-account, order-confirmation
- Queue: BullMQ `emailQueue` with direct fallback
- Config: `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`

---

## Testing

> **Verification metadata**: totals below verified on **2026-08-04** on branch **`docs/synchronize-project-documentation`** at commit **`8dca92e`** (latest merged main baseline).

### Backend (Jest + Supertest)

```bash
cd Smart_AI_backend
npm test                           # Full suite (1611 tests, 39 suites; verified 2026-08-04)
npm test -- --runInBand            # Sequential (recommended)
```

### Frontend (Vitest + @testing-library/react)

```bash
cd Smart_AI_frontend
npm test                           # Vitest run (129 tests, 9 files; verified 2026-08-04)
npx tsc --noEmit                   # TypeScript strict check
npm run build                      # Production build (tsc -b + vite build)
```

### CI Validation

```bash
git diff --check                   # No whitespace errors
```

---

## CI/CD

### CI Pipeline (`.github/workflows/ci.yml`)

Triggers on push or PR to `main` when changes affect `Smart_AI_backend/**`, `Smart_AI_frontend/**`, or workflow files.

- **Backend**: `npm ci` → `npm test` (Node 24, Ubuntu)
- **Frontend**: `npm ci` → `npx tsc --noEmit` → `npx vitest run` → `npm run build` (Node 24, Ubuntu, cached deps)

### CD Pipeline (`.github/workflows/deploy-frontend.yml`)

Triggers on push to `main` with frontend changes.

1. Checkout code
2. Install Vercel CLI
3. `vercel pull` — fetch environment
4. `vercel build --prod`
5. `vercel deploy --prebuilt --prod`
6. Secrets: `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`

---

## Documentation

| File | Contents |
|------|----------|
| [PROJECT_CONTEXT.md](./docs/PROJECT_CONTEXT.md) | Handoff block, completed work, production state, known limitations |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System diagram, frontend/backend structure, AI pipeline, external services |
| [DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Render, Vercel, Docker, environment variables table, rollback checklist |
| [TESTING.md](./docs/TESTING.md) | Test suites, mocking strategy, CI workflow, pre-merge checklist, Radix UI testing notes |
| [ROADMAP.md](./docs/ROADMAP.md) | Completed items, next priorities, technical debt |
| [CHANGELOG.md](./docs/CHANGELOG.md) | Keep a Changelog format — unreleased changes |
| [CODING_STANDARD.md](./docs/CODING_STANDARD.md) | Code style, naming conventions, documentation workflow |
| [ERD.md](./docs/ERD.md) | Database schema, relationships, indexes, scaling recommendations |
| [PROJECT_TECHNICAL_AUDIT.md](./docs/PROJECT_TECHNICAL_AUDIT.md) | Point-in-time technical audit (read-only) |
| [REPOSITORY_HYGIENE_REPORT.md](./docs/REPOSITORY_HYGIENE_REPORT.md) | Point-in-time hygiene report with resolved-after-audit status |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Branch strategy, commit conventions, PR checklist, testing, doc policy |
| [SECURITY.md](./SECURITY.md) | Supported versions, vulnerability reporting, secrets, env vars, dependency policy |
| [API_OVERVIEW.md](./docs/API_OVERVIEW.md) | Endpoint groups, authentication, Swagger UI link, common errors |

---

## License

Distributed under the MIT License.
