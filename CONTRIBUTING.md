# Contributing

## Branch Strategy

| Branch Pattern | Purpose | Base |
|---------------|---------|------|
| `main` | Production-ready code. CI must pass on every push and PR. | - |
| `feature/*` | New features, enhancements. | `main` |
| `fix/*` | Bug fixes. | `main` |
| `docs/*` | Documentation-only changes (no application code). | `main` |
| `hotfix/*` | Urgent production fixes. | `main` (with expedited review) |

All branches merge back into `main` via pull request.

## Commit Message Convention

Use conventional commit format:

```
<type>(<scope>): <description>
```

Examples:

```
feat(chat): add complaint handling agent
fix(order): enforce admin status transition rules
docs(project): update handoff block after PR #38
refactor(product): extract image validation service
test(chat): add intent pre-classification tests
chore(deps): update Mongoose to 8.24
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

## Pull Request Checklist

### Documentation-Only PR

- [ ] No whitespace errors: `git diff --check`
- [ ] Verify Markdown links and referenced files exist
- [ ] No secrets or credentials committed
- [ ] Application tests are not required unless application or config files changed

### Application-Code PR

- [ ] Backend tests pass: `cd Smart_AI_backend && npm test`
- [ ] Frontend TypeScript check passes: `cd Smart_AI_frontend && npx tsc --noEmit`
- [ ] Frontend tests pass: `cd Smart_AI_frontend && npm test`
- [ ] Frontend production build passes: `cd Smart_AI_frontend && npm run build`
- [ ] No whitespace errors: `git diff --check`
- [ ] No `any`, `@ts-ignore`, `eslint-disable`, `as any`
- [ ] No unused imports or dead code (enforced by CI)
- [ ] New features include tests
- [ ] Bug fixes include a test that fails before the fix
- [ ] API changes are backward-compatible (no breaking response shape changes)
- [ ] No secrets or credentials committed
- [ ] If PR changes behavior, architecture, deployment, tests, or production status: relevant documentation updated before merge
- [ ] `docs/PROJECT_CONTEXT.md` handoff block updated if test totals or status changed

## Coding Standards

See [CODING_STANDARD.md](./docs/CODING_STANDARD.md) for full details.

Key points:
- Frontend: TypeScript strict mode, no `any`, feature-based folder organization, Zustand + TanStack Query
- Backend: CommonJS, controllers handle HTTP, services hold logic, Mongoose models for schema only
- Tests: mock all external dependencies (MongoDB, Redis, Cloudinary, Brevo, AI APIs), use `beforeEach` reset
- Both: `async/await`, descriptive names, error classes over generic `Error`, `instanceof` checks

## Testing Checklist

### Backend
```bash
cd Smart_AI_backend
npm test                           # Full suite (--forceExit --detectOpenHandles)
npm test -- --runInBand            # Sequential mode (recommended)
```

### Frontend
```bash
cd Smart_AI_frontend
npm test                           # Vitest run
npx tsc --noEmit                   # TypeScript strict check
npm run build                      # Production build
```

### CI Pipeline
`.github/workflows/ci.yml` runs on push or PR to `main`:
1. Backend: `npm ci` + `npm test`
2. Frontend: `npm ci` + `npx tsc --noEmit` + `npx vitest run` + `npm run build`

## Documentation Update Policy

1. Every PR that changes behavior, architecture, deployment, tests, roadmap, or production status must update the relevant documentation before merge.
2. After merge, mutable handoff metadata (commit, branch, PR, status) may be updated when the next task or branch begins.
3. Avoid requiring a separate documentation PR after every code PR — update docs in the same PR that introduces the change.

Mutable status and test totals must include "Last updated" or "Verified at commit" metadata.

## AI Agent Collaboration Rules

When working with AI coding agents on this repository:

1. **Read before write** — Read files before editing. Verify context before making changes.
2. **Run `git diff --check` before finishing** — No whitespace errors.
3. **Run type-check and tests after every change** — Confirm no regressions.
4. **State constraints before action** — If a constraint prohibits modifying certain files, state it before each operation.
5. **Document mutable metadata** — Handoff blocks, commit hashes, and test totals must include snapshot/verification timestamps.
6. **Do not fabricate values** — Never claim unverifiable releases, versions, or environment values.
7. **Follow the branch strategy** — Use `docs/*` for documentation-only changes, `fix/*` for bug fixes, `feature/*` for new features.
8. **Update documentation with code changes** — PRs that change behavior, architecture, deployment, tests, or production status must update relevant documentation before merge. After merge, mutable handoff metadata may be updated when the next task or branch begins.
