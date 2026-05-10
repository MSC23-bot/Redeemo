# Pre-Launch Hardening Plan — §AC8 + §W + remaining §AG (Tier 2 brainstorm-first)

> **STATUS — DRAFT (2026-05-10).** Plan-first scope pass. NOT for execution yet. Owner-approved sequencing decisions are required before any PR. See [§7 Owner Decisions](#7-owner-decisions-required-before-execution).

## 0. Context

After the §AC / §AD / §AG audits closed most of the auth/session deferrals (commits `7c86d61`, `823d835`, `238008c`, `e537de3`, `ce0c164`, `e96bc19`, `5d46689`), what remains for pre-public-launch hardening consolidates around:

- **§AC8 PARTIAL** — auth/session production hardening: Redis ownership documentation, alerting on session-revoke spikes, refresh-rate observability metrics, auth-flow load-test baseline.
- **§W standing** — production resilience checklist: route-level rate limits, retry/backoff, request timeouts, caching strategy, DB index review, pagination review, third-party failure handling, SLO / alerting baselines, load-testing plan.
- **§AG3 / §AG8 Tier 0 nice-to-haves** — DB CHECK constraint for `RedemptionScreenshotEvent.platform`; release-build verification that `__DEV__` refresh diagnostics are stripped.
- **§AG6 / §AG7 watch-points** — React Query refetchInterval pattern + RedeemedSeal font fragility (notes only).

These overlap heavily by design. This plan unifies them under one workstream sequenced to minimize scope creep — **the goal is a defensible "ready for public traffic" posture, not gold-plated observability.**

## 1. Current state audit (anchor for the plan)

What the codebase ALREADY has. The hardening sweep adds to this rather than replaces it.

### 1.1 Rate limits — strong baseline

`src/api/plugins/rate-limit.ts` defines four route tiers + a global ceiling:

| Tier | Prod cap | Dev cap | Used by | Keying |
|---|---|---|---|---|
| `login` | 5/min | 50/min | customer/admin/merchant/branch login routes | IP |
| `forgotPassword` | 3/hour | 10/min | customer/admin/merchant forgot-password | IP |
| `refresh` | 30/min | 100/min | customer auth/refresh | IP |
| `redemptionPolling` | 30/min | 100/min | `GET /redemption/me/:code` | per-customer (`req.user.sub`), preHandler hook |
| **Global** | 100/min | 100/min | everything else | IP |

**Coverage gap:** all other routes fall back to the global 100/min IP ceiling. That's adequate for current traffic but on shared NAT (corporate Wi-Fi, CGNAT) the global ceiling can falsely fire before any specific route's ceiling. Documented in §AC8 already.

### 1.2 Audit log — strong data, no alerting

`src/api/shared/audit.ts` defines `AuditEvent` enum with auth + payment events; `writeAuditLog` is called from **83 sites** across the API. Notable events captured:

- `AUTH_REFRESH_FAILED`
- `AUTH_SESSION_REPLACED`
- `AUTH_LOGIN_SUCCESS` / `AUTH_LOGIN_FAILED`
- `AUTH_OTP_SENT` / `AUTH_OTP_VERIFY_FAILED`
- `AUTH_ACCOUNT_DELETED`
- `REDEMPTION_CREATED`, `REDEMPTION_VALIDATED`, `PIN_FAIL_LIMIT_HIT`

**The data is all there.** What's missing is alerting infrastructure that watches for spike patterns on these events.

### 1.3 Redis — namespaced and centralized

`src/api/shared/redis-keys.ts` centralizes 13 key namespaces with inline purpose comments. The structure is good; what's missing is operational documentation for each namespace (TTL, eviction policy, recovery scenario).

### 1.4 Outbound HTTP — no timeouts, no retry config

- `src/api/shared/stripe.ts` — Stripe SDK with default config (no `timeout`, no `maxNetworkRetries` override).
- `src/api/shared/otp.ts` — Twilio SDK with default config.
- Resend not yet integrated (Phase 6).

**Pre-launch risk:** a misbehaving Stripe / Twilio endpoint could hang a request thread until the SDK's internal default timeout (Stripe defaults to 80s, Twilio to 30s). At any meaningful concurrency this saturates the Node event loop.

### 1.5 Database — Prisma indexes present, no review process

`prisma/schema.prisma` has 115 `@index` / `@unique` / `@@unique` declarations. New columns added during M1-M3 + PR-B were each indexed at the migration commit. **No `EXPLAIN ANALYZE` audit has been run** against realistic-volume seed data; new indexes have been added defensively per migration.

### 1.6 Pagination — mixed conventions

`take:` / `skip:` / `cursor:` / `orderBy` appears in 58 service-level call sites. Some use cursor pagination (savings, redemption history); some are unbounded `findMany` (categories, branches, photos). No documented convention; no enforcement that new endpoints must paginate.

### 1.7 Load-test harness — none

No `k6` / `artillery` / similar tooling in the repo. No baseline numbers for any endpoint.

### 1.8 Observability tooling — Pino logs only

- Structured logs: Fastify default (Pino) — `app.ts:26` enables logger when not `NODE_ENV=test`.
- No metrics export (no Prometheus, OpenTelemetry, Datadog, Sentry).
- No request-trace propagation.
- No SLO definitions.

### 1.9 Frontend retry/backoff — React Query defaults, hand-tuned where it matters

- React Query handles client retries with sensible defaults (3 attempts, exponential backoff).
- Refresh-token retry is custom: serialized + transport-vs-terminal split (PR #52).
- Polling retry budget: 15-min hard cap on `useRedemptionPolling`.

## 2. Scope

### In scope

| Concern | Coverage |
|---|---|
| Redis ownership documentation (§AC8) | Document each of the 13 namespaces |
| Alerting on session-revoke spikes (§AC8) | Define alert thresholds + delivery channel |
| Refresh-rate observability metrics (§AC8) | Decide: log-based metrics vs metrics export |
| Auth-flow load-test baseline (§AC8) | k6 smoke-test of auth flows under realistic concurrency |
| Per-route rate limits (§W) | Audit each route group; promote / tighten where needed |
| Outbound HTTP timeouts (§W) | Stripe + Twilio explicit timeout config |
| Caching strategy (§W) | Document the convention; no new infrastructure if not needed |
| DB index review (§W) | One-shot `EXPLAIN ANALYZE` pass on top read-heavy endpoints |
| Pagination review (§W) | Audit + document convention; tighten unbounded `findMany` if any |
| Third-party failure handling (§W) | Stripe webhook idempotency confirmation; Twilio failure path |
| SLO / alerting baselines (§W) | Define p95 latency + error-rate targets per critical endpoint |
| Load-testing plan (§W) | k6 harness + baseline runs + how often to re-run |
| §AG3 platform CHECK constraint | Migration to add `CHECK ("platform" IN ('ios', 'android'))` |
| §AG8 release-build verification | One-shot release-readiness inspection |
| §AG6 / §AG7 | Note in the plan; no code change |

### Out of scope

- Distributed tracing (OpenTelemetry / Tempo / Jaeger). Production-scale problem. Pino structured logs cover pre-launch.
- Background job queue (BullMQ). No current flow needs deferred work; redemption / auth / payment all complete in the request path. Phase 6 comms (Resend marketing) might need it, deferred until then.
- Comprehensive caching layer (Redis read-through cache for discovery, merchant profile). Owner-deferred until production traffic shows it's needed; current React Query staleTime handles client-side, and discovery endpoints are not the hot path on mobile.
- Sentry / Datadog wiring. Pre-launch starts with structured Pino logs piped to whichever logging service the hosting platform provides (Vercel / Railway / Render — TBD owner decision). Sentry can layer on later.
- SLO tracking dashboards. Pre-launch: define the SLOs in docs + alert on breaches. Dashboards come once we have production traffic to display.
- §Q1-Q3 + §Q5 redeemed-state Tier-2 design pass (separate workstream).

## 3. Plan document

**Path:** `docs/superpowers/plans/2026-05-10-pre-launch-hardening.md` (this file).

Companion docs to be created:

- `docs/operations/redis-namespaces.md` — Redis ownership reference (PR-1).
- `docs/operations/observability-baselines.md` — SLOs + alert thresholds + log queries (PR-3).
- `docs/operations/load-test-runbook.md` — k6 smoke-test runbook + baseline numbers (PR-4).
- `docs/operations/index-audit-2026-05-10.md` — `EXPLAIN ANALYZE` snapshot (PR-2).

The four `docs/operations/*` files are **the deliverable for the documentation/operational pieces**. They're operational reference material, not narrative — short, dense, navigable.

## 4. Pre-launch blocker classification

Owner-decision matrix for "what must ship before public traffic" vs "what can defer until production scale".

### 4.1 Must ship before public launch (hard blockers)

| # | Item | Why |
|---|---|---|
| B1 | **Stripe + Twilio explicit request timeouts** | Default SDK timeouts (80s / 30s) saturate the event loop under any concurrency. One slow upstream call blocks N other requests. |
| B2 | **Stripe webhook idempotency confirmation** | Already in place via `StripeWebhookEvent` table — verify it's still wired and write a one-page operational runbook. Financial flow; no surprises at launch. |
| B3 | **Auth-flow k6 smoke test + baseline numbers** | Need to know what login / refresh / redemption flow looks like under 50-100 concurrent users before public traffic finds out. |
| B4 | **Alerting on auth-failure spikes** | `AUTH_REFRESH_FAILED` + `AUTH_OTP_VERIFY_FAILED` + `PIN_FAIL_LIMIT_HIT` are the brute-force / abuse signals. Need at least one alert channel firing on threshold breach (email or Slack). |
| B5 | **Redis ownership documentation** | Operational. When (not if) Redis hiccups, on-call needs to know which namespaces are tolerable to flush vs. require operational care. One markdown doc. |
| B6 | **DB index audit + `EXPLAIN ANALYZE` snapshot of top 10 read-heavy endpoints** | One-shot. Catches accidentally-unindexed queries before they hit production volume. |
| B7 | **§AG3 platform CHECK constraint** | Defense-in-depth migration. Tier 0 / 5-minute fix. Folds in here naturally. |
| B8 | **§AG8 release-build verification** | One-shot release-readiness check. Confirm `__DEV__`-gated diagnostic logs strip in EAS production build. |
| B9 | **Pagination audit — tighten any unbounded `findMany`** | Catches accidental "return everything" endpoints. One-shot audit + tighten if found. |

### 4.2 Should ship before public launch (strong recommendations, defer-able under explicit owner sign-off)

| # | Item | Why defer-able |
|---|---|---|
| S1 | **Refresh-rate observability metrics** (counts + p95 latency exposed for refresh route) | We have audit-log data; we can query it ad-hoc. Metrics dashboard helps but isn't blocking. |
| S2 | **SLO target definitions for top 10 endpoints** | Helpful for on-call; not blocking traffic. Can land week 2. |
| S3 | **Per-route rate-limit promotion for any high-risk routes not yet covered** | Audit may find none — depends on findings. |
| S4 | **Load-test runbook beyond auth flows** (search, voucher detail, redemption) | Auth flows are the highest-risk; others can baseline post-launch with real traffic shape. |

### 4.3 Defer to production scale (post-launch)

| # | Item | Why deferred |
|---|---|---|
| D1 | OpenTelemetry distributed tracing | Pre-launch cost > pre-launch value. Pino logs cover incident triage. |
| D2 | BullMQ background queue | No flow needs it currently. Phase 6 comms might. |
| D3 | Redis read-through cache layer | React Query handles client-side; backend is fast enough at current shape. |
| D4 | Sentry / Datadog wiring beyond Pino | Hosting platform's log aggregation (Vercel / Railway TBD) covers MVP needs. |
| D5 | Live-traffic SLO dashboards | Need traffic to display. Define SLOs now (S2), wire dashboards once traffic exists. |

### 4.4 Notes only — no work this round

| # | Item | Why notes-only |
|---|---|---|
| N1 | §AG6 React Query `setTimedOut` from inside `refetchInterval` | Working code. Flag at the React Query upgrade PR. Plan documents the watch-point. |
| N2 | §AG7 `RedeemedSeal` font-fragility | Latent. Activates only if a custom-font PR ships. Plan documents the watch-point. |

## 5. Sequencing — recommended PR breakdown

Five focused PRs over ~1.5 weeks of execution time. Each PR ships independently; later PRs depend on earlier.

### PR-1: Redis ownership doc + §AG3 platform CHECK + §AG8 release-build verification

**Theme:** Foundational hygiene. Smallest PR; purely documentation + one schema migration + one release-build inspection.

**Code changes:**
- Prisma migration: `ALTER TABLE "RedemptionScreenshotEvent" ADD CONSTRAINT "RedemptionScreenshotEvent_platform_check" CHECK ("platform" IN ('ios', 'android'));`

**Docs:**
- `docs/operations/redis-namespaces.md` (new) — per-namespace ownership table:
  - Key prefix, purpose, TTL, eviction policy, recovery procedure (safe-to-flush vs requires-care), test fixture if any.
  - 13 namespaces total per `redis-keys.ts`.

**Operational:**
- §AG8: run `eas build --profile preview` once; grep production-build artifact for `[api.refresh] body shape` and `[api.refresh] response status` strings; confirm absent. Document the procedure + result in a short follow-up note in the redis-namespaces doc (or a dedicated `release-readiness.md`).

**Tests:**
- Migration tested via existing Prisma migration test pattern (`tests/api/auth/...` style integration test that the constraint exists and rejects bad input).

**Estimated size:** ~30 LOC migration + ~250 lines markdown + 1 test. ~1 commit.

**Owner decisions to surface during this PR:** none — pure documentation + small migration.

### PR-2: DB index audit + pagination audit

**Theme:** Catch accidentally-unindexed queries + unbounded `findMany` before production traffic finds them. One-shot operational sweep.

**Code changes (only if findings warrant):**
- Add Prisma migrations for any missing indexes flagged by `EXPLAIN ANALYZE`.
- Tighten any unbounded `findMany` to use `take` + cursor pagination.

**Docs:**
- `docs/operations/index-audit-2026-05-10.md` (new) — for top 10 read-heavy endpoints (run in priority order):
  1. `GET /api/v1/customer/discovery/home` (home feed)
  2. `GET /api/v1/customer/discovery/merchant/:id` (merchant profile)
  3. `GET /api/v1/customer/discovery/voucher/:id` (voucher detail)
  4. `GET /api/v1/customer/discovery/search` (search)
  5. `GET /api/v1/customer/savings/redemptions` (redemption history pagination)
  6. `GET /api/v1/customer/favourites/merchants` + `/vouchers`
  7. `GET /api/v1/customer/reviews/:branchId` (branch reviews)
  8. `GET /api/v1/redemption/my` (redemption history list)
  9. `GET /api/v1/redemption/me/:code` (polling — already rate-limited but still hot)
  10. `GET /api/v1/customer/categories` (category taxonomy)

  Per endpoint: query plan output, row-scan vs index-hit, proposed index if needed.

  Process: seed realistic data volume (10k merchants, 100k vouchers, 1M redemptions for stress; or smaller multipliers if adequate). Run query, capture `EXPLAIN (ANALYZE, BUFFERS) ...` output. Snapshot in the doc.

**Tests:**
- Each new index ships with the standard Prisma migration test harness.

**Estimated size:** Highly variable. If audit finds nothing, ~0 code + ~400 lines doc. If finds 3-5 indexes needed, ~30-50 LOC migrations + ~500 lines doc. Allow 1-3 commits.

**Owner decisions to surface:**
- Should the audit doc be regenerated annually / per-major-release as a recurring operational discipline? Or one-shot at launch?

### PR-3: Outbound HTTP timeouts + third-party failure handling

**Theme:** Prevent runaway request hangs caused by Stripe / Twilio slow upstream calls.

**Code changes:**
- `src/api/shared/stripe.ts` — explicit `timeout: 10000` (10s) + `maxNetworkRetries: 2` on Stripe SDK init. Stripe webhooks already have idempotency via `StripeWebhookEvent` table; document but don't change.
- `src/api/shared/otp.ts` — wrap Twilio SDK calls in `Promise.race` with explicit 10s timeout, OR use Twilio SDK's `timeout` config option if exposed (verify at implementation time).
- Add a `withTimeout(promise, ms, errorCode)` utility for any future outbound call that needs timeout enforcement.

**Docs:**
- `docs/operations/observability-baselines.md` (new) — section "Third-party failure handling" documenting:
  - Stripe: 10s request timeout, 2x retries, webhook idempotency via `StripeWebhookEvent` table.
  - Twilio: 10s request timeout, 1x retry, OTP send-failure user-facing copy ("Try again in a moment").
  - Resend (deferred to Phase 6): pattern to follow when wired.
  - Future maps/geocoding provider (TBD).

**Tests:**
- Vitest integration test: mocked Stripe slow response → caught at 10s timeout + clear error code.
- Vitest integration test: mocked Twilio rejection → user-facing error returned (no thread hang).

**Estimated size:** ~50-80 LOC code + ~30 LOC tests + ~200 lines doc. 1-2 commits.

**Owner decisions to surface:**
- Stripe retry count: 2 (default) vs 0 (we handle retries via Stripe webhooks) vs 1?
- Twilio: do we want auto-retry on network blip, or surface error to user immediately?

### PR-4: Auth-flow k6 smoke test + load-test runbook

**Theme:** Concrete numbers for "what happens at 50-100 concurrent users hitting auth flows".

**Code changes:**
- `load-tests/auth-flow.js` (new) — k6 script:
  - Login → refresh → call `/api/v1/customer/profile/me` × 5 → logout flow.
  - Ramp from 1 → 50 → 100 concurrent virtual users over 2 minutes.
  - Output: p50 / p95 / p99 latency per endpoint, error rate per stage, total throughput.

- `load-tests/redemption-polling.js` (new) — k6 script:
  - Authenticated user opens Show-to-Staff (acquires redemption first) → polls `/redemption/me/:code` at 5s cadence × 3 minutes (matches real polling cadence within the 15-min budget).
  - Verify the per-customer rate-limit DOES NOT false-positive at legitimate cadence.
  - Verify backend handles 50 concurrent polling sessions without latency degradation.

- `load-tests/README.md` (new) — runbook: install k6, run with seeded local backend, expected baseline numbers, when to re-run.

**Docs:**
- `docs/operations/load-test-runbook.md` (new) — runbook for re-running the suite, reading output, comparing against committed baselines, escalation path if regressions found.
- Append baseline numbers (p50, p95, p99, error rate) per endpoint to the runbook.

**Tests:**
- Self-validating: the k6 scripts ARE the tests. No additional Vitest coverage needed.

**Estimated size:** ~250-400 LOC k6 scripts + ~300 lines doc. 2 commits.

**Owner decisions to surface:**
- k6 OSS vs k6 Cloud — start with OSS (free, runs locally / on CI). Cloud is a Phase 6 escalation if needed.
- Target concurrency for "smoke baseline" — 50 concurrent? 100? 500? Recommend 50-100 for smoke (matches realistic launch-day expectation); higher caps go in Phase 6.
- Frequency: every PR? Every release? Once at launch? Recommend: once now, then ad-hoc on auth-impacting changes.

### PR-5: Alerting + observability baselines + SLO definitions

**Theme:** Define what "healthy" looks like and route the existing audit-log signals to a notification channel.

**Code changes:**
- `src/api/plugins/observability.ts` (new) — lightweight metrics emission:
  - On boot, expose `/api/v1/health` (already may exist; verify) + `/api/v1/health/metrics` reading recent counts from audit-log + Redis.
  - Per-request hook: log structured `{ requestId, route, statusCode, durationMs, userId? }` line — Pino already does this; document the format.

- (Optional, owner-decision) integrate hosting-platform alerting:
  - Vercel: log drains → alerting service.
  - Railway / Render: log forwarding to Logtail / Better Stack / similar.
  - Defer wiring until owner confirms hosting platform.

**Docs:**
- `docs/operations/observability-baselines.md` extension (continued from PR-3):
  - **SLO targets per critical endpoint** (p95 latency, error rate, availability):
    - `POST /auth/login` — p95 < 500ms, error rate < 1%, availability 99.5%
    - `POST /auth/refresh` — p95 < 200ms, error rate < 1%, availability 99.9%
    - `GET /redemption/me/:code` — p95 < 100ms, error rate < 0.5%, availability 99.9%
    - `POST /redemption` (create) — p95 < 800ms, error rate < 1%, availability 99.5%
    - `GET /discovery/home` — p95 < 600ms, error rate < 1%, availability 99.5%
    - (numbers above are draft; tune via PR-4 baseline data)

  - **Alert thresholds:**
    - `AUTH_REFRESH_FAILED` rate > 50/hour for one IP → potential brute-force.
    - `AUTH_OTP_VERIFY_FAILED` rate > 100/hour for one phone → potential abuse.
    - `PIN_FAIL_LIMIT_HIT` rate > 10/hour globally → potential coordinated attack.
    - `AUTH_SESSION_REPLACED` rate > 50/hour globally → potential mass account takeover.
    - 5xx error rate > 1% over 5 minutes → on-call wake.
    - p95 latency on critical endpoints > 2× SLO target for 5+ minutes → on-call.

**Tests:**
- Vitest integration: mock-emit each AuditEvent; assert the alert-threshold function classifies correctly.

**Estimated size:** ~100 LOC observability hook + ~50 LOC threshold logic + ~50 LOC tests + ~400 lines doc. 1-2 commits.

**Owner decisions to surface:**
- Hosting platform = ? (drives where logs go and what alerting channel is realistic).
- Notification channel: email vs Slack vs PagerDuty vs SMS?
- Who's on-call for the launch period? Owner alone, or wider team?
- SLO target tuning — accept the draft numbers above as starting point, or owner has stricter / looser values?

## 6. Tests / verification needed

| PR | Test type | Coverage |
|---|---|---|
| PR-1 | Vitest integration | Migration adds CHECK constraint; insert with bad platform value rejected at DB layer. |
| PR-2 | Vitest integration | Each new index ships with a query that validates the planner uses it (`EXPLAIN ANALYZE` regression check optional). |
| PR-3 | Vitest integration | Stripe / Twilio mocked slow path → caught at timeout. Stripe / Twilio mocked rejection → user-facing error returned. |
| PR-4 | k6 self-validating | k6 thresholds enforce "p95 < target" + "error rate < target". CI can run the smoke test on PR. |
| PR-5 | Vitest integration | Alert classifier produces correct severity for sample event sequences. |

## 7. Owner decisions required before execution

The plan is concrete enough to execute, but six decisions need owner input first:

| # | Decision | Default if owner doesn't decide | Blocks |
|---|---|---|---|
| D1 | **Hosting platform** for production (Vercel / Railway / Render / other) | Cannot ship PR-5 alerting wiring without this | PR-5 alerting |
| D2 | **Notification channel** for alerts (email / Slack / PagerDuty / SMS) | Email-to-personal-address as MVP | PR-5 alerting |
| D3 | **k6 smoke-test concurrency target** for "passes at launch" | 50 concurrent | PR-4 |
| D4 | **Stripe retry count override** (default 2 vs 0 vs 1) | Keep default 2 | PR-3 |
| D5 | **Twilio failure UX** (auto-retry once vs surface immediately) | Surface immediately, user re-taps | PR-3 |
| D6 | **Index-audit cadence** (one-shot vs annual vs per-major-release) | One-shot at launch + ad-hoc on schema changes | PR-2 |

D1 is the only true blocker — without knowing the hosting platform, PR-5's alerting wiring is fictional. The other five are tuning preferences that can be set with sensible defaults and revised if needed.

## 8. Sequencing decision matrix

If owner wants to **ship all five PRs before public launch** (full hardening): ~1.5 weeks of execution, each PR ~1-3 commits. Sequenced PR-1 → PR-2 → PR-3 → PR-4 → PR-5.

If owner wants to **ship the minimum viable hardening** (B1-B9 only, classified §4.1 above): ~3-5 days of execution. Cherry-pick from this plan:

- PR-1 (Redis docs + §AG3 + §AG8 release-build check) — full.
- PR-2 (index audit) — minimum viable: top 5 endpoints only, defer 6-10 to post-launch.
- PR-3 (HTTP timeouts) — full, this is a true blocker.
- Defer PR-4 (load-tests) — owner-acknowledged risk that we don't know launch-day numbers; mitigate with conservative initial traffic ramp.
- PR-5 reduced — alerting only on the four highest-priority audit-log signals (B4); defer SLO documentation to post-launch.

If owner wants to **defer everything except the absolute essentials**: PR-1 + PR-3 only. ~2 days of execution. Skips load-test baseline and alerting; accepts the risk that production-day will surface the unknowns.

## 9. Notes (no work this round)

- **§AG6** — `useRedemptionPolling.setTimedOut` from inside `refetchInterval`. Working today, unusual pattern. Flag at the React Query upgrade PR; no change here.
- **§AG7** — `RedeemedSeal` hardcoded percentage positions on the brand-rose ink-fade band + cream speckles. Activates only if a custom-font PR ships and breaks the seal visually. No change here.

## 10. Cross-refs

- Memory `project_deferred_followups_index.md` §AC8 (PARTIAL — this plan addresses the remaining items).
- Memory `project_deferred_followups_index.md` §W (standing checklist — this plan converts the checklist into concrete deliverables).
- Memory `project_deferred_followups_index.md` §AG3 / §AG6 / §AG7 / §AG8 (folded in / noted).
- `CLAUDE.md` Phase 3C.1c PR-B section (the auth/session work that closes §Y / §AD / §AC6 / §AC7 ahead of this hardening sweep).
- `src/api/plugins/rate-limit.ts` — current rate-limit tier definitions.
- `src/api/shared/audit.ts` — current AuditEvent enum (the data source for alerting).
- `src/api/shared/redis-keys.ts` — Redis namespace map (input to PR-1 doc).

## 11. Recommendation

The plan is structured so PR-1 is mechanical (no owner judgment needed beyond accepting the doc structure), PR-2 is dependent on audit findings, and PR-3 is a focused infra fix. PR-4 + PR-5 are where most owner judgment lands.

**Suggested next step:** Owner reviews this plan, decides on D1-D6, and confirms the sequencing strategy from §8. After that, PR-1 can begin without further blocking decisions.

PR-1 is the lowest-risk, highest-leverage starting point — ~30 LOC migration + comprehensive Redis ownership doc + a one-shot release-build inspection. Lands in a day; the operational documentation is a permanent reference for everyone who follows.
