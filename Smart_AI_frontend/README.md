# Smart AI Frontend

React SPA for the Smart AI e-commerce platform: catalog browsing, cart, idempotent checkout, orders, reviews, Q&A, wishlist, compare, stores, appointments, complaints, an admin dashboard, and a floating AI chat assistant delivered over Socket.IO.

## Stack

| Area | Tech |
|------|------|
| UI | React 18, TypeScript 5.8 (strict), Tailwind CSS 4 |
| Build | Vite 7 |
| Components | shadcn/ui (Radix primitives), Lucide icons, Recharts, React Markdown + KaTeX |
| State | Zustand 5 (auth, cart, compare, wishlist), TanStack React Query 5 |
| Routing | React Router DOM 7 |
| API | Axios (Bearer JWT + 401 auto-refresh queue) |
| Realtime | socket.io-client 4 (AI chat) |
| Tests | Vitest 4 + @testing-library/react 16 + jsdom |

## Folder Structure

```
src/
├── assets/          static assets
├── components/      shared + shadcn/ui primitives (ui/), AI chat UI (ui/shadcn-io/)
├── constants/       shared constants
├── features/        domain modules (auth, products, cart, checkout, orders, chat,
│                    compare, wishlist, reviews UI, complaints, stores, addresses,
│                    appointments, profile, admin)
├── lib/             axios instance, API base URL resolution, Google Identity helper
├── routes/          AppRouter (lazy-loaded public/protected/admin routes)
├── services/        API service modules (per domain)
├── stores/          Zustand stores
├── tests/           Vitest test files
└── types/           TypeScript types
```

Each domain in `features/` contains `components/`, `pages/`, `hooks/` (if applicable), `utils/`, and an `index.ts` barrel.

## Setup

Requires the backend running (see `../Smart_AI_backend/README.md`).

```bash
cd Smart_AI_frontend
npm install
cp .env.example .env        # or create .env.local
npm run dev                 # Vite dev server on http://localhost:5173
```

## Environment Variables

Copy `.env.example` to `.env`. All `VITE_*` values are **public** (embedded in the client bundle at build time) — never put backend secrets (API keys, JWT secrets, DB credentials) in them.

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | **Yes** | Backend API base URL, absolute http/https, must not match the frontend origin (e.g., `http://localhost:5000/api`) |
| `VITE_API_URL` | No | Backend base URL for non-API endpoints (used for Socket.IO origin derivation) |
| `VITE_GOOGLE_CLIENT_ID` | Conditional | Google OAuth client ID (needed for Google login) |

Env changes require a rebuild (`npm run build` or restart `npm run dev`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server with HMR |
| `npm run lint` | ESLint |
| `npm test` | Vitest run (all tests) |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run preview` | Preview the production build locally |

## Tests

```bash
npm test                 # 129 tests / 9 files (verified 2026-08-04)
npx vitest --watch       # Watch mode
```

Covered: auth refresh flow, API base URL resolution, Google Identity, order status transitions, order detail page, admin order dialog, product recommendations, idempotency key, and chat markdown/code-block rendering.

## Build & Deployment

- **Production build**: `npm run build` (`tsc -b && vite build`), output `dist/`.
- **Vercel**: auto-deployed via GitHub Actions on push to `main` when `Smart_AI_frontend/**` changes. Set `VITE_API_BASE_URL`, `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID` in the Vercel project env — changes require a fresh build.
- **Docker**: served by nginx in `docker-compose.yml`; build args `VITE_API_BASE_URL`, `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`.

## Backend Dependency

The frontend requires the backend API at `VITE_API_BASE_URL` for all data and auth, and the backend Socket.IO server for the AI chat. CORS and Socket.IO origin are configured by the backend's `FRONTEND_URL`. There is no offline mode.

## Google Identity

Google login uses the Google Identity Services (GIS) script, which the app loads at runtime (see `src/lib/googleIdentity.ts`). An internet connection is required to load it, and `VITE_GOOGLE_CLIENT_ID` must be set to a client registered for the deployment origin.
