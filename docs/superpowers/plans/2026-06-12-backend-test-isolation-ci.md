# Plan — Backend test isolation + CI gate

**Date:** 2026-06-12
**Tier:** 2 (test infra; incremental, two-PR shape)
**Status:** Draft — planning only; paused for approval before any code.

## Goal
1. Remove the shared-Neon real-DB **flake tax** (concurrency + data-drift).
2. Make backend test results **trustworthy** (deterministic, isolated).
3. Add a **backend CI check** that can become **merge-blocking** before the Merchant Portal epic.

Resend/domain setup stays a **parallel owner/devops track**, not part of this slice.

## Current state (inspected)
- **194 test files. 77 are real-DB** (import `PrismaPg`/`new PrismaClient`, connect to the shared dev Neon via `.env` `DATABASE_URL`); **117 are mock/unit** (`buildApp()` + `app.decorate('prisma'/'redis', mock)` — they do **not** connect; `buildApp` doesn't decorate prisma/redis itself).
- `vitest.config.ts`: single project, `maxWorkers: 4`, `setupFiles: ['./tests/setup.ts']` (injects test JWT/Stripe secrets; does **not** set `DATABASE_URL`).
- `generated/prisma` is **gitignored** → CI must `prisma generate` before tsc/tests.
- Existing CI: `.github/workflows/ci.yml` — one required job (`customer-web typecheck/lint/build`) + advisory dep-audit. **No backend job.**

## Where the flakes come from (two distinct causes)
1. **Concurrency contention** — up to 4 real-DB suites run in parallel against one Neon DB; `afterAll` teardown + cross-suite writes collide → the occasional 1-file flake (membership, suspend-reactivate, seen 3× this session). *These suites pass in isolation.*
2. **Data drift** — the ~40 `discovery/**` + seed suites assert on specific data in the **shared, drifted dev DB** (leaked fixtures, manual edits) → the ~58–108 non-deterministic "baseline" failures. *Root cause is running against a mutable shared DB, not the code.*

Cause 1 is fixed by **serial execution**; cause 2 needs a **dedicated, fresh-seeded test DB**.

## Strategy decision

**Test split — two Vitest projects** (recommended):
- `unit`: the 117 mock suites — **parallel, no DB**, already deterministic. The trustworthy core.
- `integration`: the 77 real-DB suites — **serial** (`fileParallelism: false`) against a dedicated DB.

**Categorisation** (pick at approval):
- **(a) Recommended — filename convention `*.integration.test.ts`** (rename the 77 via `git mv`, same dir so import paths are unchanged). Mechanical, reviewable, self-documenting, clean globs, future tests follow it.
- (b) Lower-diff alternative — a maintained `include`/`exclude` glob **list** in config. Smaller PR1 diff but brittle (a new real-DB test silently lands in the wrong project).

**Test DB — local Postgres (recommended) over Neon for tests:**
- CI: a `postgres` **service container**; dev: a local Docker Postgres (or a personal Neon branch by choice). **Fresh `migrate deploy` + seed per run** → no drift, no contention, no Neon cost, no network latency (so serial is fast).
- The schema is standard Postgres (Decimal lat/long, no PostGIS) → local PG is faithful.
- *Alternative:* ephemeral **Neon branch per CI run** — prod parity, but adds Neon-API orchestration + branch lifecycle + network latency. Reserve for if a Neon-specific behaviour ever matters.
- **Either way, stop running tests against the shared dev Neon** — that's the root cause.

## Smallest safe first PR (PR1) — split + unit-as-required-CI, **no DB infra**
1. `vitest.config.ts` → two **projects** (`unit` parallel, `integration` serial). Categorise per (a) or (b).
2. New scripts: `test:unit`, `test:integration`, keep `test` = both.
3. **CI job `backend (typecheck + unit)`** in `ci.yml`: `npm ci` → `prisma generate` (dummy `DATABASE_URL`) → `tsc --noEmit` → `vitest run --project unit` (dummy `DATABASE_URL`/`REDIS_URL` + setup.ts secrets; **no live DB/Redis** — unit suites mock everything).
4. `integration` runs **locally, serially** (kills the concurrency flakes) — **not in CI yet**.

**PR1 delivers:** a deterministic, **required-capable** backend gate (tsc + 117 unit suites, fast, no services) **today**, plus the concurrency-flake fix locally — with zero DB infrastructure and zero test-data changes. The CI run also validates the categorisation (a mis-tagged "unit" test that needs a DB fails fast → recategorise).

## PR2 (deferred) — dedicated test DB → integration in CI
- Add the Postgres service (CI) + local Docker compose (dev) + a `migrate deploy` + seed step.
- Point `integration` at it → **deterministic** real-DB runs.
- Add `backend (integration)` CI job, **advisory first**, promote to **required** once green.
- *Expected fallout:* some `discovery/**` suites assume dev-DB data → on a fresh seed they must seed their own fixtures or rely on the standard seed. Fix iteratively (this is the data-drift cleanup the "baseline" has been masking).

## CI job shape (PR1)
```
backend (typecheck + unit)   [add to ci.yml, always-run on PR + push main]
  - actions/checkout@v4
  - setup-node (node-version-file: .nvmrc); npm ci
  - npx prisma generate            # env: DATABASE_URL=<dummy> (generate needs the var, not a live DB)
  - npx tsc --noEmit
  - npx vitest run --project unit  # env: DATABASE_URL/REDIS_URL=<dummy>; setup.ts supplies secrets
```

## Required vs advisory
- **Required (owner sets branch protection):** `customer-web` (existing) + **`backend (typecheck + unit)`** (after PR1 soaks).
- **Advisory:** dep-audit (existing) + **`backend (integration)`** when added in PR2 → promote to required once stable.

## Runtime + developer workflow
- `unit` (parallel, no DB): **fast** inner loop (`npm run test:unit`).
- `integration` (serial): slower wall-clock than today's 4-parallel **but deterministic**; with local PG (PR2) the network latency is gone so serial is acceptable. Run `npm run test:integration` only when touching real-DB code; `npm test` for both.
- CI `unit` + tsc are fast (no services); CI `integration` (PR2) runs on the Postgres service.

## Deferred
- PR2 dedicated test DB + integration in CI (advisory→required).
- Per-test **transactional isolation** (vs serial) — advanced; serial is the MVP.
- `discovery/**` data-assumption fixes on fresh seed.
- Branch-protection flip to make backend required (owner action).
- Weaning **local dev** off the shared Neon entirely.

## Out of scope (locked)
Resend/domain/email enablement (owner track); customer-app/web test infra; any product/schema change; the Merchant Portal epic.
```
