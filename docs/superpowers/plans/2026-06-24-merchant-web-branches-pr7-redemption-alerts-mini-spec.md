# PR-7 mini-spec: Redemption alerts (per-branch in-app bell on validation)

Status: DRAFT for owner + Codex review. Docs-only. No implementation until approved.

Programme: Merchant Portal Branches (PR-1 to PR-8). Source of truth: `docs/superpowers/specs/2026-06-23-merchant-web-branches-programme-design.md` (umbrella, D8 + the PR-7 section + Section 11 deferred recipient model).

Locked decision being implemented: D8. "Redemption alerts as an in-app bell, per-branch toggle, reusing `VOUCHER_REDEEMED` + the M4 merchant bell; email deferred/dark. When enabled, branch redemption events produce in-app merchant notifications via the M4 bell; notify the branch's owner/merchant-admins and branch managers where the role/scope supports it. TRIGGER: alerts fire on merchant validation (the in-store staff-verified event, `isValidated:true` in `verifyRedemption`), NOT on customer code generation."

OWNER DECISION (grill-me, 2026-06-24) - the richer recipient model: DEFER the whole richer model. PR-7 ships ONLY the single per-branch on/off toggle. When ON, an in-app bell fires after in-store validation to the branch's active owner(s) + branch-scoped Branch Managers; exclude STAFF and BranchUser/app-only users; self-action silenced; email stays dark. PR-7 does NOT add: per-recipient on/off toggles; an extra-recipient email field; per-recipient alert schema; any email delivery behaviour. Reason: the "extra recipient" is inherently an email feature and email is still dark; per-recipient toggles add schema/UI complexity before the email model exists. The richer recipient model (per-recipient toggles + extra-recipient email) is recorded as a LATER email-enabled slice, likely bundled with notification/email preferences.

Grounded in a five-subsystem live-code inspection (the M4 bell + Notification model + `notify()`/`adminNotify()` writers; the `verifyRedemption` trigger site; the per-branch toggle schema; merchant-web UI; recipient fan-out + the email-dark lock + the richer-model feasibility).

BASELINE NOTE: PR-7 stacks on the open PR-1/PR-2/PR-3 stack (PRs #309/#310/#313). `assertCanManageBranch` + the Staff & Access scope model + the merchant-web branch surfaces are stack-only (read via `git show feat/merchant-web-branches-pr3-photos:<path>`); the M4 merchant bell, `notify()`/`adminNotify()`, the Notification model, the redemption flow, and the M8 fan-out helpers are on `main`. Locate by symbol; line numbers are indicative.

---

## 1. Live-code reality (what exists today)

- `NotificationType.VOUCHER_REDEEMED` ALREADY EXISTS as a valid enum value (prisma/schema.prisma ~1517). So NO enum-addition migration is needed for the type. But it has ZERO Notification producers today (it appears only as an `AuditLog` event string + this dormant enum value). PR-7 is the FIRST code to ever write a Notification of this type.
- `Notification` model (prisma/schema.prisma ~1592): `recipientType` (enum), `recipientId` (the canonical per-person pointer; for `MERCHANT_ADMIN` it is a `MerchantAdmin.id`), `userId` (legacy USER-only FK, null for MERCHANT_ADMIN rows), `title`, `body`, `type`, `channel`, `referenceId`, `referenceType`, `isRead`/`readAt`/`sentAt`. Indexes `(recipientType, recipientId, isRead)` + `(recipientType, recipientId, sentAt)` power the bell. `recipientId` is polymorphic (no DB FK); the write path enforces correctness.
- `notify()` (src/api/shared/notify.ts ~109) is EMAIL-COUPLED + SINGLE-RECIPIENT: it ALWAYS commits a `CommunicationLog` (EMAIL, status QUEUED) row inside its transaction + enqueues a delivery job; the in-app Notification is an OPTIONAL add-on. It requires a `to:` email and passes through the email rate limiter. It does NOT fan out. So `notify()` is the WRONG writer for PR-7: per validation, per recipient, it would commit a dark `CommunicationLog` email row + burn an email-quota slot.
- `adminNotify()` (src/api/shared/adminNotify.ts ~49) is the IN-APP-ONLY writer precedent (built in M8 EXACTLY because the bell fan-out must not write email outbox rows): a pure `prisma.notification.create` with `channel: IN_APP`, NO `CommunicationLog`, NO email job. Its `emit*` helpers (e.g. `emitMerchantSubmittedAlert` ~99) show the fan-out shape: resolve a recipient SET, LOOP and notify each, BEST-EFFORT (try/catch swallow so it never fails the committed action), `excludeAdminId` for self-action-silence. `adminNotify` hardcodes `recipientType: 'ADMIN'`; PR-7 needs the `MERCHANT_ADMIN` analogue.
- M4 merchant bell READ (src/api/merchant/notifications/service.ts + routes.ts): all queries bound to `recipientType = MERCHANT_ADMIN` + `recipientId = req.user.sub` (= the logged-in `MerchantAdmin.id`); per-person isolation; there is NO org-wide notification read (a single merchant-keyed row would be invisible). The bell read routes do NOT call `resolveAdminMerchant` (per-person; a suspended merchant can still read).
- The redemption flow (src/api/redemption/service.ts): `createRedemption` writes an `AuditLog 'VOUCHER_REDEEMED'` at `isValidated:false` (~507-512) - the FORBIDDEN producer site (customer code generation). `verifyRedemption` sets `isValidated:true` (~587-595) + a `VOUCHER_VERIFIED` audit (~597) - the LOCKED PR-7 trigger site (the in-store staff-verified event). `POST /redemption/verify` serves BOTH the branch-actor (mobile/staff `BranchUser`) AND the merchant-actor (portal `MerchantAdmin`) through one route. `verifyRedemption` has `redemption.branchId` + `redemption.voucher.merchantId` + `redemption.userId` in context.
- Email-dark: `EMAIL_ENABLED` (src/api/shared/email.ts) defaults OFF = email dark globally; the email worker no-ops / marks dark QUEUED rows FAILED (terminal, no flush-on-enable). This is WHY `notify()`-routed emails are dark today, and WHY PR-7 must use the in-app-only `adminNotify`-style writer (so it does not even commit dark email outbox rows for a high-frequency event).
- Recipient resolution foundation (src/api/shared/merchantMembership.ts + src/api/merchant/shared.ts): `MerchantMembership` (role OWNER / BRANCH_MANAGER / STAFF; `allBranches` / `allowedBranchIds` via `MerchantMembershipBranch`) joined to `MerchantAdmin`. `getMerchantOwnerContact` resolves a SINGLE owner (insufficient - multi-owner is supported). PR-7 must enumerate ALL active OWNER + branch-scoped BRANCH_MANAGER memberships for the redemption's merchant.
- `Branch` model: NO existing redemption-alert / notification preference column. PR-7's only schema is the per-branch toggle.
- merchant-web: the M4 `NotificationBell` already renders (Topbar) - NOT a PR-7 task; its row renderer is type-driven via `lib/notifications/typeMeta.ts` (maps type -> {label, Icon}; unknown types fall back to a generic Bell) + `lib/notifications/resolveDestination.ts` (deep-link; safe fallback to `/`). A new `VOUCHER_REDEEMED` type renders with zero bell changes (fallback-safe). The PR-1 branch detail has a DISABLED redemption-alerts affordance (a `LockedAffordance`, redemption alerts visible-but-disabled per D8/PR-1).

Corrections to assumptions:
- CORRECTION 1: PR-7 must NOT use `notify()` (email-coupled). It must add a NEW in-app-only `MERCHANT_ADMIN` writer (the `adminNotify` analogue, e.g. `merchantNotify`). Using `notify()` with an `inApp` block would silently commit dark `CommunicationLog` email rows + burn email quota per recipient per validation - the wrong shape and a breach of the email-dark lock.
- CORRECTION 2: `VOUCHER_REDEEMED` is already a `NotificationType`; the only PR-7 schema is the per-branch toggle on `Branch`.

---

## 2. Prototype behaviour being targeted

Prototype `04`: a branch redemption-alerts card. PR-7 ships the per-branch on/off toggle + (optionally) a read-only "who is alerted" recipient list. The prototype's per-recipient on/off toggles + the "Add an extra recipient" email field are DEFERRED (owner decision above).

---

## 3. Schema change (additive) - one column

`Branch.redemptionAlertsEnabled Boolean @default(false)`. Opt-in (default OFF). Rationale (recorded default): defaulting every branch ON would, the moment PR-7 ships, fan out a `VOUCHER_REDEEMED` bell row to every active owner/BM on every in-store validation for existing live merchants who never asked for it - noisy + surprising. Opt-in lets a merchant deliberately enable it from the now-live PR-1 card; it is the conservative, reversible default for a new notification feature. (`Branch` has both `true` (isActive) and `false` (isMainBranch/isTestData) defaults, so convention does not dictate it; OFF is the safe choice. Flip at review if the owner prefers ON.)

`NotificationType.VOUCHER_REDEEMED` already exists - NO enum migration. Migration: `ALTER TABLE "Branch" ADD COLUMN "redemptionAlertsEnabled" BOOLEAN NOT NULL DEFAULT false;` (purely additive, backfills all rows in one statement; the `canManageVouchers` pattern). Dev-first; staging/prod via `prisma migrate deploy`. No new index needed (the producer reads the toggle on the single branch it already loads).

---

## 4. Backend behaviour

### 4a. New in-app-only merchant notification writer

Add `merchantNotify(...)` (the `MERCHANT_ADMIN` analogue of `adminNotify`): a pure `prisma.notification.create` with `recipientType: 'MERCHANT_ADMIN'`, `recipientId: <each recipient's MerchantAdmin id>`, `channel: IN_APP`, `type: 'VOUCHER_REDEEMED'`, `userId: null`, `referenceType: 'redemption'`, `referenceId` = the redemption id (pinned: the alert is about a specific validation event, so a redemption deep-link is the most actionable; the merchant-web `resolveDestination` entry for `'redemption'` is OPTIONAL/deferred and the bell falls back to `/` safely if absent). NO `CommunicationLog`, NO email job, NO `to:` email. This keeps the email-dark lock intact for a high-frequency event. (Do NOT route through `notify()`.)

### 4b. The alert producer (trigger site + best-effort + gate)

Co-locate ONE producer inside `verifyRedemption` (src/api/redemption/service.ts), AFTER the `isValidated:true` update commits (~587-595) and after/alongside the `VOUCHER_VERIFIED` audit (~597), BEFORE the return. NEVER at the `createRedemption` / `AuditLog 'VOUCHER_REDEEMED'` site (~507, `isValidated:false`, customer code generation) - the shared string is the single highest-risk trap.
- GATE: read the branch's `redemptionAlertsEnabled` (extend the `verifyRedemption` branch select, which today selects only `branch.isActive`, to also fetch `branch.redemptionAlertsEnabled` + `branch.merchantId` + `branch.name` for copy). If OFF, emit nothing.
- BEST-EFFORT: wrap in try/catch (or a `safeNotify`-style helper) so a notification failure NEVER fails the validation. The redemption is validated by the `isValidated:true` update regardless; the alert is a post-commit side-effect (mirror `adminNotify`/`safeNotify`).
- FAN-OUT: resolve the recipient SET (4c), loop, `merchantNotify` each (one Notification row per recipient so each person's M4 bell shows it).

### 4c. Recipient fan-out (who gets the bell)

New recipient-resolution helper keyed by `merchantId` + `branchId`: enumerate `MerchantMembership` rows for `redemption.voucher.merchantId` with `status: ACTIVE` and (`role: OWNER`) OR (`role: BRANCH_MANAGER` AND scope covers `redemption.branchId`, i.e. `allBranches: true` OR a `MerchantMembershipBranch` row for the branch); join to `MerchantAdmin` for the `recipientId`; one Notification per recipient. EXCLUDE STAFF (D8 enumerates owner + merchant-admins + branch managers; STAFF is the low-privilege portal role and is omitted - recorded default, owner-locked). EXCLUDE `BRANCH_USER` (app/staff-side delivery is out of scope - do not mix app delivery into merchant-web). SELF-ACTION SILENCE: if the validating actor is a `MerchantAdmin` (merchant-portal validation), exclude their own id (mirror `excludeAdminId`); if the validator is a `BranchUser` (app), no exclusion is needed (they are not a recipient anyway). Do NOT use `getMerchantOwnerContact` alone (single-owner findFirst) - multi-owner is supported, so enumerate ALL active owners.

### 4d. Copy + email-dark

The alert copy says in-app now, email later (e.g. title "Voucher redeemed at <branch>"; body references the voucher + branch + the validation time, never the customer's personal details and NOT the redemption code, which is moot post-validation). Email stays dark; PR-7 commits NO email outbox rows for this event.

---

## 5. Customer-visible behaviour

NONE. The alert is a merchant-side in-app bell. No customer surface changes. The customer redemption + validation flow is unchanged (the producer is a post-commit side-effect of `verifyRedemption`).

---

## 6. Merchant / admin behaviour

Merchant (merchant-web): the PR-1 DISABLED redemption-alerts `LockedAffordance` becomes a LIVE single per-branch on/off switch that reads `branch.redemptionAlertsEnabled` and writes it via a branch-settings PATCH (a new `useSetRedemptionAlerts`-style hook). Card copy is rewritten to "in-app now, email later" (DROP any "gets an email" wording). The privacy line is REWRITTEN to match what the bell actually carries: the alert shows the voucher, branch, and validation time, never the customer's personal details. (The PR-1 card's "time and redemption code" wording is DROPPED: the alert does NOT carry the redemption code, which is moot post-validation; do not keep that line verbatim or it over-promises content the bell row will not show.) The card MAY display a READ-ONLY recipient list (who will be alerted: the active owner(s) + the branch's branch managers) as a clarity affordance. Do NOT build the per-recipient on/off toggles or the "Add an extra recipient" email field (deferred). The redeemed alert surfaces in the existing M4 `NotificationBell` (already wired; PR-7 only adds a `VOUCHER_REDEEMED` `typeMeta` entry + optionally a `redemption`/branch deep-link `resolveDestination` entry).

Admin: NONE. Redemption alerts are a merchant-side feature; no admin involvement, no `AdminApproval`, no admin bell change.

---

## 7. Authorization (Owner / Branch Manager / Staff)

| Action | OWNER | BRANCH_MANAGER | STAFF |
|---|---|---|---|
| Toggle the per-branch redemption-alert preference | Allowed (any branch) | Allowed (assigned branch) | Denied |
| RECEIVE the in-app alert (when ON) | Yes (active owners) | Yes (scope-covering BMs) | No |
| Read own bell | Yes | Yes | Yes (M4 bell is per-person; but they receive no VOUCHER_REDEEMED rows) |

The toggle WRITE is a branch-management write -> `resolveMerchantContext + assertCanManageBranch(ctx, branchId)` (OWNER any / assigned BRANCH_MANAGER / STAFF denied), the same branch-settings boundary as the PR-4 hours toggle. Server-enforced. (Recorded default; D8 lists BMs among recipients but does not state who may CHANGE the toggle - `assertCanManageBranch` matches the branch-settings pattern. Flip to OWNER-only at review if the owner deems alert-routing governance-adjacent.) STAFF is excluded as a RECIPIENT per D8 + the owner decision.

---

## 8. Tests

Backend:
- Producer fires on `verifyRedemption` (isValidated:true) when the branch toggle is ON: writes one `VOUCHER_REDEEMED` Notification per recipient (active owner(s) + scope-covering BMs), `channel: IN_APP`, `recipientType: MERCHANT_ADMIN`, and writes NO `CommunicationLog` / NO email job (email-dark pin).
- Producer does NOT fire when the toggle is OFF.
- Producer does NOT fire at `createRedemption` / the `isValidated:false` audit site (the forbidden-site pin).
- Best-effort: a `merchantNotify` failure does NOT fail the validation (the redemption is still validated).
- Fan-out: STAFF memberships excluded; `BRANCH_USER` excluded; a BM whose scope does NOT cover the branch excluded; multiple active owners all notified; the validating merchant-admin (if the actor) self-silenced.
- Toggle write authz: OWNER any / assigned BM allowed; unassigned BM + STAFF -> `INSUFFICIENT_PERMISSIONS`; suspended merchant -> `MERCHANT_SUSPENDED`.
- The new `Branch.redemptionAlertsEnabled` defaults false; the migration backfills existing rows false.

merchant-web (jest/RTL): the PR-1 card becomes a live single toggle reading/writing `redemptionAlertsEnabled` (owner + assigned BM can toggle; STAFF/non-owner cannot); copy says "in-app now, email later" (no "email"); the optional read-only recipient list renders owner + BMs; per-recipient toggles + extra-recipient email field are ABSENT (deferred); a `VOUCHER_REDEEMED` bell row renders via `typeMeta`.

---

## 9. Rollback plan

- Code rollback: revert the PR. The producer in `verifyRedemption` is removed (validation behaviour unchanged - the alert was always a best-effort side-effect); the merchant-web card returns to the disabled affordance. Any already-written `VOUCHER_REDEEMED` Notification rows are inert (the bell renders them harmlessly; they can be left or cleaned up).
- Schema rollback: the migration is a single additive boolean column (default false). Reverting the code leaves the column dormant with no behavioural effect. No existing column altered.

---

## 10. Stop-and-report triggers

- The producer cannot be implemented as a best-effort post-commit side-effect of `verifyRedemption` (it must NEVER fail a validation).
- Recipient resolution is ambiguous for any role/scope combination (umbrella stop-and-report trigger) - the fan-out must deterministically enumerate active OWNER + branch-scoped BRANCH_MANAGER memberships; if any combination is unclear, report.
- Any temptation to route through `notify()` (which commits dark `CommunicationLog` email rows + burns email quota) instead of the in-app-only `merchantNotify` - this silently breaches the email-dark lock; report/refuse.
- Any temptation to co-locate the producer at the `createRedemption` / `isValidated:false` `VOUCHER_REDEEMED` audit site - hard lock; the only correct site is `verifyRedemption` after the validation flip.
- Any extension that writes `BRANCH_USER` (app/staff-side) notification rows (mixing app delivery into merchant-web) - out of scope; report.
- DECISION RECORDED (owner grill-me): the richer recipient model (per-recipient toggles + extra-recipient email + per-recipient schema + email delivery) is DEFERRED to a later email-enabled slice; the toggle default is OFF/opt-in; the toggle-write authz is `assertCanManageBranch`; STAFF + BRANCH_USER are not recipients.
- DEPLOY: the additive migration must reach staging/prod via `prisma migrate deploy`.

---

## 11. Explicit deferrals

- The richer recipient model: per-recipient (owner/BM) on/off toggles + an "Add an extra recipient" non-portal EMAIL field + the per-branch-per-recipient schema it needs. Recorded as a LATER email-enabled slice, likely bundled with notification/email preferences (owner-locked). It cannot ship while email is dark (the extra-recipient is an email feature).
- Email delivery of redemption alerts (email stays dark; in-app now, email later).
- `BRANCH_USER` (app/staff-side) push/in-app delivery of redemption alerts (no app delivery in merchant-web).
- STAFF-role portal members as recipients (excluded per D8 + the owner decision).
- Any notification/email preference surface beyond the single per-branch toggle (D8: do not add preferences beyond the toggle unless explicitly chosen; not chosen here).

---

## 12. Cross-check table (existing code -> proposed PR-7)

| # | Existing (live code) | Proposed PR-7 | Note |
|---|---|---|---|
| 1 | `VOUCHER_REDEEMED` is a valid `NotificationType` (schema ~1517) but has ZERO Notification producers (only an AuditLog string + a dormant enum). | PR-7 is the FIRST producer of a `VOUCHER_REDEEMED` Notification. No enum migration. | The type exists; only the producer + the toggle are new. |
| 2 | `notify()` (notify.ts) is email-coupled + single-recipient (always writes a `CommunicationLog` EMAIL row + enqueues + burns email quota). | NEW in-app-only `merchantNotify` (mirror `adminNotify`): one Notification per recipient, `channel: IN_APP`, NO `CommunicationLog`, NO email. | Email-dark-correct for a high-frequency event. Never use `notify()`. |
| 3 | `adminNotify` (M8) is the in-app-only ADMIN writer + `emit*` fan-out (resolve set, loop, best-effort, self-silence). | PR-7 mirrors this exactly for `MERCHANT_ADMIN`: resolve owner + scope-covering BMs, loop, best-effort, self-silence. | Established precedent; PR-7 adds the MERCHANT_ADMIN analogue. |
| 4 | `verifyRedemption` flips `isValidated:true` (~587); `createRedemption` writes the `VOUCHER_REDEEMED` AUDIT string at `isValidated:false` (~507). | Producer co-located ONLY in `verifyRedemption` after the flip, gated on the per-branch toggle, best-effort. NEVER at the `createRedemption` audit site. | The shared string is the highest-risk trap; trigger = merchant validation only. |
| 5 | `Branch` has no alert preference column. | Add `Branch.redemptionAlertsEnabled Boolean @default(false)` (opt-in). Additive migration. | The only PR-7 schema. |
| 6 | M4 bell is per-person (`recipientType MERCHANT_ADMIN` + `recipientId = req.user.sub`); no org-wide read. | One Notification row per recipient `MerchantAdmin.id` so each person's bell shows it. | A single merchant-keyed row would be invisible. |
| 7 | The M4 `NotificationBell` renders any type (typeMeta fallback-safe) + already mounted in the Topbar. | Add a `VOUCHER_REDEEMED` `typeMeta` entry + optional `redemption`/branch deep-link; the bell itself needs no wiring. | Not a PR-7 bell task; only the producer + the toggle UI + typeMeta. |
| 8 | The PR-1 redemption-alerts affordance is a DISABLED `LockedAffordance`. | Becomes a LIVE single per-branch toggle (read/write `redemptionAlertsEnabled`); copy "in-app now, email later"; optional read-only recipient list. Per-recipient toggles + extra-recipient email NOT built. | `assertCanManageBranch`-gated write. |
| 9 | `EMAIL_ENABLED` off (email dark); `notify()` still commits dark `CommunicationLog` rows. | PR-7 commits NO email outbox rows for this event (in-app-only). Copy promises email later. | Email-dark lock preserved. |

---

## 13. PR shape + sequencing

- PR-7 is Tier-3 (one additive column). It stacks AFTER PR-1..PR-6 (uses the PR-1 alerts card + the PR-2 `assertCanManageBranch` guard).
- Suggested order: schema (the `Branch.redemptionAlertsEnabled` column + migration) -> the in-app-only `merchantNotify` writer -> the recipient-resolution helper (active owner + scope-covering BM) -> the best-effort producer in `verifyRedemption` (gated + self-silenced) + the verify-select extension -> merchant-web (the live toggle + copy + optional recipient list + the `VOUCHER_REDEEMED` typeMeta) -> tests.
- Out of scope: the richer recipient model; email; app-side (`BRANCH_USER`) delivery; PR-8 (multi-window hours); any change to the redemption/validation semantics beyond the post-commit alert.

No implementation until this mini-spec is owner + Codex approved.
