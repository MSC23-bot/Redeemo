# Staging email/worker enablement (sandbox mode)

**Status: PREPARATION-ONLY. Nothing in this document has been executed. All facts verified
read-only on 2026-07-10 (code at main `f9cc9652`+, Railway variables by name/flag only, no
secrets read). Execution requires an explicit owner-approved closed-scope window.**

## 1. Goal

Make Merchant Portal email flows (invites, claim links, OTPs, password resets, owner
notifications) deliver through REAL email on staging in sandbox/allowlist mode, replacing
the manual CommunicationLog-read recipe. Production/live merchant email stays separate and
owner-gated (sender domain, SPF/DKIM/DMARC, monitored inboxes, bounce handling, legal/comms
posture: none of that is touched by this plan).

## 2. Current state (verified 2026-07-10)

| Item | State |
|---|---|
| Worker service | OFFLINE since ~2026-06-29 (last deployment `0656b4ee` @ `53bafac4`, REMOVED). The ONLY blocker. |
| worker env | ALREADY provisioned: `EMAIL_ENABLED=true`, `EMAIL_SANDBOX=true`, `EMAIL_SANDBOX_ALLOWLIST=admin@redeemo.co.uk`, `RESEND_API_KEY` present, DB/Redis/encryption wired. `STORAGE_ENABLED=false` (fine: email path never touches R2). |
| Web env | `EMAIL_ENABLED=false`, `EMAIL_SANDBOX=true` (deliberate: the API never sends; `notify()` writes the outbox + queues a BullMQ job; the worker delivers). |
| Sender policy (code, D-F) | default `Redeemo <noreply@redeemo.co.uk>`; merchant emails `Redeemo Merchants <merchants@redeemo.co.uk>`; reply-to `support@redeemo.co.uk`; env-overridable. Sandbox delivery verified end-to-end 2026-06-25 under this exact posture (staging deploy runbook §B). |
| Sandbox rails (code) | `EMAIL_SANDBOX=true` rewrites EVERY recipient to the allowlist; empty allowlist REFUSES to send (fail closed). `EMAIL_ENABLED != true` = no client construction, no network call. |
| Backlog | 19 QUEUED CommunicationLog rows (2026-07-07 → 07-09; all EMAIL: 8 merchant_login_otp, 3 admin_otp, 3 merchant_claim, 2 email_verify, 2 password_reset, 1 edit_applied). |
| Backlog policy (code) | the outbox reconciler force-FAILs rows QUEUED >24h and NULLs their payloads (tokens never linger); rows younger than the ceiling re-enqueue and send. So on worker start, only recent rows deliver: to the allowlist only. |
| Bounce webhook | `RESEND_WEBHOOK_SECRET` present on Web; Resend webhook targets the staging URL per the 2026-06-25 runbook. |
| SMS caveat | sandbox rewriting covers EMAIL ONLY. The worker holds live Twilio credentials (`SMS_ALLOWED_COUNTRY_CODES=+44`, daily cap 500). No SMS rows are queued today and portal flows do not enqueue SMS, but customer-app phone-verification flows WOULD send real SMS once the worker runs. Do not exercise customer phone flows on staging while the worker is up without a separate decision. |
| Worker jobs on start | email processor · outbox reconciler (repeatable, 60s) · maintenance sweeps (stale-claim, pending-hours) · moderation worker (`MODERATION_ENABLED=false` = no-op). |

## 3. What is already safe/ready vs what must change

**Ready:** the entire env posture, the sandbox fail-closed rails, the 24h token-expiry
policy, the sender policy, the bounce webhook wiring, and prior end-to-end verification.

**Must change (the enablement step):** deploy the worker service at the current main tip.
That is the whole change. No variable edits, no code changes, no schema.

## 4. Owner-gated decisions (make BEFORE the window)

- **D-EM1 Go/no-go** for the staging window.
- **D-EM2 Backlog disposition:** (a) let the code policy run: >24h rows expire, recent rows
  (roughly the last day's) deliver to `admin@redeemo.co.uk`; or (b) pre-expire ALL 19 QUEUED
  rows first for a clean slate: a staging data mutation (single UPDATE flipping QUEUED→FAILED
  + NULLing payload, exactly what the policy would do later; reversible only in the sense
  that nothing is lost: these are stale OTP/claim emails).
- **D-EM3 Worker posture:** always-on (worker sweeps keep the Neon staging branch awake:
  no autosuspend, continuous compute + Railway worker usage) vs windowed (deploy for test
  sessions, remove after; zero idle cost; emails queue harmlessly in between).
- **D-EM4 (unchanged, later):** production email enablement: fully out of scope here.

## 5. Enablement sequence (single window, ~30 min, staging only)

- E1 (read-only) Re-verify: worker env flags unchanged; allowlist non-empty; count QUEUED.
- E2 (per D-EM2) Backlog disposition if option (b) chosen.
- E3 Deploy the worker: Railway dashboard → worker service → Cmd+K "Deploy latest commit"
  (SHA-stamped; per the deploy-verification rule in the staging runbook §14). Watch boot
  logs: BullMQ workers registered, sweeps scheduled, no crash loop.
- E4 Verify sends: trigger ONE merchant login OTP → email arrives at the allowlist inbox
  with the rewritten recipient; the CommunicationLog row flips QUEUED→SENT. Repeat for one
  invite (claim link), one password reset, one owner notification (e.g. an edit-applied
  notice). Confirm the ORIGINAL recipients received nothing (they are rewritten). Owner
  spot-checks the Resend dashboard activity + bounce webhook deliveries.
- E5 Observe 15 minutes: no retry storms, no unexpected sends, sweep logs healthy, Neon
  activity as expected.

## 6. Verification checklist (all must hold to call it enabled)

- [ ] Worker deployment SUCCESS at the intended SHA (deployment id + commitHash recorded)
- [ ] Boot logs show email worker + reconciler + maintenance sweeps registered
- [ ] OTP email delivered to allowlist inbox; row QUEUED→SENT
- [ ] Invite/claim email delivered; claim link works end to end
- [ ] Password-reset email delivered; link works
- [ ] Owner-notification email delivered
- [ ] No email delivered to any non-allowlist address (spot-check Resend activity)
- [ ] Backlog handled per D-EM2 (counts recorded before/after)
- [ ] No SMS sent (CommunicationLog SMS count unchanged)

## 7. Risks, costs, rollback

- **Risk: stale backlog delivery** (bounded by the 24h policy + allowlist; D-EM2(b) removes
  it entirely). **Risk: real-recipient leakage**: prevented by the sandbox rewrite verified
  in code + the fail-closed empty-allowlist rule; verified again at E4. **Risk: SMS** (see
  §2 caveat): do not run customer phone flows during the window. **Risk: worker code drift**:
  the worker deploys at current main, which has not run as a worker since `53bafac4`; watch
  boot logs (E3); rollback is immediate if it crash-loops.
- **Cost:** Railway worker compute + Neon staging compute while running (sweeps every 60s
  prevent autosuspend). Windowed posture (D-EM3) reduces this to test sessions only.
- **Rollback:** remove/stop the worker deployment (one dashboard action). Emails simply
  queue again in CommunicationLog; the manual read recipe keeps working. No data loss, no
  variable changes to revert.
