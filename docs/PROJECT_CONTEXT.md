# Project Context - Handoff Block

| Field | Value |
|-------|-------|
| **Last updated** | 2026-07-30 |
| **Verified commit** | `82a333a` (base commit before documentation changes) |
| **Current branch** | `feat/product-error-handling` |
| **Current task** | Product controller — `getAllProducts` and `getProductById` migrated to centralized error handling |
| **Next task** | Phase 3 continued: review remaining controllers (order, cart, review, promotion, wishlist, dashboard) |
| **Known blockers** | None |

> Update this block after each merged PR.

---

# Project Overview

Smart_AI is an AI-powered E-commerce Platform built with React 18, Express 4, MongoDB 7, Redis 7, Socket.IO, Docker, and AI APIs. The primary chat provider is OpenAI (`gpt-4o`); Gemini provides embeddings (`gemini-embedding-001`) and a chat fallback. Brevo handles transactional emails, and Cloudinary hosts product images.

# Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full details.

# Completed Work Summary

- **API Base URL production fix**: Frontend Axios validates absolute HTTPS URLs; rejects relative paths and mismatched origins.
- **Cloudinary integration**: Lazy-initialized Cloudinary client. All 21 Base64 product images migrated to Cloudinary. Product images now use public HTTPS URLs. Old order snapshots may still contain legacy image data.
- **Product image validation**: Custom `ProductImageValidationError`, Base64 limits (5MB, jpeg/png/webp), HTTPS-only, private IP rejection (172.16/12 range).
- **Order confirmation email**: Safe HTTPS image rendering and reliable order tracking links. Private-IP filtering in production HTML.
- **Admin order status transition flow**: Centralized `orderStatusTransitions.js` module mirrored in frontend, filtered dropdown, same-status rejection, `allowedNextStatuses` in error response.
- **Customer order detail page**: `/orders/:id` with loading skeleton and error states.
- **AI chatbot**: RAG pipeline (intent classification via OpenAI `gpt-4o` → vector search → constraint parsing → ranking → OpenAI `gpt-4o` primary chat completion with Gemini `gemini-2.0-flash` fallback), complaint handling via OpenAI, embeddings via Gemini (`gemini-embedding-001`), multi-turn context (Redis, 30min TTL, 20 max turns), evaluation framework at `evaluation/chatbot/`.
- **API documentation**: OpenAPI 3.1 spec with swagger-jsdoc + swagger-ui-express mounted at `/api-docs`. Documents Auth, Products, Orders, Cart, Chat, Reviews, Promotions, Complaints, Wishlist, Compare, Questions, Stores, Addresses, Profile, Appointments, Dashboard, Health. Includes reusable schemas (User, Product, Order, Review, Promotion, Error) and Bearer JWT auth. Route accuracy test suite (`tests/route-accuracy.test.js`) validates every swagger path matches a real Express route with correct auth documentation, plus OpenAPI structure and secret-safety checks.
- **Database ERD**: Complete entity-relationship documentation at `docs/ERD.md` covers all 16 collections, entity relationships, indexes, unique constraints, and scaling recommendations.

# Current Production State

- Frontend: Vercel (auto-deploy from main)
- Backend: Render (via `RENDER_EXTERNAL_URL`)
- Database: MongoDB Atlas (required for `$vectorSearch`)
- Cache/Queue: Redis managed
- Images: Cloudinary (all product images migrated)
- Email: Brevo configured

# Known Limitations

- `middlewares/errorHandler.js` — centralized error handler implemented (Phase 1–3). Migrated modules: complaint (Phase 1), health, address, profile, appointment, compare, question, answer, store (Phase 2), auth (Phase 3), product (Phase 3 continued: `createProduct`, `updateProduct`, `deleteProduct`, `getAllProducts`, `getProductById` migrated; `searchSemantic`, `getRecommendations` remain legacy). Remaining controllers (order, cart, review, promotion, wishlist, dashboard) still use legacy local error handling.
- Redis `reconnectStrategy = false` — resolved: auto-reconnect with exponential backoff implemented (see CHANGELOG)
- MongoDB `$vectorSearch` requires Atlas cluster
- No SMS provider — email only via Brevo
- Some controller tests tightly coupled to mocks
- `.env.docker.example` contains old SMTP vars but app uses Brevo API
- **Complaint route authorization fixed** — all 8 endpoints now protected with `protect` + `adminMiddleware` (branch `fix/complaint-route-authorization`).

# Documentation Maintenance

After every merged PR: update PROJECT_CONTEXT.md, ROADMAP.md, and CHANGELOG.md. Mutable status and test totals must include "Last updated" or "Verified at commit" metadata.
