# Project Context - Handoff Block

| Field | Value |
|-------|-------|
| **Last updated** | 2026-08-13 |
| **Verified commit** | `f5b6c52` (latest merged main baseline: merge of PR #104 `fix/deployed-product-initial-load`) |
| **Verified branch** | `docs/portfolio-project-polish` (working tree) |
| **Current branch** | `docs/portfolio-project-polish` |
| **Current task** | Portfolio documentation polish — rewrite the root `README.md` as a portfolio landing page, add `docs/PORTFOLIO_NOTES.md`, and refresh stale docs (test totals, Helmet/security headers, route rate limiting, chat streaming, health-check paths). **In progress; not yet merged.** |
| **Next task (recommended)** | Chat / general / admin rate limiting (next ROADMAP priority). |
| **Known blockers** | None |

> Update this block after each merged PR.
> Test totals and other mutable values in this file are verified as of the `Verified branch`/`Verified commit` above.

---

# Project Overview

Smart_AI is an AI-powered E-commerce Platform built with React 18, Express 4, MongoDB 7, Redis 7, Socket.IO, Docker, and AI APIs. The primary chat provider is OpenAI (`gpt-4o`); Gemini provides embeddings (`gemini-embedding-001`) and a chat fallback. Brevo handles transactional emails, and Cloudinary hosts product images.

# Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full details. Product-query chat responses stream as token deltas over real-time Socket.IO transport (`aiResponseStart` / `aiResponseChunk` / `aiResponseComplete`); small-talk, complaint, and deterministic answers are delivered as one complete `aiResponse` event.

# Completed Work Summary

- **API Base URL production fix**: Frontend Axios validates absolute HTTPS URLs; rejects relative paths and mismatched origins.
- **Cloudinary integration**: Lazy-initialized Cloudinary client. All 21 Base64 product images migrated to Cloudinary. Product images now use public HTTPS URLs. Old order snapshots may still contain legacy image data.
- **Product image validation**: Custom `ProductImageValidationError`, Base64 limits (5MB, jpeg/png/webp), HTTPS-only, private IP rejection (172.16/12 range).
- **Order confirmation email**: Safe HTTPS image rendering and reliable order tracking links. Private-IP filtering in production HTML.
- **Admin order status transition flow**: Centralized `orderStatusTransitions.js` module mirrored in frontend, filtered dropdown, same-status rejection, `allowedNextStatuses` in error response.
- **Customer order detail page**: `/orders/:id` with loading skeleton and error states.
- **AI chatbot**: RAG pipeline (intent classification via OpenAI `gpt-4o` → vector search → constraint parsing → ranking → OpenAI `gpt-4o` primary chat completion with Gemini `gemini-2.0-flash` fallback), complaint handling via OpenAI, embeddings via Gemini (`gemini-embedding-001`), multi-turn context (Redis, 30min TTL, 20 max turns). Evaluation framework at `evaluation/chatbot/` (40 deterministic offline/mocked scenarios: constraint parsing, MRR/ranking, multi-turn context, fallback behavior, CLI thresholds). Product-query responses stream as token deltas over Socket.IO; small-talk/complaint/deterministic answers are a single `aiResponse`.
- **Chat reliability features** (merged PRs #88–#94, #101): conversation ownership isolation by authenticated user (unique `{ userId, sessionId }` index), message correlation + duplicate-submission protection (Redis dedup, replay-not-regenerate, local LRU fallback), real-time streaming, stop generation (per-request `AbortController`), Retry/Regenerate (generate-then-atomic-replace), and read-only REST conversation history with reload restore.
- **Security headers + route rate limiting** (PR #99): Helmet `v8` with a custom CSP (`middlewares/securityHeaders.js`, mounted `index.js:71`); express-rate-limit throttles on auth-session, email-action, resend-verification, token-action, and semantic-search endpoints.
- **Deployed first-load timeout fix** (PR #104): the axios response interceptor retries a timed-out `GET` exactly once (`ECONNABORTED`, no HTTP response, not `/auth/refresh`), bounding cold-start first-load failures.
- **API documentation**: OpenAPI 3.1 spec with swagger-jsdoc + swagger-ui-express mounted at `/api-docs`. Route accuracy test suite validates every swagger path against a real Express route.
- **Database ERD**: Complete entity-relationship documentation at `docs/ERD.md` covering all 16 collections, relationships, indexes, unique constraints, and scaling recommendations.
- **Chat code-block regression coverage** — `frontend/src/tests/ChatCodeBlock.test.tsx` added (code-block / markdown rendering regression tests). Complete.
- **Repository hygiene cleanup** — Untracked the committed `.env.docker`, the stray `uploads/avatars/*.jpg`, the root `hortlog -sne` artifact, and removed the leftover `_probe.test.tsx`. `.env.docker` and `uploads/**` are no longer tracked. Complete (merge PR #77).

# Current Production State

- Frontend: Vercel (auto-deploy from main)
- Backend: Render (via `RENDER_EXTERNAL_URL`)
- Database: MongoDB Atlas (required for `$vectorSearch`)
- Cache/Queue: Redis managed
- Images: Cloudinary (all product images migrated)
- Email: Brevo configured (API-only; no SMTP)
- Frontend test total: 421 tests / 40 files; Backend: 2043 tests / 68 suites (verified 2026-08-13)

# Known Limitations

- Socket.IO chat requires a JWT access-token handshake — unauthenticated clients are rejected before reaching AI processing (see ROADMAP / SECURITY). Known limitation: the access token still originates from `localStorage` on the frontend.
- Security headers are applied (Helmet `v8` + custom CSP, `middlewares/securityHeaders.js`); rate limiting covers the login endpoint plus auth-session/email-action/resend-verification/token-action/semantic-search routes — the chat endpoint and general/admin routes are not yet rate-limited (see ROADMAP / SECURITY).
- Access and refresh tokens are stored in `localStorage` on the frontend (XSS exposure trade-off; see SECURITY.md).
- Centralized error handling: `middlewares/errorHandler.js` is fully implemented with `AppError` classes; **all 18 controllers use `asyncHandler` + `AppError`** (order `createOrder` included). A subset of paths still requests the legacy `{ success, message }` top-level error envelope via `req.errorResponseFormat = 'legacy-top-level-message'`: product `createProduct`/`updateProduct`, and the store, appointment, profile, and address route groups (`routes/storeRoutes.js`, `appointmentRoutes.js`, `profileRoutes.js`, `addressRoutes.js`).
- Redis auto-reconnect with exponential backoff implemented (500ms → 30s cap, infinite retries, disabled during graceful shutdown).
- MongoDB `$vectorSearch` requires Atlas cluster.
- No SMS provider — email only via Brevo.
- Some controller tests tightly coupled to mocks.
- See `docs/ROADMAP.md` Technical Debt and `docs/PROJECT_TECHNICAL_AUDIT.md` for the full known-limitation list.

# Documentation Maintenance

After every merged PR: update PROJECT_CONTEXT.md, DEPLOYMENT.md, and CHANGELOG.md. Mutable status and test totals must include "Last updated" / "Verified at commit" metadata.