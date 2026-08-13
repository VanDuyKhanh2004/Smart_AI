# Roadmap

> Verification: status, test totals, and priorities below reflect the repository as verified on **2026-08-13** on branch **`docs/portfolio-project-polish`** (working tree; latest merged main baseline commit **`f5b6c52`**).

## Completed

### Authentication & Security
- [x] JWT authentication with access/refresh tokens
- [x] Google OAuth login
- [x] Email verification flow
- [x] Password reset with secure tokens
- [x] Account lock protection (5 failed attempts, 15min lockout)
- [x] Account unlock via email token
- [x] Login IP rate limiting (Redis-backed, 20 attempts/15min)
- [x] Admin role middleware
- [x] Complaint route authorization — all 8 endpoints protected with `protect` + `adminMiddleware`
- [x] Socket.IO chat authentication — JWT handshake (`io.use(...)`) so anonymous clients cannot drive paid AI calls; token from `handshake.auth.token` or `Authorization: Bearer`; refresh tokens rejected; stable auth error codes

### E-commerce Core
- [x] Product catalog CRUD with image upload
- [x] Product search (semantic vector + text + fallback)
- [x] Product recommendations (vector + brand/price + fallback)
- [x] Shopping cart (server + guest local cart merge on login)
- [x] Checkout with idempotency (UUID v4 key, fingerprint validation)
- [x] Order management (user: create/view/cancel; admin: list/stats/update status)
- [x] Centralized order status transitions with validated rules
- [x] Product image Cloudinary integration with validation
- [x] Customer reviews with moderation (pending/approved/rejected)
- [x] Wishlist functionality
- [x] Product comparison tool
- [x] Promotion/discount application (percentage/fixed, date range, usage limits)

### AI Features
- [x] AI chat assistant with RAG pipeline
- [x] Intent classification (small_talk, complaint, product_query via OpenAI gpt-4o with Gemini fallback)
- [x] Vector search for product queries (MongoDB Atlas `$vectorSearch`)
- [x] Natural language constraint parsing (price range, brands, specs)
- [x] Product ranking by soft preferences
- [x] Multi-turn chat context (Redis-backed, configurable TTL/max turns)
- [x] OpenAI chat completions (gpt-4o, primary) and Gemini chat completions (fallback) — product-query answers streamed as deltas over real-time Socket.IO (`aiResponseStart` / `aiResponseChunk` / `aiResponseComplete`); small-talk, complaint, and deterministic answers delivered as a single `aiResponse`
- [x] Gemini embeddings (`gemini-embedding-001`, 1536 dimensions)
- [x] Content-hash based embedding deduplication
- [x] Fallback chain (vector → text → latest products)
- [x] Offline evaluation harness (`evaluation/chatbot/`, 40 deterministic mocked scenarios: constraint parsing, MRR/ranking, multi-turn context, fallback behavior, CLI `--fail-under` thresholds)
- [x] Chat message correlation + duplicate-submission protection — `clientMessageId` Redis dedup (`processing`/`completed`), replay-not-regenerate on duplicates, bounded process-local LRU fallback
- [x] Real-time AI response streaming (delta chunks, zero-based sequential `chunkIndex`, authoritative `aiResponseComplete`)
- [x] Stop AI generation — one `AbortController` per accepted request threaded through the pipeline; no partial assistant content persisted; dedup claim released for clean retry
- [x] Retry and Regenerate — logical-turn vs generation-attempt identity; generate-then-atomic-replace for regenerate
- [x] Conversation history restore after reload (read-only REST `GET /api/chat/conversations`)
- [x] Conversation ownership isolation by authenticated user (unique `{ userId, sessionId }` index, trusted socket identity)

### Admin Features
- [x] Admin dashboard with charts and stats
- [x] Admin product management
- [x] Admin order management with status transitions
- [x] Admin review moderation
- [x] Admin Q&A management
- [x] Admin promotion management
- [x] Admin store management
- [x] Admin appointment management
- [x] Admin complaint management

### Infrastructure
- [x] Docker Compose (MongoDB 7, Redis 7, backend, frontend with nginx)
- [x] CI pipeline (GitHub Actions: backend tests + frontend type-check/tests/build)
- [x] Vercel CD for frontend (auto-deploy on push to main)
- [x] Graceful shutdown sequence
- [x] Health check endpoints (liveness, readiness, dependency status)
- [x] Correlation ID middleware for request tracing
- [x] Pino structured logging with sensitive data redaction
- [x] BullMQ job queues (email, embeddings, system ping) with concurrency control
- [x] OpenAPI 3.1 documentation with swagger-jsdoc + swagger-ui-express at `/api-docs`
- [x] Redis auto-reconnect with exponential backoff (500ms → 30s cap, infinite retries, disabled during graceful shutdown)
- [x] Centralized error handling — all 18 controllers migrated to `asyncHandler` + `AppError` (legacy `{ success, message }` envelope retained only on product create/update and store/appointment/profile/address routes)
- [x] Security headers — Helmet `v8` with a custom CSP (production `'self'` + Google, HSTS, `frame-ancestors`, `no-referrer`), applied before body parsers
- [x] Route-level rate limiting — express-rate-limit throttles on auth-session, email-action, resend-verification, token-action, and semantic-search endpoints (in addition to the Redis-backed login limiter)

### Testing & Quality
- [x] Backend test suite (2043 tests, 68 suites; verified 2026-08-13)
- [x] Frontend test suite (421 tests, 40 files; verified 2026-08-13, includes chat markdown/code-block, chat socket auth, correlation/streaming/stop/retry-regenerate, persistence/hydration tests)
- [x] CI-enforced TypeScript strict mode check
- [x] Chat code-block regression coverage — `frontend/src/tests/ChatCodeBlock.test.tsx` (10 scenarios)
- [x] Socket.IO integration tests — `backend/tests/socketAuth.test.js` (13 scenarios: handshake auth via token/header, all 4 auth error codes, query-param rejection, `socket.data.user` shape, `sendMessage` → AI pipeline, impersonation guard)
- [x] Frontend chat socket auth tests — `frontend/src/tests/ChatServiceAuth.test.ts` (7 scenarios: token handoff, `connect_error` mapping, no infinite retries, reconnect with fresh token, logout disconnect)
- [x] Repository hygiene cleanup — untracked `.env.docker`, `uploads/avatars/*.jpg`, root `hortlog -sne`; removed leftover `_probe.test.tsx`

## Current Baseline

- Backend: 68 suites / **2043 tests** passing; Frontend: 40 files / **421 tests** passing; lint, `tsc -b`, and `npm run build` pass.
- Chat sockets require a JWT handshake; unauthenticated sockets cannot reach the paid AI pipeline.
- Production: frontend on Vercel (auto-deploy), backend on Render (manual), MongoDB Atlas (`$vectorSearch`), managed Redis, Cloudinary images, Brevo email (API-only), Google OAuth.
- Product-query chat responses stream as deltas over Socket.IO; small-talk/complaint/deterministic answers are a single `aiResponse`.
- AI evaluation is offline/mocked only — it does **not** measure live chatbot accuracy or production latency.

## Next Priorities

Prioritized by security/cost exposure first, then reliability, then performance. None started.

1. **Chat / general / admin rate limiting** — extend beyond the login endpoint and the existing auth/semantic-search route limiters to the chat endpoint, general API, and admin routes.
2. **httpOnly cookie token strategy** — move access/refresh tokens out of `localStorage` to remove the XSS exposure (documented as a known limitation in SECURITY.md).
3. **Startup environment validation** — fail fast / warn on missing required env vars (`BREVO_*`, `GEMINI_API_KEY`, `GOOGLE_*`, etc.) instead of silently skipping features.
4. **Shiki migration** — replace the dead 621-line Shiki code-block component and unused `shiki`/`react-simple-icons` deps with the active `ai/code-block.tsx` (Shiki-ready).
5. **Bundle optimization** — address the 1.15 MB main chunk (Vite `>500 kB` warning) with `manualChunks` / vendor splitting.
6. **E2E tests** — add Playwright/Cypress smoke flows (login → browse → checkout → order; admin moderation).
7. **Controller/service refactoring** — split oversized controllers (`orderController` 803 L, `authController` 726 L, etc.) and extract services for cart/wishlist/compare/review/store/address/promotion/appointment/dashboard.
8. **Legacy error-envelope cleanup** — retire the remaining `{ success, message }` top-level envelopes on product create/update and store/appointment/profile/address routes so every endpoint uses the centralized `{ success, error: {...} }` format.
9. **Live RAG evaluation** — run a small live eval against real Atlas + real LLM to replace mocked-only numbers.
10. **Observability/metrics** — route remaining `console.*` calls through Pino; add metrics/APM and log aggregation.
11. **Backend CD** — automate Render deployment (workflow or blueprint) to match frontend CD.

## Future Ideas

- [ ] Multi-language support (i18n)
- [ ] Payment gateway integration (VNPay, Momo)
- [ ] Real-time order tracking with shipping updates
- [ ] Push notifications (web + mobile)
- [ ] Product comparison v2 (side-by-side spec table)
- [ ] Customer analytics dashboard
- [ ] Automated product import/export (CSV, Excel)
- [ ] Mobile app (React Native)
- [ ] Admin role hierarchy (super-admin, manager, staff)
- [ ] SEO optimization (server-side rendering)
- [ ] Webhook system for third-party integrations
- [ ] Automated backup and disaster recovery
- [ ] Kubernetes deployment support

## Technical Debt

- [ ] No rate limiting on the chat endpoint or general/admin routes (login, auth-session, email-action, resend-verification, token-action, and semantic-search are covered)
- [ ] Tokens stored in `localStorage` (XSS exposure; `httpOnly` cookie strategy not implemented)
- [ ] Two error envelopes coexist (`{ success, error: {...} }` vs `{ success, message }` on product create/update and store/appointment/profile/address routes)
- [ ] Some controller tests mock implementation details (tight coupling to mocks)
- [ ] No database migration tool for schema changes
- [ ] Frontend test coverage limited to select components (11 test files vs ~13 feature modules)
- [ ] No automated performance or load testing
- [ ] No E2E tests
- [ ] Dead code: Shiki code-block component (621 L, no importers), `systemQueue` with no producer, unused exports (`getSocketStats`), unused deps (`nodemailer`, `googleapis`, `@google/generative-ai`, `uuid`, `shiki`, `react-simple-icons`)
- [ ] Main bundle 1.15 MB with no `manualChunks`
- [ ] TanStack Query underused (most pages fetch via `useState`/`useEffect`)
- [ ] Two competing base-URL conventions (`.replace('/api','')` vs `resolveBackendOrigin()`)
- [ ] Oversized controllers and inconsistent service layer
- [ ] No backend CD (manual Render deploy)
- [ ] No observability metrics/APM; `console.*` calls bypass Pino
- [ ] No commit-message enforcement (convention is followed by habit)

## Ongoing Process

- [ ] Update PROJECT_CONTEXT.md, DEPLOYMENT.md, and CHANGELOG.md after each merged PR
- [ ] Keep mutable status and test totals with "Verified" / "Last updated" metadata
