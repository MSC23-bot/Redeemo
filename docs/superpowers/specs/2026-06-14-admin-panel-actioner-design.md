# Admin Panel: Actioner and Review Console (Design Spec)

Status: Draft for owner review (do not start the implementation plan or any code until approved)
Date: 2026-06-14
Tier: 3 (new UI surface, security boundary, operational workflow)
Companion artefacts: `docs/superpowers/specs/2026-06-13-admin-actioner-mockups.html` (clickable concept), `docs/superpowers/specs/2026-06-10-merchant-portal-admin-onboarding-design.md` (the broader onboarding design this slice sits inside).

## 0. Purpose and language

The Admin Panel is Redeemo's internal operating console. This spec defines the first admin operational build: a web app where an admin authenticates and operates the already-built actioner backend (the approval queue, claim and review, request changes, reject, approve and go-live, create merchant draft, suspend and reactivate, confirm branch location), reading the full merchant context and the communication history, so a real merchant can move from lead to live through the product rather than through seed scripts.

Language note (owner direction, 2026-06-14): this document stages the work into a first build (Option A), a required follow-on (Option B), and a separate profile-enrichment workstream. "First build" and "first implementation slice" mean a staged internal step, not a reduced-quality public release. Redeemo does not launch publicly until the Admin Panel and the Merchant Portal are a complete operating system: safe, usable, with a complete workflow and no reliance on manual gaps. Where this spec says a thing ships "later," it means staged for risk and PR size, not dropped from the launch bar.

## 1. Why the actioner console comes before the self-serve Merchant Portal

Verified against code: the merchant and admin domain is largely modelled, but the approval path was write-only until Phase 2 Slice 1. Slice 1 (M1 to M6b, shipped) built the actioner backend (claim, request-changes, reject, approve and go-live, create draft, suspend and reactivate, confirm-location), all reachable only by API call today. A self-serve Merchant Portal built before an operable actioner would be a submission funnel into a queue nobody can action. The correct order is: build the admin console that operates the chokepoint (this slice), then admin-edit-on-behalf (Option B, so staff can fully onboard a merchant), then the self-serve Merchant Portal. The merchant onboarding backend CRUD already exists, so staff can drive interim onboarding once Option B lands.

## 2. Architecture

Decision (owner-confirmed): a separate Admin web app, not a section of `customer-web`. Rationale: clean security boundary (separate origin, separate JWT audience, no customer/admin surface bleed), independent deploy and access control.

- Location: `apps/admin-web/` (new workspace, parallel to `apps/customer-web`), Next.js 15 App Router, TypeScript, TanStack React Query.
- It authenticates against the existing `/api/v1/admin/auth` endpoints, calls the existing `/api/v1/admin/*` routes, and respects `src/api/admin/capability.ts` RBAC.
- It runs locally against the hosted staging API for this build; deploying the admin app to its own host is a separate later step. A deployed, secure, admin-accessible environment is a launch-readiness requirement (see section 18); the platform cannot launch publicly with the admin panel only runnable locally.

Tooling and design system (recorded decision, see memory `project-ui-tooling-shadcn-aceternity-vercel` and `feedback-style-no-emojis-no-emdashes-brand-colors`):
- Component base: shadcn/ui (the admin app gets its own `components.json`; tables, forms, dialogs, badges are the queue and review screens). This is the first consumer of the locked "shadcn to admin" decision.
- Vercel skills at build time: `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`, `agent-browser` (QA and dogfooding).
- UX shaping: `interface-design`, `ui-ux-pro-max`, `impeccable`.
- Bespoke pieces: Magic MCP (`21st_*`) and `frontend-design`.
- Aceternity is deliberately not used in admin (it is the marketing toolkit; admin must read calm and practical).
- Brand: Redeemo tokens from `apps/customer-app/src/design-system/tokens.ts` (red `#E20C04`, coral `#E84A00`, navy `#010C35`, cream `#FFF9F5`), brand red reserved for primary actions. No emojis (SVG icons), no em-dashes.

These skills and the Magic MCP are build-time aids, not durable product dependencies. The durable requirements are Redeemo brand alignment, practical admin UX, shadcn-style component discipline, and no generic or AI-looking UI. Those hold regardless of which tools produce the code, and the shipped code must stand on its own without them.

## 3. Admin authentication: M0 email-OTP prerequisite slice

Current reality (verified in `src/api/auth/admin/service.ts`): admin login is a two-step password then OTP, but no OTP code is generated or sent (`loginAdmin` makes a session challenge only; the "send via Twilio" path is a TODO), and `verifyAdminOtp` accepts only the dev bypass code `000000` in `development` or `test`. On staging and production this fails closed, so admin login cannot currently be completed on staging.

Decision (owner-locked): email-based OTP. No Twilio or SMS for admin login at this stage. The `000000` bypass stays for local `development` and `test` only. Staging and production use the real emailed code. Reasons: it matches the locked email-first verification strategy, reuses Resend (verified on staging), avoids SMS cost, and is production-shaped and safer than a bypass.

This is a small, security-bearing backend change, so it ships as M0, a prerequisite slice before the admin UI build, with its own tests and review.

Proposed flow (mirrors the existing `forgotPasswordAdmin` pattern: generate, store in Redis, send via `notify` plus an `emailTemplates` template):
- `loginAdmin`: after the challenge, generate a 6-digit code, store it hashed in Redis bound to the challenge (same TTL), and send it via `notify` with a new `adminOtpEmail(code)` template. On staging the sandbox redirects it to the allowlisted address; in production it reaches the admin inbox. Never log or return the code.
- `verifyAdminOtp`: compare the submitted code to the stored hash with a constant-time check, enforce an attempt limit (invalidate the challenge after N misses), keep single-use (the challenge is already deleted on verify), and keep the `000000` dev bypass for `development` and `test` only.
- Reuse the existing rate limiter (the security limiter shipped as Phase-0 PR-0.2) on login and verify.
- Files likely touched: `src/api/auth/admin/service.ts` (login and verify), `src/api/shared/emailTemplates.ts` (new `adminOtpEmail`). No schema change.

Security properties: Redis TTL plus single-use challenge, hashed code, attempt limit, constant-time compare, never logged or returned, rate-limited. Risks and mitigations: code interception is bounded by email-account security (email OTP is only as strong as the inbox), so high-risk step-up (TOTP or passkeys) is a documented future option; brute force is bounded by the attempt limit plus rate limit; email bombing is bounded by the rate limit on login.

Tests (full list in the plan): generates a 6-digit code and stores it hashed with correct TTL; calls `notify` with `adminOtpEmail`; never returns or logs the code; correct code issues tokens; wrong code returns OTP invalid and increments the attempt counter; missing or expired challenge fails; N wrong attempts invalidates the challenge; replay of a used challenge fails; `000000` works only in `development` and `test`; staging and production with no emailed code fail (no backdoor); constant-time compare; rate limit on login and verify; and a staging end-to-end check (login, code arrives in the Resend sandbox, enter it, signed in; wrong code rejected; expiry after the TTL).

## 4. RBAC: capabilities per action

Source of truth: `src/api/admin/capability.ts`. Roles: `SUPER_ADMIN`, `OPERATIONS`, `FINANCE`, `CONTENT`, `SUPPORT`. Capabilities used by this console: `approval:read`, `approval:action`, `merchant:create-draft`, `merchant:suspend`, `branch:confirm-location`. `OPERATIONS` holds all five; `SUPER_ADMIN` is the superuser; `FINANCE`, `CONTENT`, and `SUPPORT` hold none of these, so they get a read-limited or no-access view of this console.

| Action | Capability |
|---|---|
| View queue and review detail | `approval:read` |
| Claim / release | `approval:action` |
| Request changes / reject | `approval:action` |
| Approve and go-live | `approval:action` (the approve route also gates on `approval:action`) |
| Create merchant draft | `merchant:create-draft` |
| Suspend / reactivate | `merchant:suspend` |
| Confirm branch location | `branch:confirm-location` |

The UI shows and enables an action only when the admin's role holds the capability, and the backend independently enforces it (defence in depth, see section 13).

## 5. Option A: the actioner and review console (this build)

### 5.1 Approval queue

The work list. Backend `listApprovals` already sorts oldest-first (`submittedAt asc`) and filters by status, type, and age, with pagination.

- Urgency (owner-locked): age-based, no formal SLA countdown. Default sort oldest-waiting-first. Colour thresholds: neutral under 3 days waiting, amber at 3 or more, red at 5 or more. Reason: no review-volume or staffing data yet, and the UI must not imply a service promise we cannot keep. A real SLA can come later once volume is known.
- Filters: status chips (All, Submitted, Under review, Changes requested).
- Each row shows the merchant, type, waiting age with the urgency colour, verification state, status, and the owner or claim state (claimed by you, unclaimed, or waiting on merchant), with a review or claim action.
- Stale claims show a stale flag when claimed for more than 24 hours (see 5.3).
- Freshness (section 9): 45-second polling, manual refresh, visible last-updated time, counts derived from the same query.

### 5.2 Claim and release

Backend reality: claiming is an atomic exclusive lock (`claimedById: null, status: PENDING`), so an item cannot be double-claimed. Release currently clears the claim with no check that the releaser owns it.

Decision (owner-locked):
- Keep the exclusive claim (one reviewer responsible at a time).
- Tighten release: the claimer can release their own claim; `SUPER_ADMIN` can force-release anyone's; ordinary admins cannot release another admin's claim. This is a small guard in the existing release handler, documented here, implemented in the plan.
- Show a stale-claim flag in the queue when a claim is older than 24 hours. No auto-release (it could yank a legitimate long-running review).
- Tests (in the plan): claimer can release; another ordinary admin cannot release; `SUPER_ADMIN` can force-release; a stale claim displays in the queue.

### 5.3 Merchant review screen (full review context)

Decision (owner-locked): the review screen is the main quality-control point, so it surfaces everything an admin needs to make a real approve, request-changes, or reject decision in one place, not just checklist status and two vouchers.

The backend `getApproval` currently returns the merchant (partial), the onboarding checklist, and the two RMV vouchers. The review screen needs an additive read that also returns branches, documents (as short-lived signed URLs), the full profile, and all vouchers. This is the one new read endpoint in Option A (no schema change).

The screen surfaces, at minimum:
- Merchant profile: business name, trading name, description, category, website, logo and banner where available.
- Branch list: address, postcode, locality, main and active status, `locationConfidence`, and visible or live readiness. Branch PINs are never shown.
- Uploaded documents as viewable signed links (no raw storage paths, see section 13).
- Voucher and RMV details: custom versus template, title, type, saving, status, approval state, and a terms or clause summary.
- Onboarding checklist as a supporting summary, not the whole basis for approval.
- The communication and activity timeline (section 6).
- Clear approve, request-changes, and reject actions with reasons.

Flag thin or missing areas (owner-locked): the screen visibly flags the limits of today's model so the approver understands them, for example no documents uploaded, company type not captured, registered or head-office address not captured, sector-specific evidence not captured, and documents uploaded but not required by the current gate. Important: today's submission gate (`computeOnboardingChecklist`) requires only one branch, a signed contract, and two RMV vouchers. Documents are not required to submit or to go live. The flags make this explicit. Option A surfaces and flags only; it does not add fields, document types, or gates (those are the section 12 enrichment workstream).

### 5.4 Request changes

Backend reality: takes a free-text reason and emails it to the merchant via `merchantChangesRequestedEmail`; reopens the submission (`onboardingStep` becomes `NEEDS_CHANGES`).

Decision (owner-locked): keep the backend free-text reason only. Add UI-only quick-reason chips that prefill or append friendly, specific wording (for example "Document expired", "Photo unclear", "Wrong category"); no stored structured categories in this build. Add helper text: "Be specific and friendly. This message is emailed to the merchant." Add a soft minimum-length and specificity nudge so admins do not send one-word reasons.

### 5.5 Reject

Backend reality: sets the merchant `INACTIVE`, emails the merchant via `merchantRejectedEmail`.

Decision (owner-locked): the free-text reason is mandatory; add a confirmation step before final rejection; make it clear that rejection sets the merchant inactive and emails them.

### 5.6 Approve and go-live

Backend reality: an atomic transaction re-checks the go-live gates server-side, activates the two RMVs, sets the merchant active and live, and emails the owner via `merchantLiveEmail`. It can reject the approve with specific codes (`ONBOARDING_GATES_INCOMPLETE`, `MAIN_BRANCH_LOCATION_UNCONFIRMED`, `APPROVAL_NOT_ACTIONABLE`, and a test-data guard).

Decision (owner-locked): a serious confirmation step that states the server re-checks every gate, activates the RMVs, emails the owner, and makes the merchant visible to customers. On a failed re-check: never partially approve, never force go-live, keep the merchant unapproved, and show a clear, specific banner that names the failed gate, driven by the backend error code where possible (for example "Cannot go live: the main branch location is not confirmed. Confirm the pin, then approve."), with the relevant checklist row highlighted. Deep-link-to-fix is not required in this build; it is a nice-to-have follow-on, because different failures need different fix UIs.

### 5.7 Create merchant draft

Backend reality: `createMerchantDraft` takes `businessName`, `tradingName?`, `ownerEmail`, `ownerFirstName`, `ownerLastName`, `jobTitle?`, creates the merchant plus the owner admin (no password) plus an OWNER membership, and queues the owner's claim email (set-password link) via the notify outbox.

Decision (owner-locked): the form matches exactly these backend fields and stays minimal. Category and town are not on this form (the merchant adds those during onboarding). The screen makes clear the merchant is admin-created and merchant-claimed by email, and that nothing goes live until approved.

### 5.8 Suspend and reactivate

Backend reality (M6a): suspend is atomic, revokes the owner and branch sessions, and runs the cycle-refund sweep; reactivate restores; both write transactional audit rows. Reactivating a non-suspended merchant returns a clear error.

Decision: both actions require a confirmation step (suspend is serious: it takes the merchant non-operational within seconds).

### 5.9 Confirm branch location

Backend reality (M4): `POST /admin/branches/:id/confirm-location` sets coordinates and a manually-confirmed confidence, with a transactional audit row, gated on `branch:confirm-location`. Surfaced from the branch list on the review screen.

## 6. Communication and activity timeline (read-only, Option A)

A read-only per-merchant timeline on the review screen, extending the audit card.

- Shows key admin actions from `AuditLog` (filterable by `entityId` and `entityType = 'merchant'`), including actor, reason, and before/after where useful.
- Shows lifecycle emails from `CommunicationLog`, resolved via the owner admin id where possible, with delivery state (queued, sent, failed, bounced, including from the Resend bounce webhook).
- Shows the current merchant process state (status, step, verification).
- Presented as operational history, not a CRM conversation thread.

Documented gaps (explicit, not hidden):
- `CommunicationLog` has no direct `merchantId`; email history is resolved indirectly through the owner admin id. This can over-include emails if one owner admin is ever associated with multiple merchants. Today each draft creates a dedicated, email-unique owner admin, so the relationship is effectively one-to-one and resolution is accurate, but the data model does not guarantee it. Decision: the Option A timeline is best-effort, and its email section is clearly labelled in the UI as resolved via the owner account, so it never implies a perfect merchant-specific email history. If exactness becomes required, or multi-merchant-per-person lands, pull the `merchantId` and `triggeredByAdminId` denormalisation (in the fast-follow list below) forward.
- Branch-addressed emails (PINs) would need branch-to-merchant joining.
- Email rows do not store the exact triggering admin, so attribution is inferred from nearby audit events.
- There is no `MerchantNote` model.
- There is no inbound email, threading, or recruiter-assignment model.

Fast-follow: status and type filters, delivery badges, a safe Resend action (reuses `notify`), internal notes via a new `MerchantNote` model, and denormalised `merchantId` plus `triggeredByAdminId` on communication rows for robust querying and exact attribution.
Deferred: full two-way email threading, inbound replies, CRM-style notes and tasks, recruiter and rep assignment history, full correspondence search.

## 7. Admin notifications: a bounded notification slice (explicit, not lost)

This is "what needs my attention," distinct from the queue (the work list) and the merchant timeline (per-merchant history).

Verified gap: in-app admin notifications do not exist today. `NotificationRecipientType` is only `USER`, `MERCHANT_ADMIN`, `BRANCH_USER` (no `ADMIN`), and `Notification` has only a customer `userId` FK (no `adminId` or generic `recipientId`). `notify()` explicitly rejects pairing in-app with `recipientType: 'ADMIN'`. So admins can be emailed but have no in-app feed.

This slice (owner-locked, explicit, staged as a small prerequisite or fast-follow with its own PR, decided at plan time): 
- Additive migration: add `ADMIN` to `NotificationRecipientType`, add a generic canonical `recipientId` to `Notification`, and add explicit admin notification types (the precise model and types are in 7.1 and 7.2). Relax the `notify()` guard to allow ADMIN in-app.
- Admin-scoped endpoints: list with unread filter, unread count, mark-read, mark-all-read.
- Frontend: header bell and badge, unread count, recent-notifications dropdown, mark-read and mark-all-read, click-through to the merchant, review, or task via `referenceId` and `referenceType`, polling with the dashboard, no WebSockets or SSE.
- Events feeding it (shared with section 8): new merchant submitted, resubmitted after changes, claim stale over 24 hours, owner email bounced or suppressed, notification delivery failed, a merchant I claimed needs attention, a review or task assigned to me.

Coherence (owner architectural direction): the fix is deliberately a single coherent `Notification` model serving all recipient types (customer, merchant-admin, branch-user, admin) via one generic `recipientId`, with one bell, badge, dropdown, mark-read pattern, one polling approach, and one click-through. The admin notification slice builds that foundation, and the Merchant Portal notification system reuses the same model and mechanism rather than being a parallel idea.

Merchant Portal implication (documented): merchant users later receive in-app alerts on the same coherent model for changes requested, approval and go-live, rejection, document and voucher issues, and account or onboarding events.

### 7.1 Coherent notification model (schema precision)

The coherent model makes `recipientId` the canonical recipient pointer, paired with `recipientType`:
- `recipientId` (String, additive) is the canonical pointer to the recipient. With `recipientType` it identifies the row's owner: USER points to User, MERCHANT_ADMIN to MerchantAdmin, BRANCH_USER to BranchUser, ADMIN to AdminUser. Because it is polymorphic, `recipientId` has no single database foreign key; referential integrity for the pointer is enforced in the write layer and covered by tests. (Alternative for the plan to weigh: typed nullable foreign keys per recipient type with a one-is-set check, giving database-level integrity at the cost of more columns. This spec assumes the generic-pointer approach; the plan confirms it.)
- `userId` is kept only as the legacy customer foreign key and its Prisma `user` relation, so existing customer-notification queries and the relation keep working. It is set only for USER notifications, where it equals `recipientId`. It is null for MERCHANT_ADMIN, BRANCH_USER, and ADMIN.
- Backfill: a data migration sets `recipientId = userId` for all existing rows (all USER today), so `recipientId` is non-null and canonical for every row after the migration.
- Indexes: a composite index on (`recipientType`, `recipientId`, `isRead`) for unread-count and unread-list queries, and (`recipientType`, `recipientId`, `sentAt`) for the ordered feed.
- Invariant (prevents split-brain): `recipientId` is always set; `recipientType` always matches the table `recipientId` points to; for `recipientType = USER`, `userId` equals `recipientId` and the user relation is valid; for every non-USER type, `userId` is null. The single write path (`notify` and the notification-create helper) enforces this, and a test asserts it.
- How all four recipient types use it: every notification is keyed by (`recipientType`, `recipientId`); list, unread-count, and mark-read all filter on that pair. Admin is (ADMIN, adminUserId), merchant is (MERCHANT_ADMIN, merchantAdminId), branch is (BRANCH_USER, branchUserId), customer is (USER, userId, with `userId` also set). The bell, badge, dropdown, mark-read, polling, and `referenceId` click-through are written once against (`recipientType`, `recipientId`) and reused by the Merchant Portal later.

### 7.2 Explicit admin notification types

The current `NotificationType` enum is customer and merchant oriented. The slice adds explicit admin types (additive enum values) so the bell and dropdown can filter, group, icon, and render each correctly, rather than collapsing everything into one generic admin type:
- `ADMIN_MERCHANT_SUBMITTED` (new merchant submitted for approval)
- `ADMIN_MERCHANT_RESUBMITTED` (resubmitted after changes requested)
- `ADMIN_CLAIM_STALE` (a claim older than 24 hours)
- `ADMIN_OWNER_EMAIL_BOUNCED` (owner email bounced or suppressed)
- `ADMIN_DELIVERY_FAILED` (notification delivery failure needing attention)
- `ADMIN_REVIEW_ASSIGNED` (a review or task assigned to me)

Each carries `referenceId` and `referenceType` (typically the merchant or approval) for click-through. A generic admin fallback type may exist for future events, but the events above are explicit so the UI can filter and render them properly.

### 7.3 Channel semantics: email delivery versus in-app display

Verified: `NotificationChannel` has `PUSH`, `EMAIL`, and `SMS` and no in-app value, and `notify()` writes in-app `Notification` rows with `channel: NotificationChannel.EMAIL` (`src/api/shared/notify.ts`), which conflates "an email was sent" with "this belongs in the bell." The slice separates the two concepts explicitly:
- `CommunicationLog` is the delivery log: it answers "was an email, SMS, or push sent, and did it deliver" (queued, sent, failed, bounced).
- `Notification` is the in-app display feed: a row's presence means "this belongs in the bell," for one recipient.
- The slice adds an `IN_APP` value to `NotificationChannel` (additive), writes in-app `Notification` rows with `channel: IN_APP`, and backfills existing rows from `EMAIL` to `IN_APP` (they are all in-app feed rows). The channel becomes honest rather than misleading.
- Invariant: the bell feed is queried only by (`recipientType`, `recipientId`, `isRead`) plus `referenceId` and `referenceType`. It never joins `CommunicationLog`, and it is never filtered on `channel`. The `channel` value on a `Notification` row is descriptive (it says "in-app"), not a feed filter. An email send writes a `CommunicationLog` row; a bell item writes a `Notification` row; `notify()` may write one, the other, or both, but the bell reads only `Notification`. This guarantees "email sent" and "in the bell" are never conflated.

Within the slice, fast-follow: role and ops-targeted notifications, notification preferences. Deferred: realtime push (WebSocket, SSE, FCM).

## 8. Admin email alerts (so admins are not reliant on the dashboard being open)

High-signal, low-noise, actionable. `notify()` already supports `recipientType: 'ADMIN'` for email, so no new plumbing, just templates and emit calls.

Email alerts (this build or a tight fast-follow, decided at plan time): new merchant submitted (to a configurable ops alerts inbox); resubmitted after changes (to the reviewer who requested them); merchant owner email bounced or suppressed (to the draft creator or claimed reviewer; derived from `CommunicationLog` bounced); notification delivery failure needing attention (to the ops inbox; derived from `CommunicationLog` failed after retries).
In-app or dashboard badge only (no email): per-status queue counts; claim stale over 24 hours; approve, reject, suspend, reactivate (visible in the audit log, taken by the actor).
Future realtime (deferred): live push of new submissions.
Deferred: material change after a reviewer claims (needs change-detection and the deferred pending-edit diff), per-admin digests, per-admin preferences.

## 9. Dashboard freshness (owner-locked)

React Query with a 45-second refetch interval on the queue and counts, a manual refresh button, a visible "Last updated HH:MM:SS" time, counts and badges derived from the same query so they update together, polling paused when the tab is backgrounded, and no WebSockets or SSE for this build. Polling is simpler and reliable now; realtime can come later if review volume justifies it.

## 10. Audit and safety baseline (owner-locked)

1. Capability-gated UI plus backend enforcement (defence in depth): each action is shown and enabled only if the admin's role holds the capability, and the backend independently enforces it.
2. Confirmation for serious actions: approve and go-live, reject, and suspend each require an explicit confirmation; reject and suspend also require a reason. Claim, release, request-changes, and confirm-location do not.
3. Audit completeness: every action writes an `AuditLog` row with actor, merchant entity, before and after on state change, and the reason for reject, request-changes, and suspend (already supported).
4. Document safety: documents open via short-lived signed URLs (roughly a 10 to 15 minute TTL), generated per view, never raw storage paths.
5. No sensitive-data leakage: branch PINs are never returned to the admin UI, no secrets in the client bundle, and the review-context read explicitly omits PINs and raw storage keys.
6. Auth and session: admin email-OTP (section 3) plus admin JWT, a 15-minute access token with refresh, logout, an idle-session timeout for the console, and rate-limiting on login and OTP.

Launch-readiness hardening (documented, owner open to including before public launch, especially for suspend): forced re-authentication before the most destructive actions. It need not be in the first admin UI PR unless it proves small and natural.
Optional and not recommended by default: a raw IP allowlist for the console. Redeemo involves remote work (owner currently in Qatar, UK market, others on changing networks), so fixed IP allowlisting risks locking out legitimate admins. Prefer strong admin auth, email OTP, short sessions, idle timeout, capability checks, audit logs, and forced re-auth for destructive actions. If an extra access layer is wanted later, prefer Cloudflare Access or identity-aware access over fixed IPs.

## 11. Backend additions summary (build versus reuse)

Reuse (already exists): the actioner routes and transitions, RBAC, lifecycle emails via `notify`, the audit log with actor, suspend and reactivate, confirm-location, the security rate limiter, the Resend bounce webhook and `CommunicationLog` delivery state.
Build in this slice or its prerequisites:
- M0 email-OTP (section 3): backend, no schema change. Prerequisite to the UI.
- Review-context read (section 5.3): an additive read returning branches, documents as signed URLs, full profile, and all vouchers. No schema change.
- Communication-and-activity timeline read (section 6): assembles `AuditLog` plus `CommunicationLog` via owner plus state. No schema change.
- Release-handler guard (section 5.2): a small permission tightening. No schema change.
- Admin email alerts (section 8): emit calls plus new admin templates plus an ops-inbox config. No schema change.
- Admin notification slice (section 7): one additive migration (`ADMIN` recipient type plus generic `recipientId`) plus admin-scoped endpoints plus the bell UI. The only schema change in scope, staged as its own PR.

## 12. Phase-3 merchant business profile enrichment (separate workstream, documented not built)

Option A surfaces and flags existing data and adds no new fields, document types, or gates. The richer merchant business profile is a separate Phase-3 onboarding and schema workstream, because it changes schema, onboarding, verification, and merchant conversion friction and deserves its own spec and plan.

What the schema holds today (verified): Merchant has business name, trading name, `companyNumber`, `vatNumber`, website, logo, banner, description, primary category, contract status and dates, verification status. MerchantAdmin (owner) has first and last name, email, phone with country code, job title. MerchantDocument has a file URL plus only four generic document types (`BUSINESS_VERIFICATION_1`, `BUSINESS_VERIFICATION_2`, `PRICE_LIST`, `AGREEMENT`). MerchantContract has signed-at, IP, terms version, and signature method.

Genuinely missing from the schema: company type (and its enum), a registered or head-office address distinct from branches, and sector-specific document types.

Proposed field classification (anchors, not final scope):

| Field | In schema today | Proposed stage |
|---|---|---|
| Legal business name | Yes | Required for draft |
| Trading name | Yes | Optional (draft) |
| Company type (Ltd, sole trader, partnership) | No field | Required before submission (new field plus enum) |
| Company registration number | Yes (`companyNumber`) | Required before submission, if Ltd |
| VAT number | Yes (`vatNumber`) | Optional or conditional (if VAT registered) |
| Registered or head-office address | No field (branches only) | Required before go-live (new field) |
| Owner or primary contact name | Yes (MerchantAdmin) | Required for draft |
| Job title or authority | Yes (`jobTitle`) | Required before submission (authority to bind) |
| Contact email | Yes (MerchantAdmin) | Required for draft |
| Contact phone | Yes (MerchantAdmin) | Required before submission |
| Website | Yes | Optional |
| Public description | Yes | Required before go-live (customer-facing) |
| Public customer contact, if different | Partial (branch phone or email) | Optional or future |
| Logo | Yes | Required before go-live |
| Banner | Yes | Optional |
| Generic verification documents | Yes (2 slots), not gated | Required before submission (add a document gate) |
| Sector evidence (FHRS, licence, insurance) | No types | Required before submission, conditional by sector (new document types) |
| Billing or finance contact | No field | Future or deferred (Phase 5 billing) |

This workstream must also resolve: whether documents are required before submission or before go-live, the conditional rules (company number if Ltd, VAT if registered), and how to preserve merchant conversion while capturing enough business-level information to verify and approve properly. The existing onboarding design spec (`2026-06-10-merchant-portal-admin-onboarding-design.md`) is its home.

## 13. Option A versus Option B (A first for a safe foundation, B as a required follow-on)

Option B is not optional. In real operations Redeemo staff may need to make changes for merchants on their behalf: on the phone, during recruitment and onboarding, when a merchant asks support to update something, when the merchant does not use the self-serve portal immediately, or when staff help get a merchant ready for approval. It is staged after a smaller Option A foundation for risk and PR size, not because it is a nice-to-have.

Option A (this build): actioner and review foundation, queue, claim and release, request changes, reject, approve and go-live, create draft, suspend and reactivate, confirm branch location, read full review context, read the communication and activity timeline. No merchant-content editing unless explicitly scoped.

Option B (required follow-on, separate slice): admin-edit-on-behalf and back-office merchant management. Edit merchant profile and business details where allowed, add and edit branches, upload and replace documents, create and edit RMV and custom vouchers, submit for approval on the merchant's behalf, and support phone-assisted or staff-assisted onboarding.

Option B safety rules (recorded):
- Every admin-on-behalf edit is audited as "admin acting on behalf of merchant" (the `actorType` enum supports this).
- Significant edits capture a reason or source where appropriate (for example "merchant requested by phone").
- Admin edits reuse the same merchant onboarding validation and gates; no weaker admin-only path.
- Pre-approval edits may be direct if audited.
- Post-go-live edits may need pending-edit moderation or stricter controls, especially for customer-visible details.
- Sensitive, legal, or commercial fields may require merchant confirmation rather than free admin editing.

The clean rule: Option A actions the approval workflow and lifecycle controls; Option B mutates the merchant's business content. Anything that writes the merchant's own onboarding data belongs to Option B.

## 14. Cross-check (requirement, current code reality, gap, proposed decision)

| Requirement | Code reality (verified) | Gap | Proposed decision |
|---|---|---|---|
| Admin login on staging | `/admin/auth/*` exists; OTP code never sent; `000000` fails closed off dev | Cannot log in on staging | M0 email-OTP prerequisite (section 3) |
| Queue with urgency | `listApprovals` sorts oldest-first, filters status and age | No UI urgency model | Age-based colours, no SLA (5.1) |
| Exclusive claim | Atomic conditional claim | Release unguarded | Tighten release (5.2) |
| Full review context | `getApproval` returns partial merchant, checklist, 2 RMVs | No branches, documents, full profile | Additive review-context read (5.3) |
| Request changes and reject reasons | Free-text reason, emailed | None for backend | UI chips and confirmation (5.4, 5.5) |
| Approve and go-live | Atomic re-check, specific error codes | Failure surface is UI | Named banner plus checklist highlight (5.6) |
| Create draft | Six-field input plus claim email | Mockup had extra fields | Form matches backend (5.7) |
| Communication timeline | AuditLog by merchant; CommunicationLog delivery state | No `merchantId`, no triggering admin, no notes | Read-only timeline plus documented gaps (6) |
| In-app admin notifications | `notify` emails ADMIN; Notification has no ADMIN feed | No `ADMIN` recipient type or `recipientId` | Bounded notification slice, additive migration (7) |
| Admin alerts | `notify` supports ADMIN email; CommunicationLog bounced and failed | No emit calls or templates | Four email alerts (8) |
| Richer business profile | companyNumber and vatNumber exist; no company type, registered office, or sector doc types; gate is thin | Schema and gates incomplete | Phase-3 enrichment workstream (12) |
| Admin-edit-on-behalf | Merchant CRUD exists | No admin write path or audit-as-on-behalf | Option B required follow-on (13) |

## 15. Out of scope for Option A
Self-serve Merchant Portal UI; merchant lead capture and CRM; verification pre-score; the section 12 profile enrichment; merchant-content editing (Option B); production deploy of the admin app; any production, AWS, or production-email change.

## 16. Open decisions for owner review
1. Notification slice timing: just before or just after Option A's first PR (section 7). Recommendation: a tight prerequisite or first fast-follow, made explicit in the plan either way.
2. Admin email alerts: in Option A's build or a tight fast-follow (section 8). Recommendation: fast-follow if it grows the first PR too much.
3. Forced re-auth before suspend: in the first admin UI PR or as launch-readiness hardening (section 10). Recommendation: launch-readiness, unless it proves small and natural.
4. The ops alerts inbox address and whether ops alerts also fan out to all `SUPER_ADMIN` admins (section 8).

## 17. Testing approach (detail in the plan)
Local unit and component tests with jest and React Testing Library mirroring `customer-web`; Zod-schema tests that parse real staging responses; staging walkthroughs against the hosted API with email side-effects observed in the Resend sandbox and database effects checked in the Neon staging editor; a new `admin-web` typecheck, lint, and build CI job; the M0 and release-guard tests listed in sections 3 and 5.2.

## 18. Launch-readiness model (owner direction)

Public launch is not gated on onboarding merely existing. Redeemo does not launch publicly until both the Admin Panel and the Merchant Portal feel like a complete, credible operating system. A merchant must not self-onboard and then land in a half-baked portal. This is staged implementation internally, but the experience at public launch must be complete and trustworthy on both sides.

Terminology: avoid "MVP" to mean a thin public launch. Use "first implementation slice", "pre-launch internal slice", or "first operational slice" for staged internal steps. Reserve "launch" for the complete operating model.

### 18.1 The Merchant Portal is more than an onboarding checklist

Even before a merchant is verified or live, the portal should communicate the value of the platform and what the merchant will be able to do. Features may be staged, locked, previewed, or marked unavailable until approval or live status, but the experience should feel coherent and intentional, not empty or unfinished. A clear indication of what unlocks after approval and go-live is itself a required experience element.

Merchant Portal capability anchors (not final scope; the Merchant Portal has its own spec and plan): onboarding and verification progress; business profile management; branch management; voucher creation and management; the RMV and template-guided voucher builder; redemption visibility and management; analytics and reports; notifications and action items; documents, contracts, and compliance status; support and communication history; and a clear indication of what unlocks after approval and go-live.

### 18.2 Launch-readiness map

This map spans the whole operating system (Admin Panel and Merchant Portal). The Merchant Portal items are anchors for its own spec; they are listed here so the launch bar is explicit.

Must-have before public launch (the credible operating system):
- Admin: the actioner and review console (Option A); admin-edit-on-behalf (Option B); admin notifications; the communication and activity timeline; email-OTP admin auth and the section 10 safety baseline; and a deployed, secure, admin-accessible Admin Panel environment (its own host, HTTPS, the auth and safety baseline, and the access model). The platform cannot launch with the admin panel only runnable locally.
- Merchant: onboarding and verification progress; business profile management; branch management; voucher creation and management with the RMV and template-guided builder; documents, contracts, and compliance status; notifications and action items; a coherent, intentional shell with clear locked or preview states; and a clear indication of what unlocks at go-live.
- Verification credibility: a defined subset of the section 12 enrichment that lets staff verify and approve properly (for example company type, registered or head-office address, sector evidence, and document gates), rather than the thin current gate.

Can be staged behind approval or live status (functional only once the merchant is live):
- Redemption visibility and management; analytics and reports with real data; featured and campaign tools (Phase 5); anything with no meaning before customers can redeem.

Can be visible as disabled or preview to communicate value (present pre-live, clearly locked):
- Redemption, analytics, and growth tools shown as previews with "available once you are live" messaging; the value narrative of the platform; what the merchant unlocks at each onboarding and approval step.

Can be deferred until after public launch:
- Full lead CRM and recruiter assignment; two-way correspondence and inbound email; AI offer suggestions; advanced statements and exports; realtime notification push; the full sector-evidence matrix beyond the launch subset; admin engine-management CRUD UIs.

### 18.3 Consequence for sequencing

The Admin Panel actioner console (this spec) is the first operational slice, not the launch bar. Public launch additionally requires Option B, the Merchant Portal operating model above, the coherent notification system on both sides, and the verification-credibility subset of profile enrichment. Each is staged internally for risk and PR size, and each is part of the launch-readiness bar, not optional polish.
