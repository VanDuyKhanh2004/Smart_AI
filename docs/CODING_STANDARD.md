# Coding Standards

## TypeScript Strict Mode

The frontend uses TypeScript with strict mode enabled (`tsconfig.app.json`):

```json
{
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "verbatimModuleSyntax": true,
  "erasableSyntaxOnly": true,
  "noFallthroughCasesInSwitch": true,
  "noUncheckedSideEffectImports": true
}
```

- All code must compile without errors under strict mode
- CI enforces `npx tsc --noEmit` — must pass before merge
- `verbatimModuleSyntax` requires `import type` for type-only imports
- `noUnusedLocals` catches dead imports and variables — CI will fail if violated

## Prohibited Patterns

- **No `any`** — use `unknown` with type guards, or define a proper interface/type
- **No `@ts-ignore`** — fix the underlying type issue instead
- **No `eslint-disable`** — fix the lint issue or configure the rule properly
- **No `as any`** — use proper type narrowing or assertion with a known type
- **No `// @ts-expect-error`** — address the type error directly
- **No dummy side effects** to suppress unused warnings

## Backend Conventions

### JavaScript
The backend uses CommonJS (`require`, `module.exports`) — no ES modules.

### Architecture Principles
- **Controllers** handle HTTP request/response only — parse input, call services, send response
- **Services** contain business logic, orchestration, external API calls, validation
- **Models** define Mongoose schemas with validation, statics, instance methods — no business logic
- **Utils** contain pure, stateless helper functions (no side effects)
- **Middlewares** handle cross-cutting concerns (auth, logging, rate limiting, correlation ID)
- **Configs** handle external service initialization and connection management

### Code Style
- `async/await` over raw promises or `.then()` chains
- `try/catch` with meaningful error messages
- Throw custom error classes (e.g., `ProductImageValidationError`) instead of generic `Error`
- Use `instanceof` checks over `error.name ===` string comparison for error type detection
- Prefer `const` over `let` for immutable bindings
- Destructure objects and arrays for clarity
- Use descriptive variable and function names (Vietnamese in user-facing messages, English in code)

### MongoDB / Mongoose
- Use MongoDB transactions for multi-document atomic operations (e.g., order creation)
- Use `$set`/`$unset` strategy for selective field updates — avoid passing `undefined` to `$set`
- Define indexes explicitly in schema files
- Use `select: false` for sensitive or large fields (passwords, tokens, embedding vectors)
- Use embedded subdocuments for tightly coupled data (order items, address, status history)
- Use `ref` for loosely coupled relations (user, product references)

### Testing
- Mock all external dependencies (MongoDB, Redis, Cloudinary, Brevo, AI APIs)
- Use `beforeEach` to reset all mocks and state before each test
- Test error paths and edge cases, not just happy paths
- Test security scenarios (auth bypass, idempotency replay, injection)
- Use `--runInBand` to avoid MongoDB connection collisions
- New bug fixes must include a test that fails before the fix

### Error Handling
- Inlined in `index.js` (not using `middlewares/errorHandler.js` which is empty)
- Logs via Pino with sanitized URL (query params stripped)
- Returns `{ error: { message, status, timestamp } }` JSON
- 404 handler returns `{ error: { message: "Route {path} not found", status: 404, timestamp } }`

## Frontend Conventions

### Architecture Principles
- **Feature-based folder organization**: `features/orders/`, `features/products/`, etc.
- Each feature module contains: `components/`, `pages/`, `hooks/`, `utils/`, `index.ts`
- **Services** handle API calls via Axios — one service per domain module
- **Zustand stores** for global UI state (auth, cart, compare, wishlist)
- **TanStack React Query** for server state (caching, invalidation, mutations)
- **Types** defined in `types/` directory, matching backend API response shapes
- UI primitives (shadcn/ui) in `components/ui/`
- Common layouts and guards in `components/`

### Code Style
- Functional components with hooks — no class components
- TypeScript interfaces/types for all component props
- Use `useMemo` / `useCallback` for expensive computations and stable callback references
- Destructure props in function parameter
- Use `cn()` utility (`clsx` + `tailwind-merge`) for conditional class names
- Use `aria-*` attributes for accessibility
- Prefer named exports over default exports

### Imports
- Path alias `@/*` maps to `./src/*`
- `import type` for type-only imports (required by `verbatimModuleSyntax`)
- Clean imports — no unused imports (enforced by `noUnusedLocals`)

### Testing
- Use `@testing-library/react` queries: `getByRole`, `getByText`, `findByRole`, `queryByText`
- Prefer `queryBy*` for absence assertions (returns `null`, doesn't throw)
- Mock API service modules with `vi.mock()` at top of test file
- Pre-populate Zustand stores with `useAuthStore.setState()`
- For Radix UI Select tests:
  - Close dropdown with `Escape` key before asserting button states (dialog gets `aria-hidden="true"`)
  - Use `getByRole('option', { name: '...' })` to find select options in portal
- No real HTTP calls or network requests in tests

## Git Workflow

- **Main branch**: Production-ready code. CI must pass on push/PR.
- **Feature branches**: Create from `main`, merge back via PR (no enforced naming convention).
- **Commit messages**: Imperative mood preferred but not enforced.
- No enforced commit message convention currently.

## Documentation Workflow

After every merged PR:
1. **PROJECT_CONTEXT.md** — Update the handoff block (commit, branch, PR, status) and add completed work summary
2. **ROADMAP.md** — Mark completed items, adjust priorities
3. **CHANGELOG.md** — Move Unreleased entries into a new release section if warranted, or keep under Unreleased

Mutable status and test totals must include "Last updated" or "Verified at commit" metadata.

## PR Workflow

1. Create feature branch from `main`
2. Implement changes following coding standards
3. Add or update tests
4. Run validation locally:
   - `git diff --check` — no whitespace errors
   - `cd Smart_AI_backend && npm test` — backend tests pass
   - `cd Smart_AI_frontend && npx tsc --noEmit` — TypeScript compiles
   - `cd Smart_AI_frontend && npm test` — frontend tests pass
   - `cd Smart_AI_frontend && npm run build` — production build succeeds
5. Open PR to `main`
6. CI runs automatically on push — must pass
7. Code review and merge

## Code Review Checklist

- [ ] No `any`, `@ts-ignore`, `eslint-disable`, `as any`
- [ ] No unused imports or dead code (checked by CI)
- [ ] Tests cover new functionality and error paths
- [ ] Backward compatible API changes — no breaking response shape changes
- [ ] No secrets or credentials in code
- [ ] Error messages are meaningful and user-facing where appropriate
- [ ] No new runtime dependencies added without justification
- [ ] Follows existing patterns and conventions (feature-based, service abstraction)
- [ ] MongoDB indexes added if new query patterns introduced
- [ ] Graceful handling of null/undefined external services (Cloudinary lazy init etc.)
- [ ] PROJECT_CONTEXT.md handoff block updated if PR changes status or totals
