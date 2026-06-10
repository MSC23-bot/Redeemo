# Merchant Portal — Phase 0 Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the five shared backend foundations the "first live merchant" loop depends on — transactional email (Resend), a unified notification dispatcher, R2 file storage with a photo-moderation gate, an atomic password-reset/SMS limiter, and a BullMQ job runner — plus the staging-environment requirements, **without building any Merchant Portal UI, Admin Actioner, merchant-creation, go-live, voucher-builder, curated-terms engine, admin RBAC/grants, or any Phase 2/3 workflow** (those are deferred).

**Architecture:** Additive backend infrastructure on the existing Fastify + Prisma 7 + Neon + `ioredis` stack. New shared libs live in `src/api/shared/`; a new second process (`src/worker.ts`) runs BullMQ workers against the existing Redis. Email/SMS/push dispatch funnels through one `shared/notify.ts` that writes the **existing** `Notification` + `CommunicationLog` models and enqueues delivery jobs (bounded retries + idempotency). File storage uses Cloudflare R2 via the S3-compatible SDK; **Phase 0 ships the storage *library* (presign + validation) only — no live upload route** (routes need Phase-2 capability checks). A moderation gate guarantees no unmoderated photo is ever public. Email production-sending stays **gated** behind the owner's domain/mailbox/DNS completion (runbook §6); staging runs in Resend sandbox mode.

**Tech Stack:** Fastify 5, Prisma 7.7, Neon Postgres, `ioredis` 5, BullMQ (new), `resend` 6.10 (vendored, to be wired), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (new, R2 is S3-compatible), Twilio (existing), Vitest.

**Source of truth:** the merged PR #197 spec — `docs/superpowers/specs/2026-06-10-merchant-portal-admin-onboarding-design.md` (§0 scope, §5 documents, §12 photo safeguards, §14 Phase-0 prerequisites) + `docs/runbooks/deploy-security-runbook.md` (§1 env, §6 email pre-send gates, §4 launch sequence).

**Plan version:** v1.2 — patched 2026-06-10 after review. Patch log: (1) `CommunicationLog` gains `QUEUED` (no "SENT before delivery"); (2) cut `MerchantDocument.verificationStatus` (Phase 2); (3) storage = library-only, no exposed route; (4) Resend webhook gated on its own secret, independent of outbound; (5) limiter victim-vs-abuser counter semantics; (6) BullMQ/Redis topology made explicit; (7) moderation-default consequence stated plainly; (8) **delivery reliability — `CommunicationLog(QUEUED)` is a durable outbox with best-effort post-commit enqueue + a deterministic-`jobId` reconciler sweep (§4.1), so a committed `QUEUED` row can never be silently undelivered.** Decisions D1–D6 recorded (§13).

---

## 0. Scope boundary (CLOSED)

**IN (this plan — backend foundations only):** Resend email foundation · `shared/notify.ts` dispatcher (writes `Notification` + `CommunicationLog`) · R2 storage **library** (presign + validation, no live route) · photo safeguards (count cap + moderation hook/gate + no-instant-unmoderated-publish invariant) · §SEC.1 atomic password-reset (+ SMS) limiter · BullMQ job-runner foundation · staging-environment requirements.

**NOT IN — explicitly deferred, do not plan or build here:** Merchant Portal UI · Admin Actioner / `AdminApproval` reader · merchant self-register / `MerchantMembership` / `MerchantLead` · go-live transaction · type-specific voucher builder · **curated-terms / `TermsClause` engine** · **admin RBAC / capability grants** · the day-2 photo-management UI, admin moderation queue, photo-report, admin remove/revert **actions** · all Phase 2/3 workflows. (Phase 0 ships only the storage + gate + field those will later drive.)

**Non-goals:** no FCM/push send (Phase 6 — `notify.ts` writes the in-app `Notification` row and is push-ready, but delivers no push); no migration of the Stripe-webhook voucher-cycle-reset to BullMQ (D6); no production email enablement (owner gate, §13); no live upload route (Phase 2); no provider lock-in for moderation (provider-agnostic hook, safe default).

---

## 1. Goals & non-goals

| # | Goal | Definition of done |
|---|---|---|
| G1 | Resend email foundation | A tested `shared/email.ts` that sends via Resend in live or sandbox mode, with the D-F sender policy; **no real production send until the owner gate closes** (§13). |
| G2 | `shared/notify.ts` dispatcher | One entry point that writes a `Notification` row (when in-app-applicable) + a `CommunicationLog` row (status `QUEUED`) per external channel, enqueues a BullMQ delivery job, and is consumed by the existing email placeholders (PIN, password-reset, email-verify). |
| G3 | R2 storage library | A tested `shared/storage.ts` (presigned PUT/GET, content-type + size validation, deterministic key scheme) for documents + logos + banners + branch photos. **No HTTP route in Phase 0.** |
| G4 | Photo safeguards | A per-branch count cap + a provider-agnostic moderation hook + the **invariant that no photo is publicly visible unless `moderationStatus = APPROVED`**, holding even when no scanner is configured (default → admin review). |
| G5 | §SEC.1 atomic limiter | SMS **and** password-reset counters atomic under concurrency (no overshoot), with **victim-vs-abuser semantics** (a blocked attempt never burns a victim's per-email/per-phone quota but still counts against IP/global). Proven by a concurrency test; all three forgot-password surfaces route through it. |
| G6 | BullMQ job runner | A `src/worker.ts` process + a queue/worker factory on the existing Redis (explicit topology: dedicated connection, key prefix, `noeviction`), graceful shutdown, bounded retries, idempotency, and the email-delivery + moderation-scan queues. |
| G7 | Staging requirements | A documented staging manifest (env vars, two-process model, Neon branch, Redis, Stripe test, Resend sandbox) + a Railway-compatible `Procfile`. |

**Non-goals (explicit):** none of the §0 deferred surfaces; no new customer-app or customer-web code except the **one** defensive read-path photo filter in G4 (backend discovery query only — no UI); no observability/alerting (hardening PR-5); no load testing (hardening PR-4).

---

## 2. Current-state ground truth (verified by code audit + re-inspection, 2026-06-10)

| Area | State | Anchor |
|---|---|---|
| `resend` SDK | Vendored `^6.10.0`, **zero imports** (only Phase-6 TODO comments) | `package.json:49`; `.env.example:98–110` |
| `Notification` model | **EXISTS** (in-app/push, per user) | `prisma/schema.prisma:1457–1477` |
| `CommunicationLog` model | **EXISTS** — status enum `SENT/FAILED/BOUNCED`, `@default(SENT)` | `schema.prisma:1483–1501`; enum `1425–1429` |
| `CommunicationStatus` | `SENT / FAILED / BOUNCED` — **no `QUEUED`** (patch 1 adds it) | `schema.prisma:1425–1429` |
| User consent | `newsletterConsent`, `marketingConsentAt`; back-relation `communications` | `schema.prisma:116–157` |
| Email placeholders to replace | Branch PIN email `console.info`; `forgotPassword*` "TODO Phase 6" | `src/api/merchant/branch/service.ts:532–535`; `auth/{customer,merchant,admin}/service.ts` |
| Twilio SMS | Live | `src/api/shared/otp.ts` |
| Env validation | Fail-closed `requireSecret()` + `REQUIRED_SECRETS[]` + `validateRequiredEnv()`; no Zod | `src/api/shared/env.ts:35–88` |
| Redis client | `ioredis` singleton, `app.redis`, `lazyConnect`, `maxRetriesPerRequest: 3` | `src/api/plugins/redis.ts:6–32` |
| Password-reset limiter | Wired + called, **race-prone**; victim keys = per-email hr+day, abuser key = per-IP day; counts every request (anti-enumeration) | `src/api/shared/pwdResetLimiter.ts:77–124` |
| SMS limiter | Volume caps **race-prone**; resend cooldown **atomic SET-NX**; victim = per-phone+per-user, abuser = per-IP+global | `src/api/shared/smsLimiter.ts:141–231` |
| Redis keys | `rl:pwd-reset:*`, `rl:otp:*`, `rl:sms:global:day`, `pwd-reset:customer:<token>` | `src/api/shared/redis-keys.ts` |
| File upload / R2 / S3 / multipart | **ABSENT** — no deps, no code | `package.json:32–53` |
| `BranchPhoto` | **EXISTS** — id, branchId, url, sortOrder, createdAt; **no moderation** (patch 4 §4 adds it) | `schema.prisma:507–517` |
| `MerchantDocument` | **EXISTS** — id, merchantId, documentType, fileUrl, uploadedAt; **storage needs nothing more** (patch 2 cuts the proposed status field) | `schema.prisma:546–556` |
| Image moderation | **ABSENT** | — |
| BullMQ / worker / cron | **ABSENT** — only periodic task is voucher-cycle-reset via Stripe webhook | `subscription/webhook.ts:95–128` → `cycle.ts:31–45` |
| Process model | Single Fastify process; `dev/build/start/test` scripts | `package.json:17–24`; `src/index.ts` → `bootstrap.ts` |
| Deploy/staging config | **ABSENT** — no Dockerfile/Procfile; env-var driven | runbook §1–§7 |

---

## 3. File / module map (decomposition lock)

**New shared libs** (`src/api/shared/`):
- `email.ts` — Resend client wrapper (send, sandbox redirect, From/Reply-To policy, idempotency key).
- `notify.ts` — the dispatcher (writes `Notification` + `CommunicationLog` status `QUEUED`; best-effort enqueue AFTER commit; outbox-reconciled — §4.1).
- `storage.ts` — R2 (S3-compatible) client: **presigned PUT/GET + key scheme + content-type/size validation. No route.**
- `moderation.ts` — provider-agnostic image-moderation hook (`scanImage()` → `CLEAN | FLAGGED | UNAVAILABLE`); default provider `none`.
- `atomicLimiter.ts` — a Lua-backed `consume(redis, { abuserKeys, victimKeys })` helper (the §SEC.1 core, victim-vs-abuser semantics) that the password-reset + SMS limiters call.

**New queue infra** (`src/api/queues/`):
- `connection.ts` — a dedicated BullMQ `ioredis` connection (`maxRetriesPerRequest: null`).
- `index.ts` — queue factory + key prefix + the `email` / `moderation` queue definitions + enqueue helpers.
- `processors/email.ts` — email-delivery worker (calls `shared/email.ts`, transitions `CommunicationLog` `QUEUED → SENT`; `→ FAILED` only on exhausted retries).
- `processors/outboxReconciler.ts` — the repeatable `reconcile-outbox` sweep: re-enqueues stale `QUEUED` `CommunicationLog` rows by deterministic `jobId` (§4.1).
- `processors/moderation.ts` — moderation-scan worker (calls `shared/moderation.ts`, transitions `BranchPhoto.moderationStatus`).

**New process entrypoint:** `src/worker.ts`.

**New webhook route:** `src/api/webhooks/resend.ts` — Resend bounce/complaint → `CommunicationLog` status + suppression. **Gated on `RESEND_WEBHOOK_SECRET` being configured — independent of outbound `EMAIL_ENABLED`** (patch 4).

**Modify (existing):**
- `prisma/schema.prisma` — `CommunicationStatus += QUEUED` + flip `CommunicationLog.status @default(QUEUED)` (PR-0.4); `BranchPhoto += moderationStatus, moderationCheckedAt, moderationDetail?` + new enum `PhotoModerationStatus` (PR-0.6). **No `MerchantDocument` change** (patch 2).
- `src/api/shared/env.ts` — add `requireSecretWhenEnabled()` + register the new feature-gated secrets; do **not** add them to the hard `REQUIRED_SECRETS`.
- `src/api/shared/pwdResetLimiter.ts` + `smsLimiter.ts` — route counting through `atomicLimiter.consume` with victim/abuser classification.
- `src/api/auth/{customer,merchant,admin}/service.ts` — confirm all three forgot-password paths consume the atomic limiter; replace the password-reset email placeholder with `notify.ts`.
- `src/api/merchant/branch/service.ts:532–535` + `auth/merchant/branch-user.service.ts` — replace email `console.info` with `notify.ts`.
- `src/api/app.ts` — register **only** the Resend webhook (gated on its secret). **No storage-route registration** (patch 3).
- `src/api/customer/discovery/service.ts` — defensive read-path filter: branch photos surfaced only when `moderationStatus = APPROVED`.
- `package.json` — add deps + `worker`/`start:worker` scripts.
- `.env.example` — add Resend, R2, moderation, worker, `EMAIL_WEBHOOK` vars.
- `docs/runbooks/deploy-security-runbook.md` — worker process + staging two-process notes.

**New process-config file:** `Procfile` (Railway-compatible — §13 D2) declaring `web` + `worker`.

**NOT created in Phase 0 (moved to Phase 2):** `src/api/storage/plugin.ts`, `src/api/storage/routes.ts`, `@fastify/multipart` registration — the live upload route needs capability checks that don't exist until `MerchantMembership` (Phase 2).

---

## 4. Schema & migration needs (two small additive migrations)

Phase 0 is **almost** schema-free because `Notification` + `CommunicationLog` already exist.

**Migration A — `CommunicationStatus.QUEUED` (in PR-0.4):**
```prisma
enum CommunicationStatus {
  QUEUED        // row written by notify.ts BEFORE delivery — the new default
  SENT          // provider ACCEPTED it (set by the email worker, not before)
  FAILED        // delivery attempt failed after bounded retries
  BOUNCED       // provider bounce/complaint webhook
}
// CommunicationLog.status @default(QUEUED)   // was @default(SENT)
// CommunicationLog @@index([status, sentAt]) // supports the §4.1 outbox reconciler sweep
```
- **Why (patch 1):** `SENT` must mean "the provider accepted/sent it." Writing `SENT` before the worker runs would misreport every queued message as delivered. `notify.ts` writes `QUEUED`; the email worker flips `QUEUED → SENT/FAILED`; the webhook flips `→ BOUNCED`.
- Additive enum value + a default change + a new `@@index([status, sentAt])`. **Safe:** `CommunicationLog` has zero existing writers (audit), so no rows or callers depend on the old default. The index supports the outbox reconciler (§4.1).

**Migration B — photo-moderation gate (in PR-0.6):**
```prisma
enum PhotoModerationStatus {
  PENDING       // uploaded, not yet cleared — NEVER public
  APPROVED      // scanner CLEAN or admin-approved — the ONLY public state
  FLAGGED       // scanner FLAGGED or admin-rejected — quarantined
}
model BranchPhoto {
  // ...existing: id, branchId, url, sortOrder, createdAt...
  moderationStatus    PhotoModerationStatus @default(PENDING)
  moderationCheckedAt DateTime?
  moderationDetail    String?
  @@index([branchId, moderationStatus])
}
```
- **Backfill:** existing seed `BranchPhoto` rows → `APPROVED` (curated reference data); new rows default `PENDING`.
- **`MerchantDocument` is NOT changed (patch 2):** storage only needs to write the file + the existing `fileUrl`. A document *verification/review* status is a Phase-2 onboarding/actioner concern (the admin reviews docs at the verify tier, spec §5) — building it here would pull Phase-2 review state into a storage PR. Cut.
- Additive + backfilled; `migrate dev` → `migrate deploy` (runbook §4). No destructive change.
- **No** `TermsClause`/`MerchantMembership`/`MerchantLead`/`AdminApproval`-reader here (Phase 2). **Deferred to Phase 2:** `PhotoReport`, the `MerchantDocument` verification-review model, `NotificationType` merchant-onboarding enum values.

### 4.1 Delivery reliability — `CommunicationLog(QUEUED)` as a durable outbox (patch v1.2)

**Problem:** `notify.ts` commits `CommunicationLog(QUEUED)` then enqueues the BullMQ job *after* the transaction (you cannot enqueue inside a Postgres transaction — Redis isn't in it; enqueuing before commit would orphan a job if the tx rolls back). If the commit succeeds but the enqueue fails (Redis blip, or the process dies between commit and enqueue), the row is `QUEUED` with no job — a silently undelivered message.

**Rule (transactional-outbox-lite — deliberately NOT a message bus):**
1. **`CommunicationLog(status=QUEUED)` IS the durable outbox.** The committed row is the single source of truth that "this message must be delivered." A message is delivered-for-real only once a worker flips it off `QUEUED`.
2. **Deterministic `jobId = CommunicationLog.id`.** BullMQ dedups by `jobId`: enqueuing the same row id while a job exists (waiting / active / delayed / retrying) is a no-op, so **re-enqueue is always safe** — that is what makes the reconciler idempotent.
3. **Enqueue is best-effort, AFTER commit.** `notify.ts` enqueues outside the transaction; on enqueue error it **logs a controlled warning with the row id, leaves the row `QUEUED`, and does NOT throw to the caller or roll the row back** (the outbox guarantees eventual delivery — a transient queue failure must neither fail the user's request nor lose the record).
4. **Reconciler sweep (the safety net).** A repeatable worker job `reconcile-outbox` (every 60 s) selects `CommunicationLog WHERE status = QUEUED AND sentAt < now() − GRACE` (`GRACE` ≥ the max retry-backoff window, e.g. 2 min) `ORDER BY sentAt LIMIT N`, and re-enqueues each by `jobId = id`. A row that still has a live job is deduped (no-op); a row whose original enqueue was lost gets a fresh job. Bounded `LIMIT` per run avoids a thundering herd; the `@@index([status, sentAt])` keeps the scan cheap.
5. **Worker terminal states.** The email worker flips `QUEUED → SENT` on provider-accept; on **retries exhausted** it flips `QUEUED → FAILED` (so the reconciler stops re-trying it). A row only *stays* `QUEUED` while genuinely undelivered — which is exactly what the reconciler looks for.
6. **Double-send backstop.** Delivery is at-least-once (a worker can crash *after* the provider accepted but *before* the row flips to `SENT`, and BullMQ will re-run the stalled job). The Resend **`idempotencyKey = CommunicationLog.id`** (PR-0.3 / PR-0.4) makes a duplicate send a provider-side no-op — so at-least-once enqueue ⇒ effectively at-most-once delivery.

**Deliberately NOT built (no overbuild):** no separate outbox table (the existing `CommunicationLog` is reused); no intermediate `SENDING` state (jobId dedup + the idempotency key already cover the in-flight window); no DLQ beyond BullMQ's `removeOnFail` retention + the `FAILED` row state. If production telemetry later shows real double-send or stuck-`FAILED` volume, an intermediate `SENDING` state + a DLQ view are the next step — out of Phase 0 scope.

---

## 5. External provider requirements

| Provider | Use | Phase-0 action | Owner/devops action |
|---|---|---|---|
| **Resend** | Transactional + (later) marketing email | Wire SDK; sandbox mode on staging | Verify domain + SPF/DKIM/DMARC; API keys (staging+prod); bounce/complaint webhook; monitored inboxes — **§13 production gate** |
| **Cloudflare R2** | Storage (docs/logos/banners/photos) | Wire S3-compatible client + presign (library only) | Create bucket(s); access keys; public base URL/CDN; CORS for browser PUT |
| **Image moderation** | Photo safety gate | Provider-agnostic hook; default `none` → admin review | **D1:** pick provider or accept admin-review-only |
| **Twilio** | SMS (existing) | Limiter made atomic; no behavioural change | — |
| **Redis topology** | Sessions + limiters + **BullMQ** | See PR-0.1 — **shared instance for MVP**, dedicated BullMQ connection, key prefix, `noeviction` | Ensure staging/prod Redis `maxmemory-policy noeviction` + headroom |
| **Neon** | Postgres | `migrate deploy` | Provision a **staging branch** |

**Redis topology (patch 6):** BullMQ **shares the existing Redis instance** for MVP (low job volume: email/notification/moderation only; operational simplicity; one instance to run). It uses its **own `ioredis` connection** (`maxRetriesPerRequest: null`, required by BullMQ; the app keeps its `maxRetriesPerRequest: 3` connection) and a **key prefix** (`BULLMQ_PREFIX=redeemo`) so queue keys never collide with session/limiter keys. The shared instance **must be `maxmemory-policy noeviction`** — BullMQ cannot tolerate key eviction (a dropped job key = a lost job); sessions + TTL'd rate-limit keys are unaffected by `noeviction`. **Trigger to split to a dedicated Redis later:** sustained queue depth/throughput, memory pressure from job payloads, or wanting to scale workers / apply different persistence independently of the session store.

---

## 6. Env vars / secrets

Add to `.env.example` (documented) and to `env.ts` via a new **feature-gated** validator (validated only when the flag is on, so local/dev boot is unaffected):

```bash
# ── Email / Resend ──────────────────────────────────────────────
EMAIL_ENABLED=false                       # OUTBOUND master switch; prod gate (§13)
EMAIL_WEBHOOK_ENABLED=true                # INBOUND bounce/complaint webhook (patch 4) — active independent of outbound; effectively on when RESEND_WEBHOOK_SECRET is set
EMAIL_SANDBOX=true                         # staging: redirect all mail to the allowlist
EMAIL_SANDBOX_ALLOWLIST=qa@redeemo.co.uk   # comma-separated; sandbox-only
RESEND_API_KEY=                            # required when EMAIL_ENABLED=true
RESEND_FROM_EMAIL="Redeemo <noreply@redeemo.co.uk>"   # D-F policy
RESEND_REPLY_TO="support@redeemo.co.uk"
RESEND_MERCHANT_FROM="Redeemo Merchants <merchants@redeemo.co.uk>"
RESEND_WEBHOOK_SECRET=                     # bounce/complaint webhook signature; presence activates the webhook

# ── Storage / Cloudflare R2 (S3-compatible) ─────────────────────
STORAGE_ENABLED=false                      # gates presign issuance
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=redeemo-staging
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
R2_PUBLIC_BASE_URL=https://media-staging.redeemo.co.uk

# ── Image moderation ────────────────────────────────────────────
MODERATION_PROVIDER=none                   # none | rekognition | sightengine
MODERATION_ENABLED=false                   # when false → photos stay PENDING (admin review)

# ── Worker / queues ─────────────────────────────────────────────
WORKER_CONCURRENCY=5
BULLMQ_PREFIX=redeemo
PHOTO_COUNT_CAP_PER_BRANCH=15              # §12 cap (D5)
```

**`env.ts` change:** add `requireSecretWhenEnabled(flagVar, flagValue, ...secretNames)` — if the flag is on, the named secrets must be present + non-placeholder; if off, skipped. Call it in `validateRequiredEnv()`. The hard `REQUIRED_SECRETS` list is unchanged (dev boots without R2/Resend) while still failing-closed once a feature is switched on. **The webhook activates on `RESEND_WEBHOOK_SECRET` presence**, so bounces are still received even with `EMAIL_ENABLED=false` (patch 4).

---

## 7. Dependencies between Phase-0 items + parallelisation

```
PR-0.1 BullMQ foundation  ─┐
PR-0.2 §SEC.1 atomic limiter ─┼─ (mutually independent — parallel-safe)
PR-0.5 R2 storage library ─┘
                 │                 │
PR-0.3 Resend email client ───────┤ (independent; pairs with 0.1/0.4)
                 │                 │
PR-0.4 notify.ts + email worker + bounce webhook  ← needs 0.1 + 0.3; 0.2 MERGED before real sends
                                   │
PR-0.6 photo moderation gate + schema    ← needs 0.5 (storage lib) + 0.1 (async scan job)
                                   │
PR-0.7 staging env + Procfile            ← needs all of the above
```

- **Safely parallel:** PR-0.1, PR-0.2, PR-0.3, PR-0.5 touch disjoint files (4 parallel tracks). PR-0.5 no longer touches `app.ts` (library-only), so it conflicts with nothing.
- **Hard sequencing:** PR-0.4 after 0.1 + 0.3; PR-0.6 after 0.5 + 0.1; PR-0.7 last. PR-0.2 (§SEC.1) is a **merge-before-enable** gate for any real email.
- **Cross-file conflict watch:** only PR-0.4 modifies `app.ts` (the webhook) in Phase 0 — no contention with PR-0.6 now that storage has no route.

---

## 8. PR breakdown (bite-sized, TDD)

Backend tests: `npx vitest run`, under `tests/api/…`. Frequent commits per step boundaries.

### PR-0.1 — BullMQ job-runner foundation

**Files:** Create `src/api/queues/connection.ts`, `src/api/queues/index.ts`, `src/worker.ts`; Modify `package.json`; Test `tests/api/queues/queue.test.ts`

- [ ] **Step 1: Add the dependency** — `npm install bullmq@^5`; verify the diff; stage `package.json` + `package-lock.json`.
- [ ] **Step 2: Write the failing test** — assert `makeQueue('test')` uses a connection with `maxRetriesPerRequest: null` + the `BULLMQ_PREFIX`; assert `enqueue('test', data, { jobId })` is idempotent (same `jobId` ⇒ one job). Skip-when-no-`REDIS_URL` (mirror `app.ts` test gating).
- [ ] **Step 3: Run — expect FAIL.** `npx vitest run tests/api/queues/queue.test.ts`
- [ ] **Step 4: Implement `connection.ts`**
  ```ts
  import IORedis from 'ioredis'
  // BullMQ REQUIRES maxRetriesPerRequest:null on its blocking connection (separate
  // from the app's app.redis connection). Shares the same Redis INSTANCE (§5 topology).
  export function makeQueueConnection() {
    return new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null })
  }
  ```
- [ ] **Step 5: Implement `index.ts`** — memoised `makeQueue(name)` + `enqueue(name, data, opts)` with `prefix: BULLMQ_PREFIX`; the `EMAIL_QUEUE`/`MODERATION_QUEUE` constants; default opts (`attempts: 3`, `backoff: { type: 'exponential', delay: 2000 }`, `removeOnComplete: 1000`, `removeOnFail: 5000`); `enqueue` passes `jobId` for idempotency.
- [ ] **Step 6: Implement `src/worker.ts`** — `import 'dotenv/config'`; `validateRequiredEnv()`; Prisma + the queue connection; start `Worker`s via an (initially empty) `registerProcessors(...)`; `SIGTERM`/`SIGINT` → `worker.close()` + `connection.quit()`. Scripts: `"worker": "tsx watch src/worker.ts"`, `"start:worker": "node dist/src/worker.js"`.
- [ ] **Step 7: Document the Redis topology** in a header comment in `connection.ts` (shared instance + `noeviction` + prefix + the split trigger, §5).
- [ ] **Step 8: Run — expect PASS;** then **Step 9: Commit** — `feat(queues): BullMQ job-runner foundation + worker process`

### PR-0.2 — §SEC.1 atomic limiter (victim-vs-abuser)

**Files:** Create `src/api/shared/atomicLimiter.ts`, `tests/api/shared/atomicLimiter.test.ts`; Modify `pwdResetLimiter.ts`, `smsLimiter.ts`; Test `tests/api/shared/pwdResetLimiter.atomic.test.ts`

- [ ] **Step 1: Write the failing semantics test** — three properties: (a) **no overshoot** — N concurrent `consume()` against one victim key (limit L) ⇒ exactly L allowed; (b) **victim not burned** — once a victim key is at its cap, further blocked attempts do **not** increment it (its TTL/window doesn't extend); (c) **abuser still counts** — every attempt (allowed or victim-blocked) increments the abuser key, so the abuser key trips its own limit.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `atomicLimiter.ts`** — one Lua script, one round-trip:
  ```lua
  -- KEYS = abuserKeys ++ victimKeys ; ARGV = nAbuser, then [limit,window] per key in KEYS order
  local nA = tonumber(ARGV[1]); local idx = 2
  -- abuser: ALWAYS incr (the attempt counts), set TTL on first, then check
  for i = 1, nA do
    local v = redis.call('INCR', KEYS[i])
    if v == 1 then redis.call('EXPIRE', KEYS[i], tonumber(ARGV[idx+1])) end
    if v > tonumber(ARGV[idx]) then return {0, redis.call('TTL', KEYS[i]), 'abuser'} end
    idx = idx + 2
  end
  -- victim: CHECK WITHOUT incrementing (don't burn a victim's quota on a blocked attempt)
  local vStart = idx
  for i = nA + 1, #KEYS do
    local c = tonumber(redis.call('GET', KEYS[i]) or '0')
    if c >= tonumber(ARGV[idx]) then return {0, redis.call('TTL', KEYS[i]), 'victim'} end
    idx = idx + 2
  end
  -- all clear: NOW count the victim keys (the legitimate request)
  idx = vStart
  for i = nA + 1, #KEYS do
    local v = redis.call('INCR', KEYS[i])
    if v == 1 then redis.call('EXPIRE', KEYS[i], tonumber(ARGV[idx+1])) end
    idx = idx + 2
  end
  return {1, 0, 'ok'}
  ```
  Signature: `consume(redis, { abuserKeys:[{key,limit,window}], victimKeys:[{key,limit,window}] }) → { ok, retryAfter, scope }`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Route `pwdResetLimiter.ts` through `consume`** — collapse `assertPwdResetAllowed` + `recordPwdResetRequest` into one atomic call. **Classify:** victim = per-email hour + per-email day (`rl:pwd-reset:<hash>`, `…:day`); abuser = per-IP day (`rl:pwd-reset:ip:day:<ip>`). Preserve anti-enumeration: a request not blocked by a victim cap still increments the per-email counter for non-existent accounts (the victim-incr happens before the user lookup, identically for real/fake). Delete the race-prone read-then-incr + the lines 22–31 FOLLOW-UP comment.
- [ ] **Step 6: Route `smsLimiter.ts` volume counters through `consume`** — **Classify:** victim = per-phone hour+day + per-user hour+day (+ per-branch day for branchPin); abuser = per-IP hour+day + global daily circuit-breaker. Keep the **E.164/country pre-checks** and the **atomic SET-NX per-phone cooldown** as-is (the cooldown already serialises concurrent same-phone sends). Preserve the "an attempt that passed the limiter but fails at Twilio still counted" semantics — a passing request increments all counters before the send.
- [ ] **Step 7: Confirm all three forgot-password surfaces consume it** — `auth/customer/service.ts`, `auth/merchant/service.ts:211`, `auth/admin/service.ts:148`; add the call where missing; one regression test per surface.
- [ ] **Step 8: Run the full limiter suite — expect PASS.** Then **Step 9: Commit** — `fix(security): §SEC.1 atomic limiter with victim/abuser counter semantics`

### PR-0.3 — Resend email client

**Files:** Create `src/api/shared/email.ts`, `tests/api/shared/email.test.ts`; Modify `env.ts`, `.env.example`

- [ ] **Step 1: Write the failing test** — mock `resend`; assert `sendEmail({to, subject, html, idempotencyKey})`: (a) `EMAIL_ENABLED=false` ⇒ no network call, returns `{ skipped: true }`; (b) `EMAIL_SANDBOX=true` ⇒ recipient rewritten to the allowlist; (c) From/Reply-To from env; (d) returns `externalId`; (e) passes the idempotency key.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `env.ts` `requireSecretWhenEnabled('EMAIL_ENABLED','true','RESEND_API_KEY')`** + call it in `validateRequiredEnv()`. Don't touch `REQUIRED_SECRETS`.
- [ ] **Step 4: Implement `email.ts`** — lazy `new Resend(requireSecret('RESEND_API_KEY'))`; honour `EMAIL_ENABLED` (skip+log when off), `EMAIL_SANDBOX` (redirect), From/Reply-To/merchant-From; accept `idempotencyKey`; return `{ externalId, status }`. Never throw on a disabled send.
- [ ] **Step 5: Run — expect PASS.** **Step 6:** `.env.example` email block. **Step 7: Commit** — `feat(email): Resend client wrapper with sandbox + D-F sender policy`

### PR-0.4 — `shared/notify.ts` + email worker + outbox reconciler + bounce webhook + QUEUED migration

**Files:** Create `src/api/shared/notify.ts`, `src/api/queues/processors/email.ts`, `src/api/queues/processors/outboxReconciler.ts`, `src/api/webhooks/resend.ts`, migration, tests; Modify `src/worker.ts`, `src/api/app.ts`, `prisma/schema.prisma`, the email placeholders

- [ ] **Step 1: `CommunicationStatus.QUEUED` migration** — add the enum value + flip `@default(QUEUED)` + add `@@index([status, sentAt])` (§4 Migration A, for the §4.1 reconciler). `npx prisma migrate dev --name comms_status_queued`.
- [ ] **Step 2: Write the failing `notify.test.ts`** — `notify({ recipient, type, channels, inApp, template })`: (a) writes one `CommunicationLog` row per external channel with **`status: QUEUED`**; (b) a `Notification` row iff `inApp`; (c) enqueues an `EMAIL_QUEUE` job with **`jobId = CommunicationLog.id`** (deterministic); (d) marketing-type respects `newsletterConsent`, transactional always sends; (e) **enqueue-failure path (§4.1): when the queue `add` throws, the `CommunicationLog` row is STILL committed as `QUEUED`, the call logs + does NOT throw, and the row is left for the reconciler.**
- [ ] **Step 3: Run — expect FAIL.**
- [ ] **Step 4: Implement `notify.ts`** — write the rows in a `prisma.$transaction` (commit first), THEN enqueue best-effort **outside** the transaction with `jobId = communicationLog.id`. Wrap the enqueue in try/catch: on failure, `log.warn({ communicationLogId }, 'enqueue failed; left QUEUED for reconciler')` and return normally — **never throw to the caller, never roll the row back** (§4.1 rule 3). Transactional vs marketing split. PUSH = write the `Notification` row only (FCM deferred).
- [ ] **Step 5: Implement `processors/email.ts`** — consume `EMAIL_QUEUE`: load the `CommunicationLog`; **idempotency guard — if it is already `SENT`/`BOUNCED`, ack and return** (a reconciler/stalled re-run must not resend a delivered row); else call `email.sendEmail({ ..., idempotencyKey: communicationLog.id })`; on success transition **`QUEUED → SENT`**. On throw, let BullMQ retry (`attempts:3`); **on the final attempt failing, transition `QUEUED → FAILED`** (so the reconciler stops re-trying it) — via an `on('failed')` handler checking `job.attemptsMade >= attempts`. Register in `src/worker.ts`.
- [ ] **Step 6: Implement the outbox reconciler (§4.1)** — `processors/outboxReconciler.ts`: select `CommunicationLog WHERE status = QUEUED AND sentAt < now() − GRACE_MS ORDER BY sentAt LIMIT N`, and for each re-`enqueue(EMAIL_QUEUE, { id }, { jobId: id })` (dedup-safe). Register a **repeatable** `reconcile-outbox` job (every 60 s) in `src/worker.ts` (`GRACE_MS = 120_000`, `N = 200`).
- [ ] **Step 7: Write + run the reliability tests** — (a) **stale-QUEUED recovery:** insert a `QUEUED` row with `sentAt` older than `GRACE`, no live job → run the reconciler → asserts `enqueue` called with `jobId = id`; (b) **idempotent re-enqueue:** running the reconciler twice (or against a row that still has a job) does not double-send — assert dedup via `jobId` and that a `SENT` row is never re-enqueued; (c) **fresh row skipped:** a `QUEUED` row newer than `GRACE` is left alone. Expect PASS.
- [ ] **Step 8: Implement `webhooks/resend.ts`** — verify `RESEND_WEBHOOK_SECRET`; `email.bounced`/`email.complained` → `CommunicationLog.status = BOUNCED` + Redis suppression set; `email.delivered` → confirm `SENT`. **Register in `app.ts` gated on `RESEND_WEBHOOK_SECRET` presence (NOT `EMAIL_ENABLED`)** so bounces are received even when outbound is paused (patch 4).
- [ ] **Step 9: Replace the placeholders** — `merchant/branch/service.ts:532–535` (PIN), `auth/merchant/branch-user.service.ts`, the three `forgotPassword*` "TODO Phase 6" → `notify(...)`. Token NEVER logged.
- [ ] **Step 10: Per-route limiter on transactional email** (§14-A/B) — reuse `atomicLimiter.consume` with `rl:email:<type>:<recipient>` as a victim key + per-IP abuser key.
- [ ] **Step 11: Run full suite — expect PASS.** **Step 12: Commit** — `feat(notify): outbox dispatcher (QUEUED→SENT) + reconciler + email worker + bounce webhook`

### PR-0.5 — R2 storage **library** (no route)

**Files:** Create `src/api/shared/storage.ts`, `tests/api/shared/storage.test.ts`; Modify `package.json`, `env.ts`, `.env.example`

- [ ] **Step 1: Add deps** — `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` (NOT `@fastify/multipart` — no route in Phase 0). Verify diff.
- [ ] **Step 2: Write the failing test** — `storage.ts`: (a) `presignPut({ kind, ownerId, contentType, sizeBytes })` rejects disallowed content-types + over-cap sizes per kind; (b) returns a presigned URL + the deterministic object key; (c) `publicUrl(key)` composes `R2_PUBLIC_BASE_URL`. Mock the S3 client.
- [ ] **Step 3: Run — expect FAIL.**
- [ ] **Step 4: Implement `storage.ts`** — an S3 client at `R2_ENDPOINT` (region `auto`); key scheme `${kind}/${ownerId}/${nanoid}.${ext}`; per-kind allowlists (docs: pdf/jpg/png ≤10 MB; logo/banner/photo: jpg/png/webp ≤5 MB); short-TTL presigned PUT + presigned GET for private docs; `requireSecretWhenEnabled('STORAGE_ENABLED','true', R2_*)`. **Exported as a library — no Fastify route registered.**
- [ ] **Step 5: Run — expect PASS.** **Step 6: Commit** — `feat(storage): R2 (S3-compatible) presign + validation library (no route)`

**Why library-only (patch 3):** there is **no legitimate Phase-0 caller** — uploads happen in the Phase-2 onboarding/day-2 flows. A generic presign/upload route guarded only by existing auth + a flag would be broadly usable by any authenticated session before `MerchantMembership`/capability checks exist (a merchant uploading to another merchant's key space, or unbounded object creation). Phase 2 adds the route **with** capability + ownership checks (the uploader must own the branch/merchant the key is scoped to), the per-kind/size/type limits enforced server-side, and the moderation enqueue. Phase 0 ships the validated library + tests so Phase 2 wires a thin, correctly-scoped route on top.

### PR-0.6 — Photo moderation gate + schema

**Files:** Create `src/api/shared/moderation.ts`, `src/api/queues/processors/moderation.ts`, migration, tests; Modify `prisma/schema.prisma`, `src/worker.ts`, `src/api/customer/discovery/service.ts`

- [ ] **Step 1: Migration B** — `PhotoModerationStatus` enum + `BranchPhoto` fields (§4); backfill existing rows → `APPROVED`. `npx prisma migrate dev --name photo_moderation`.
- [ ] **Step 2: Write the failing gate test** — a new `BranchPhoto` defaults `PENDING`; the discovery read returns **only** `APPROVED`; with `MODERATION_ENABLED=false` a new photo stays `PENDING` (not public).
- [ ] **Step 3: Run — expect FAIL.**
- [ ] **Step 4: Implement `moderation.ts`** — `scanImage(url) → 'CLEAN' | 'FLAGGED' | 'UNAVAILABLE'`; provider switch on `MODERATION_PROVIDER` (default `none` ⇒ `UNAVAILABLE`, so the photo stays `PENDING`). Provider-agnostic (Rekognition/Sightengine adapters added when chosen, D1).
- [ ] **Step 5: Implement `processors/moderation.ts`** — consume `MODERATION_QUEUE`: `CLEAN`⇒`APPROVED`, `FLAGGED`⇒`FLAGGED`, `UNAVAILABLE`⇒leave `PENDING`; set `moderationCheckedAt`. Register in `src/worker.ts`. **The enqueue call site lands in Phase 2** (with the upload route); Phase 0 ships the processor + the enqueue helper + a unit test that drives the processor directly.
- [ ] **Step 6: Discovery read-path filter** — `discovery/service.ts` branch-photo selects add `where: { moderationStatus: 'APPROVED' }` (§14-D). Invariant: no `PENDING`/`FLAGGED` photo reaches a customer surface.
- [ ] **Step 7: Count-cap helper** — `assertPhotoCapNotExceeded(branchId)` reading `PHOTO_COUNT_CAP_PER_BRANCH` (counts non-`FLAGGED` rows); exported for the Phase-2 route. Unit-test the boundary.
- [ ] **Step 8: Run — expect PASS;** `npx tsc --noEmit` zero new errors. **Step 9: Commit** — `feat(moderation): photo gate + schema + no-unmoderated-publish invariant`

**Moderation-default consequence (patch 7) — stated plainly:** with `MODERATION_PROVIDER=none` / `MODERATION_ENABLED=false` (the MVP default), **a merchant-uploaded photo stays `PENDING` and is invisible to customers until either a scanner clears it or an admin approves it.** This is acceptable because the invariant is "no unmoderated public photos." **Phase-2 dependency:** the Phase-2 photo-upload feature must ship **with** an approval path (a real scanner *or* the admin photo-review action) — otherwise uploaded photos would never become visible. Phase 0 builds the gate; Phase 2 must build at least one release valve.

### PR-0.7 — Staging env + process config

**Files:** Create `Procfile`; Modify `.env.example`, `docs/runbooks/deploy-security-runbook.md`

- [ ] **Step 1: `Procfile`** (Railway-compatible, D2) — `web: node dist/src/index.js` + `worker: node dist/src/worker.js`.
- [ ] **Step 2: Finalise `.env.example`** — every Phase-0 var present + documented; mark owner-provisioned ones.
- [ ] **Step 3: Update the runbook** — a "Phase-0 foundations" section: the two-process model, the staging manifest (Neon branch, Redis with `noeviction`, Stripe test, Resend sandbox key, R2 staging bucket), the migrate-deploy step, and "email stays gated until §13 closes."
- [ ] **Step 4: Build check** — `npm run build` ⇒ assert `dist/src/worker.js` + `dist/src/index.js` exist.
- [ ] **Step 5: Commit** — `chore(deploy): staging two-process Procfile + Phase-0 env manifest + runbook`

---

## 9. Test strategy

- **Unit (Vitest):** every new shared lib with mocked I/O. The §SEC.1 test is load-bearing — it must prove **no overshoot**, **victim-not-burned**, and **abuser-counts** (three distinct assertions).
- **State transitions:** `CommunicationLog` `QUEUED → SENT` (worker success), `→ FAILED` (retries exhausted), `→ BOUNCED` (webhook); `BranchPhoto` `PENDING → APPROVED/FLAGGED` (processor).
- **Outbox reliability (§4.1) — load-bearing:** enqueue-failure leaves the row `QUEUED` and does NOT throw; the reconciler re-enqueues stale `QUEUED` rows by deterministic `jobId`; re-enqueue is idempotent (no double-send, `SENT`/`BOUNCED` rows are never re-enqueued); fresh rows (< `GRACE`) are skipped. This proves "DB says queued ⇒ the message is eventually delivered, exactly once effective."
- **Integration:** the Resend webhook (active on secret, independent of `EMAIL_ENABLED`); the discovery photo-gate (only `APPROVED` returned); notify → rows + enqueue.
- **Migration:** apply on a Neon test branch; assert backfill set seed photos `APPROVED`; assert the `QUEUED` default.
- **Regression gate:** `npx vitest run` stays green; `npx tsc --noEmit` zero **new** errors (the 4 pre-existing `savings.service.test.ts` baseline errors documented in CLAUDE.md remain).

---

## 10. Rollout / rollback

- **Order:** merge PR-0.1/0.2/0.3/0.5 (parallel) → 0.4 → 0.6 → 0.7. **§SEC.1 (0.2) must merge before any real email send.**
- **Feature flags are the safety net:** `EMAIL_ENABLED`, `STORAGE_ENABLED`, `MODERATION_ENABLED` default `false`; merging is inert until a flag flips — every PR ships dark.
- **Webhook independence (patch 4):** the Resend bounce webhook is active on `RESEND_WEBHOOK_SECRET` presence, **decoupled from `EMAIL_ENABLED`**, so toggling outbound off still records inbound bounces/complaints.
- **Staging first:** flip flags on staging (Resend sandbox, R2 staging bucket) before any prod flag.
- **Rollback:** each feature flag off = instant disable, no redeploy. The two additive migrations (QUEUED value, photo fields) leave harmless extra columns/values on a code rollback (no data loss). The worker can scale to zero without affecting the API (jobs queue until it returns).

---

## 11. Security & privacy risks

- **§SEC.1 (headline):** until PR-0.2 lands, the password-reset limiter can overshoot under concurrency ⇒ victim-inbox-bombing once email is live. **Hard prerequisite** to enabling email (runbook §6). The **victim/abuser split** additionally ensures an attacker hammering one victim email can't lock the victim out indefinitely (victim counters self-heal on their fixed window; the attacker's IP/global counters trip instead).
- **Presigned-URL abuse:** presigns are content-type + size + key-scoped + short-TTL + flag-gated; **no live route in Phase 0** (the Phase-2 route adds ownership/capability scoping).
- **Unmoderated public photo (product red-line):** the gate (`moderationStatus=APPROVED` required for public) + the discovery read-filter guarantee the §12 invariant even with no scanner. Default = **deny** (PENDING).
- **PII in `CommunicationLog`:** store type + subject + status only — **never email bodies**. Retention/access policy aligns with spec §18.1 #10 / §18.2.
- **Email auth:** unverified domain ⇒ spoofing + deliverability failure — owner gate (§13).
- **Bounce suppression:** the webhook + suppression set prevent sending to hard-bounced addresses (reputation protection), and keep working independent of the outbound switch.
- **No silently-lost message (§4.1):** `CommunicationLog(QUEUED)` is the durable outbox — a post-commit enqueue failure or a crash-in-the-gap cannot lose the message (the reconciler re-enqueues stale rows by deterministic `jobId`), and the Resend `idempotencyKey = CommunicationLog.id` stops the at-least-once retry from double-sending. Not a full message bus — just "DB says queued ⇒ no job missing."
- **Secrets:** R2 + Resend keys fail-closed when their flag is on, never logged, never client-exposed.

---

## 12. What must happen before Phase 2 can start

1. **All 7 Phase-0 PRs merged** (foundations exist + green); **§SEC.1 merged** (PR-0.2).
2. **Owner/devops provisioning gates Phase 2 depends on:**
   - Hosting (Railway, D2) + staging stood up (Neon branch, Redis `noeviction`, the two-process deploy).
   - **Resend production gate (runbook §6):** domain verified + SPF/DKIM/DMARC + monitored inboxes + bounce webhook reachable + `EMAIL_ENABLED=true`. *Phase-2 claim-links/verification/approval emails are unusable until this closes.*
   - **R2 buckets** (staging+prod) + credentials + CORS + public base URL.
   - **Moderation decision (D1)** — provider wired, **or** Phase 2 must ship the admin photo-review queue (the only other release valve for `PENDING` photos, patch 7).
3. **No Phase-2 schema is pre-built here** — `MerchantMembership`/`MerchantLead`/`AdminApproval`-reader/`TermsClause`/the `MerchantDocument` verification model all begin in Phase 2.

---

## 13. Recorded decisions (owner-confirmed 2026-06-10)

| # | Decision | Recorded outcome |
|---|---|---|
| **D1** | Image moderation | **Provider-agnostic hook; admin-review default for MVP** (`MODERATION_PROVIDER=none`). Photos stay PENDING/invisible until a scanner or admin approval exists (patch 7). A real scanner is wired when volume justifies. |
| **D2** | Hosting | **Assume Railway** (current deploy/domain docs frame Railway as the API host) for the two-process model + `Procfile`. Final provider setup remains an owner/deploy decision if it changes. |
| **D3** | Storage | **Cloudflare R2** (S3-compatible SDK). |
| **D4** | Email | **Ships dark / sandbox only in Phase 0.** No production sending until the runbook §6 gates close. |
| **D5** | Photo cap | **15 per branch**, configurable via `PHOTO_COUNT_CAP_PER_BRANCH`. |
| **D6** | Voucher-cycle-reset | **Do NOT** migrate it to BullMQ now — it stays on the Stripe webhook. |

**Remaining open = provisioning/gates only (not design):** the owner/devops actions in §5 + §12 (domain verification, bucket creation, Railway/staging provisioning, the moderation-provider wiring if/when chosen). No further *design* decision blocks implementation.

---

## 14. Scope questions — RESOLVED

| Ref | Item | Disposition |
|---|---|---|
| §14-A | Resend bounce/complaint webhook + suppression | **KEEP** — in PR-0.4, gated on its own secret (patch 4). |
| §14-B | Per-route limiter on transactional email | **KEEP** — PR-0.4 step 8, rides the atomic limiter. |
| §14-C | Schema additions | **KEEP `BranchPhoto.moderationStatus`** (the gate needs it); **CUT `MerchantDocument.verificationStatus`** (Phase 2, patch 2). |
| §14-D | Defensive discovery approved-photo filter | **KEEP** — PR-0.6 step 6. |

**Correctly out of Phase 0 (recorded):** `PhotoReport` model, admin photo-moderation queue + remove/revert/report **actions**, `MerchantDocument` verification-review model, `NotificationType` merchant-onboarding values, FCM/push delivery, the live upload route + `@fastify/multipart` — all Phase 2/3 or Phase 6.

---

## 15. Self-review (writing-plans)

- **Spec coverage:** the 7 owner-scoped items map to PRs (G1→0.3/0.4, G2→0.4, G3→0.5, G4→0.6, G5→0.2, G6→0.1, G7→0.7). ✓
- **Patch coverage:** all 8 review patches integrated (status QUEUED ✓ §4/PR-0.4; MerchantDocument cut ✓ §3/§4/§14; storage library-only ✓ §3/PR-0.5; webhook own-gate ✓ §6/PR-0.4/§10; victim/abuser ✓ PR-0.2/§11; Redis topology ✓ §5/PR-0.1; moderation consequence ✓ PR-0.6/§12; **outbox reliability ✓ §4.1 + PR-0.4 steps 4–7 + §9 + §11**). ✓
- **Placeholder scan:** no "TBD"/"add validation"/"similar to" — every PR names files, code shapes, run commands. ✓
- **Type/name consistency:** `EMAIL_QUEUE`/`MODERATION_QUEUE`, `PhotoModerationStatus`, `CommunicationStatus.QUEUED`, `consume({abuserKeys,victimKeys})`, `requireSecretWhenEnabled()`, `notify()` consistent. ✓
- **Scope discipline:** zero Phase-2/3 surfaces; storage is library-only; the two boundary touches (BranchPhoto field, discovery filter) are the resolved §14 items. ✓

---

## 16. Cross-check — Phase 0 covered vs Phase 2/3 deferred

| Capability | Phase 0 (this plan) | Deferred (Phase 2/3) |
|---|---|---|
| **Email** | Resend client (dark/sandbox), `notify.ts`, email worker, bounce webhook, transactional per-route limiter | Production enablement (owner gate); marketing campaigns; merchant-onboarding email templates/types |
| **Notifications** | `Notification` + `CommunicationLog` writes (`QUEUED→SENT/FAILED/BOUNCED`) | FCM push delivery (Phase 6); `NotificationType` onboarding values (emitted by the actioner) |
| **Storage** | `shared/storage.ts` library (presign + validation + key scheme) | Live upload route + `@fastify/multipart` + capability/ownership checks; document re-upload UX |
| **Photos** | `moderationStatus` field + gate + discovery filter + count-cap helper + scan hook/processor | Upload call site, admin moderation queue, remove/revert/report **actions**, scanner provider wiring |
| **Documents** | Storage library can store them (existing `fileUrl`) | `MerchantDocument` verification-review model + the verify-tier flow |
| **Limiters** | §SEC.1 atomic (SMS + password-reset + transactional email), victim/abuser | — |
| **Jobs** | BullMQ foundation + worker + email/moderation queues | Onboarding/sweep/statement jobs; voucher-cycle-reset stays on the webhook (D6) |
| **Staging** | Env manifest + `Procfile` + runbook | Actual provisioning (owner); observability/alerting (hardening) |
| **Merchant lifecycle** | — | `MerchantMembership`, `MerchantLead`, self-register, actioner, go-live, verification pre-score, RBAC/grants, curated-terms engine, voucher builder — **all Phase 2/3** |
