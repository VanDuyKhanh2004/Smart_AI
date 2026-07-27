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
| Products | `/api/products` | Mixed | Product CRUD, search, recommendations |
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
| Health | `/api/health` | Public | Health check endpoints |

## Authentication

Most endpoints require a Bearer JWT token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Access tokens are short-lived (default 15 minutes). Use the `/api/auth/refresh` endpoint with a refresh token to obtain a new access token.

## Rate Limiting

Rate limiting is enforced on the login endpoint (`/api/auth/login`) via Redis-backed token bucket (20 attempts per 15-minute window per IP).

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

### 404 Not Found
```json
{
  "error": {
    "message": "Route /api/unknown not found",
    "status": 404,
    "timestamp": "2026-07-27T12:00:00.000Z"
  }
}
```

### 500 Server Error
```json
{
  "error": {
    "message": "Internal Server Error",
    "status": 500,
    "timestamp": "2026-07-27T12:00:00.000Z"
  }
}
```

## See Also

- [Swagger UI](/api-docs) (when server is running)
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture and data flow
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Deployment configuration
