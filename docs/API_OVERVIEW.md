# API Overview

Smart AI backend exposes a RESTful JSON API. Interactive documentation is available at `/api-docs` when the server is running.

## Base URL

```
http://localhost:5000/api
```

Production base URL is configured via `FRONTEND_URL` / `RENDER_EXTERNAL_URL`.

## Interactive Documentation (Swagger)

Navigate to `/api-docs` on a running instance to browse, test, and explore all endpoints interactively.

- **OpenAPI version**: 3.1
- **Authentication**: Bearer JWT (click "Authorize" in Swagger UI to set your token)

## Endpoint Groups

| Tag | Prefix | Authentication | Description |
|-----|--------|----------------|-------------|
| Auth | `/api/auth` | Mixed | Register, login, Google OAuth, email verification, password reset, account unlock |
| Products | `/api/products` | Mixed | Product CRUD, search, recommendations, lightweight metadata (`/products/meta`) |
| Orders | `/api/orders` | Authenticated | Create and manage orders; admin: list all, update status |
| Cart | `/api/cart` | Authenticated | Shopping cart operations |
| Reviews | `/api/reviews` | Mixed | Product reviews and moderation |
| Promotions | `/api/promotions` | Admin | Promotion/discount management |
| Complaints | `/api/complaints` | Admin | Customer complaint management |
| Wishlist | `/api/wishlist` | Authenticated | Product wishlist |
| Compare | `/api/compare` | Mixed | Product comparison |
| Questions | `/api/questions` | Mixed | Q&A for products |
| Stores | `/api/stores` | Mixed | Store management |
| Addresses | `/api/addresses` | Authenticated | Shipping address management |
| Profile | `/api/profile` | Authenticated | User profile and avatar |
| Appointments | `/api/appointments` | Mixed | Store appointment booking |
| Dashboard | `/api/dashboard` | Admin | Admin analytics and statistics |
| Chat | `/api/chat` | Authenticated | Conversation history list + detail (live chat is Socket.IO-only) |
| Health | `/api/health` | Public | Health check endpoints |

## Authentication

Most endpoints require a Bearer JWT token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Access tokens are short-lived (default 15 minutes). Use the `/api/auth/refresh` endpoint with a refresh token to obtain a new access token.

## Rate Limiting

Rate limiting is enforced on the login endpoint (`/api/auth/login`) via Redis-backed token bucket (20 attempts per 15-minute window per IP).

## Chat History (REST)

Live chat messaging itself remains Socket.IO-only — **there is no `POST /api/chat`**. History is served over REST so it can reuse the existing `protect` + axios Bearer/refresh flow.

Both endpoints require a Bearer JWT and always operate on the authenticated user's own conversations (`req.user.id` from the token); any client-supplied `userId` is ignored.

### `GET /api/chat/conversations`

List the authenticated user's active conversations (owned, `status: 'active'`, `messageCount > 0`). Summaries only — `messages[]` is never included. Sorted `lastMessageAt` desc (tie-break `_id` desc).

Query params:
- `limit` — page size, default `20`, max `50`
- `cursor` — opaque base64url token returned as `nextCursor`; pass it to fetch the next page

```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "sessionId": "550e8400-e29b-41d4-a716-446655440000",
        "messageCount": 4,
        "lastMessageAt": "2026-08-07T12:00:00.000Z",
        "preview": "Em ơi chiếc iPhone 15 đang giá bao nhiêu ạ?",
        "createdAt": "2026-08-07T10:00:00.000Z",
        "updatedAt": "2026-08-07T12:00:00.000Z"
      }
    ],
    "nextCursor": null
  }
}
```

### `GET /api/chat/conversations/:sessionId`

Fetch one owned conversation's full message history. `sessionId` must be a valid UUID (else `400` `INVALID_SESSION`). A missing **or** foreign session returns the same generic `404` `CONVERSATION_NOT_FOUND` so conversation ids cannot be enumerated. Only UI-needed metadata is returned — `ipAddress`/`userAgent`/debug fields are never exposed.

```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "active",
    "messageCount": 4,
    "lastMessageAt": "2026-08-07T12:00:00.000Z",
    "createdAt": "2026-08-07T10:00:00.000Z",
    "updatedAt": "2026-08-07T12:00:00.000Z",
    "messages": [
      {
        "role": "user",
        "content": "Em ơi chiếc iPhone 15 đang giá bao nhiêu ạ?",
        "timestamp": "2026-08-07T11:59:00.000Z",
        "clientMessageId": "c1"
      },
      {
        "role": "assistant",
        "content": "Dạ, iPhone 15 đang là 19.990.000đ ...",
        "timestamp": "2026-08-07T12:00:00.000Z",
        "clientMessageId": "a1",
        "generationId": "a1",
        "metadata": { "modelUsed": "openai" }
      }
    ]
  }
}
```

### Frontend persistence hints

The browser uses two `localStorage` keys — **hints only, never the source of truth**: `SMART_AI_SELECTED_CHAT_SESSION` (the session to resume) and `SMART_AI_CHAT_RESTORE_MODE` (`'selected'` | `'new'`). After logout the mode is forced to `'new'` and the selected session cleared, so one browser can never hydrate a previous user's chat. See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Common Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Vui lòng đăng nhập để truy cập"
  }
}
```

### 403 Forbidden
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Bạn không có quyền truy cập chức năng này"
  }
}
```

### 404 Not Found (centralized)
```json
{
  "success": false,
  "error": {
    "message": "Route /api/unknown not found",
    "code": "NOT_FOUND"
  }
}
```

### 500 Server Error (centralized)
```json
{
  "success": false,
  "error": {
    "message": "Lỗi server nội bộ",
    "code": "INTERNAL_ERROR"
  }
}
```

> **Error-handling status (verified 2026-08-04)**: The centralized error handler (`middlewares/errorHandler.js`) is fully implemented with `AppError` classes in `utils/errors/`. **All 18 controllers** wrap handlers with `asyncHandler` and throw `AppError` subclasses, so errors flow through the global `errorHandler`. Two error envelopes coexist:
> - **Centralized envelope** `{ success: false, error: { message, code, details?, timestamp? } }` — used by most endpoints (e.g., complaint, auth, order, product, cart, review, promotion, wishlist, compare, question, answer, dashboard, health, chat).
> - **Legacy top-level envelope** `{ success: false, message }` — still requested on specific paths via `req.errorResponseFormat = 'legacy-top-level-message'`: product `createProduct` / `updateProduct` (`controllers/productController.js`), and the **store**, **appointment**, **profile**, and **address** route groups (`routes/storeRoutes.js`, `appointmentRoutes.js`, `profileRoutes.js`, `addressRoutes.js`). The frontend `ApiError` type reads `response.data.message`, so both envelopes carry `message`.
>
> See [ARCHITECTURE.md](./ARCHITECTURE.md) for details.

## See Also

- [Swagger UI](/api-docs) (when server is running)
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture and data flow
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Deployment configuration
