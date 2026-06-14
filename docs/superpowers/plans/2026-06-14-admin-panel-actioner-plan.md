# Admin Panel: Actioner and Review Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Do NOT begin until the owner approves this plan and confirms disk headroom (see memory `project_environment_issues.md`).

**Goal:** Ship a separate, deployable Admin web app that lets an admin authenticate (email OTP) and operate the already-built actioner backend (queue, claim, review, request changes, reject, approve and go-live, create draft, suspend and reactivate, confirm branch location), reading full merchant context and a communication timeline, with a coherent in-app notification system and email alerts.

**Architecture:** A new Next.js 15 App Router app at `apps/admin-web/` (shadcn/ui, TanStack React Query) over the existing Fastify backend. The first prerequisite (M0) closes the admin email-OTP gap. The coherent notification model lands early (M2) so the admin shell is complete. Later milestones add small additive backend reads and the alert emits. Everything runs against the hosted Railway staging API; a deployed admin environment is a separate launch-readiness step.

**Tech Stack:** Next.js 15, TypeScript, TanStack React Query, shadcn/ui; backend Fastify on Node 24, Prisma 7, Neon Postgres, Redis, BullMQ, Resend.

**Source of truth:** `docs/superpowers/specs/2026-06-14-admin-panel-actioner-design.md`. Section references below (for example "spec 5.2") point to it.

---

## Scope and PR sequence

Each milestone is one PR. M0 is fully detailed (task-by-task TDD); M1 through M8 are specified to task level and get their fine-grained TDD expansion at execution time. Build in order.

| PR | Milestone | Type | Depends on |
|---|---|---|---|
| M0 | Admin email OTP | Backend only | none (build first) |
| M1 | `admin-web` scaffold + auth/session + CI | Frontend + CI | M0 |
| M2 | Notification slice (coherent model + bell) | Migration + Backend + Frontend | M1 |
| M3 | Approval queue (read) + dashboard freshness | Frontend | M1 |
| M4 | Review-context read endpoint + review screen | Backend read + Frontend | M3 |
| M5 | Actioner actions + release guard | Backend guard + Frontend | M4, M2 (emits) |
| M6 | Create draft + suspend/reactivate + confirm-location | Frontend (+ small backend) | M5 |
| M7 | Communication and activity timeline | Backend read + Frontend | M4 |
| M8 | Admin email alerts | Backend emit + templates | M5, M2 |

Notification timing (owner-resolved): the notification slice is a **named, guaranteed PR at M2, right after the shell**, not an optional fast-follow. The bell is part of the coherent authed shell, so the model, endpoints, and bell UI land in M2; the event emit calls are then wired in the milestones that create the events (M5 actioner, M8 alerts). This is why M5 and M8 list M2 as a dependency.

Launch-readiness items beyond this plan: Option B (admin-edit-on-behalf, required follow-on, own spec and plan), the deployed secure admin environment, and the verification-credibility subset of profile enrichment (spec 12, 13, 18).

---

## File-structure map

Backend (additions and edits):
- `src/api/auth/admin/service.ts` (modify): real email OTP in `loginAdmin` and `verifyAdminOtp` (M0).
- `src/api/auth/admin/routes.ts` (modify): rate-limit the verify route (M0).
- `src/api/plugins/rate-limit.ts` (modify): add an `otpVerify` tier (M0).
- `src/api/shared/emailTemplates.ts` (modify): `adminOtpEmail` (M0); `adminAlert*` templates (M8).
- `prisma/schema.prisma` + migrations (M2): `Notification` coherent model (`ADMIN` recipient type, canonical `recipientId`, `IN_APP` channel, explicit admin `NotificationType` values), via expand, backfill, contract.
- `src/api/shared/notify.ts` (modify): allow ADMIN in-app; write `channel: IN_APP`; enforce the recipient invariant (M2).
- `src/api/admin/notifications/{service,routes}.ts` (create): admin-scoped list, unread count, mark-read, mark-all-read (M2).
- `src/api/shared/adminNotify.ts` (create): emit helper for admin in-app notifications (M2, used by M5 and M8).
- `src/api/admin/approvals/service.ts` (modify): `getReviewContext` read (M4); release-owner guard (M5).
- `src/api/admin/timeline/{service,routes}.ts` (create): per-merchant communication and activity timeline read (M7).

Frontend (`apps/admin-web/`):
- M1: `app/(auth)/login/page.tsx`, `app/(app)/layout.tsx`, `lib/api/{client,auth}.ts`, `lib/auth/session.ts`.
- M2: `features/notifications/{NotificationBell,NotificationDropdown,NotificationItem}.tsx`, `lib/api/notifications.ts`.
- M3: `app/(app)/queue/page.tsx`, `features/queue/*`, `lib/api/approvals.ts`.
- M4: `app/(app)/queue/[id]/page.tsx`, `features/review/*`.
- M5: `features/review/{ActionBar,RequestChangesDialog,RejectDialog,ApproveConfirm}.tsx`.
- M6: `app/(app)/merchants/new/page.tsx`, `features/merchants/*`, `lib/api/{merchants,branches}.ts`.
- M7: `features/timeline/*`, `lib/api/timeline.ts`.

Tests mirror `apps/customer-web` jest and React Testing Library setup; backend tests under `tests/api/**`.

---

## Cross-cutting requirements (every milestone)

- TDD: write the failing test, run it red, implement minimally, run it green, commit.
- No schema change except M2 (additive expand, a data backfill, then a contract to required).
- Capability checks: every admin route keeps `requireAdminCapability`; the UI mirrors `capability.ts` but never replaces backend enforcement (spec 4, 10).
- No secrets in the client bundle; branch PINs and raw storage keys never leave the backend (spec 10).
- No emojis, no em-dashes, Redeemo brand tokens (memory `feedback-style-no-emojis-no-emdashes-brand-colors`).
- Run backend tests with `npx vitest run`; frontend tests with `npx jest` from `apps/admin-web`.

---

## M0: Admin email OTP (backend prerequisite, detailed)

**Goal:** Replace the unsendable admin OTP with a real emailed 6-digit code. Email only, no Twilio. Dev bypass `000000` stays for `development` and `test`; staging and production use the real emailed code (spec 3).

### M0 rate-limiting model (review points 1 and 4)

No new general-purpose limiter is added; the design reuses existing layers and adds exactly two things (a verify-route tier and a per-challenge attempt limit). Four orthogonal layers compose:

1. **Login endpoint abuse and password brute force:** the login route already has `routeRateLimit('login')` (per-IP, in `src/api/plugins/rate-limit.ts`). Unchanged. Wrong-password attempts are blocked here and never reach the OTP code path.
2. **OTP email send abuse:** handled entirely by the existing `notify()` caps (per-recipient 5 per hour, per-IP 200 per day, `notify.ts`). No separate admin OTP limiter is added (it would double-count). Crucially, `loginAdmin` sends the OTP email only after a successful password check, so the per-recipient email cap is consumed only on a password-correct login. A no-password attacker never reaches `notify`, so a victim's email quota cannot be burned by blocked login attempts (review point 1).
3. **OTP verify endpoint abuse:** the verify route currently has no route limit. M0 adds a new `otpVerify` tier to `routeRateLimit` and applies it to `/admin/auth/otp/verify` (per-IP). This caps verify hammering independent of any single challenge.
4. **Brute force of a single emitted code:** a per-challenge attempt counter (5 wrong codes then the challenge is invalidated), stored inside the challenge value in Redis. This is scoped to one challenge, so it never burns a different session.

These do not double-count: layer 1 is per-IP on login, layer 2 is per-recipient and per-IP on email send (post-password), layer 3 is per-IP on verify, layer 4 is per-challenge. Each guards a different resource.

### Code storage (review point 3)

The emitted code is stored as a **keyed, challenge-bound HMAC**, not a raw SHA-256. Because the code space is tiny (one million values), a raw hash would be trivially brute-forced offline if Redis leaked. Store `hmac = crypto.createHmac('sha256', ENCRYPTION_KEY).update(sessionChallenge + ':' + code).digest('hex')` (reusing the already-required `ENCRYPTION_KEY` server secret), and verify by recomputing and comparing with `crypto.timingSafeEqual`. Keying defeats offline brute force without the server secret; challenge-binding means the same code in two challenges yields different HMACs. Cost is one HMAC per verify.

### Staging identity (review point 2)

Staging admin QA uses an **owned `.co.uk` identity**, `staging-admin@redeemo.co.uk`, mirroring the customer approach (`staging-customer@redeemo.co.uk`). The seed `admin@redeemo.com` is only a database lookup key and never appears in the test. Before the M0 staging check, set the staging admin user's email to `staging-admin@redeemo.co.uk` (a one-row update on the staging branch). The Resend sandbox redirects all sends to the allowlisted inbox regardless, but we use the `.co.uk` identity for clarity.

**Files:** Modify `src/api/shared/emailTemplates.ts`, `src/api/auth/admin/service.ts`, `src/api/auth/admin/routes.ts`, `src/api/plugins/rate-limit.ts`. Test: `tests/api/auth/admin/admin-email-otp.test.ts` (new), `tests/api/auth/admin/admin-otp-bypass.test.ts` (extend).

### Task M0.1: adminOtpEmail template

- [ ] **Step 1: failing test** in `tests/api/shared/email-templates.test.ts`: `adminOtpEmail('492018')` returns a `RenderedEmail` whose subject mentions a sign-in code, whose text and html contain `492018`, which states a 10-minute expiry, and which contains no link.
- [ ] **Step 2: run red.** `npx vitest run tests/api/shared/email-templates.test.ts`.
- [ ] **Step 3: implement** `adminOtpEmail(code: string): RenderedEmail` in `emailTemplates.ts`, following the `passwordResetEmail` shape.
- [ ] **Step 4: run green.**
- [ ] **Step 5: commit** `feat(email): add adminOtpEmail template`.

### Task M0.2: generate, HMAC-store, and send the code in loginAdmin

- [ ] **Step 1: failing test** in `tests/api/auth/admin/admin-email-otp.test.ts`: a valid `loginAdmin` returns `{ status: 'OTP_REQUIRED', sessionChallenge }`, writes a Redis challenge whose JSON includes `codeHmac` (64-char hex) and `attempts: 0`, and calls `notify` once with `recipientType: 'ADMIN'`, `type: 'admin_otp'`, and an `email` whose text contains the 6-digit code. Assert the returned object and logs never contain the raw code.
- [ ] **Step 2: run red.**
- [ ] **Step 3: implement** in `loginAdmin` (`src/api/auth/admin/service.ts`): after generating `challenge`, generate `code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')`; compute `codeHmac = crypto.createHmac('sha256', process.env.ENCRYPTION_KEY!).update(challenge + ':' + code).digest('hex')`; store the challenge value as `JSON.stringify({ adminId, deviceId, deviceType, codeHmac, attempts: 0 })` at the existing key and TTL; send via `notify(prisma, redis, { to: admin.email, recipientType: 'ADMIN', recipientId: admin.id, userId: null, type: 'admin_otp', email: adminOtpEmail(code), ip })` inside a best-effort try/catch (mirror `forgotPasswordAdmin`). Do not add a new limiter (the existing `routeRateLimit('login')` and `notify` caps cover it). Never log or return the code.
- [ ] **Step 4: run green.**
- [ ] **Step 5: commit** `feat(admin-auth): email a real OTP code on login`.

### Task M0.3: verify the emitted code with a per-challenge attempt limit

- [ ] **Step 1: failing tests** in the same file: with a challenge carrying a known `codeHmac`, `verifyAdminOtp` with the correct code issues tokens; a wrong code throws `OTP_INVALID` and increments `attempts`; after 5 wrong attempts the challenge is deleted and further attempts throw `ACTION_TOKEN_INVALID`; a replayed (consumed) challenge throws; with `NODE_ENV='test'` the bypass `000000` issues tokens; with `NODE_ENV='staging'` set in the test and no matching code, `000000` throws `OTP_INVALID` (no backdoor).
- [ ] **Step 2: run red.**
- [ ] **Step 3: implement** in `verifyAdminOtp`: parse `{ adminId, deviceId, deviceType, codeHmac, attempts }`; if `ADMIN_OTP_DEV_BYPASS_ENVS.has(NODE_ENV)` and the code equals `000000`, accept; otherwise recompute `submittedHmac = createHmac('sha256', ENCRYPTION_KEY).update(challenge + ':' + submittedCode).digest('hex')` and compare with `crypto.timingSafeEqual(Buffer.from(submittedHmac,'hex'), Buffer.from(codeHmac,'hex'))`; on mismatch increment `attempts`, and if `attempts >= 5` delete the challenge, then throw `OTP_INVALID`; on match proceed to the existing token-issue block (which already deletes the challenge, keeping it single-use).
- [ ] **Step 4: run green.**
- [ ] **Step 5: commit** `feat(admin-auth): verify emitted OTP via challenge-bound HMAC + attempt limit`.

### Task M0.4: rate-limit the verify route

- [ ] **Step 1: failing test** in `tests/api/auth/admin/admin-otp-bypass.test.ts`: the existing dev-bypass assertions still pass under the new path, and repeated verify calls beyond the tier limit are rejected with the rate-limit response.
- [ ] **Step 2: run red.**
- [ ] **Step 3: implement** add an `otpVerify` tier to `TIERS` in `src/api/plugins/rate-limit.ts` (per-IP, tuned like `login`), and apply `config: { rateLimit: routeRateLimit('otpVerify') }` to the `/otp/verify` route in `src/api/auth/admin/routes.ts`.
- [ ] **Step 4: run green** across `tests/api/auth/admin/`.
- [ ] **Step 5: commit** `feat(admin-auth): rate-limit the OTP verify route`.

**M0 staging verification:** set the staging admin email to `staging-admin@redeemo.co.uk`; from a local client call `POST /api/v1/admin/auth/login`, observe the `admin_otp` email arrive in the Resend sandbox, then `POST /otp/verify` with the code and confirm tokens; confirm a wrong code is rejected, the code expires after the TTL, and the verify route rate-limits.

**M0 acceptance:** an admin completes login on staging via an emailed code using a `.co.uk` identity; the code is HMAC-stored and challenge-bound; `000000` works only in `development` and `test`; no code is logged or returned; the four rate-limit layers behave as described; backend suite green.

---

## M1: admin-web scaffold + auth/session + CI

**Goal:** A new Next.js app an admin can log into against staging (email OTP), landing on an authed shell that shows their role; unauthenticated users are redirected to login.

**Files:** the `apps/admin-web` scaffold (mirror `apps/customer-web`); `lib/api/client.ts` (base URL from env, admin JWT header, 401 to refresh then login), `lib/api/auth.ts` (login, otp/verify, refresh, logout, Zod), `lib/auth/session.ts` (token storage, `adminRole`, a `hasCapability` helper mirroring `capability.ts`), `app/(auth)/login/page.tsx`, `app/(app)/layout.tsx` (shell, role badge, logout, redirect guard). CI: an `admin-web` typecheck, lint, build job in `.github/workflows/ci.yml` mirroring the customer-web job.

**Tests:** unit for `session.ts` and `client.ts` (401 to refresh to login); component for the login form (submit, error, OTP step).

**Staging verification:** log in end-to-end against staging; land on the shell with the role shown; unauthenticated access redirects.

**Acceptance gate (review point 7, includes an owner action):**
- The admin-web dev origin (for example `http://localhost:3002`) and any future staging admin origin **must be added to the web service `CORS_ORIGIN`**. This is a required owner action (a Railway env change), and login against staging will not work until it is done. M1 is not complete until the deployed-or-local admin origin is in `CORS_ORIGIN` and the end-to-end login succeeds.
- CI job green; capability helper matches `capability.ts`.

---

## M2: Notification slice (coherent model + bell)

**Goal:** The coherent notification model and the admin bell per spec 7, 7.1, 7.2, 7.3, landing right after the shell so the admin console is coherent from the start.

**Schema migration (review point 6: expand, backfill, contract):**
- **Migration A (expand, additive):** add `ADMIN` to `NotificationRecipientType`; add `IN_APP` to `NotificationChannel`; add the six explicit admin `NotificationType` values (spec 7.2); add `recipientId String?` (nullable for now) to `Notification`; add indexes `(recipientType, recipientId, isRead)` and `(recipientType, recipientId, sentAt)`.
- **Data backfill:** set `recipientId = userId` for all existing rows (all USER today) and `channel = IN_APP` for all existing in-app rows.
- **Migration B (contract):** alter `Notification.recipientId` to `String` (NOT NULL, required). After this, `recipientId` is canonical and always set, matching the spec. `recipientId` is therefore nullable only transiently during expand and backfill, then required.

**Backend:** relax the `notify()` guard so `inApp` is allowed for `ADMIN`; write in-app rows with `channel: IN_APP` and `recipientId` always set; enforce the invariant in the single write path (recipientId always set; userId null for non-USER; userId equals recipientId for USER) (spec 7.1). `src/api/admin/notifications/{service,routes}.ts`: list (unread filter, paginated), unread count, mark-read, mark-all-read, scoped to the requesting admin by `(recipientType='ADMIN', recipientId=adminId)`. `src/api/shared/adminNotify.ts`: a helper that writes an admin in-app notification for an event with `referenceId` and `referenceType` (used by M5 and M8).

**Frontend:** `features/notifications/{NotificationBell,NotificationDropdown,NotificationItem}.tsx`, `lib/api/notifications.ts`; the bell and unread badge in the shell header, the dropdown with mark-read and mark-all-read, click-through via `referenceId` and `referenceType`, polling with the dashboard, no WebSockets.

**Tests:** backend, the invariant is enforced and asserted; existing customer notifications still parse and query after backfill; the unread-count query filters on `(recipientType, recipientId, isRead)`; admin list is scoped to the admin; the bell feed never reads `CommunicationLog` (spec 7.3 invariant test); `recipientId` is NOT NULL after Migration B. Frontend, the bell shows the unread count, the dropdown marks read and mark-all-read, click-through routes to the referenced entity. (No events fire yet; M5 and M8 wire the emits.)

**Staging verification:** apply migrations on a Neon staging branch first; verify existing notifications are intact post-backfill; manually insert one admin notification and confirm the bell shows it, opens, click-throughs, and marks read.

**Acceptance:** the coherent model is live with `recipientId` required; the admin bell works; customer notifications are unaffected.

---

## M3: Approval queue (read) + dashboard freshness

**Goal:** The queue screen per spec 5.1 and 9.

**Files:** `lib/api/approvals.ts` (list, Zod), `app/(app)/queue/page.tsx`, `features/queue/{QueueTable,StatusFilter,UrgencyBadge,LastUpdated,RefreshButton}.tsx`, a `useQueue` hook with a 45-second `refetchInterval` paused when backgrounded.

**Tests:** Zod parse of the real staging payload; age-based urgency colours (neutral under 3 days, amber 3 or more, red 5 or more); status filter chips; owner/claim column; a role lacking `approval:read` sees a forbidden state; the refresh button refetches; last-updated updates on refetch.

**Staging verification:** the queue lists real approvals oldest-first; counts update on refresh; polling refreshes without a manual reload.

**Acceptance:** queue reads and renders against staging with urgency, claim state, filters, and freshness.

---

## M4: Review-context read endpoint + merchant review screen

**Goal:** The full-context review screen per spec 5.3, with thin-area flags.

**Backend (additive read, no schema change):** `getReviewContext(prisma, approvalId)` in `src/api/admin/approvals/service.ts` returning the approval, full merchant profile, all branches (with `locationConfidence`, main and active, never `redemptionPin`), documents as short-lived signed URLs (10 to 15 minute TTL, per view), all vouchers (RMV and custom), the checklist summary, verification and contract state. Route `GET /admin/approvals/:id/review` gated on `approval:read`.

**Frontend:** `app/(app)/queue/[id]/page.tsx`, `features/review/{MerchantHeader,ProfileCard,BranchTable,DocumentList,VoucherList,ChecklistSummary,ThinAreaFlags}.tsx`, `lib/api/approvals.ts` (review Zod).

**Tests:** backend, `getReviewContext` returns branches, documents, profile, vouchers, and omits `redemptionPin` and raw storage keys (assert absence); signed URLs not raw paths. Frontend, each section renders; the thin-area flags render when documents are absent, company type is null, no registered office exists, and so on (spec 5.3); a role lacking `approval:read` is blocked.

**Staging verification:** open a real submitted merchant; profile, branches, documents (open via signed URL), and vouchers render; thin-area flags show.

**Acceptance:** the real merchant context renders in one screen, PINs and storage internals never exposed, thin areas flagged.

---

## M5: Actioner actions + release guard

**Goal:** Claim, release, request changes, reject, approve and go-live per spec 5.2, 5.4, 5.5, 5.6, with the release-owner guard, and the matching admin notifications.

**Backend (small guard, no schema change):** in `releaseApproval` require the caller is the claimer or holds `SUPER_ADMIN`, else throw a clear error. Expose the stale-claim age (or derive client-side from `claimedAt`). Wire `adminNotify` (M2) emits for the events this milestone creates (resubmission is merchant-side, so the relevant emit here is internal review-assignment; the new-submission and bounce emits live in M8).

**Frontend:** `features/review/{ActionBar,RequestChangesDialog,RejectDialog,ApproveConfirm}.tsx`; extend `lib/api/approvals.ts`.

**Tests:** backend, the four release cases (claimer can release; another ordinary admin cannot; `SUPER_ADMIN` force-release; stale claim visible) per spec 5.2. Frontend, each action calls the right endpoint and invalidates the queue and review queries; request-changes requires a non-empty reason, shows helper text and quick-reason chips that prefill the free-text, and enforces a soft minimum length; reject requires a reason and a confirmation and states it sets the merchant inactive and emails them; approve shows the serious confirmation; on a failed approve re-check the backend error code drives a named banner and highlights the failed checklist row, never force-approving; capability-gated buttons hidden for roles lacking `approval:action`.

**Staging verification:** claim, request changes (observe the sandbox email), resubmit via API or seed, approve, confirm the merchant goes active and appears in discovery; force a failed approve and confirm the named banner.

**Acceptance:** the full action set works against staging with the guard, reasons, confirmations, and the failure surface.

---

## M6: Create draft + suspend/reactivate + confirm-location

**Goal:** Create merchant draft (the six backend fields), suspend and reactivate, confirm branch location per spec 5.7, 5.8, 5.9.

**Files:** `app/(app)/merchants/new/page.tsx`, `features/merchants/CreateDraftForm.tsx`, `lib/api/merchants.ts` (create, suspend, reactivate), `lib/api/branches.ts` (confirm-location); lifecycle actions on the review or merchant view.

**Backend:** none new; confirm the create-draft form matches exactly `businessName`, `tradingName?`, `ownerEmail`, `ownerFirstName`, `ownerLastName`, `jobTitle?`.

**Tests:** create-draft validation and success surfaces the claim-email-sent state, handles `EMAIL_ALREADY_EXISTS`; suspend and reactivate each require a confirmation, reflect state, gated on `merchant:suspend`, handle the not-suspended error; confirm-location gated on `branch:confirm-location`.

**Staging verification:** create a draft, observe the claim email; suspend a live merchant and confirm it goes non-operational; reactivate; confirm a postcode-centroid branch pin.

**Acceptance:** an admin can create a draft and run the lifecycle controls against staging.

---

## M7: Communication and activity timeline

**Goal:** The read-only per-merchant timeline per spec 6, best-effort and clearly labelled.

**Backend (additive read, no schema change):** `src/api/admin/timeline/{service,routes}.ts`, `getMerchantTimeline(prisma, merchantId)` returning interleaved audit actions (`AuditLog` by `entityId` and `entityType='merchant'`, with actor, reason, before and after) and lifecycle emails (`CommunicationLog` resolved via the owner admin id, with delivery state), plus current merchant state. Route `GET /admin/merchants/:id/timeline` gated on `approval:read`.

**Frontend:** `features/timeline/{ActivityTimeline,EmailRow,ActionRow,DeliveryBadge}.tsx`, `lib/api/timeline.ts`; mount on the review screen, replacing the audit card. The email section carries a visible "resolved via the owner account" label (spec 6 best-effort decision).

**Tests:** backend, the timeline returns audit actions with actor and email rows with delivery state, resolved via the owner admin id; frontend, actions and emails interleave by time, delivery badges render queued, sent, failed, bounced, and the best-effort label is present.

**Staging verification:** open a merchant with a claim email and at least one admin action; confirm both appear with delivery state and the label.

**Acceptance:** a read-only timeline renders with the documented best-effort labelling.

---

## M8: Admin email alerts

**Goal:** The four email alerts per spec 8, low-noise and actionable, each also writing the matching admin in-app notification (M2).

**Backend:** emit calls (reusing `notify` with `recipientType: 'ADMIN'`) plus new `adminAlert*` templates in `emailTemplates.ts` plus an ops-inbox config (an env var for the ops alerts address, optionally fan-out to all `SUPER_ADMIN` admins). Events: new merchant submitted (ops inbox), resubmitted after changes (the reviewer who requested), owner email bounced or suppressed (the draft creator or claimed reviewer, derived from `CommunicationLog` bounced), notification delivery failure (ops inbox, derived from `CommunicationLog` failed after retries). Each emit also calls `adminNotify` to write the in-app notification.

**Tests:** each event sends the right template to the right recipient and writes the matching in-app notification; no email is sent for self-actions (approve, reject, suspend, reactivate); the bounced and delivery-failure alerts derive from `CommunicationLog` state.

**Staging verification:** create a draft to a deliberately bouncing sandbox address and confirm the bounce alert fires; submit a merchant and confirm the new-submission alert reaches the ops inbox in the sandbox.

**Acceptance:** the four alerts fire to the right recipients on staging, in-app and by email, with no self-action noise.

---

## Risks, rollback, and safety

- Net-new and additive: M1, M3 to M8 add a new app and additive backend reads and emits; M2 is the only schema change (additive expand, a backfill, then a contract to required) and is the riskiest, so it is verified on a Neon staging branch before the shared branch, with the invariant and the post-backfill not-null assertions in tests.
- Staging-only: all testing is against the staging Neon branch and the Resend sandbox; production is untouched; the admin app is not publicly deployed in this plan.
- M0 is security-bearing: it ships with the rate-limiting model above and the spec 3 test list; the dev bypass stays dev and test only; the code is HMAC-stored and challenge-bound.
- Staging identity: an owned `.co.uk` admin identity is used; no `.com` address appears in any test (review point 2).
- Environment: the near-full disk has caused ENOSPC; confirm several GB free before starting (memory `project_environment_issues.md`).
- Frequent commits per task; each milestone is independently revertable.

## Open owner decisions (carried from spec 16 plus plan-level)

1. Notification recipient modelling: canonical `recipientId` made NOT NULL after backfill (this plan) versus typed nullable FKs with a one-is-set check (spec 7.1 alternative). Recommendation: canonical `recipientId` for the single coherent pattern.
2. The `otpVerify` rate-limit tier values (M0): reuse the `login` tier numbers or set dedicated ones. Recommendation: a dedicated tier tuned slightly stricter than login.
3. Forced re-auth before suspend: in M6 or as launch-readiness hardening (spec 10). Recommendation: launch-readiness unless it proves small.
4. The ops alerts inbox address and whether ops alerts also fan out to all `SUPER_ADMIN` admins (M8).
5. The staging admin `.co.uk` identity: confirm `staging-admin@redeemo.co.uk` is the address to use.

(Resolved by this revision: notification-slice timing is fixed at M2, a named guaranteed PR; review-context read confirmed additive; the OTP limiter is dropped in favour of existing layers.)

## Deferred (not in this plan)

Option B admin-edit-on-behalf (required follow-on, own spec and plan); the self-serve Merchant Portal; merchant lead capture and CRM; verification pre-score; the section 12 profile enrichment; the deployed admin environment; production, AWS, and production-email changes; realtime notification push; the timeline `merchantId` and `triggeredByAdminId` denormalisation, internal notes, and Resend action (spec 6 fast-follow).

---

## Self-review

- Spec coverage: M0 covers spec 3; M1 covers 2 and 4; M2 covers 7 and its subsections; M3 covers 5.1 and 9; M4 covers 5.3 and the 11 review-context read; M5 covers 5.2, 5.4, 5.5, 5.6; M6 covers 5.7, 5.8, 5.9; M7 covers 6; M8 covers 8; risks and rollback cover 10 and 11; deferred covers 12, 13, and the section 18 launch items. No spec section is unmapped.
- Review points addressed: 1 and 4 (the rate-limiting model subsection; the OTP limiter dropped, verify-route tier plus per-challenge attempt limit added, composition and no-victim-burn explained); 2 (the `.co.uk` staging identity); 3 (challenge-bound HMAC with `ENCRYPTION_KEY`); 5 (notification slice fixed at M2, a named guaranteed PR); 6 (expand, backfill, contract making `recipientId` required); 7 (the M1 CORS acceptance gate and owner action).
- Placeholder scan: M0 carries concrete files, commands, and assertions; later milestones are specified to task level and expanded to bite-sized TDD by the execution sub-skill (stated, not hidden).
- Name consistency: `getReviewContext`, `getMerchantTimeline`, `adminOtpEmail`, `adminNotify`, `codeHmac`, the `otpVerify` tier, and the `(recipientType, recipientId)` key are used consistently across milestones.
