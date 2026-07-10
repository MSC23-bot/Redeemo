# Staging email/worker enablement (sandbox mode)

**Status: FIRST WINDOW ATTEMPTED 2026-07-10 (owner-approved, windowed posture). Infra and
sandbox rails PASSED; delivery was blocked ONLY by an invalid staging `RESEND_API_KEY`
(since rotated by the owner). This document is the operator record of that window plus the
retry procedure. Production email remains untouched and owner-gated.**

## 1. Goal

Make Merchant Portal email flows (invites, claim links, OTPs, password resets, owner
notifications) deliver through REAL email on staging in sandbox/allowlist mode, replacing
the manual CommunicationLog-read recipe. Production/live merchant email stays separate and
owner-gated (sender domain, SPF/DKIM/DMARC, monitored inboxes, bounce handling, legal/comms
posture: none of that is touched here).

## 2. First window: what was executed (2026-07-10)

- Backlog disposition (owner-approved D-EM2 safe default): all 23 then-QUEUED
  `CommunicationLog` rows pre-expired (status FAILED, payload NULLed) so stale OTP/reset/
  invite messages could not suddenly send. **The backlog is now clean.**
- Worker sandbox posture re-verified immediately before deploy: `EMAIL_ENABLED=true`,
  `EMAIL_SANDBOX=true`, `EMAIL_SANDBOX_ALLOWLIST=admin@redeemo.co.uk`.
- Worker deployed at `b641fa0f`. Two fail-closed env guards (added to the codebase
  since the worker last ran in June) surfaced and were satisfied with documented values,
  now SET on the worker service: **`WORKER_DATABASE_POOL_MAX=5`** (per `.env.example`;
  Neon CU-burn cap) and **`MAINTENANCE_MODE=disabled`** (the explicitly supported
  maintenance-off path; right for short windows: outbox expiry/re-enqueue and the other
  sweeps do not run).
- Worker BOOTED HEALTHY: email processor registered, prisma pool max 5, maintenance
  scheduler off by explicit opt-out.
- Fresh OTP test: the **sandbox rewrite WORKED** (worker logged recipient redirects to the
  allowlist; no real recipient was ever addressed; no SMS sent) but every Resend send
  failed and the row terminal-FAILED. Probe (key never displayed): the staging
  **`RESEND_API_KEY` was INVALID** (Resend API 400 "API key is invalid").
- Worker STOPPED (deployment removed) per the windowed posture. Total window ~25 min.
- Owner action taken after the window: the Resend API key was rotated and added to Railway
  (Web, then Worker). **The WORKER variable is the one that matters for sending: the API
  never sends; verify the worker has the new key BY NAME before any retry.**

## 3. Verdict of the first window

Everything except the provider credential is PROVEN: env posture, fail-closed rails,
allowlist rewrite, queue processing, terminal-failure policy, no-SMS, windowed
start/stop. The ONLY unverified link is Resend accepting the send with the rotated key.

## 4. Retry procedure (next window, ~15 min)

- R1 (read-only) Verify by NAME that the WORKER service has `RESEND_API_KEY` set (do not
  print or inspect the value) and that the sandbox trio (`EMAIL_ENABLED` /
  `EMAIL_SANDBOX` / `EMAIL_SANDBOX_ALLOWLIST`) is unchanged. Confirm QUEUED backlog is
  0-or-known before starting.
- R2 Deploy the worker: Railway dashboard → worker service → Cmd+K → "Deploy latest
  commit" (SHA-stamped). Watch boot logs (email processor registered, pool max 5, no
  crash loop).
- R3 Trigger + verify THREE flows, each landing at the allowlist inbox ONLY, with the
  `CommunicationLog` row flipping QUEUED→SENT (externalId populated):
  one merchant login OTP · one staff invite (claim link; use a clearly-labelled
  acceptance-test invitee) · one password reset (link unused).
- R4 Negative checks: no email to any non-allowlist address (owner spot-checks the Resend
  dashboard activity); no SMS rows created; do NOT exercise customer phone flows while the
  worker is up (sandbox covers EMAIL only; the worker holds live Twilio credentials).
- R5 Stop the worker again (windowed posture) unless the owner explicitly switches to
  always-on (cost: worker compute + the 60s sweeps keep the Neon staging branch awake;
  note that with `MAINTENANCE_MODE=disabled` the outbox reconciler does NOT run, so
  emails queued while the worker is DOWN only send after the next window's fresh jobs:
  a future always-on posture should enable maintenance with the documented values).

## 5. Risks, costs, rollback (unchanged from the first window)

- Real-recipient leakage: prevented by the sandbox rewrite (now verified live) + the
  fail-closed empty-allowlist rule.
- SMS: not sandbox-covered; no portal flow enqueues SMS; keep customer phone flows off
  staging during windows.
- Cost: windowed = minutes of worker compute per window. Always-on is a separate owner
  decision (D-EM3).
- Rollback: remove/stop the worker deployment (one action); emails queue harmlessly; the
  CommunicationLog-read recipe keeps working.

## 6. Owner-gated items still open

- D-EM3 posture decision if always-on is ever wanted (incl. enabling maintenance config).
- Production email enablement: fully out of scope; requires sender domain, SPF/DKIM/DMARC,
  monitored inboxes, bounce handling, and legal/comms posture.
