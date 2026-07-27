# Project Context - Handoff Block

| Field | Value |
|-------|-------|
| **Last updated** | 2026-07-27 |
| **Verified commit** | `82a333a` (base commit before documentation changes) |
| **Current branch** | `docs/project-living-documentation` |
| **Last merged PR** | #38 - `fix/admin-order-status-flow` |
| **Current production status** | Frontend on Vercel, backend on Render, MongoDB Atlas, Redis managed |
| **Current task** | Add and verify living project documentation |
| **Next task** | Add `CONTRIBUTING.md` and `SECURITY.md` |
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

# Current Production State

- Frontend: Vercel (auto-deploy from main)
- Backend: Render (via `RENDER_EXTERNAL_URL`)
- Database: MongoDB Atlas (required for `$vectorSearch`)
- Cache/Queue: Redis managed
- Images: Cloudinary (all product images migrated)
- Email: Brevo configured

# Known Limitations

- `middlewares/errorHandler.js` is empty — error handling inlined in `index.js`
- Redis `reconnectStrategy = false` — requires restart on connection loss
- MongoDB `$vectorSearch` requires Atlas cluster
- No SMS provider — email only via Brevo
- Some controller tests tightly coupled to mocks
- `.env.docker.example` contains old SMTP vars but app uses Brevo API

# Documentation Maintenance

After every merged PR: update PROJECT_CONTEXT.md, ROADMAP.md, and CHANGELOG.md. Mutable status and test totals must include "Last updated" or "Verified at commit" metadata.
