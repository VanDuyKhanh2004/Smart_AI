# Smart AI — Portfolio Notes

> Verified-only material for resumes, interviews, and recruiter demos. Every claim below is backed by the repository at HEAD `f5b6c52` (verified 2026-08-13). No fabricated metrics or production traffic claims.

## One-liner

**Smart AI** — a full-stack AI e-commerce platform (React + Express) whose flagship is a real-time RAG shopping assistant: it classifies intent, retrieves over MongoDB Atlas `$vectorSearch`, applies rule-based constraints/ranking, and streams Vietnamese answers over Socket.IO with duplicate-safe/idempotent delivery, cancel, retry/regenerate, and history restore.

## What it is

- Production-deployed full-stack app: **Vercel** (React SPA) + **Render** (Express API) + **MongoDB Atlas** (`$vectorSearch`) + managed **Redis** + **Cloudinary** + **Brevo** email + **OpenAI/Gemini**.
- Complete e-commerce domain: catalog, cart (server + guest merge), idempotent checkout, orders with validated status transitions, reviews with moderation, wishlist/compare, promotions, stores + opening-hours, appointments, complaints, Q&A, profile/addresses, and an admin dashboard with charts.
- The AI assistant is the centerpiece and the deepest engineering in the repo (~a dozen dedicated test files, 500+ lines of design contracts).

## Verified stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript 5.8 strict, Vite 7, Tailwind 4, shadcn/ui (Radix), Zustand 5, TanStack Query 5, React Router 7, Axios, socket.io-client 4, Recharts, Vitest 4 + Testing Library |
| Backend | Node ≥ 20, Express 4 (CommonJS), Mongoose 8, Socket.IO 4, BullMQ 5, Redis 6, Helmet 8, express-rate-limit 8, OpenAI 5, `@google/genai` 2, Cloudinary 2, Brevo 6, Pino 10, Jest 30 + Supertest 7 |
| Data | MongoDB Atlas (vector search on 1536-dim `gemini-embedding-001` embeddings), Redis (cache / queues / chat context / rate limits) |

## Architecture in one breath

A **modular monolith** (`middlewares → controllers → services → models`) behind one REST + Socket.IO surface. Chat is the only real-time surface: one authenticated socket carries streaming, dedup, stop, retry/regenerate, and typing; conversation history is a separate read-only REST layer that reuses the JWT/refresh flow. Background work (email, embeddings) runs on BullMQ workers. MongoDB is the source of truth; Redis is a fast, *explicitly failure-policy'd* auxiliary.

## Strongest contributions

1. **Chat messaging engine** — designed duplicate-safe/idempotent message handling on a lossy channel: client-minted `clientMessageId` → Redis dedup claim → replay (never re-run) of completed answers → bounded local LRU when Redis is down (per-process only). Winner of "how do you handle retries and duplicates" in interviews.
2. **Real-time AI streaming with user control** — delta-streamed answers over Socket.IO with a single `AbortController` per request threaded through the whole RAG pipeline so *Stop* prevents every later phase (no partial persistence, no wasted provider tokens). Added Retry (reuse turn) and Regenerate (fresh attempt id, atomic replace-only-on-success).
3. **RAG that is testable offline** — constraints and ranking are deterministic rules; only the final answer is LLM-written. An offline, mocked, deterministic evaluation harness (40 scenarios: constraint accuracy, MRR, multi-turn retention, fallback reliability) gates AI regressions without live provider calls.
4. **Explicit failure semantics** — a documented Redis policy map: cache fail-open, login limiter fail-open, email throttle fail-closed, chat dedup LRU fallback. Graceful shutdown (BullMQ → Socket.IO → HTTP → Redis → Mongo → log flush) and liveness/health/readiness endpoints.
5. **Security as a layer** — JWT access/refresh, Google OAuth, SHA-256-hashed one-time email tokens, account lockout, atomic Redis login rate limiting, Helmet CSP, and a JWT-gated chat socket that blocks anonymous clients from driving paid AI calls.

## CV-ready bullets

- Built an AI e-commerce platform (React/TypeScript + Node/Express) featuring a RAG shopping assistant that streams Vietnamese answers over Socket.IO; deployed to Vercel + Render with MongoDB Atlas `$vectorSearch` and Redis.
- Engineered duplicate-safe chat delivery via client-minted correlation ids and Redis dedup with replay-on-duplicate and a bounded local fallback during Redis outages.
- Added real-time streaming chat (small deltas) with user stop-generation (one AbortController per request), Retry, and Regenerate (generate-then-atomic-replace), plus conversation-history restore over REST.
- Designed a deterministic offline AI evaluation harness (constraint accuracy, MRR ranking, multi-turn context, fallback reliability) used as a CI quality gate; mocked all external providers so tests are hermetic.
- Shipped 2,464 automated tests (2,043 backend / 421 frontend) with CI enforcing type-check, lint, tests, and production build; Socket.IO suites use a real in-memory server.
- Hardened production behavior: Redis auto-reconnect with explicit fail-open/fail-closed policies, graceful shutdown, liveness/health/readiness endpoints, Helmet CSP, atomic Redis login rate limiting, and idempotent checkout.

## Interview talking points (dig here)

1. **Why Socket.IO instead of REST for chat?** One connection for streaming, typing, dedup acks, and cancel; history is a thin read-only REST layer reusing the existing token/refresh stack.
2. **How is duplicate processing prevented?** Client `clientMessageId` → Redis `SET NX` claim → `processing`/`completed` state machine → completed answers are *replayed* (cached payload) not regenerated; claims released on failure for explicit retry. Scope is `userId + sessionId + clientMessageId`, and the guarantee is per-process only when Redis is unavailable (bounded local LRU).
3. **What happens when Redis is down?** Policy map: cache and login-limiting fail open, email throttle fails closed, chat dedup degrades to a bounded process-local LRU; MongoDB remains the source of truth.
4. **How is Stop implemented?** One `AbortController` per accepted request, created at the socket boundary and threaded through intent → context → RAG → provider stream; checkpoints call `throwIfCancelled`; aborting prevents every later phase, partial content is never persisted, and the dedup claim is released so the same id can retry cleanly.
5. **What's the RAG pipeline?** Intent classification → embed → Atlas `$vectorSearch` → weighted `$text` fallback → latest-in-stock fallback → rule-based constraint parsing (price/brand/stock) → soft-preference ranking → LLM answer (OpenAI → Gemini → deterministic).
6. **Why are constraints/ranking deterministic rules rather than LLM output?** Cheap, fast, reproducible, and unit-testable offline; the LLM only does language generation. This is the crux of the offline evaluation harness.
7. **What if the provider streams a bit then fails?** No fallback after the first chunk — the stream surfaces one correlated terminal `error` event and nothing is persisted; provider fallback only happens when zero chunks were emitted.
8. **How is chat isolated per user?** Conversations are keyed `{ userId, sessionId }` (compound unique index); `userId` always comes from the verified socket identity; REST history filters by JWT; same `sessionId` from two users yields two isolated conversations and two separate Redis contexts.
9. **How do you test real-time Socket.IO without a server?** Real in-memory HTTP + Socket.IO server with `socket.io-client` over the WebSocket transport; only the DB/Redis/AI models are mocked. Frontend uses an in-memory fake socket.
10. **How do you rate-limit logins safely?** One atomic Lua script (INCR + EXPIRE in the same execution) — no TOCTOU, TTL set at creation, fixed window; fail-open when Redis isn't ready. Plus express-rate-limit throttles on auth-session, email-action, resend-verification, token-action, and semantic-search.
11. **What's the honest limitation list?** Tokens in `localStorage` (XSS exposure; `httpOnly` cookies pending), no chat/general/admin rate limiting yet, two error envelopes on a few legacy routes, offline eval is not live accuracy, no E2E tests, no automated backend CD.
12. **What was a real production bug you fixed?** Deployed first-load timeouts: cold starts exceeded the 10 s axios timeout → added a bounded single retry for timed-out GETs (`ECONNABORTED` with no HTTP response, GET-only, never a user abort and never the refresh call) so the page reliably loads on a cold instance.

## Reliability summary

- Graceful shutdown ordering: BullMQ → Socket.IO (`serverShutdown` broadcast) → HTTP → Redis → MongoDB → log flush → exit.
- Redis reconnect: `min(500 × 2ⁿ, 30000)` ms, infinite retries, disabled during shutdown.
- Health: `/health` (liveness) · `/api/health` (Mongo + Redis) · `/api/health/ready` (Mongo critical, Redis degraded → 200) · `/api/health/live`.
- Idempotent checkout: UUID key + request fingerprint.

## Testing & CI summary (snapshot, verified 2026-08-13)

- Backend: **68 suites / 2,043 tests** (Jest 30 + Supertest 7, `--runInBand`; all external deps mocked).
- Frontend: **40 files / 421 tests** (Vitest 4 + Testing Library + jsdom).
- AI offline eval: **40 deterministic scenarios** (`npm run evaluate:chatbot -- --fail-under=0.90`).
- CI: `tsc -b`, ESLint, vitest, build, backend tests. CD: Vercel auto-deploy on `main`.

## Demo flow (5 minutes)

1. **Search** — browse the catalog; note the product grid, filters, pagination, and opening-hours badges on store pages (computed in `Asia/Ho_Chi_Minh` on the client).
2. **AI chat** — open the floating chat: ask a constrained product question ("điện thoại dưới 10 triệu, pin tốt"), watch the stream, hit **Stop**, then **Regenerate**; reload the page to see the conversation restored.
3. **Auth** — register (email verification), login, Google login; trigger account-lock on repeated bad passwords and unlock via email.
4. **Checkout** — add to cart, check out (idempotency), see the order with validated status transitions.
5. **Admin** — sign in as admin: products, orders, review moderation, promotions, complaints, dashboard charts.

> **Screenshots**: none are committed yet — the root `README.md` has a `<!-- TODO -->` placeholder to paste product/search/AI-chat/admin captures when available. Do not substitute invented images.
