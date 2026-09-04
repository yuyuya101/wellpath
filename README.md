# WellPath — Personalized Wellness Assessment Funnel

[![CI](https://github.com/yuyuya101/wellpath/actions/workflows/ci.yml/badge.svg)](https://github.com/yuyuya101/wellpath/actions/workflows/ci.yml)

A production-style full-stack implementation of a health-assessment subscription
funnel: a guided, multi-screen questionnaire (3 sections, persisted as 4 resumable
steps) supports **lose / maintain / gain** goals and produces a **free summary**, and a **simulated,
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
| Tests | Vitest (unit/integration) + Playwright (e2e) | 72 automated checks + dual-viewport smoke |
| Deploy | Netlify (OpenNext runtime) + Neon Postgres | $0 tier, no credit card, git-push deploys |

## Architecture

```
src/
  app/                      Next App Router: pages + /api/[[...route]] handler
    assessment/[id]/        multi-screen guided wizard (resumable, optimistic-locked) and result/checkout page
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
.github/workflows/ci.yml    CI on every push/PR: verify job (typecheck/lint/Vitest-PGlite/build) + migration job (Drizzle SQL applied to a real PostgreSQL 16 service)
```

### Key guarantees (each pinned by a test)
- **Atomic submit** — assemble → validate → compute → persist in one DB transaction; a missing step rolls back with 422 and leaves the session `in_progress`.
- **Field-level DTO gating** — the free response physically omits `bmr/tdee/recommendedIntake` (asserted on the serialized string).
- **Optimistic locking** — each step carries a revision; stale writes get 409 + the current revision, and the client auto-rebases once.
- **Idempotent payment** — `Idempotency-Key` is deduped permanently; double-click grants exactly one subscription; same-key/different-payload → 409; replays never re-expose the recovery code.
- **Single-use recovery** — only an HMAC digest is stored; constant-time compare, conditional `UPDATE ... WHERE used=false` closes the replay race; 7-day TTL.
- **DB fixed-window rate limit** — counters live in Postgres (multi-instance safe), 10 create / 5 pay per minute → 429.
- **Edit & recompute (T16)** — after submission a user can edit answers and recompute; entitlement is preserved; a plain duplicate submit stays a no-op.

## Product surface — two explicit entry paths
- **Free lane** (landing, primary CTA): creates an anonymous session and starts the guided
  13-screen wizard; the result page shows the free summary plus a `lockedFields` list.
- **Premium lane** (landing, highlighted CTA → `/pricing`): an exact free-vs-Premium comparison
  page states which fields are masked, explains the simulated `/pay` flow and starts the same
  wizard. On the result page **Upgrade to Premium** opens a three-step simulated checkout modal
  (plan summary -> card/PayPal form -> success). Card details stay entirely in component state and
  are **never sent to the server**; the only authorizing call is the idempotent `POST /api/pay`,
  which flips the server-side entitlement to active (30 days). The same page then expands from the
  masked summary to the full plan without a reload and reveals the member-only **AI health coach**.
  A "Compare free vs Premium" link on the result page routes back to `/pricing`.

## Premium AI coach (local DeepSeek via Ollama)
The full result page calls `POST /api/assessments/{id}/insights`, a **premium-only** endpoint
(non-members get `402 PAYMENT_REQUIRED`). It never recomputes health numbers: the deterministic
domain result is already authoritative. It builds a prompt from those computed values and asks a
**local** Ollama model (default `deepseek-r1:1.5b` at `http://127.0.0.1:11434`) for natural-language
tips, then returns `{ source: "local-llm", tips }`. When no local model is reachable (e.g. the
deployed host) it transparently falls back to the deterministic rule-based recommendations and
returns `source: "rule-fallback"`, so the feature can never hard-fail the result page. A production
host with no `OLLAMA_BASE_URL` configured skips the local call entirely (it could never reach a
user's laptop), so it answers immediately instead of waiting on a timeout; local `pnpm dev`
(`NODE_ENV=development`) calls the model by default. Override with `OLLAMA_BASE_URL` /
`OLLAMA_MODEL`. Run locally: install Ollama, `ollama pull deepseek-r1:1.5b`,
keep `ollama serve` running, then `pnpm dev`.

## Commands

```bash
pnpm install
cp .env.example .env            # see docs/DEPLOYMENT.md; tests need NO .env DATABASE_URL
pnpm dev                        # local dev
pnpm typecheck                  # tsc --noEmit (strict)
pnpm lint                       # eslint
pnpm test                       # Vitest: 72 unit/integration tests (PGlite)
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
| Domain unit | Vitest | 26 | Mifflin formula, BMI categories, lose/maintain/gain directions, deficit/surplus/floor, pace, timeline rounding, protected cases (frozen constants) |
| Schema | Vitest | 3 | nine-table relations & constraints |
| API integration | Vitest | 13 | session create/resume, cookie access, step optimistic lock, partial-draft acceptance vs empty-enum/typed-wrong rejection, validation/problem+json |
| Business flow | Vitest | 16 | atomic submit/rollback, free-vs-full DTO gating incl. lockedFields/upgrade CTA, premium-expiry falls back to free, gain/maintain e2e + BMI25 ceiling, recovery single-use & expiry, idempotency, double-click, simulate-fail, rate limit, recompute, domain-rule→422 regression |
| E2E | Playwright | 1 spec × 2 viewports | full funnel in real Chromium on desktop + iPhone 12 viewport |
| Premium AI insights | Vitest | 4 | non-member -> 402 boundary, local-model unreachable -> rule-fallback (never hard-fails), local-model success -> parsed local-llm tips (fetch mocked), production-without-LLM skips the call entirely (no timeout wait) |
| Onboarding validation | Vitest | 10 | target screen mirrors the server BMI 18.5/25 healthy band via shared pure formulas: direction + floor/ceiling, exact-boundary allowed, missing-height/empty guards (no late submit-time rejection) |
| **Total** | | **72 + 2 e2e** | all green |

### Coverage scope & deliberate gaps
**Why these scenarios** — they map 1:1 to the challenge's riskiest invariants: deterministic
health math (frozen constants + edge/illegal inputs), step persistence & optimistic-lock
concurrency, the **free-vs-premium boundary** (the free DTO physically omits protected
values, declares them in `lockedFields`, and a premium past its expiry falls back to free),
payment idempotency/double-click, single-use recovery, and DB rate limiting.
**Deliberately not covered and why**:
- Real third-party payment / webhook signing — out of scope (simulated checkout by spec); the state machine and idempotency it would rely on are fully tested instead.
- Load/performance and cross-browser matrix — a 3-day backend-skeleton task; correctness is covered at unit/integration level and one dual-viewport E2E guards the critical path.
- AuthN with passwords/email — the product is anonymous by design; access is a 24h HttpOnly cookie and cross-device recovery uses the single-use HMAC recovery code.

## API contract
See [`docs/openapi.json`](docs/openapi.json) (OpenAPI 3.1). All errors are
`application/problem+json` with one of nine stable codes:
`INVALID_REQUEST, RECOVERY_INVALID, SESSION_NOT_FOUND, STEP_CONFLICT,
PAYMENT_IDEMPOTENT_MISMATCH, PAYMENT_REQUIRED, VALIDATION_FAILED, RATE_LIMITED, INTERNAL_ERROR`.
The premium-only AI coach endpoint returns `402 PAYMENT_REQUIRED` for non-members.

## Data model
Nine Postgres tables centered on the anonymous assessment session, with an
**independently renewable entitlement** (membership never lives in the cookie).
Entity-relationship diagram, keys and constraints:
[`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) (Mermaid ERD rendered by GitHub).

## Deployment
Live demo: **https://wellpa.netlify.app** (Netlify, OpenNext runtime; Neon Postgres).
See [`docs/DEPLOYMENT_NETLIFY.md`](docs/DEPLOYMENT_NETLIFY.md) for the authoritative
free-tier, no-credit-card deploy. `netlify.toml` is the infra-as-config. (Render/Koyeb
notes are retained under `docs/` as evaluated-but-rejected options — see `docs/AI_USAGE.md` §5.)

## Reproduce the funnel & payment with cURL
The whole funnel + idempotent checkout is replayable against the live host. A cookie
jar (`-c/-b jar.txt`) stands in for the browser; each step auto-saves.

```bash
BASE=https://wellpa.netlify.app
# 1) create anonymous session (sets wellpath_sid cookie)
curl -s -c jar.txt -X POST "$BASE/api/assessments"
SID=<sessionId from the response above>

# 2) save the four steps (incremental; optimistic revision returned each time)
curl -s -b jar.txt -H 'Content-Type: application/json' -X PATCH "$BASE/api/assessments/$SID/steps/basics"   -d '{"stepKey":"basics","answer":{"sex":"male","ageYears":28,"heightCm":175,"weightKg":80}}'
curl -s -b jar.txt -H 'Content-Type: application/json' -X PATCH "$BASE/api/assessments/$SID/steps/goal"      -d '{"stepKey":"goal","answer":{"targetWeightKg":70}}'
curl -s -b jar.txt -H 'Content-Type: application/json' -X PATCH "$BASE/api/assessments/$SID/steps/activity"  -d '{"stepKey":"activity","answer":{"activity":"moderate"}}'
curl -s -b jar.txt -H 'Content-Type: application/json' -X PATCH "$BASE/api/assessments/$SID/steps/condition" -d '{"stepKey":"condition","answer":{"specialCondition":null}}'

# 3) submit -> deterministic server-side compute (atomic)
curl -s -b jar.txt -X POST "$BASE/api/assessments/$SID/submit" -d '{"recalculate":false}'

# 4) result as a NON-member: free summary only; bmr/tdee/intake keys are absent
curl -s -b jar.txt "$BASE/api/assessments/$SID/result"

# 5) simulated checkout with a client UUIDv4 Idempotency-Key (returns one-time recovery code)
KEY=$(uuidgen)
curl -s -b jar.txt -H 'Content-Type: application/json' -X POST "$BASE/api/pay" \
  -d "{\"sessionId\":\"$SID\",\"idempotencyKey\":\"$KEY\",\"productCode\":\"wellpath_premium_30d\"}"
# 5b) replay the SAME key+payload -> identical first result, replayed:true, recoveryCode:null
curl -s -b jar.txt -H 'Content-Type: application/json' -X POST "$BASE/api/pay" \
  -d "{\"sessionId\":\"$SID\",\"idempotencyKey\":\"$KEY\",\"productCode\":\"wellpath_premium_30d\"}"
# 5c) same key, DIFFERENT product -> 409 PAYMENT_IDEMPOTENT_MISMATCH
curl -s -b jar.txt -H 'Content-Type: application/json' -X POST "$BASE/api/pay" \
  -d "{\"sessionId\":\"$SID\",\"idempotencyKey\":\"$KEY\",\"productCode\":\"other\"}"

# 6) result as a member: full payload now present (bmr/tdee/recommendedIntake)
curl -s -b jar.txt "$BASE/api/assessments/$SID/result"

# 7) new device / cleared cookie: redeem the one-time recovery code to get a fresh cookie
curl -s -c jar2.txt -H 'Content-Type: application/json' -X POST "$BASE/api/recovery/redeem" \
  -d '{"recoveryCode":"<code from step 5>"}'
curl -s -b jar2.txt "$BASE/api/assessments/$SID/result"   # full again; a 2nd redeem -> 401

# 8) premium-only AI coach: local DeepSeek/Ollama tips, or rule-fallback when no local model
curl -s -b jar.txt -X POST "$BASE/api/assessments/$SID/insights"   # non-member cookie -> 402
```

> Non-production failure branch: add `"simulate":"fail"` to the `/pay` body to exercise
> the `failed` terminal state (ignored in production).

### Pre-provisioned PAID demo sessions (free vs full diff, no sign-up needed)
The sessions below are already submitted **and paid** (sample-1 profile: male 28 /
175 cm / 80 kg → 70 kg / moderate → BMI 26.1, BMR 1758.75, TDEE 2726, intake 2226).
Because access is cookie-based, a reviewer without the original cookie redeems the
**one-time** recovery code (step 7) to view the full result. If a code is already
consumed/expired, just run the cURL sequence above to mint a fresh paid session.

| sessionId | recovery code (single-use) | status |
|---|---|---|
| `2d9b2844-e8a4-4474-88d7-e8b7b5743b76` | `3mF-koWUV-Ce4NFYrBlNkcT2qRK2g-x7zXpXPmlErtA` | premium, paid (minted & verified 2026-09-03: free `access=free`/no payload -> after pay `access=full`, TDEE 2726 / intake 2226) |
| `f8192289-3392-4a70-821b-f49f2a90603a` | `TeZihYUllSWEIDBKlIK9Mh6HVxck3Z9UxgegwoIQCiE` | premium, paid (backup) |
| `38cf4d4f-fa25-4c2e-aad0-fb78fbf3c9cc` | `e68w9jM04_fg7R0ZOVWPRXiEO8PNhUyXPj2X9oE5dXs` | premium, paid (backup) |

> Recovery path verified in production: `redeem` → 200 + fresh cookie → result `access=full`
> (TDEE 2726); redeeming the same code again → 401 `RECOVERY_INVALID` (single-use holds).

## Security summary
HttpOnly/SameSite=Lax access cookie (Secure in production), HMAC-hashed recovery
codes, no wildcard CORS (same-origin only), hard-delete erasure endpoint, security
response headers, secrets kept out of git, dependency audit clean at high/critical.
