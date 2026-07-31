# Plan: Transactional Email Enablement (rep-login prerequisite)

Status: DRAFT plan (docs only). No implementation and no provider/DNS actions are taken by this PR.
Tier: 3 (backend contract + production provider enablement + security gate). Brainstorm/spec context is the
existing Phase 0 email work (PR-0.2 atomic limiter, PR-0.3 Resend wrapper, PR-0.4 outbox pipeline) plus the
locked D-F sender policy; this plan is the enablement + abuse-hardening layer on top of that shipped base.
Owner: Fable leads; Opus executes the CODE work; the owner executes every DNS/Resend-console/env-flip step.

## 0. Why now (owner-locked context, 2026-07-10)

Transactional production email is now a LAUNCH PREREQUISITE, not a Phase-6 deferral, because FIELD rep admin
accounts receive their login OTP by email in the field. There is no DB-read workaround and no TOTP in scope.
Scope is TRANSACTIONAL ONLY: admin OTPs, merchant login OTPs, claim/staff-invite links, merchant email
verification, branch-PIN email, password resets, and the onboarding lifecycle notices. NO marketing.
`EMAIL_ENABLED` stays owner-gated. This plan does not flip it; it defines the code prerequisite (§SEC.1
completion), the provider/DNS records, the safety gates, rollback, verification, and the staging rehearsal.

Authority folded in (do not contradict):
- `docs/runbooks/deploy-security-runbook.md` §6 pre-send HARD gates + §1 env table (`EMAIL_ENABLED` dark by
  default; `RESEND_WEBHOOK_SECRET` self-gates the webhook independently of `EMAIL_ENABLED`).
- `docs/PROJECT-STATE.md` §4.4 (five production-pending migrations await an owner `migrate deploy` window)
  and §5 D-F sender-domain policy.
- `docs/deferrals/open-register.md` §SEC.1 ("Atomic email rate-limiter: OPEN; required BEFORE enabling
  Resend sending") and the "Email enable (D-F)" GATED row.

Note on runbook staleness (record, do not act here): runbook §6 line ~213 still says "email delivery is
unwired (console.info placeholders only)". That predates Phase 0 PR-0.4 — the outbox IS wired now
(`src/api/shared/notify.ts`, `src/api/queues/processors/email.ts`, `src/api/webhooks/resend.ts`). The
enablement PR that closes this plan should also correct that runbook paragraph in the same change.

---

## 1. CODE WORK (EXISTS vs GAP)

The pipeline is more built than the open-register §SEC.1 one-liner implies. Findings below cite evidence.

### 1.1 Outbox + delivery pipeline — EXISTS (verify-only)

- Resend wrapper with `EMAIL_ENABLED` / `EMAIL_SANDBOX` rails, D-F sender resolution, Idempotency-Key
  support: `src/api/shared/email.ts` (`sendEmail`, `isEmailEnabled` at line ~52; disabled ⇒
  `{ skipped: true, reason: 'disabled' }`, no client construction, no `RESEND_API_KEY` needed).
- Dispatcher / single choke point committing a QUEUED `CommunicationLog` outbox row then best-effort
  enqueue (jobId = row id, dedup-safe): `src/api/shared/notify.ts` (`notify`, transaction at line ~168,
  enqueue at line ~196).
- Delivery worker: reconstruct-from-payload, skip-terminal idempotency, terminal `QUEUED→SENT/FAILED`
  with payload NULLed (reset link / PIN never outlives the QUEUED window):
  `src/api/queues/processors/email.ts` (`processEmailJob`, `setTerminal`, `onEmailJobFailed`).
- Outbox reconciler safety net: re-enqueues stale QUEUED rows, 24h max-age expiry ⇒ `FAILED` + payload
  NULL, advisory-locked, bounded batch 200, on the process-local maintenance floor (the 60s repeatable
  was DELETED for Neon CU-burn): `src/api/queues/processors/outboxReconciler.ts`
  (`RECONCILE_MAX_AGE_MS`, `RECONCILE_BATCH`, `outboxDbPhase`).
- `CommunicationLog` model + `CommunicationStatus { QUEUED SENT FAILED BOUNCED }` + indexes on
  `[status,sentAt]` and `[externalId]`: `prisma/schema.prisma` lines ~1791-1821, ~1701-1710.
  No schema change is required for enablement.

### 1.2 §SEC.1 atomic limiter primitive — EXISTS

- `src/api/shared/atomicLimiter.ts` `consume()` runs check-and-count as ONE Lua script with four key
  classes and locked precedence gate → abuser → victim → cooldown. Semantics:
  gate = cost/capacity breaker (checked first, counted only on allowed); abuser = requester identity
  (every attempt counts); victim = target (counted only on allowed); cooldown = SET-NX-EX serializer.
  Pinned against real Redis by `tests/api/shared/atomic-limiter.test.ts` (50 concurrent @ limit 5 ⇒ exactly 5).
- Reuse patterns already in production on this primitive: `smsLimiter.ts` (global gate + per-phone/user
  victim + per-IP abuser + resend cooldown), `pwdResetLimiter.ts` (per-email victim + per-IP abuser),
  `merchantLocationLimiter.ts` (global gate + per-user/merchant victim + per-IP abuser). The email
  limiter should mirror `smsLimiter` exactly (it is the closest analogue: cost-bearing external send).

### 1.3 Email send limiter tiers — PARTIAL (this is the core §SEC.1 GAP to close)

Current state in `notify.ts` (lines ~100-101, ~149-176): it already calls `consume()` with
- victim key `rl:email:<type>:<emailHash>` at 5 per hour, and
- abuser key `rl:email:ip:day:<ip>` at 200 per day.

Owner checklist wants four tiers: per-account, per-IP, per-email-address, global send ceiling. Mapping:

| Tier (owner checklist) | Present today | Verdict |
|---|---|---|
| per-email-address, per TYPE (5/hr) | `rl:email:<type>:<emailHash>` victim | EXISTS |
| per-IP (200/day) | `rl:email:ip:day:<ip>` abuser | EXISTS (add a per-IP HOURLY abuser too, mirroring sms) |
| per-email-address AGGREGATE (across all types) | none | GAP — build |
| per-account (recipientId, across all types) | none | GAP — build |
| GLOBAL daily send ceiling (gate) | none | GAP — build |

GAP-1 (build): add a GLOBAL daily send gate key — `rl:email:global:day` — env-driven
`EMAIL_GLOBAL_DAILY_CAP` (default e.g. 2000, never relaxed in prod), passed as a `gateKeys` entry so a
platform-wide anomaly trips one ops-visible breaker and is counted only on allowed sends (anti-DoS on the
cap, exactly as `smsLimiter.globalDailyCap()` / `SMS_GLOBAL_DAILY_CAP`). This is the single most important
missing control before real mail flows: without it one endpoint bug can bill/burn unbounded Resend volume.

GAP-2 (build): add an AGGREGATE per-email-address victim key — `rl:email:addr:hour:<emailHash>` and
`rl:email:addr:day:<emailHash>` — so an attacker cannot cycle `type` (admin_otp, password_reset,
merchant_claim, merchant_email_verify, branch_pin, …) to multiply the per-type 5/hr into 5×N/hr against
one inbox. This is the victim-inbox-bombing vector §SEC.1 was opened for; the per-(type,recipient) key
alone does not close it.

GAP-3 (build): add a per-ACCOUNT victim key — `rl:email:acct:day:<recipientType>:<recipientId>` — bounding
total transactional volume to one recipient identity per day regardless of address or type churn.

GAP-4 (build): add a per-IP HOURLY abuser key alongside the existing daily one (mirror `smsLimiter`
`ipHour`/`ipDay`), so a burst is caught in an hour, not only across a day.

Design: keep it in ONE helper `consumeEmailSend(redis, ctx)` in a new `src/api/shared/emailLimiter.ts`
(mirroring `smsLimiter.ts`), called from inside `notify()` in place of the current inline `consume()` block,
so no calling route can bypass it. Caps live in a `PROD`/`DEV` table with `RATE_LIMIT_RELAX` loosening the
VOLUME caps in non-prod only (never the global cost gate). New `RedisKey` helpers for the four new keys.
`notify()` returns `{ queued: false, reason: 'rate-limited' }` on block (unchanged contract). All routes it
wraps (already all funnel through `notify()`): admin OTP send, merchant login OTP send, password reset
(admin/merchant/customer), merchant claim / staff invite (both via `issueMerchantClaim`), merchant email
verify, branch PIN email, and the onboarding lifecycle notices — full caller inventory in §1.7.

### 1.4 OTP request cooldowns + failed-round lockout — PARTIAL (GAP for email OTP)

- Per-challenge wrong-code cap EXISTS: admin `ADMIN_OTP_MAX_ATTEMPTS = 5` (`src/api/auth/admin/service.ts`
  line ~29) and merchant `MERCHANT_OTP_MAX_ATTEMPTS = 5` (`src/api/auth/merchant/service.ts` line ~39);
  the Nth wrong code destroys the challenge (must restart login for a fresh code). Customer SMS OTP has a
  resend cooldown + `OTP_MAX_ATTEMPTS` lockout via `smsLimiter` (`customer/service.ts` line ~247).
- GAP-5 (build): there is NO cross-challenge lockout / cooldown after repeated RE-REQUESTS of a fresh
  challenge for the EMAIL OTP paths (admin + merchant). An attacker who knows an admin/merchant email can
  re-trigger `POST login` to farm fresh codes and email-bomb the inbox, bounded today only by the edge
  `login` 5/min + `otpVerify` 5/min tiers and (after GAP-2) the aggregate per-address email cap. Add a
  per-recipient OTP resend cooldown (SET-NX-EX, e.g. 45s, reusing the `cooldown` scope of `consume()`, as
  `smsLimiter` does for phone) keyed on `rl:email-otp:cooldown:<recipientType>:<recipientId>` inside the OTP
  send path, and a per-recipient failed-ROUND counter that applies a longer cooldown after K consecutive
  destroyed challenges. Mark severity MODERATE: GAP-2 already blunts the email-bomb; this closes the
  code-farming / annoyance vector and gives a clean ops signal.

### 1.5 Enumeration posture — EXISTS (verify-only), one item to confirm

- Password reset is enumeration-safe by construction: `consumePwdResetAttempt` runs BEFORE the user lookup
  (`pwdResetLimiter.ts`), and every send is best-effort in a `try {} catch {}` that swallows delivery
  failure so the response shape never reveals account existence (admin `service.ts` ~285, merchant ~544,
  customer ~461).
- Self-serve merchant registration is explicitly non-enumerating: fresh vs duplicate-verified vs
  duplicate-unverified all return an identical `{ VERIFY_EMAIL_SENT, sessionChallenge }`, password is
  bcrypt-hashed UNCONDITIONALLY before the existence check (no timing oracle), and a duplicate-verified
  email stores a DECOY challenge (`src/api/auth/merchant/service.ts` `registerMerchant` docblock ~780,
  `sendMerchantAuthEmail` ~763, `merchantAccountExistsEmail`).
- Admin + merchant login OTP send is best-effort/swallowed and the code is never logged or returned
  (`admin/service.ts` ~72, `merchant/service.ts` ~136).
- Watch-item (verify, likely no change): merchant login throws `EMAIL_NOT_VERIFIED` / `MERCHANT_SUSPENDED`
  / `MERCHANT_DEACTIVATED` AFTER password verification (`merchant/service.ts` ~98-106). These are reachable
  only with a correct password, so they are not a plain unauthenticated enumeration oracle; confirm during
  review that no pre-password branch leaks existence. No fix planned unless review finds a pre-auth leak.

### 1.6 Provider-failure behaviour + circuit-breaker — PARTIAL

- Bounded retries EXIST: `DEFAULT_JOB_OPTIONS` in `src/api/queues/index.ts` (lines ~56-59) is
  `attempts: 3, backoff: exponential 2000ms, removeOnComplete: 1000, removeOnFail: 5000`. On exhaustion
  `onEmailJobFailed` flips the row to terminal `FAILED` (`email.ts`), so the reconciler stops re-trying.
  There is NO retry-storm risk from the worker: retries are bounded per job and the reconciler only
  re-enqueues by deterministic jobId (BullMQ dedups) with a 24h terminal expiry.
- Dark-mode is safe: when `EMAIL_ENABLED` is off the worker records the row `FAILED` (NOT a held backlog),
  so flipping email on later does NOT flush a stale queue of expired reset links (`email.ts`
  `skipped-disabled` branch). This is load-bearing for rollback (§4).
- Bounce/complaint webhook EXISTS and is self-gated by `RESEND_WEBHOOK_SECRET` independently of
  `EMAIL_ENABLED`: `src/api/webhooks/resend.ts` (Svix-verified; `email.bounced`/`email.complained` ⇒
  `BOUNCED` + 90-day Redis suppression; `email.delivered` ignored). Marketing suppression is respected by
  `notify()`; transactional is never suppressed (account-critical) — correct.
- GAP-6 (build): there is NO automatic circuit-breaker / send-pause on a volume or bounce-rate ANOMALY.
  The only kill switch is the manual `EMAIL_ENABLED` env flip. Add a lightweight auto-pause: a Redis flag
  `email:send:paused` that `notify()` checks (fail-closed to QUEUED-not-sent, same as dark mode) and that
  the global-gate breaker or the webhook sets when the daily bounce/complaint ratio crosses a threshold,
  clearable by a SUPER_ADMIN action. Scope this as a SMALL follow-up within the enablement slice, not a
  blocker for first flip (the global daily gate GAP-1 is the hard cost stop; the auto-pause is defence in
  depth). Mark GAP-6 severity LOW-MEDIUM.
  - AS IMPLEMENTED (PR #513): the pause is truly fail-closed, NOT the "QUEUED-not-sent, same as dark mode"
    sketch above. When `email:send:paused` is set, `notify()` declines at the single choke point and returns
    `{ queued: false, reason: 'send-paused' }`, writing NO outbox row. Rationale: a QUEUED-not-sent contract
    would leave stale QUEUED rows that the delivery worker (which does not read the pause flag) would drain
    the instant sending resumes, defeating the pause. Writing no row is the fail-closed contract that a
    paused platform cannot leak sends through the worker. The flag has no TTL (persists until a SUPER_ADMIN
    clears it); the bounce-ratio trigger fires from the Resend webhook and is bound to the FIRST BOUNCED
    status transition so a duplicate webhook delivery cannot inflate the ratio (PR #513 idempotency
    correction). Adjudicated by Fable, ratified by Codex review.

### 1.7 Monitoring / logging / SUPER_ADMIN visibility — PARTIAL

- EXISTS: every send leaves a durable `CommunicationLog` row (queryable by `type` / `status` / `sentAt` /
  `externalId`); the reconciler emits a redacted per-type expiry breakdown through the `AlertSink`
  (`outboxReconciler.ts` `outboxSideEffects`; counts + internal type labels only, never payload/recipient).
- GAP-7 (build): no dedicated send-VOLUME counters, no anomaly log lines on the send path, and no
  SUPER_ADMIN-facing view. Add: (a) structured `[email] sent type=<t> status=<s>` counter increments +
  a per-type/day Redis counter keyed alongside the limiter; (b) an anomaly log line when the global gate or
  a per-address cap blocks; (c) surface CommunicationLog aggregates (last 24h sent/failed/bounced by type)
  to SUPER_ADMIN in the admin ops console (read-only). Mark severity LOW for first flip (CommunicationLog is
  already the audit trail); do it in the enablement slice so ops has visibility from day one.

### 1.8 CODE work summary

| Item | Verdict |
|---|---|
| Outbox + worker + reconciler + webhook + CommunicationLog schema | EXISTS (verify-only) |
| §SEC.1 atomic `consume()` primitive | EXISTS |
| Email limiter: per-type-address, per-IP-day | EXISTS |
| GAP-1 global daily send gate (`EMAIL_GLOBAL_DAILY_CAP`) | GAP — build (hard blocker for flip) |
| GAP-2 aggregate per-address hour/day cap | GAP — build (hard blocker for flip) |
| GAP-3 per-account/day cap | GAP — build |
| GAP-4 per-IP hourly abuser cap | GAP — build |
| GAP-5 email-OTP resend cooldown + failed-round lockout | GAP — build (moderate) |
| GAP-6 auto send-pause on anomaly | GAP — build (low-med, defence in depth) |
| GAP-7 send-volume counters + SUPER_ADMIN view | GAP — build (low) |
| Enumeration posture | EXISTS (verify-only) |

Build order: GAP-1..GAP-4 land as one `consumeEmailSend` refactor of the `notify()` limiter block (the
§SEC.1 closure), unit-tested against real Redis like `atomic-limiter.test.ts`. GAP-5..GAP-7 follow in the
same slice. GAP-1 + GAP-2 are the HARD prerequisites for any `EMAIL_ENABLED` flip; the rest are strongly
recommended in the same window.

---

## 2. PROVIDER / DNS (owner-executed; exact records)

Domain: `redeemo.co.uk` (canonical; we do NOT own `redeemo.com`). Provider: Resend. DNS host: Cloudflare.

### 2.1 Sender identity (recommendation, consistent with locked D-F)

Keep the D-F-decided From/Reply-To identities (do not re-open D-F):
- Default From: `Redeemo <noreply@redeemo.co.uk>`
- Merchant From: `Redeemo Merchants <merchants@redeemo.co.uk>`
- Reply-To: `support@redeemo.co.uk`
- Legal/DSAR mailbox (unchanged, not a sender): `info@redeemo.co.uk`

Verify the APEX `redeemo.co.uk` domain in Resend. Resend auto-provisions a `send.redeemo.co.uk` Return-Path
(bounce) subdomain for SPF/DKIM/DMARC alignment — that subdomain is Resend's, NOT a new From address, so it
does not conflict with the D-F apex From policy. Justification for apex-with-send-subdomain over a bespoke
`send.`/`mail@` From: it matches the already-locked D-F copy and every already-shipped template/link
(`noreply@`/`merchants@`), needs no template or copy change, and still gets a dedicated bounce subdomain for
deliverability. A SEPARATE subdomain is reserved for FUTURE marketing (runbook §6: keep transactional and
marketing streams distinct so a marketing unsubscribe never blocks transactional mail); marketing is out of
scope here, so no marketing subdomain is provisioned now.

### 2.2 Records to add in Cloudflare (owner)

Resend generates the exact DKIM host/value tokens per domain in its console; add EXACTLY what Resend shows.
The list below gives the record set and the values we author (SPF, DMARC) verbatim plus the Resend-issued
shapes. IMPORTANT: set every Resend/DKIM/verification record to Cloudflare proxy status "DNS only" (grey
cloud), never proxied.

1. Domain-verification TXT (Resend-issued, verbatim from console)
   - Type: TXT
   - Name/host: `resend._domainkey` (Resend may label this the verification record; use its exact name)
   - Value: the exact string Resend shows (a `p=...` DKIM public key or a verification token)
   - Proxy: DNS only · TTL: Auto

2. DKIM (Resend-issued; typically one to three records — add each exactly as shown)
   - Type: CNAME or TXT (Resend states which per record)
   - Name/host: e.g. `resend._domainkey` / `resend2._domainkey` / a `send._domainkey.*` host — use Resend's
     exact names
   - Value: the exact target/key Resend shows
   - Proxy: DNS only · TTL: Auto

3. SPF for the Resend Return-Path subdomain (Resend-issued MX + TXT on `send`)
   - Record A: Type MX · Name `send` · Value `feedback-smtp.<region>.amazonses.com` (exact host + priority
     from Resend, e.g. priority 10) · DNS only
   - Record B: Type TXT · Name `send` · Value `v=spf1 include:amazonses.com ~all` (use the exact include
     Resend shows) · DNS only
   - Do NOT add a competing apex SPF that omits Resend. If an apex `v=spf1` TXT already exists for the
     mailbox provider, this SPF lives on the `send` subdomain (Resend's Return-Path), so there is no apex
     conflict — but confirm the apex SPF is unchanged and still valid for inbound mailbox mail.

4. DMARC (we author this; start relaxed, tighten later — mirrors the HSTS staged rollout in runbook §5)
   - Type: TXT
   - Name/host: `_dmarc`
   - Value (start): `v=DMARC1; p=none; rua=mailto:dmarc@redeemo.co.uk; adkim=s; aspf=s; fo=1`
   - Value (step 2, after ~1-2 weeks of clean aggregate reports): `p=quarantine`
   - Value (step 3, once aligned + confident): `p=reject`
   - Proxy: DNS only · TTL: Auto
   - `dmarc@redeemo.co.uk` MUST be a real monitored inbox before you publish this record (it receives the
     aggregate `rua` reports).

5. Mailbox / inbound (owner confirm; NOT Resend — Resend is send-only)
   - Keep the apex inbound MX (mailbox provider, e.g. Zoho) DISTINCT from Resend's `send.` bounce subdomain.
     They do not conflict, but confirm both together. Every From / Reply-To / published contact
     (`noreply@` bounces land via Return-Path; `support@`, `merchants@`, `info@`, `dmarc@`) must be a REAL,
     MONITORED inbox before launch (an unmonitored `info@` = missed DSARs → UK GDPR 30-day breach).

### 2.3 Resend console steps (owner)

1. Create a SEPARATE Resend API key per environment (staging key ≠ production key; runbook §6). The staging
   key drives the sandbox rehearsal (§6); the production key is added only at the production flip (§7).
2. Add domain `redeemo.co.uk`, copy the exact DKIM/SPF/verification records into Cloudflare (§2.2), wait for
   Resend to show "Verified".
3. Configure the webhook endpoint (bounce/complaint) pointing at the deployed `POST` Resend webhook route
   backed by `RESEND_WEBHOOK_SECRET` (the handler already exists: `src/api/webhooks/resend.ts`). Decide
   Yes/No on enabling it for the first flip (recommended YES — see §3).
4. Set a Resend send-volume / spend budget alert (runbook §6 line ~234).

---

## 3. SAFETY GATES before `EMAIL_ENABLED=true` in PRODUCTION (ordered checklist)

All must be TRUE, in order, before the production flip:

1. [ ] CODE: §SEC.1 closure merged to `main` — GAP-1 (global daily gate) + GAP-2 (aggregate per-address) at
       minimum, ideally GAP-3..GAP-5 too; unit-tested against real Redis (mirror `atomic-limiter.test.ts`);
       `npm run test:unit` green; the enablement PR also corrects the stale runbook §6 "unwired" paragraph.
2. [ ] PROVIDER: `redeemo.co.uk` shows "Verified" in Resend; SPF (send subdomain) + DKIM present.
3. [ ] DMARC live at `p=none` with `rua=mailto:dmarc@redeemo.co.uk`, and `dmarc@` is a monitored inbox.
       (Tightening to quarantine/reject is a later step, not a flip blocker.)
4. [ ] MAILBOXES: `noreply@`(Return-Path), `support@`, `merchants@`, `info@`, `dmarc@` all real + monitored.
5. [ ] STAGING REHEARSAL PASSED: with the STAGING Resend key, `EMAIL_SANDBOX=true` and a non-empty
       `EMAIL_SANDBOX_ALLOWLIST`, and the STAGING WORKER ONLINE (see §6), an end-to-end admin OTP + claim +
       reset + branch-PIN send each reached the allowlisted inbox and each left a `SENT` CommunicationLog
       row. Limiter caps observed to block on the aggregate/global tiers.
6. [ ] BOUNCE/COMPLAINT WEBHOOK DECISION: recommended ENABLE for first flip — set `RESEND_WEBHOOK_SECRET` +
       configure the Resend webhook so a bounce/complaint flips rows `BOUNCED` and suppresses marketing. It
       self-gates independently of `EMAIL_ENABLED`, so it can be turned on before the send flip. Record the
       Yes/No explicitly.
7. [ ] GLOBAL CAP SET: `EMAIL_GLOBAL_DAILY_CAP` set to a sane production ceiling in the host env.
8. [ ] OWNER SIGN-OFF LINE: "I, <owner>, authorise flipping EMAIL_ENABLED=true in PRODUCTION on <date> at
       <SHA>. Staging rehearsal passed on <date>. Rollback is the env flip in §4." (No agent may flip on the
       owner's behalf; §SEC.1 open-register row and the D-F GATED row both require owner action.)

---

## 4. ROLLBACK (go dark safely)

- Primary rollback: set `EMAIL_ENABLED=false` in the host env. This is a runtime flag read per-send
  (`isEmailEnabled()` in `email.ts`); no redeploy is needed (runbook §10). The NEXT send is dark immediately.
- What happens to in-flight work: `notify()` still commits QUEUED rows if any route is hit while dark; the
  worker, on a disabled send, records each as terminal `FAILED` (NOT a held backlog) — so re-enabling later
  does NOT flush a stale queue of expired reset links / codes (`email.ts` `skipped-disabled`). No data loss:
  every attempt remains a durable CommunicationLog audit row.
- Secondary (finer) control once GAP-6 lands: set the `email:send:paused` Redis flag to pause sending
  while leaving `EMAIL_ENABLED=true` (keeps the webhook + suppression active).
- The bounce webhook can stay ON through a rollback (`RESEND_WEBHOOK_SECRET` self-gates), so bounce/complaint
  events for already-sent mail keep resolving rows correctly even while outbound is paused.
- BLAST RADIUS of the flip: turning `EMAIL_ENABLED=true` affects ONLY transactional outbound email delivery
  (admin/merchant OTP, claim/invite, verify, branch-PIN, reset, onboarding notices). It does NOT touch
  auth/session logic, redemption, discovery, billing, or any read path. The worst-case failure mode of a bad
  flip is bounded by `EMAIL_GLOBAL_DAILY_CAP` (cost) and the per-address/per-account caps (victim bombing),
  and is reversible in seconds via the env flip with zero data loss.

---

## 5. VERIFICATION FLOWS post-flip (expected CommunicationLog states)

Run each end-to-end; assert the row + terminal state. All rows start `QUEUED` (payload set), then flip.

1. Admin OTP login: trigger admin login on a new device ⇒ `notify` writes `type='admin_otp'`, recipientType
   `ADMIN`, status `QUEUED` → worker → `SENT` (`externalId` set, payload NULLed). Admin receives the 6-digit
   code by email; verify login completes; a wrong code 5× destroys the challenge (`ADMIN_OTP_MAX_ATTEMPTS`).
2. Claim / staff invite: issue a merchant claim / staff invite ⇒ `type='merchant_claim'`, recipientType
   `MERCHANT_ADMIN`, `QUEUED`→`SENT`; the emailed claim link (`buildClaimLink`) sets a password; token
   consumed on use.
3. Merchant email verify (self-serve register): `type='merchant_email_verify'`, `QUEUED`→`SENT`; identical
   response shape on fresh vs duplicate (decoy) — the duplicate path emits `merchant_account_exists` to the
   real holder, also `SENT`.
4. Password reset (admin/merchant/customer): `type='password_reset'`, `QUEUED`→`SENT`; emailed link resets;
   a non-existent email still returns the same response (no enumeration) and simply writes no row / a
   rate-limited no-op.
5. Branch PIN email: set/rotate a branch PIN ⇒ `type='branch_pin'`, recipientType `BRANCH_USER`,
   `QUEUED`→`SENT` (supplementary to the SMS path; email-path failure is non-fatal).
6. Negative: exceed the aggregate per-address cap ⇒ `notify` returns `{ queued:false, reason:'rate-limited' }`
   and writes NO row; exceed `EMAIL_GLOBAL_DAILY_CAP` ⇒ same, and an anomaly log line (GAP-7) fires.
7. Bounce path (if webhook enabled): send to a Resend test bounce address ⇒ row flips `SENT`→`BOUNCED` via
   the webhook and the recipient is added to the 90-day suppression set (marketing only).

---

## 6. STAGING vs PRODUCTION split

Proven on STAGING FIRST (golden rule, runbook): every §5 flow, but with the STAGING Resend key,
`EMAIL_SANDBOX=true`, and a non-empty `EMAIL_SANDBOX_ALLOWLIST` so no test mail reaches a real address (an
empty allowlist makes `sendEmail` refuse to send — fail-safe, `email.ts`). The limiter tiers (GAP-1..GAP-4)
are exercised on staging.

REHEARSAL PREREQUISITE — the staging WORKER is currently OFFLINE. With the worker down, `notify()` commits
QUEUED rows but nothing sends: rows sit QUEUED and the reconciler eventually EXPIRES them to `FAILED` at 24h.
So the staging rehearsal step MUST FIRST bring the staging worker ONLINE (`src/worker.ts` — the process that
runs `startEmailWorker` + the maintenance scheduler), then verify a QUEUED row transitions to `SENT`. Turning
the staging worker on is the explicit rehearsal gate; do not attempt the sandbox send test until it is
running and a test row is observed flipping QUEUED→SENT.

Only in PRODUCTION: the production Resend API key, `EMAIL_SANDBOX=false` (real recipients), the production
`RESEND_WEBHOOK_SECRET` + Resend webhook endpoint, the production `EMAIL_GLOBAL_DAILY_CAP`, DMARC tightening
to quarantine→reject after clean reports, and the actual `EMAIL_ENABLED=true` flip. Also production-only and
separately owner-gated (PROJECT-STATE §4.4): the five production-pending `prisma migrate deploy` migrations —
none are required for email (the CommunicationLog schema already exists), but confirm the production schema is
current before the flip so no send path hits a missing column.

---

## 7. Sequencing + ownership + OWNER-GATED markers

Estimated sequence (each a reviewable step; sizes are rough):

1. CODE — §SEC.1 closure (GAP-1..GAP-4) `consumeEmailSend` refactor + real-Redis tests. Fable-built (Opus).
   ~1 focused PR.
2. CODE — GAP-5 (email-OTP cooldown/lockout), GAP-6 (auto-pause flag), GAP-7 (counters + SUPER_ADMIN view) +
   runbook §6 correction. Fable-built. ~1 PR (can split GAP-7 if large).
3. OWNER — add Cloudflare DNS records (§2.2) + verify domain in Resend + create staging & prod keys. OWNER-GATED.
4. OWNER + Fable — bring the STAGING WORKER ONLINE (§6), run the sandbox rehearsal, capture CommunicationLog
   evidence. Worker-online action is owner/deploy; the verification is Fable.
5. OWNER — DMARC `p=none` live + monitored inboxes confirmed. OWNER-GATED.
6. OWNER — production env: `EMAIL_GLOBAL_DAILY_CAP`, `RESEND_WEBHOOK_SECRET` (+ webhook), production Resend
   key, then the `EMAIL_ENABLED=true` flip with the §3 sign-off line. OWNER-GATED.
7. Fable — post-flip §5 production verification + monitor Resend dashboard + DMARC reports; tighten DMARC
   to quarantine→reject over the following weeks (OWNER executes each DMARC change). OWNER-GATED for each
   DNS edit.

OWNER-GATED markers (no agent performs these):
- Any Cloudflare DNS record add/edit (SPF, DKIM, DMARC, verification, MX).
- Any Resend console action (domain add/verify, API-key creation, webhook config, budget alert).
- Bringing the staging/production worker process online.
- Setting production env vars (`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_GLOBAL_DAILY_CAP`,
  `EMAIL_SANDBOX*`).
- The `EMAIL_ENABLED=true` flip itself (staging and production) and the §3 owner sign-off line.
- DMARC policy tightening (`p=none`→`quarantine`→`reject`).

Fable-built (no owner gate): all CODE work in §1 (GAP-1..GAP-7 + tests + runbook correction), the plan/PR
docs, and the post-flip verification/monitoring reads.
