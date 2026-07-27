# Roadmap

## Completed

### Authentication & Security
- [x] JWT authentication with access/refresh tokens
- [x] Google OAuth login
- [x] Email verification flow
- [x] Password reset with secure tokens
- [x] Account lock protection (5 failed attempts, 15min lockout)
- [x] Account unlock via email token
- [x] Login rate limiting (Redis-backed, 20 attempts/15min)
- [x] Admin role middleware

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
- [x] OpenAI chat completions (gpt-4o, primary) and Gemini chat completions (fallback) with streaming via Socket.IO
- [x] Gemini embeddings (`gemini-embedding-001`, 1536 dimensions)
- [x] Content-hash based embedding deduplication
- [x] Fallback chain (vector → text → latest products)

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

### Testing
- [x] Backend test suite (959 tests, 27 suites, snapshot verified at base commit `82a333a`)
- [x] Frontend test suite (119 tests, 8 files, snapshot verified at base commit `82a333a`)
- [x] CI-enforced TypeScript strict mode check

## In Progress

- None currently.

## Next Priority

Highest priority:

- [ ] Implement error handler middleware (`middlewares/errorHandler.js` is empty)

Then:

- [ ] Add Redis auto-reconnect (currently `reconnectStrategy = false`)
- [ ] Add rate limiting on admin endpoints
- [ ] Add environment variable validation at startup
- [ ] Generate API documentation (OpenAPI/Swagger)
- [ ] Add end-to-end tests (Cypress or Playwright)
- [ ] Increase frontend test coverage

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

## Ongoing Process

- [ ] Update PROJECT_CONTEXT.md, ROADMAP.md, and CHANGELOG.md after each merged PR
- [ ] Keep mutable status and test totals with "Last updated" / "Verified at commit" metadata

## Technical Debt

- [ ] `middlewares/errorHandler.js` file is empty — error handling inlined in `index.js`
- [ ] Redis `reconnectStrategy = false` — manual restart required on Redis failure
- [ ] Some controller tests mock implementation details (tight coupling to mocks)
- [ ] No enforced commit message convention
- [ ] No database migration tool for schema changes
- [ ] Frontend test coverage limited to select components (8 test files)
- [ ] Rate limiting only on login endpoint — admin endpoints unprotected
- [ ] No automated performance or load testing
