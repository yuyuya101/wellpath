# WellPath — Personalized Wellness Assessment Funnel

A production-style full-stack implementation of a health-assessment subscription
funnel: a 4-step questionnaire produces a **free summary**, and a **simulated,
idempotent checkout** unlocks the full plan, with a one-time recovery code.

Built for the Ruiqi "3-day full-stack challenge" under business-grade standards:
atomic transactions, optimistic locking, field-level DTO gating, DB rate limiting,
RFC 9457 errors, automated tests at three levels and CI/CD on free tiers.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, Route Handlers) | One deployable, SSR + API |
| API | Hono 4 mounted on a platform-agnostic Route Handler | Lightweight, web-standard, testable in-process |
| Validation | Zod 4 | One schema source for request/response/domain |
| ORM | Drizzle ORM | SQL-transparent, typed migrations |
| DB (prod) | PostgreSQL on Neon | Free, serverless Postgres |
| DB (test) | PGlite (WASM) | Zero-install isolated DB per test |
| Forms | react-hook-form | Uncontrolled, minimal re-renders |
| Tests | Vitest (unit/integration) + Playwright (e2e) | 43 automated checks + dual-viewport smoke |
| Deploy | Render web service + cron-job.org keep-alive | No credit card |

## Architecture

```
src/
  app/                      Next App Router: pages + /api/[[...route]] handler
    assessment/[id]/        4-step wizard (RHF) and result/checkout page
    recovery/               recovery-code redemption
  components/               client components (StartButton)
  lib/                      browser API client, unit conversion
  server/
    api/                    Hono app, error map (RFC9457), routes
    application/            services: assessment/result/entitlement/payment/rateLimit
    domain/health/          PURE health formulas (Mifflin-St Jeor), zero I/O
    domain/recovery.ts      recovery-code generation + HMAC
    infrastructure/db/      schema (9 tables), client factory, migrations, time helper
    validation/             Zod contracts
tests/                      Vitest: domain / schema / api / end-to-end flow
e2e/                        Playwright single funnel smoke (desktop + mobile)
drizzle/                    SQL migration (9 tables)
docs/                       ADRs, OpenAPI, deployment & acceptance docs
.github/workflows/ci.yml    quality + real-PG migration + chromium e2e
```

### Key guarantees (each pinned by a test)
- **Atomic submit** — assemble → validate → compute → persist in one DB transaction; a missing step rolls back with 422 and leaves the session `in_progress`.
- **Field-level DTO gating** — the free response physically omits `bmr/tdee/recommendedIntake` (asserted on the serialized string).
- **Optimistic locking** — each step carries a revision; stale writes get 409 + the current revision, and the client auto-rebases once.
- **Idempotent payment** — `Idempotency-Key` is deduped permanently; double-click grants exactly one subscription; same-key/different-payload → 409; replays never re-expose the recovery code.
- **Single-use recovery** — only an HMAC digest is stored; constant-time compare, conditional `UPDATE ... WHERE used=false` closes the replay race; 7-day TTL.
- **DB fixed-window rate limit** — counters live in Postgres (multi-instance safe), 10 create / 5 pay per minute → 429.
- **Edit & recompute (T16)** — after submission a user can edit answers and recompute; entitlement is preserved; a plain duplicate submit stays a no-op.

## Commands

```bash
pnpm install
cp .env.example .env            # see docs/DEPLOYMENT.md; tests need NO .env DATABASE_URL
pnpm dev                        # local dev
pnpm typecheck                  # tsc --noEmit (strict)
pnpm lint                       # eslint
pnpm test                       # Vitest: 43 unit/integration tests (PGlite)
pnpm build                      # production build
pnpm test:e2e                   # Playwright dual-viewport smoke (run after build; needs DATABASE_URL)
pnpm db:migrate                 # apply SQL migration to DATABASE_URL
pnpm verify                     # typecheck + lint + test + build
```

> Tests intentionally run against in-process PGlite and require **no** DATABASE_URL.
> Production/previews use a direct (non-pooler) Neon connection — see `docs/DEPLOYMENT.md`.

## Test matrix

| Level | Tool | Count | Covers |
|---|---|---|---|
| Domain unit | Vitest | 19 | Mifflin formula, BMI categories, deficit/floor, timeline rounding, protected cases (frozen constants) |
| Schema | Vitest | 3 | nine-table relations & constraints |
| API integration | Vitest | 10 | session create/resume, cookie access, step optimistic lock, validation/problem+json |
| Business flow | Vitest | 11 | atomic submit/rollback, DTO gating, recovery single-use & expiry, idempotency, double-click, simulate-fail, rate limit, recompute |
| E2E | Playwright | 1 spec × 2 viewports | full funnel in real Chromium on desktop + iPhone 12 viewport |
| **Total** | | **43 + 2 e2e** | all green |

## API contract
See [`docs/openapi.json`](docs/openapi.json) (OpenAPI 3.1). All errors are
`application/problem+json` with one of eight stable codes:
`INVALID_REQUEST, RECOVERY_INVALID, SESSION_NOT_FOUND, STEP_CONFLICT,
PAYMENT_IDEMPOTENT_MISMATCH, VALIDATION_FAILED, RATE_LIMITED, INTERNAL_ERROR`.

## Deployment
See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for Render + Neon + cron-job.org
(free-tier, no credit card). Infrastructure-as-config lives in [`render.yaml`](render.yaml).

## Security summary
HttpOnly/SameSite=Lax access cookie (Secure in production), HMAC-hashed recovery
codes, no wildcard CORS (same-origin only), hard-delete erasure endpoint, security
response headers, secrets kept out of git, dependency audit clean at high/critical.
