# Architecture

## Overview

Smart_AI is a full-stack e-commerce platform with AI capabilities. The frontend is a React SPA communicating with a RESTful Node.js backend via HTTP and Socket.IO. The backend connects to MongoDB for persistence, Redis for caching/queues, Cloudinary for image hosting, and external AI/email APIs.

```
┌─────────────────────────────────────────────────────────────┐
│               Frontend (React 18 + TypeScript)               │
│    Vite 7 · Tailwind CSS 4 · shadcn/ui · Zustand 5          │
│    TanStack React Query 5 · React Router DOM 7              │
│    Axios · socket.io-client 4 · Recharts 3 · Leaflet        │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP (REST) / WebSocket (Socket.IO)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Backend (Express 4 + Node.js)               │
│    Middleware: correlationId, cors, requestLogger, auth      │
│    Controllers: auth, product, order, cart, chat, etc.      │
│    Services: image, search, recommendation, cache, context   │
│    BullMQ Workers: system, email, embedding                  │
│    Socket.IO Handlers                                        │
└──────┬──────────────────┬──────────────────┬────────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│   MongoDB 7  │  │   Redis 7    │  │   Cloudinary     │
│  (Mongoose 8) │  │  (redis v6)  │  │  (Images/CDN)   │
│              │  │  Cache/Queue │  │                  │
│  Atlas for   │  │  Rate Limit  │  │ smart-ai/products│
│  vector      │  │  Chat Ctx    │  │                  │
└──────────────┘  └──────┬───────┘  └──────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │  BullMQ 5    │
                  │  (Redis-backed)│
                  │              │
                  │ systemQueue  │
                  │ emailQueue   │
                  │ embeddingQueue│
                  └──────────────┘
```

## Frontend

### Build & Configuration
- **Vite 7** with `@vitejs/plugin-react` and `@tailwindcss/vite`
- Path alias `@` → `./src`
- Vitest configured with jsdom environment, globals enabled, CSS support
- TypeScript strict mode with `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`

### Application Shell
1. `main.tsx` renders `QueryClientProvider` → `App.tsx`
2. `App.tsx` initializes Zustand stores (auth, compare) on mount
3. `AppRouter.tsx` defines public, protected, and admin routes
4. `Layout.tsx` / `AdminLayout.tsx` wrap page components

### State Management
- **Zustand stores**: auth (tokens, user, isAuthenticated), cart (server + guest), compare, wishlist
- **TanStack React Query**: Server state caching, invalidation, mutations
- **Axios instance**: Base URL resolved from `VITE_API_BASE_URL`, request interceptor for Bearer token, response interceptor for 401 auto-refresh with request queue

### Route Architecture
| Route Group | Guard | Layout |
|------------|-------|--------|
| /, /products/*, /cart, /compare, /stores | Public | Layout |
| /login, /register, /auth/* | Public | None |
| /wishlist, /checkout, /orders/*, /profile/*, /my-appointments | ProtectedRoute | Layout |
| /admin/*, /complaints | AdminRoute | AdminLayout |

### Feature Organization
Each domain module in `features/` contains:
- `components/` — UI components
- `pages/` — Page-level components
- `hooks/` — React hooks (if applicable)
- `utils/` — Utility functions
- `index.ts` — Barrel exports

### UI Components
- **shadcn/ui primitives** in `components/ui/`: dialog, select, button, badge, tabs, table, card, carousel, skeleton, avatar, alert-dialog, textarea, input, pagination
- **Layout components**: Header, MainNavigation, MobileMenu, MiniCartPreview, UserDropdown, Footer (implied)
- **Domain components**: OrderStatusBadge, AdminOrderDetailDialog, CancelOrderModal, CheckoutForm, ProductCard, etc.

### Testing
- Vitest with @testing-library/react
- Mocked API modules via `vi.mock()`
- 8 test files, 119 tests
- Radix UI portal considerations: close Select via Escape before asserting button states

## Backend

### Request Lifecycle
```
Incoming Request
    → correlationId (UUID v4)
    → express.json (10mb)
    → cors (FRONTEND_URL or *)
    → requestLogger (method, URL, duration)
    → Route matching
        → authMiddleware (optional/protected/admin)
        → Controller (may be wrapped with asyncHandler)
            → Service(s)
            → Model(s)
    → notFoundHandler (if no route matched)
    → errorHandler (if next(error) called)
        → AppError normalization
        → Mongoose/JWT error mapping
        → Pino logging with correlation ID
    → JSON Response
    → Response logged
```

### Error Handling
- **Centralized error foundation** (Phases 1 & 2): `AppError` class hierarchy in `utils/errors/`, global `errorHandler` middleware, `notFoundHandler` middleware
- **Error normalization**: AppError → status/code, Mongoose ValidationError → 400, CastError → 400, duplicate key → 409, TokenExpiredError → 401, JsonWebTokenError → 401
- **Response format**: `{ success: false, error: { message, code, details?, timestamp? } }` (timestamp in production only)
- **Production safety**: Generic messages for 5xx, no stack traces, no internal details
- **Logging**: Pino with correlation ID (requestId). 4xx at warn level, 5xx at error level. Sensitive data redacted.
- **Middleware order**: correlationId → parsers → cors → requestLogger → routes → notFoundHandler → errorHandler
- **Migrated modules**: complaint (Phase 1 pilot), health, address, profile (Phase 2). These controllers use `asyncHandler` and `AppError` classes. Errors flow through global `errorHandler` automatically.
- **Remaining controllers**: auth, product, order, cart, review, promotion, wishlist, compare, store, question, answer, dashboard, appointment — still use legacy local error handling.
- **Route-level handlers**: No route-level error middleware remains in migrated route files. Errors propagate to global `errorHandler` via Express `next(error)` (either explicitly or through `asyncHandler`).

### Graceful Shutdown
On SIGTERM/SIGINT:
1. BullMQ workers + queues closed
2. Socket.IO disconnected (broadcasts `serverShutdown`)
3. HTTP server closed
4. Redis disconnected
5. MongoDB disconnected
6. Logger flushed
7. `process.exit(0)`

## Database

### MongoDB (Mongoose 8)
- Connection: `MONGO_CONNECTION_STRING`, connection pool (maxPoolSize=10, minPoolSize=0), timeouts (serverSelection=5s, socket=45s, idle=30s)
- **User**: email unique, password (select:false), googleId (unique sparse), role (user/admin), login attempt tracking, email verification, password reset, unlock token
- **Product**: price (0-100M), specs (screen/processor/memory/camera/battery/connectivity/os/dimensions/weight/colors), embedding_vector (1536-dim), embeddingStatus (pending/processing/ready/failed), text index (name+brand+description+specs), vector index (embedding_vector for $vectorSearch)
- **Order**: items (embedded), shippingAddress (embedded), statusHistory (embedded), promotion (embedded), status enum with transitions, auto-increment order number (ORD-YYYYMMDD-XXX)
- **Cart**: user unique, items with product ref
- **Review**: user+product unique compound, rating 1-5, moderation status
- Other collections: Address, Answer, Appointment, CompareHistory, Complaint, Conversation, IdempotencyRecord, Promotion, Question, Store, Wishlist

### Redis 7
- **Library**: `redis` package v6
- **Usage**: Cache (product queries, default TTL 300s), BullMQ queue backend, login rate limiting, chat context (configurable TTL 30min, max 20 turns)
- **Note**: `reconnectStrategy = false` — no auto-reconnect on connection loss

## BullMQ

Three queues initialized in `bullmq/bootstrap.js`:

### systemQueue
- Job: `systemPing` — periodic ping to keep workers alive
- No special configuration

### emailQueue
- Job: `processJob` from `jobs/emailJobs.js`
- Email types: welcome, verification, password-reset, unlock-account, order-confirmation
- Concurrency: configurable via `EMAIL_QUEUE_CONCURRENCY` (default 2)
- Disabled via `EMAIL_QUEUE_ENABLED=false`

### embeddingQueue
- Job: `processEmbeddingJob` from `jobs/embeddingJobs.js`
- Generates embeddings via Gemini API, stores in `embedding_vector`
- Content-hash based deduplication (avoids redundant computation)
- Concurrency: configurable via `EMBEDDING_QUEUE_CONCURRENCY` (default 2)
- Lock duration: configurable via `EMBEDDING_WORKER_LOCK_DURATION` (default 60000ms)
- Disabled via `EMBEDDING_QUEUE_ENABLED=false`

### Infrastructure
- Queue factory (`queues/queueFactory.js`): Creates BullMQ Queue instances with safe close timeout
- Worker factory (`workers/workerFactory.js`): Creates Worker instances with event handlers (completed, failed, error, stalled)
- Queue registry (`queues/queueRegistry.js`): Tracks all queues for lifecycle management
- Worker registry (`workers/workerRegistry.js`): Tracks all workers for lifecycle management
- Connection (`queues/queueConnection.js`): Shared Redis connection for BullMQ, enabled via `BULLMQ_ENABLED` (default: true)

## AI

### RAG Pipeline
1. **Session**: Conversation stored in MongoDB (Conversation model)
2. **Intent Classification**: Prompt-based classification via OpenAI (`utils/gemini.js` delegates to OpenAI SDK) or Gemini fallback
3. **Embedding**: For product queries, `utils/openai.js` uses Gemini SDK (`@google/genai`) to generate embeddings with `gemini-embedding-001` (1536 dimensions)
4. **Vector Search**: MongoDB Atlas `$vectorSearch` on `embedding_vector` index
5. **Fallback**: If vector search fails → `$text` search (weighted: name=10, brand=8, description=5, specs=6) → latest active products with stock
6. **Constraint Parsing**: Natural language → price range, brands (include/exclude), inStock filters
7. **Ranking**: Soft preferences (camera, battery, performance, compact) from `productRanking.js`
8. **Context**: Redis-backed context with multi-turn merging (follow-up detection)
9. **Response**: OpenAI (`gpt-4o`) generates response via `utils/gemini.js`, streamed via Socket.IO

### External AI APIs

Note: File names are inverted relative to provider — `utils/gemini.js` uses OpenAI SDK for chat, while `utils/openai.js` uses Gemini SDK for embeddings.

- **OpenAI** (`openai` v5, primary chat provider):
  - Chat completions: `gpt-4o` via `utils/gemini.js`
  - Intent classification
  - Complaint handling
- **Google Gemini** (`@google/genai` v2, `@google/generative-ai` v0.24):
  - Embeddings: `gemini-embedding-001` (1536 dimensions) via `utils/openai.js`
  - Chat fallback: `gemini-2.0-flash` when OpenAI is unavailable

## Cloudinary

- **Library**: `cloudinary` v2
- **Configuration**: Lazy-initialized singleton (`configs/cloudinary.js`)
  - Reads `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  - Returns `null` if any env var is missing
  - `secure: true` for HTTPS URLs
- **Image Validation** (`services/productImageService.js`):
  - Accepts: Base64 data URIs (jpeg/png/webp, max 5MB decoded), absolute HTTPS URLs
  - Rejects: HTTP, relative, javascript:, blob:, file: URLs, localhost/private IPs (127.x, 10.x, 192.168.x, 172.16-31.x) in production
  - Custom error: `ProductImageValidationError` (statusCode=400, code='INVALID_PRODUCT_IMAGE')
- **Upload**: To `smart-ai/products` folder, returns `{ imageUrl, imagePublicId }`

## Brevo (Email)

- **Library**: `@getbrevo/brevo` v6
- **Service**: `emailService.js` sends transactional emails via Brevo API
- **Queue**: `emailQueueService.js` queues jobs via BullMQ with direct fallback
- **Email types**: welcome, verification, password-reset, unlock-account, order-confirmation

## External Services Summary

| Service | Purpose | Integration | Config Env Vars |
|---------|---------|-------------|-----------------|
| MongoDB Atlas | Primary database, vector search | Mongoose 8 | `MONGO_CONNECTION_STRING` |
| Redis | Cache, queue backend, rate limiting, context | `redis` v6 | `REDIS_URL` |
| Cloudinary | Product image hosting | `cloudinary` v2 | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Google Gemini | Embeddings (`gemini-embedding-001`), chat fallback (`gemini-2.0-flash`) | `@google/genai`, `@google/generative-ai` | `GEMINI_API_KEY` |
| OpenAI | Primary chat completions (`gpt-4o`), intent classification, complaint handling | `openai` v5 | `OPENAI_API_KEY` |
| Brevo | Transactional emails | `@getbrevo/brevo` v6 | `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME` |
| Google OAuth | Social login | `google-auth-library`, `googleapis` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

## Deployment Architecture

### Docker
```
nginx:3000 (frontend) → Express:5000 (backend) → MongoDB:27017, Redis:6379
```

### Production
```
Vercel (frontend) → Render (backend) → MongoDB Atlas (cloud) → Redis (managed)
```
