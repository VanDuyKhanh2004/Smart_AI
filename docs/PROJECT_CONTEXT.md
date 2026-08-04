# Project Context - Handoff Block

| Field | Value |
|-------|-------|
| **Last updated** | 2026-08-04 |
| **Verified commit** | `8dca92e` (latest merged main baseline: merge of PR #77 `chore/repository-hygiene`) |
| **Verified branch** | `docs/synchronize-project-documentation` |
| **Current branch** | `docs/synchronize-project-documentation` |
| **Current task** | Documentation synchronization (README, SECURITY, docs/*, env templates) against verified production facts |
| **Next task (recommended)** | Socket.IO chat authentication — attach JWT handshake so chat cannot be used to drive paid AI calls anonymously (see `docs/ROADMAP.md`). **Not started.** |
| **Known blockers** | None |

> Update this block after each merged PR.
> Test totals and other mutable values in this file are verified as of the `Verified branch`/`Verified commit` above.

---

# Project Overview

Smart_AI is an AI-powered E-commerce Platform built with React 18, Express 4, MongoDB 7, Redis 7, Socket.IO, Docker, and AI APIs. The primary chat provider is OpenAI (`gpt-4o`); Gemini provides embeddings (`gemini-embedding-001`) and a chat fallback. Brevo handles transactional emails, and Cloudinary hosts product images.

# Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full details. Chat responses are delivered as one complete `aiResponse` event over real-time Socket.IO transport (not token-by-token streaming).

# Completed Work Summary

- **API Base URL production fix**: Frontend Axios validates absolute HTTPS URLs; rejects relative paths and mismatched origins.
- **Cloudinary integration**: Lazy-initialized Cloudinary client. All 21 Base64 product images migrated to Cloudinary. Product images now use public HTTPS URLs. Old order snapshots may still contain legacy image data.
- **Product image validation**: Custom `ProductImageValidationError`, Base64 limits (5MB, jpeg/png/webp), HTTPS-only, private IP rejection (172.16/12 range).
- **Order confirmation email**: Safe HTTPS image rendering and reliable order tracking links. Private-IP filtering in production HTML.
- **Admin order status transition flow**: Centralized `orderStatusTransitions.js` module mirrored in frontend, filtered dropdown, same-status rejection, `allowedNextStatuses` in error response.
- **Customer order detail page**: `/orders/:id` with loading skeleton and error states.
- **AI chatbot**: RAG pipeline (intent classification via OpenAI `gpt-4o` → vector search → constraint parsing → ranking → OpenAI `gpt-4o` primary chat completion with Gemini `gemini-2.0-flash` fallback), complaint handling via OpenAI, embeddings via Gemini (`gemini-embedding-001`), multi-turn context (Redis, 30min TTL, 20 max turns). Evaluation framework at `evaluation/chatbot/` (40 deterministic offline/mocked scenarios: constraint parsing, MRR/ranking, multi-turn context, fallback behavior, CLI thresholds). Responses are a single `aiResponse` emit, not token-streamed.
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
- Frontend test total: 129 tests / 9 files; Backend: 1611 tests / 39 suites (verified 2026-08-04)

# Known Limitations

- Socket.IO chat is **unauthenticated** — any client can drive paid AI calls (known limitation; see ROADMAP next priority).
- No Helmet (CSP/security headers) and rate limiting covers only the login endpoint (see ROADMAP / SECURITY).
- Access and refresh tokens are stored in `localStorage` on the frontend (XSS exposure trade-off; see SECURITY.md).
- Centralized error handling: `middlewares/errorHandler.js` is fully implemented with `AppError` classes; **all 18 controllers use `asyncHandler` + `AppError`** (order `createOrder` included). A subset of paths still requests the legacy `{ success, message }` top-level error envelope via `req.errorResponseFormat = 'legacy-top-level-message'`: product `createProduct`/`updateProduct`, and the store, appointment, profile, and address route groups (`routes/storeRoutes.js`, `appointmentRoutes.js`, `profileRoutes.js`, `addressRoutes.js`).
- Redis auto-reconnect with exponential backoff implemented (500ms → 30s cap, infinite retries, disabled during graceful shutdown).
- MongoDB `$vectorSearch` requires Atlas cluster.
- No SMS provider — email only via Brevo.
- Some controller tests tightly coupled to mocks.
- See `docs/ROADMAP.md` Technical Debt and `docs/PROJECT_TECHNICAL_AUDIT.md` for the full known-limitation list.

# Documentation Maintenance

After every merged PR: update PROJECT_CONTEXT.md, DEPLOYMENT.md, and CHANGELOG.md. Mutable status and test totals must include "Last updated" / "Verified at commit" metadata.