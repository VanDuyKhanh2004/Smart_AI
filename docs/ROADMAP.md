# Roadmap

> Verification: status, test totals, and priorities below reflect the repository as verified on **2026-08-04** on branch **`docs/synchronize-project-documentation`** at commit **`8dca92e`** (latest merged main baseline).

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
- [x] OpenAI chat completions (gpt-4o, primary) and Gemini chat completions (fallback) — delivered as a single `aiResponse` emit over real-time Socket.IO transport
- [x] Gemini embeddings (`gemini-embedding-001`, 1536 dimensions)
- [x] Content-hash based embedding deduplication
- [x] Fallback chain (vector → text → latest products)
- [x] Offline evaluation harness (`evaluation/chatbot/`, 40 deterministic mocked scenarios: constraint parsing, MRR/ranking, multi-turn context, fallback behavior, CLI `--fail-under` thresholds)

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

### Testing & Quality
- [x] Backend test suite (1611 tests, 39 suites; verified 2026-08-04)
- [x] Frontend test suite (129 tests, 9 files; verified 2026-08-04, includes chat markdown/code-block regression tests)
- [x] CI-enforced TypeScript strict mode check
- [x] Chat code-block regression coverage — `frontend/src/tests/ChatCodeBlock.test.tsx` (10 scenarios)
- [x] Repository hygiene cleanup — untracked `.env.docker`, `uploads/avatars/*.jpg`, root `hortlog -sne`; removed leftover `_probe.test.tsx`

## Current Baseline

- Backend: 39 suites / **1611 tests** passing; Frontend: 9 files / **129 tests** passing; lint, `tsc -b`, and `npm run build` pass.
- Production: frontend on Vercel (auto-deploy), backend on Render (manual), MongoDB Atlas (`$vectorSearch`), managed Redis, Cloudinary images, Brevo email (API-only), Google OAuth.
- Chat responses are a single complete `aiResponse` event (no token-by-token streaming).
- AI evaluation is offline/mocked only — it does **not** measure live chatbot accuracy or production latency.

## Next Priorities

Prioritized by security/cost exposure first, then reliability, then performance. None started.

1. **Socket.IO authentication** — JWT handshake (`io.use(...)`) on the chat socket so anonymous clients cannot drive paid AI calls (currently unauthenticated).
2. **Chat / general / admin rate limiting** — extend beyond the login endpoint to the chat endpoint, general API, and admin routes.
3. **Helmet** — add security headers (CSP, `X-Frame-Options`, `X-Content-Type-Options`).
4. **Startup environment validation** — fail fast / warn on missing required env vars (`BREVO_*`, `GEMINI_API_KEY`, `GOOGLE_*`, etc.) instead of silently skipping features.
5. **Shiki migration** — replace the dead 621-line Shiki code-block component and unused `shiki`/`react-simple-icons` deps with the active `ai/code-block.tsx` (Shiki-ready).
6. **Bundle optimization** — address the 1.15 MB main chunk (Vite `>500 kB` warning) with `manualChunks` / vendor splitting.
7. **E2E tests** — add Playwright/Cypress smoke flows (login → browse → checkout → order; admin moderation).
8. **Socket.IO integration tests** — cover `sendMessage` → `aiResponse`, validation, rooms, and typing events.
9. **Controller/service refactoring** — split oversized controllers (`orderController` 803 L, `authController` 726 L, etc.) and extract services for cart/wishlist/compare/review/store/address/promotion/appointment/dashboard.
10. **True token streaming** — implement token-by-token `aiResponse` chunks (requires backend + frontend changes).
11. **Live RAG evaluation** — run a small live eval against real Atlas + real LLM to replace mocked-only numbers.
12. **Observability/metrics** — route remaining `console.*` calls through Pino; add metrics/APM and log aggregation.
13. **Backend CD** — automate Render deployment (workflow or blueprint) to match frontend CD.

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

- [ ] Socket.IO chat is **unauthenticated** — anonymous AI-cost exposure
- [ ] No Helmet (CSP / security headers)
- [ ] Rate limiting only on the login endpoint — chat/general/admin unprotected
- [ ] Tokens stored in `localStorage` (XSS exposure; `httpOnly` cookie strategy not implemented)
- [ ] Two error envelopes coexist (`{ success, error: {...} }` vs `{ success, message }` on product create/update and store/appointment/profile/address routes)
- [ ] Some controller tests mock implementation details (tight coupling to mocks)
- [ ] No database migration tool for schema changes
- [ ] Frontend test coverage limited to select components (9 test files vs ~13 feature modules)
- [ ] No automated performance or load testing
- [ ] No E2E tests; no Socket.IO integration tests
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
