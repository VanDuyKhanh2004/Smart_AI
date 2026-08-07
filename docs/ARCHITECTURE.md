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
- 11 test files, 153 tests (verified 2026-08-04)
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
- **Centralized error handling is fully migrated**: `AppError` class hierarchy in `utils/errors/`, global `errorHandler` middleware, `notFoundHandler` middleware. All 18 controllers wrap handlers with `asyncHandler` and throw `AppError` subclasses.
- **Error normalization**: AppError → status/code, Mongoose ValidationError → 400, CastError → 400, duplicate key → 409, TokenExpiredError → 401, JsonWebTokenError → 401
- **Response format**: `{ success: false, error: { message, code, details?, timestamp? } }` (timestamp in production only)
- **Legacy envelope paths**: a small set of paths requests the legacy `{ success, message }` top-level format via `req.errorResponseFormat = 'legacy-top-level-message'` — product `createProduct`/`updateProduct` (`controllers/productController.js`) and the store, appointment, profile, and address route groups (`routes/storeRoutes.js`, `appointmentRoutes.js`, `profileRoutes.js`, `addressRoutes.js`).
- **Production safety**: Generic messages for 5xx, no stack traces, no internal details
- **Logging**: Pino with correlation ID (requestId). 4xx at warn level, 5xx at error level. Sensitive data redacted.
- **Middleware order**: correlationId → parsers → cors → requestLogger → routes → notFoundHandler → errorHandler

### Graceful Shutdown
On SIGTERM/SIGINT:
1. BullMQ workers + queues closed
2. Socket.IO disconnected (broadcasts `serverShutdown`)
3. HTTP server closed
4. Redis disconnected
5. MongoDB disconnected
6. Logger flushed
7. `process.exit(0)`

## Real-time Chat (Socket.IO)

### Handshake Authentication
Chat sockets authenticate at connection time. `socketHandler.js` registers `io.use(authenticateSocket)` (`middlewares/socketAuthMiddleware.js`) so the handshake is verified **before** any event can be processed.

- Token accepted from `socket.handshake.auth.token` (frontend handoff) or an `Authorization: Bearer <token>` header.
- Query-string tokens are **not** accepted.
- Tokens are verified with the same `JWT_SECRET` used by REST endpoints (`utils/jwt.js` → `verifyAccessToken`); refresh tokens (signed with `JWT_REFRESH_SECRET`) are rejected.
- On success, only safe identity data is attached: `socket.data.user = { id, email, role }`. Password, hashes, refresh tokens, and full user documents are never attached.
- On failure the connection is rejected with a stable code; raw JWT errors, secrets, and stack traces are never exposed to the client.

### Stable Auth Error Codes
- `SOCKET_AUTH_REQUIRED` — token missing
- `SOCKET_AUTH_INVALID` — malformed token, bad signature, or refresh token used as access token
- `SOCKET_AUTH_EXPIRED` — expired access token
- `SOCKET_USER_NOT_FOUND` — token is valid but the user no longer exists

### Protected Events
The following events run only after `requireSocketAuth` (defense-in-depth beyond the handshake gate):
- `sendMessage` (routes to the RAG/AI pipeline)
- `joinRoom` / `leaveRoom`
- `typing` / `stopTyping`

`sendMessage` is the only event that reaches AI processing, conversation persistence, and Redis context; unauthenticated sockets never reach `chatController.processMessage`.

### Frontend Token Handoff
`chat.service.ts` sends the access token via `io(backendOrigin, { auth: { token } })` (no query params). `connect_error` auth codes are mapped to Vietnamese user messages, and the socket disconnects on auth errors so invalid tokens are not retried forever. `reconnectWithToken()` reconnects with the latest token after login/refresh, and `authStore.logout()` disconnects the live socket so stale credentials are not reused.

### Identity Integrity
The authenticated `socket.data.user.id` is the server-side identity. Client-supplied `userId` in event payloads is ignored — `sendMessage` passes only `sessionId`/`message` through, so payload `userId` cannot impersonate another user.

### Conversation Ownership
Conversations are owned by the authenticated user, not by the client-supplied `sessionId`. The `Conversation` model stores a `userId` (ObjectId → `User`) and enforces ownership with a unique compound index on `{ userId, sessionId }` — the global `sessionId` uniqueness is removed so two users can each hold the same client-visible `sessionId`.

- **Trusted identity source**: `chatController` reads `userId` exclusively from `socket.data.user.id`. Payload `userId` is ignored.
- **Compound lookup**: every conversation operation (find/create, history load, user-message save, assistant-response save, complaint persistence) queries by `{ sessionId, userId }`. A foreign or legacy `sessionId` simply misses and a fresh owned conversation is created for the current user.
- **Isolation invariant**: User A and User B may submit the same `sessionId` and still get separate MongoDB conversations and separate LLM prompt contexts. Nothing reveals another user's existence, email, ID, messages, or session ownership.
- **Legacy policy**: documents created before ownership (no `userId`) are never auto-claimed by a `sessionId`. A new owned conversation is started for the presenting user; legacy documents remain untouched. No ownership migration runs automatically.

### Redis Context Isolation
Chat multi-turn context is Redis-backed (`services/contextService.js`) and scoped per user:
- Authenticated: `chat:context:user:<userId>:<sessionId>`
- Anonymous/local: `chat:context:anon:<sessionId>` (unchanged)

Authenticated flows never read the legacy anonymous keys, so two users sharing a `sessionId` cannot share Redis context. TTL (default 30 min, `CHAT_CONTEXT_TTL_SECONDS`) and the "Redis-unavailable is non-fatal" behavior are unchanged.

### Conversation History (REST) & Reload Restoration

Live chat stays Socket.IO-only — there is **no `POST /api/chat`**. History is exposed over REST so it reuses the existing `protect` + axios Bearer/refresh flow. The REST layer is thin and read-only; it never bypasses the ownership written by the socket boundary.

- **Endpoints** — `GET /api/chat/conversations` (list) and `GET /api/chat/conversations/:sessionId` (detail), mounted in `routes/chatRoutes.js` at `/api/chat` before the 404 handler; handled by `controllers/conversationController.js`.
- **Identity** — both use `protect` and always filter by `req.user.id` from the JWT; a client-supplied `userId` is ignored. This matches the socket side, which writes `userId` from `socket.data.user.id` (an ObjectId string = `req.user.id`), so both transports address the same owned conversations.
- **List contract** — owned + `status:'active'` + `messageCount > 0`; legacy documents without a `userId` are invisible. `$sort` `lastMessageAt desc, _id desc`; `$limit: limit+1` (default 20, max 50) to compute a `nextCursor`; cursor is opaque base64url JSON `{ lastMessageAt, _id }`. Summaries only — `messages[]`, `ipAddress`, `userAgent` never projected; `preview` truncated from the latest USER message (120 chars).
- **Detail contract** — UUID-validated `sessionId` (else `BadRequestError('INVALID_SESSION')`); a missing **or** foreign session returns the same generic `NotFoundError('CONVERSATION_NOT_FOUND')` so ids cannot be enumerated; explicit DTO mapper whitelists only UI-needed assistant metadata (`modelUsed, responseType, skipRAG, processingTime, tokensUsed, clarifiedQuery, originalQuery`); user metadata and `ipAddress`/`userAgent`/debug fields are never returned.
- **Error shape** — centralized `{ success:false, error:{ code, message } }` via the existing `AppError` hierarchy.

#### Frontend persistence hints (localStorage)

The browser records two `localStorage` keys that are **hints only**, never the source of truth:
- `SMART_AI_SELECTED_CHAT_SESSION` — the session to resume.
- `SMART_AI_CHAT_RESTORE_MODE` — `'selected'` | `'new'`.

`src/services/chatPersistence.ts` exposes get/set/clear helpers plus `clearChatPersistence()`, which clears the selected session **and explicitly writes mode `'new'`** — so after logout an unset key never falls back to `'selected'`. `clearChatPersistence()` is invoked on logout, failed refresh, and failed `initialize()` in `authStore`; a successful refresh does **not** clear it. Result: on the same browser, user B can never hydrate user A's session.

#### Hydration flow (`FloatingChat.handleConnected`)

On mount/connect, exactly once per mount, the component consults the hints:
1. If restore mode is `'new'` (or no selected session), it only adds the welcome greeting — the previous session is never restored, and a reload **before** the first send after a New Chat does not resurrect the old chat.
2. If mode is `'selected'` and a selected session exists, `getConversation` (REST) is fetched, rows are mapped by `hydrateMessages()` (`chatHistory.service.ts`) into `ChatMessage`s, `chatService.restoreSession()` adopts the id, and content is rendered — the welcome is **not** shown over hydrated content.
3. Hydration failure (404/foreign/network) → `resetSession()` (clears the irrecoverable hint), welcome shown, and a `historyError` notice renders above the composer; sending is blocked while hydration is in flight.
4. The first `accepted`/`processing` send ack persists the current session (`persistCurrentSession()`), so a reload after the first interaction resumes the same conversation. New Chat (`resetSession()`) sets mode `'new'` and clears selected so the next reload starts fresh.

Hydrated messages are rendered defensively: never retryable/failed/cancelled/loading, content-only, with UI-only fallback ids (`clientMessageId || generationId || :hydrated:<uuid>`), and non-user/assistant + blank content dropped.

### Tests
- `tests/socketAuth.test.js` — real in-memory HTTP + Socket.IO server with `socket.io-client` (13 scenarios).
- `frontend/src/tests/ChatServiceAuth.test.ts` — mocked `socket.io-client` (7 scenarios).
- `tests/chatConversationOwnership.test.js` — 18 ownership/isolation scenarios (no real MongoDB/Redis/LLM).
- `tests/chatHistory.test.js` — 28 REST history scenarios (cursor/limit parsing, pipeline filters, DTO mapping, metadata whitelist, ownership, generic 404, no `messages`/`ipAddress`/`userAgent` leak).
- `frontend/src/tests/chatPersistence.test.ts`, `src/tests/ChatServicePersistence.test.ts`, `src/tests/FloatingChatHydration.test.tsx`, `src/tests/AuthSocketSync.test.ts` — persistence hints, session restore/reset, hydration flow, and logout/refresh isolation.

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
- **Auto-reconnect**: Exponential backoff via `reconnectStrategy` (node-redis) / `retryStrategy` (ioredis/BullMQ). Formula: `min(500 × 2^attempt, 30000)ms`, infinite retries. `setShuttingDown()` disables reconnect during graceful shutdown.

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
9. **Response**: OpenAI (`gpt-4o`) generates response via `utils/gemini.js`, delivered as a single complete `aiResponse` event over real-time Socket.IO transport (no token-by-token streaming).

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
