# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project intends to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `tests/appointment.test.js` (42 tests: CRUD, validation, auth, ownership, admin status transitions, `generateTimeSlots` unit tests)
- `tests/compare.test.js` (21 tests: CRUD, validation, auth, duplicate detection, ownership, error paths)
- `tests/question.test.js` (29 tests: CRUD, validation, auth, admin status update, ownership, upvote toggle, error paths)
- `tests/answer.test.js` (14 tests: create answer, delete answer, validation, auth, admin-only access, error paths)
- Redis auto-reconnect: exponential backoff (`min(500 × 2^attempt, 30000)ms`), infinite retries, graceful shutdown isolation
- Shared `calculateReconnectDelay(attemptIndex)` helper used by both node-redis `reconnectStrategy` and ioredis `retryStrategy`
- Structured reconnect logging (attempt, delayMs on scheduled; shutdown stop signal)
- `setShuttingDown()` resets status to `'disconnected'` preventing stale `'reconnecting'` health reports
- `getRedisStatus()` returns `'connected'` / `'reconnecting'` / `'disconnected'` based on client events
- `tests/redis.test.js` (36 tests): delay formula, client strategies, logging safety, status transitions, health integration
- Centralized error handling foundation (Phase 1): `AppError` class hierarchy, `asyncHandler`, global `errorHandler` middleware, `notFoundHandler` middleware
- Centralized error handling Phase 2: health, address, and profile controllers migrated to `asyncHandler` + `AppError`
- `tests/auth.test.js` (54 tests: register, login, logout, refresh, getMe, Google OAuth, email verification, password reset, unlock, admin unlock, link/unlink Google, validation, error paths)
- `tests/store.test.js` (29 tests: CRUD, validation, auth, admin-only access, geo search, error paths, ValidationError errors array, CastError)
- `tests/address.test.js` (17 tests: CRUD operations, ownership checks, auth, error propagation)
- `tests/profile.test.js` (19 tests: profile CRUD, avatar upload, password change, error propagation, secret safety)
- Error normalization: Mongoose ValidationError→400, CastError→400, duplicate key→409, JWT errors→401
- Production-safe error responses (no stack traces, no internal details)
- Structured logging with correlation IDs for all error levels
- `tests/errorHandler.test.js` (36 tests covering error classes, asyncHandler, errorHandler middleware, notFoundHandler, full integration)
- Complaint controller pilot migration: wrapped with asyncHandler, uses NotFoundError for 404 cases, forwards unexpected errors through next(error)
- Cloudinary product-image integration: upload, validate, migrate 21 Base64 images to Cloudinary
- Product image validation (Base64 decoding limits, private IP rejection in production, HTTPS-only URLs)
- Product image migration script (`scripts/migrateProductImagesToCloudinary.js`)
- API base URL production fix with validation for VITE_API_BASE_URL
- Customer order detail page (`/orders/:id`) with loading skeleton and error states
- Order confirmation email with safe HTTPS image rendering, reliable order tracking links, and private-IP filtering
- Centralized order status transition module (`services/orderStatusTransitions.js`)
- Frontend mirror of status transitions (`features/orders/utils/orderStatusTransitions.ts`)
- Admin order detail dialog with filtered status dropdown and error handling
- Backend tests for transition hardening (same-status rejection, note trimming, allowedNextStatuses)
- Frontend tests for `AdminOrderDetailDialog` and `orderStatusTransitions` utility
- Chatbot constraint parsing, product ranking by soft preferences, and conversation context management
- Chatbot evaluation framework (`evaluation/chatbot/`)
- Backend tests for chatbot evaluation, intent classification, context merging, and fallback behavior
- Database ERD documentation at `docs/ERD.md` — 16 collections, all entity relationships, indexes, unique constraints, Mermaid diagrams
- Documentation files under `docs/`

### Changed
- answerController: both handlers (`createAnswer`, `deleteAnswer`) migrated to `asyncHandler` + AppError classes (BadRequestError, NotFoundError); manual `try/catch` eliminated; Mongoose `ValidationError` handling removed (handled by global errorHandler); `console.error` calls removed (handled by global errorHandler); no inner `try/catch` to preserve; response format unchanged (already centralized `{ success, error: { code, message } }`)
- questionController: all 6 handlers migrated to `asyncHandler` + AppError classes (BadRequestError, NotFoundError, ForbiddenError); manual `try/catch` eliminated; Mongoose `ValidationError` handling removed (handled by global errorHandler); request-level `console.error` handling removed (handled by global errorHandler); AI suggestion `console.error` remains intentionally inside the non-critical inner `try/catch`; response format unchanged (already centralized `{ success, error: { code, message } }`)
- compareController: all 4 handlers migrated to `asyncHandler` + AppError classes (BadRequestError, NotFoundError, ForbiddenError); manual `try/catch` eliminated; `console.error` calls removed (handled by global errorHandler); response format unchanged (already centralized `{ success, error: { code, message } }`)
- appointmentController: all 8 handlers migrated to `asyncHandler` + AppError classes (BadRequestError, NotFoundError); manual `try/catch` eliminated; `errorResponseFormat('legacy-top-level-message')` added to routes
- storeController: all 7 handlers migrated to `asyncHandler` + AppError classes (BadRequestError, NotFoundError); manual `try/catch` eliminated; `errorResponseFormat('legacy-top-level-message')` added to routes
- authController: all 15 handlers migrated to `asyncHandler` + AppError hierarchy (BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError); manual `try/catch` eliminated; `console.error` calls removed; inner `try/catch` preserved for `verifyRefreshToken` (refreshToken handler) and `verifyIdToken` (googleLogin handler); response format unchanged (already centralized `{ success, error: { code, message } }`); locked account returns `AppError` with status 429 for `ACCOUNT_LOCKED` (preserves original HTTP status)
- productController: `createProduct`, `updateProduct`, `deleteProduct` migrated to `asyncHandler` + AppError classes (BadRequestError, NotFoundError, AppError); manual `try/catch` eliminated; `errorResponseFormat('legacy-top-level-message')` set via `req` for create and update to preserve legacy `errors` array; inner `try/catch` preserved for `uploadProductImageIfNeeded` to convert `ProductImageValidationError` to AppError; `console.error` calls removed (handled by global errorHandler)
- asyncHandler now returns the promise chain (allows `await` in unit tests)
- errorHandler: ValidationError normalization now preserves field path in `details` (`{ field, message }` objects instead of plain strings)
- `tests/errorHandler.test.js`: ValidationError mock includes `path`; legacy format test includes `errors` array with `{ field, message }` objects
- index.js error handling replaced with `notFoundHandler` + `errorHandler` middleware chain
- complaint route-level error handler now forwards unknown errors to global handler (instead of inline 500)
- healthController: `health` and `ready` wrapped with `asyncHandler`, local try/catch removed (errors already forwarded to `next(err)`)
- addressController: all 5 handlers migrated to `asyncHandler` + AppError classes (BadRequestError, NotFoundError, ForbiddenError)
- profileController: all 4 handlers migrated to `asyncHandler` + AppError classes (BadRequestError, NotFoundError); `console.error` calls removed (handled by global errorHandler)
- Error response shape for address and profile endpoints preserves legacy `{ success, message }` format (frontend type `ApiError` reads `response.data.message`); centralized `{ success, error: { message, code } }` only for complaint and unexpected errors
- Order controller `updateOrderStatus` uses centralized transition module
- AdminOrderDetailDialog status dropdown only shows allowed next states
- Update button disabled when no valid selection or in progress
- INVALID_STATUS_TRANSITION error triggers `onRefreshOrder` to refetch order
- Order confirmation email renders HTTPS images safely and verifies tracking link resolution

### Fixed
- TypeScript `noUnusedLocals` CI error (removed unused import in test file)
- Private IP detection: 172.16/12 range only (not full 172.x block)
- Order image URLs filtered in production to prevent hosting private-IP images in email HTML
- Complaint management routes now protected with `protect` + `adminMiddleware` (was unintentionally public; all 8 endpoints require admin auth)
