# Testing

## Backend Testing

### Framework
- **Jest** 30 with `--forceExit --detectOpenHandles` flags
- **Supertest** 7 for HTTP integration tests
- **Pino** logger mocked in tests (no real log output)

### Running Tests
```bash
cd Smart_AI_backend
npm test                                   # Full suite with --forceExit --detectOpenHandles
npm test -- --runInBand                    # Sequential (recommended for DB connection)
npm test -- --watch                        # Watch mode
```

### Test Suite (29 files, 1251 tests, snapshot verified on branch `fix/complaint-route-authorization`, base commit `87fc52d`)

> Documentation-only changes do not alter these totals. Update the hash after each merged PR when tests are modified.

| File | Main Coverage |
|------|--------------|
| `health.test.js` | Liveness, health, readiness endpoints with dependency mocking |
| `orderController.test.js` | createOrder (idempotency, validation, pricing, inventory, promotion, error handling, security, race conditions), cancelOrder, updateOrderStatus (transition hardening, same-status reject, note trimming, allowedNextStatuses) |
| `productController.test.js` | createProduct, updateProduct (embedding enqueue logic, image upload, cache invalidation) |
| `productImageService.test.js` | Base64 validation, HTTPS URL validation, private IP detection, Cloudinary upload, security/logging |
| `productSearchService.test.js` | Vector search, text search, fallback behavior |
| `productRecommendation.test.js` | Recommendation tiers |
| `productSchema.test.js` | Product model validation |
| `productValidator.test.js` | Constraint-based validation |
| `productConstraintParser.test.js` | Natural language parsing |
| `productRanking.test.js` | Soft preference ranking |
| `priceParser.test.js` | Price string parsing |
| `emailQueue.test.js` | BullMQ email queue processing |
| `embeddingQueue.test.js` | Embedding job processing |
| `bullmq.test.js` | Queue lifecycle |
| `shutdown.test.js` | Graceful shutdown sequence |
| `observability.test.js` | Logging, correlation IDs |
| `cors.test.js` | CORS header validation |
| `searchSemantic.test.js` | Semantic search endpoint |
| `chatbotEvaluationRunner.test.js` | Chatbot evaluation |
| `chatbotEvaluationMetrics.test.js` | Evaluation metrics |
| `chatFiltering.test.js` | Chat content filtering |
| `chatFallback.test.js` | AI fallback behavior |
| `conversationContext.test.js` | Multi-turn context management |
| `chatSearch.test.js` | Chat search functionality |
| `preclassifyIntent.test.js` | Intent pre-classification |
| `openai.test.js` | OpenAI/Gemini integration |
| `route-accuracy.test.js` | Swagger path-to-route validation (257 tests: route map, auth docs, OpenAPI structure, Bearer scheme, tags, schemas, secret-safety, Swagger UI mount) |
| `complaint-auth.test.js` | Complaint route authorization (35 tests: 401/403/200 for all endpoints, 404 handling, side-effect safety) |
| `checkoutFingerprint.test.js` | Idempotency fingerprint computation |

### Mocking Strategy
- All external dependencies are mocked via `jest.mock()`:
  - MongoDB/Mongoose (models, sessions, transactions)
  - Redis (client, commands)
  - Cloudinary (v2 SDK)
  - Brevo (email SDK)
  - OpenAI/Gemini (API clients)
- No real database, no real API calls in tests
- Mock factory helpers: `mockRes()` for Express response, `defaultOrderDoc()` for Order fixtures
- Mongoose session mocked with `startTransaction`, `abortTransaction`, `commitTransaction`, `endSession`

### Test Patterns
- `beforeEach` reset of all mocks and state
- Error cases: network failures, validation errors, auth errors, not found, race conditions, concurrent requests
- Security cases: SQL injection in IDs, idempotency key replay, token manipulation, unauthorized access

### Known Limitations
- `--runInBand` required to avoid MongoDB connection collisions between test files
- Some tests tightly coupled to mock implementation details
- No E2E tests

## Frontend Testing

### Framework
- **Vitest** 4 with jsdom environment
- **@testing-library/react** 16 for component rendering
- **@testing-library/jest-dom** for DOM matchers

### Running Tests
```bash
cd Smart_AI_frontend
npm test                                   # vitest run (all tests)
npx vitest                                 # Watch mode
npx vitest run --reporter=verbose          # Verbose output
```

### Test Suite (8 files, 119 tests, snapshot verified at base commit `82a333a`)

> Documentation-only changes do not alter these totals. Update the hash after each merged PR when tests are modified.

| File | Approx. Tests | Coverage |
|------|---------------|----------|
| `AdminOrderDetailDialog.test.tsx` | 14 | Status dropdown, button states, error handling |
| `orderStatusTransitions.test.ts` | 16 | getAllowedNextStatuses, canTransition, isTerminal |
| `OrderDetailPage.test.tsx` | 5 | Rendering, skeleton, error states |
| `ApiBaseUrl.test.ts` | 29 | URL resolution, validation, edge cases |
| `AuthRefreshFlow.test.ts` | 15 | Token refresh, interceptor behavior |
| `GoogleIdentity.test.ts` | 17 | Google Identity Services integration |
| `ProductRecommendations.test.tsx` | 12 | Display, loading, errors |
| `useIdempotencyKey.test.ts` | 11 | Idempotency key generation and management |

### Mocking Strategy
- API service modules mocked via `vi.mock()` (e.g., `@/services/order.service`)
- Zustand stores pre-populated via `useAuthStore.setState()`
- Axios errors constructed manually for error handling tests
- No real HTTP calls

### Radix UI Testing Notes
- Radix UI Select renders options in a portal (outside dialog DOM tree)
- When Select is open, dialog content receives `aria-hidden="true"` — buttons become inaccessible via `getByRole`
- Close dropdown before asserting button states:
  ```ts
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  ```
- Use `getByRole('option', { name: '...' })` to find select options instead of `getByText`

## CI Validation

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on push or PR to `main` when changes affect `Smart_AI_backend/**`, `Smart_AI_frontend/**`, or workflow files.

### Backend Job
```yaml
- run: npm ci
- run: npm test
```
Node.js 24, Ubuntu latest, working directory `Smart_AI_backend`.

### Frontend Job
```yaml
- run: npm ci
- run: npx tsc --noEmit     # TypeScript strict check
- run: npx vitest run        # Unit + component tests
- run: npm run build          # Production build (tsc -b + vite build)
```
Node.js 24, Ubuntu latest, working directory `Smart_AI_frontend`. Cached npm dependencies.

## Pre-merge Checklist

Before merging to main:

- [ ] Backend tests pass: `cd Smart_AI_backend && npm test`
- [ ] Frontend TypeScript check passes: `cd Smart_AI_frontend && npx tsc --noEmit`
- [ ] Frontend tests pass: `cd Smart_AI_frontend && npm test`
- [ ] Frontend build passes: `cd Smart_AI_frontend && npm run build`
- [ ] No whitespace errors: `git diff --check`
- [ ] No unused imports or dead code (enforced by TypeScript `noUnusedLocals`)
- [ ] No `any`, `@ts-ignore`, `eslint-disable`, `as any`
- [ ] New features include tests
- [ ] Bug fixes include a test that fails before the fix
- [ ] API changes are backward-compatible (no breaking response shape changes)
- [ ] No secrets or credentials committed
