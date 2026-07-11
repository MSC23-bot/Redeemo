# Staging email/worker enablement (sandbox mode)

**Status: VERIFIED WORKING END-TO-END; posture changed 2026-07-11 to ALWAYS-ON (§7).
The windowed posture (§2-§5) is HISTORICAL: the staging worker now runs continuously with
the maintenance scheduler enabled (owner decision 4, 2026-07-11). Production email remains
untouched and owner-gated. §4 stays useful as the verification recipe if the worker is ever
re-enabled after a stop.**

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

## 2b. Second window: PASSED (2026-07-10, ~13:45-14:00Z)

- Key rotation had a twist worth remembering: the owner's first rotated key landed on the
  WEB service by mistake, and the second attempt sat as a STAGED variable change on the
  worker: `railway run` and the running worker kept seeing the OLD key until a worker
  deploy applied it. **Railway variable edits are staged until a deploy applies them.**
- After the apply: live Resend probe from the worker env returned **HTTP 200 (send
  accepted)**: the key value was never printed or inspected at any point.
- All three product flows then delivered end to end, each `CommunicationLog` row flipping
  QUEUED→SENT **with a Resend externalId**: merchant login OTP · customer password reset ·
  staff invite (claim link; labelled acceptance-test invitee walk-email@redeemo.test).
- Every recipient was rewritten to `admin@redeemo.co.uk` (allowlist) and the **owner
  confirmed inbox receipt**: including reading the delivered OTP back to complete a real
  owner login, the strongest possible end-to-end proof.
- Negatives held: **0 SMS sent; queue empty afterwards**; no non-allowlist delivery.
- Worker **stopped** (deployment removed) at window end: windowed posture preserved.

## 3. Standing facts learned (apply to every future window)

- **The DB OTP-extraction recipe does not work while the worker is live:** delivered rows
  have their payloads NULLed on send (correct security behaviour: codes and links are not
  retained after delivery). During windows, codes/links come from the allowlist inbox only.
- **Cosmetic Web/worker config split:** invite responses say `inviteDelivery: "EMAIL_DARK"`
  because the WEB service's `EMAIL_ENABLED=false` drives that label while the WORKER does
  the sending: during windows the email still delivers despite the label (and the portal's
  "email delivery is not live yet" banner). Tracked in the open register.
- Optional owner tidy-up: revoke the old invalid Resend key (`staging-new`) in the Resend
  dashboard so exactly one active staging key exists.

## 4. Standing window procedure (~15 min; as executed successfully in §2b)

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

## 5. Risks, costs, rollback

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

## 7. Posture change 2026-07-11: staging worker ALWAYS-ON (owner decision 4)

Owner-approved always-on posture executed 2026-07-11 (staging only; production remains
separately owner-gated). Deployment at main `abf6802d` (SUCCESS), Railway worker service,
staging environment.

Safeguards verified before deploy (all by NAME, no secret values inspected):

- Sandbox trio unchanged: `EMAIL_ENABLED=true`, `EMAIL_SANDBOX=true`,
  `EMAIL_SANDBOX_ALLOWLIST=admin@redeemo.co.uk`. `RESEND_API_KEY` present.
  `WORKER_DATABASE_POOL_MAX=5`.
- SMS risk assessed: the worker registers NO SMS processor (email + maintenance sweeps +
  photo-moderation only; Twilio SMS is sent synchronously by the API service). Always-on
  adds no standing SMS path. The standing caution is unchanged: do not exercise customer
  phone flows on staging.
- Backlog checked pre-deploy: exactly 2 QUEUED rows (`merchant_edit_applied`,
  `branch_create_approved`), both benign notifications with no OTP/reset links.
- Maintenance config: `MAINTENANCE_MODE=enabled` plus the 9 documented candidate values
  from `.env.example` (F_idle 1800000 ms, F_active 5000 ms, Phase-B 200 items / 10000 ms,
  statement 4000 ms / tx 8000 ms, all three sweeps enabled). Numerics remain the
  documented CANDIDATE values; changing them is a reviewed step.

First-run outcomes (the owner-required report):

- Queue: both backlog rows flipped QUEUED to SENT with Resend externalIds within seconds
  of boot; QUEUED count now 0.
- Email: sandbox redirect confirmed live in worker logs (recipients rewritten to
  `admin@redeemo.co.uk`); no non-allowlist delivery.
- SMS: none sent; no SMS capability registered in the worker.
- Maintenance: scheduler started (outbox + pending-hours + claim-stale all ENABLED);
  sweeps running clean (`failedRows: 0`); no pending-hours rows awaited promotion
  (4 PROMOTED / 1 CANCELLED, all terminal) and no stale claims existed.
- Stability: no crash loop; zero error lines after multi-minute soak.

Consequences now permanent on staging:

- **The OTP-from-DB recipe is DEAD** (worker NULLs payloads on send): all OTPs, reset
  links and claim links arrive at the allowlist inbox only.
- The Neon staging branch stays awake (60 s floor sweeps): the CU-burn trade-off the
  owner accepted with this decision.
- Rollback remains one action: remove the worker deployment; emails queue harmlessly.
