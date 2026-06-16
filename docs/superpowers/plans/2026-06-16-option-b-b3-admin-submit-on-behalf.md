# Option B B3 — Admin Submit-on-Behalf (implementation plan)

- **Date:** 2026-06-16
- **Tier:** Option B slice (plan-first; owner decisions locked below before any code)
- **Status:** PLAN COMMITTED, PAUSED before implementation
- **Sequence:** B1 (applier) -> B2.1..B2.5 (direct/identity/category/branch/propose) all SHIPPED -> **B3 (this doc)** -> B4 / B5 / Merchant Portal (held)
- **Design reference:** `docs/superpowers/specs/2026-06-15-option-b-admin-edit-on-behalf-design.md` Section 3 (B3 design-level)

## 1. What B3 is

A thin admin endpoint that lets an authorised admin trigger a merchant's onboarding submission (first-submit or resubmit-after-changes) on the merchant's behalf, reusing the live merchant-side submit logic with no weaker path. The admin acts AS an admin (audited `actorType:'ADMIN'` plus a required reason), never AS the merchant. B3 only QUEUES the application; claim plus go-live stay the separate M3/M5 actioner flow. The contract/legal gate is preserved by construction: the live submit checklist requires `contractStatus === 'SIGNED'`, and B3 adds no admin contract-signing path, so an unsigned merchant simply fails `ONBOARDING_GATES_INCOMPLETE`.

## 2. Locked owner decisions

- **D1 capability tier:** new `merchant:submit` cap is OPERATIONS-level (added to `ALL_SLICE1_CAPS`). It is operational submit/resubmit, not approval/go-live. Backend approval stays a separate actioner capability (`approval:action`).
- **D2 audit upgrade:** move the submit audit from post-commit fire-and-forget `writeAuditLog` (no actor) to in-transaction actor-attributed `writeAuditLogTx`. Merchant-path non-regression pins required. Mirrors the B2.3-core / B2.4-core "f-and-f -> in-tx" precedent.
- **D3 owner-notify:** yes, best-effort, schema-free, reuse the existing `MERCHANT_VERIFICATION_UPDATE` notification type. Fires only when the actor is an admin (a merchant self-submit needs no notification). **If implementation proves a NEW `NotificationType` is needed, STOP and ask before any schema/migration.**
- **D4 self-action-silence:** add an optional `excludeAdminId` to `emitMerchantSubmittedAlert` so the acting admin is not alerted about their own admin-submit. Passed only on the admin path.
- **D5 UI confirm:** reason-only, NO confirmation checkbox (consistent with create-draft / propose-edit).
- **D6 resubmit-on-behalf:** included. The shared core supports `REGISTERED` first-submit AND `PENDING_APPROVAL` + `NEEDS_CHANGES` resubmit.
- **D7 PR split:** B3-core first, then B3-web. The `getMerchantDetail` read extension folds into B3-core.

## 3. Inspected files / routes / models / helpers

**Merchant submit flow (the thing B3 wraps):**
- `src/api/merchant/onboarding/service.ts` — `submitForApproval()` (L79-155), `computeOnboardingChecklist()` (L20-42, keyed by merchantId), `getOnboardingChecklist()` (L44-47, keyed by adminId), `acceptContract()` (L49-77).
- `src/api/merchant/onboarding/routes.ts` — `POST /api/v1/merchant/onboarding/submit` (merchant JWT, no body).

**Option B seam to copy:**
- `src/api/merchant/shared.ts` — `EditActor` (L12), `resolveAdminMerchant()` (L14-33, throws `MERCHANT_SUSPENDED`), `resolveTargetMerchantForAdmin()` (L43-53, allows SUSPENDED).
- `src/api/admin/merchants/routes.ts` — canonical admin-on-behalf route shape (B2.1 profile L104-125; B2.5 edit-request L243-265): cap guard -> STRICT zod body with required `reason` -> `resolveTargetMerchantForAdmin` -> `*Core(..., { merchantId, actor: { type:'ADMIN', id: req.user.sub, reason } }, auditCtx)`. Also `idParam` / `auditCtx` helpers (L82-83).
- `src/api/admin/capability.ts` — `AdminCapability` union (L21-61), `ALL_SLICE1_CAPS` (L63-72), `adminHasCapability()` (L85-89, SUPER_ADMIN short-circuit), `requireAdminCapability()` (L96-108).
- `src/api/shared/audit.ts` — `writeAuditLog()` fire-and-forget no-actor (L110-126); `writeAuditLogTx()` in-tx actor-attributed (L167-183); `AuditEvent` union already has `MERCHANT_SUBMITTED_FOR_APPROVAL` (L46) and `MERCHANT_RESUBMITTED` (L83); `event` is a String column; `ActorType` includes `MERCHANT_ADMIN` and `ADMIN`.

**Notification / ownership / legal:**
- `src/api/shared/adminNotify.ts` — `adminNotify()`, `getAlertableAdmins()` (OPERATIONS+SUPER_ADMIN), `emitMerchantSubmittedAlert()` (currently NO self-action-silence), `emitMerchantResubmittedAlert()` (targets the requesting reviewer via the approval's `adminUserId`).
- `src/api/shared/notify.ts` — `notify()` (CommunicationLog email outbox plus optional in-app Notification); the actioner owner-notify (`safeNotify`) call sites in approvals/service.ts are the pattern to mirror.
- `src/api/admin/approvals/service.ts` — `getMerchantOwner(prisma, merchantId)` (L23-34) returns `{ adminId, email } | null`; `approveApproval()` go-live re-validation (L476-501) attaches `{ checklist }` to `ONBOARDING_GATES_INCOMPLETE`.
- `prisma/schema.prisma` — `Merchant` (status / onboardingStep / verificationStatus / contractStatus), `MerchantContract`, `MerchantMembership` (OWNER source of truth), `AdminApproval` (type `MERCHANT_ONBOARDING`, referenceType `merchant`), `Notification` + `NotificationType` (includes `MERCHANT_VERIFICATION_UPDATE`).

**Admin-web UI:**
- `apps/admin-web/app/(app)/merchants/[id]/page.tsx` — card layout + `can(...)` gating; status / verification badges shown; NO submit affordance; `onboardingStep` fetched but not rendered.
- `apps/admin-web/features/merchants/ProposeMerchantEditDialog.tsx` — reason-required, no-checkbox dialog pattern to mirror.
- `apps/admin-web/lib/merchants/useMerchantActions.ts` — mutation hook + `useInvalidateAfterEdit` (detail + list) pattern.
- `apps/admin-web/lib/api/merchants.ts` — admin api client (auth + JSON body + zod parse).
- `apps/admin-web/features/review/NamedGateBanner.tsx` — error-code -> copy map. `ONBOARDING_GATES_INCOMPLETE` already mapped; `ALREADY_SUBMITTED` is NOT.
- `apps/admin-web/lib/auth/session.ts` — client capability mirror (`AdminCapability` union + `ALL_SLICE1_CAPS`).

## 4. Cross-check table (expectation -> live reality -> B3 decision)

| # | Expectation | Live reality | B3 decision |
|---|---|---|---|
| 1 | Merchant submit flow exists | `submitForApproval(prisma, redis, adminId, ctx)` -> `POST /merchant/onboarding/submit` | Wrap it; do not duplicate logic |
| 2 | Admin submit-on-behalf exists | No admin route | New `POST /admin/merchants/:id/submit` |
| 3 | Submit gated by a checklist | `branch>=1` + `contractStatus==='SIGNED'` + `rmv>=2` | Reuse `computeOnboardingChecklist(prisma, merchantId)` verbatim |
| 4 | Status precondition | `REGISTERED` OR (`PENDING_APPROVAL` && `NEEDS_CHANGES`) else `ALREADY_SUBMITTED` | Identical in the shared core; covers first-submit AND resubmit |
| 5 | "Docs + branch-user" gate submit (CLAUDE.md rule #7) | NOT enforced at submit. Code checks only branch + contract + RMV; main-branch-location-confirmed is a GO-LIVE gate | Inherit live gates exactly. Record the drift as a follow-up (Section 9). Do NOT add gates in B3 |
| 6 | No admin contract-signing / impersonation | `acceptContract` resolves the caller's OWN merchant; no admin variant; contract row keyed to merchant | B3 adds NO contract path. Contract gate blocks submit until the owner signs |
| 7 | Reuse the D4 `EditActor` seam | B2.1-B2.5 all use `{ merchantId, actor }` + `resolveTargetMerchantForAdmin` + required reason | Extract `submitForApprovalCore`; merchant wrapper + admin route both call it |
| 8 | Audit `actorType:'ADMIN'` | Current submit uses fire-and-forget `writeAuditLog`, no actor | Upgrade to in-tx `writeAuditLogTx` (actorType + reason). Merchant-path non-regression pin (D2) |
| 9 | New capability | Cap registry + client mirror | `merchant:submit` in `ALL_SLICE1_CAPS` (D1 OPERATIONS) |
| 10 | Owner notifiable | `getMerchantOwner` exists | Best-effort owner-notify on admin-submit (D3) |
| 11 | Self-action-silence on fan-out | `emitMerchantSubmittedAlert` notifies all OPERATIONS+SUPER_ADMIN | Add optional `excludeAdminId` (D4) |
| 12 | Schema change | Cap = TS union; audit events exist; `event` is String; models exist | NONE expected (Section 6) |
| 13 | UI surface | No submit affordance; checklist not shown | Cap-gated submit card + dialog; extend `getMerchantDetail` read |
| 14 | B3 != approve | `approveApproval` is the separate M3/M5 actioner flow | B3 submits only; no auto-approve / go-live |
| 15 | `redis` available on the admin scope | Admin merchants routes already use `app.redis` (suspend L88, create-draft L73) | Core's `redis` param is satisfied; no new plugin wiring |
| 16 | New AppError codes needed | Reuses `MERCHANT_NOT_FOUND` / `ALREADY_SUBMITTED` / `ONBOARDING_GATES_INCOMPLETE`; AppError->HTTP-status mapping is centralized + unchanged | No new error codes |
| 17 | Suspended merchant on the admin path | `resolveTargetMerchantForAdmin` allows SUSPENDED; the core status gate rejects it | Surfaces as `ALREADY_SUBMITTED` (acceptable; not a separate code). NamedGateBanner copy kept generic to cover submitted/under-review/live/suspended |
| 18 | Owner-notify is merchant-visible today | No Merchant Portal yet (Phase 4); transactional email is dark until Phase 6 / domain gate | Write the Notification + CommunicationLog rows best-effort (forward-compat); they are NOT user-visible yet. Flagged in Section 9 so this is not mistaken for a live alert |
| 19 | Concurrent double-submit safety | `AdminApproval` has indexes but NO `@@unique(type, referenceId)`; a concurrent first-submit could create two onboarding rows | Pre-existing latent race; B3 widens the actor set but does NOT fix it (a unique index is a migration, out of scope). Deferred follow-up (Section 9) |
| 20 | Plan/spec reachable by the implementer | The Option B spec is untracked (not on main); this plan lands on a feature branch, not main | Implement B3 ON the branch carrying this plan, OR pass the plan inline to any worktree subagent. B1 lesson: untracked planning docs are invisible to worktree subagents |

## 5. Legal / account boundary (must remain merchant-owner action)

1. **No admin contract signing.** B3 adds no `acceptContractForMerchant`. The `contractStatus === 'SIGNED'` gate enforces owner-only acceptance automatically: an unsigned merchant fails `ONBOARDING_GATES_INCOMPLETE`. The merchant-side `acceptContract` (keyed to the merchant via `resolveAdminMerchant`, recording IP + `CLICK_TO_AGREE` + `tcVersion`) is the only path to a signed contract and is untouched.
2. **No merchant impersonation.** The admin acts as ADMIN: cap-gated, required reason, audited `actorType:'ADMIN'`. No merchant JWT is minted; no password is set, read, or used.
3. **No auto-approve / go-live.** B3 only sets `status -> PENDING_APPROVAL`, `onboardingStep -> SUBMITTED`, `verificationStatus -> PENDING`, and creates/reopens the `MERCHANT_ONBOARDING` AdminApproval. Claim plus go-live remain the existing actioner flow with its own re-validation (`approveApproval`), so there is no admin self-approval loop.
4. **No self-grant.** The capability is enforced server-side via `requireAdminCapability`; the admin-web mirror is UX-only.

## 6. Schema / migration statement

**None expected.** The capability is a TypeScript union member plus an array entry; the audit events (`MERCHANT_SUBMITTED_FOR_APPROVAL`, `MERCHANT_RESUBMITTED`) already exist and `AuditLog.event` is a String column; `AdminApproval`, `Notification`, `MerchantContract`, and `MerchantMembership` are existing models; owner-notify reuses the existing `MERCHANT_VERIFICATION_UPDATE` enum value. This matches every B-slice to date (all "NO schema").

**Single stop condition (D3):** if owner-notify is found to require a NEW `NotificationType` enum value (a Postgres enum migration) rather than reusing `MERCHANT_VERIFICATION_UPDATE`, STOP and present exact SQL + rollback to the owner before any implementation. Do not add a migration silently.

## 7. B3-core tasks (PR 1)

### 7.1 Capability
- `src/api/admin/capability.ts`: add `| 'merchant:submit'` to the `AdminCapability` union with an Option B B3 comment, and add `'merchant:submit'` to `ALL_SLICE1_CAPS` (D1: OPERATIONS holds it; SUPER_ADMIN holds it via the superuser short-circuit; FINANCE/CONTENT/SUPPORT do not).

### 7.2 Shared core seam `submitForApprovalCore`
In `src/api/merchant/onboarding/service.ts`, extract a core keyed by merchantId + actor:

```
submitForApprovalCore(
  prisma: PrismaClient,
  redis: Redis,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  ctx: { ipAddress: string; userAgent: string },
)
```

Logic (lifted from the current `submitForApproval` body L86-154, with the audit upgraded):
- Fetch merchant `{ status, onboardingStep, businessName }`. `!merchant` -> `MERCHANT_NOT_FOUND`.
- `isResubmit = status === 'PENDING_APPROVAL' && onboardingStep === 'NEEDS_CHANGES'`.
- `canSubmit = status === 'REGISTERED' || isResubmit`. `!canSubmit` -> `ALREADY_SUBMITTED`.
- `checklist = computeOnboardingChecklist(prisma, merchantId)` (NOT `getOnboardingChecklist(adminId)`). `!checklist.all_complete` -> `ONBOARDING_GATES_INCOMPLETE`. **Correction vs the inspection report:** keep this throw PAYLOAD-FREE (byte-identical to the live merchant path L98); do NOT attach `{ checklist }`. The admin-web dialog already holds the per-gate state from the `getMerchantDetail.submitChecklist` read (7.6 / 8.4), so the error need not carry it, and staying payload-free keeps the merchant-path error shape unchanged (stronger non-regression). Attaching `{ checklist }` as `approveApproval` does is an OPTIONAL future refinement for headless API consumers, not B3.
- `$transaction`:
  - `merchant.update` -> `status: 'PENDING_APPROVAL'`, `onboardingStep: 'SUBMITTED'`, `verificationStatus: 'PENDING'`.
  - find existing `AdminApproval` (`type: 'MERCHANT_ONBOARDING'`, `referenceId: merchantId`, select `id` + `adminUserId`); reopen (status PENDING, clear claimedById/claimedAt/actionedAt, comment "Merchant resubmitted for onboarding approval") OR create (type/status/referenceId/referenceType 'merchant', comment "Merchant submitted for onboarding approval"). Behaviour byte-identical to today.
  - **D2:** `writeAuditLogTx(tx, { entityId: merchantId, entityType: 'merchant', event: isResubmit ? 'MERCHANT_RESUBMITTED' : 'MERCHANT_SUBMITTED_FOR_APPROVAL', actorId: actor.id, actorType: actor.type, reason: actor.reason, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })` INSIDE the transaction (rolls back with state). Replaces the post-commit fire-and-forget `writeAuditLog` at L141.
  - Return `{ updated, reviewerAdminId: existing?.adminUserId ?? null }`.
- After commit, best-effort emitters (never fail the submit; both already try/catch internally):
  - First-submit: `emitMerchantSubmittedAlert(prisma, redis, alertMerchant, { excludeAdminId: actor.type === 'ADMIN' ? actor.id : undefined })` (D4).
  - Resubmit: `emitMerchantResubmittedAlert(prisma, redis, alertMerchant, reviewerAdminId)` unchanged. (Minor, implementer judgment: if `actor.type === 'ADMIN' && reviewerAdminId === actor.id`, the resubmit alert may be skipped for self-action parity. Recommended but not load-bearing; keep it a one-line guard if added.)
  - **D3 owner-notify, admin path only** (`actor.type === 'ADMIN'`): `getMerchantOwner(prisma, merchantId)`; if resolved, best-effort `notify(...)` to the owner (`recipientType: 'MERCHANT_ADMIN'`, `recipientId: owner.adminId`, in-app `MERCHANT_VERIFICATION_UPDATE`, optional email to `owner.email`) saying their business was submitted for review. Mirror the actioner `safeNotify` call sites in approvals/service.ts for the exact `NotifyInput` shape. Best-effort; log + swallow. If the existing `notify` shape cannot express a MERCHANT_ADMIN in-app row with `MERCHANT_VERIFICATION_UPDATE` without a new enum value, STOP and ask (D3 stop condition).
- Return the updated merchant.

### 7.3 Merchant wrapper stays a thin delegate (non-regression)
`submitForApproval(prisma, redis, adminId, ctx)` keeps its exact signature and:
- `resolveAdminMerchant(prisma, adminId)` (keeps `INVALID_CREDENTIALS` + `MERCHANT_SUSPENDED`).
- `return submitForApprovalCore(prisma, redis, { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } }, ctx)`.
The merchant route `POST /merchant/onboarding/submit` is untouched. The only observable merchant-path change is the D2 audit (now in-tx, now carries `actorType: 'MERCHANT_ADMIN'`); pinned as non-regression.

### 7.4 Admin route
In `src/api/admin/merchants/routes.ts`, import `submitForApprovalCore` and add:

```
POST `${prefix}/:id/submit`
  preHandler: requireAdminCapability('merchant:submit')
  body: z.object({ reason: z.string().trim().min(1) }).strict()
  id = idParam(req)
  await resolveTargetMerchantForAdmin(app.prisma, id)   // allows SUSPENDED; core's status gate yields ALREADY_SUBMITTED for non-submittable states
  return submitForApprovalCore(app.prisma, app.redis, { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason: body.reason } }, auditCtx(req))
```
The Merchant row carries no secrets (the redemptionPin lives on Branch), so returning the core result matches B2.1. A slimmer `{ id, status, onboardingStep, verificationStatus }` shape is acceptable if the implementer prefers.

### 7.5 Self-action-silence helper change (D4)
In `src/api/shared/adminNotify.ts`, extend `emitMerchantSubmittedAlert` with an optional final arg `opts?: { excludeAdminId?: string }`. After `getAlertableAdmins`, filter `admins` to drop `admin.id === opts?.excludeAdminId` before the fan-out loop. Leave the `ADMIN_OPS_ALERT_EMAIL` shared-inbox email untouched (it is not the actor). Keep the best-effort try/catch. Backward-compatible (the merchant path passes no opts).

### 7.6 Detail read extension (folds into B3-core, D7)
In `src/api/admin/merchants/service.ts` `getMerchantDetail`: add `onboardingStep` (already on the Merchant row) and a `submitChecklist` block computed via `computeOnboardingChecklist(prisma, merchantId)` (`{ branch_created, contract_signed, rmv_configured, all_complete }`), plus a derived `canSubmitOnBehalf` boolean (`status === 'REGISTERED' || (status === 'PENDING_APPROVAL' && onboardingStep === 'NEEDS_CHANGES')`) so the UI gates the card from a single server-computed source. Keep the existing TIGHT redaction (no `redemptionPin` / secrets). Update the B2.1-read response shape + its tests.

### 7.7 Backend tests + sweep
- Unit (`submitForApprovalCore`): both actors; first-submit + resubmit; each gate failure (`MERCHANT_NOT_FOUND`, `ALREADY_SUBMITTED`, `ONBOARDING_GATES_INCOMPLETE` carrying `{ checklist }`); in-tx audit rolls back with state on a forced tx failure; `actorType` + `reason` recorded.
- **Merchant-path non-regression pins:** `POST /merchant/onboarding/submit` state transitions + AdminApproval create/reopen + emitters unchanged; audit now in-tx with `actorType: 'MERCHANT_ADMIN'`.
- Admin route integration: non-holder 403 `ADMIN_CAPABILITY_DENIED`; missing/empty reason 400; suspended merchant -> `ALREADY_SUBMITTED` (resolver allows it, status gate rejects); gates-incomplete -> 400/409 with checklist; happy-path first-submit + resubmit; AdminApproval created/reopened; self-action-silence (acting admin not in the fan-out); owner-notify best-effort fires on admin path.
- `getMerchantDetail` pins: `onboardingStep` + `submitChecklist` + `canSubmitOnBehalf` present; redaction intact (no secrets).
- Blast-radius sweep: full merchant + admin + onboarding suites green (the seam refactor touches `submitForApproval`).
- `tsc --noEmit` (backend): zero NEW errors (the 4 pre-existing `tests/api/customer/savings.service.test.ts` baseline errors remain).

## 8. B3-web tasks (PR 2)

### 8.1 Capability mirror
`apps/admin-web/lib/auth/session.ts`: add `'merchant:submit'` to the `AdminCapability` union and to `ALL_SLICE1_CAPS` (OPERATIONS), matching the backend.

### 8.2 API client + schema
`apps/admin-web/lib/api/merchants.ts`: add `submit: async (id, { reason }) => POST /api/v1/admin/merchants/${id}/submit` (auth, JSON body, zod-parse the response). Extend the merchant-detail schema with `onboardingStep`, `submitChecklist`, and `canSubmitOnBehalf`.

### 8.3 Hook
`apps/admin-web/lib/merchants/useMerchantActions.ts`: add `useSubmitMerchant(merchantId)` -> `merchantsApi.submit`, `onSuccess` + `onError` both call `useInvalidateAfterEdit(merchantId)` (invalidate detail + list).

### 8.4 Submit card + checklist
On `apps/admin-web/app/(app)/merchants/[id]/page.tsx`, add a cap-gated "Submit for review" card, visible when `can('merchant:submit') && data.merchant.canSubmitOnBehalf`. Render the 3-item `submitChecklist` (branch / contract signed / 2 mandatory vouchers) with met/outstanding states. The action button "Submit for review on the merchant's behalf" is disabled when `!submitChecklist.all_complete`, listing the outstanding items. Placement: a dedicated card after the read-only header, before the Business identity card (implementer matches the existing visual rhythm; placement is a minor UI judgment). Copy makes explicit this submits on the merchant's behalf and does NOT approve or take the merchant live.

### 8.5 SubmitMerchantDialog (D5)
New `apps/admin-web/features/merchants/SubmitMerchantDialog.tsx`, mirroring `ProposeMerchantEditDialog`: reason-required textarea, NO checkbox, copy clarifying "act on behalf, not approve / impersonate", `NamedGateBanner` for `mutation.error`, "Submit for review" CTA (disabled until reason is non-empty and not pending), `onSuccess` closes + invalidates.

### 8.6 NamedGateBanner
`apps/admin-web/features/review/NamedGateBanner.tsx`: add `ALREADY_SUBMITTED` copy (e.g. "This merchant is not in a submittable state (already submitted, under review, or live)."). `ONBOARDING_GATES_INCOMPLETE` is already mapped.

### 8.7 Admin-web tests + build checks
- Card visibility/gating (cap + `canSubmitOnBehalf`); checklist render; button disabled when incomplete with outstanding items listed.
- Dialog reason-required; hook invalidates detail + list on success and error.
- Capability mirror pin for `merchant:submit`.
- `NamedGateBanner` `ALREADY_SUBMITTED` pin.
- `tsc --noEmit` clean; jest green; **`next build` (8/8)** verified in the main checkout (per the standing admin-web rule: CI's `next build` catches Next 15 prerender errors that tsc/lint/jest miss, and the worktree implementer cannot run `next build`).

## 9. Risks, additional considerations, and minor decisions (beyond the anchor list)

These were surfaced by the live-code inspection and are not in the original anchor list. They are recorded here so the implementer does not rediscover them mid-flight.

### 9.1 Risks
- **R1 Owner-notify visibility gap (D3 reality).** The owner-notify writes a `Notification` (recipientType `MERCHANT_ADMIN`) plus a `CommunicationLog` row, but there is NO merchant-facing in-app surface yet (Merchant Portal is Phase 4) and transactional email is dark until Phase 6 / the domain gate. So D3 is, today, a forward-compat record-only write: harmless and best-effort, but the merchant does not actually SEE it yet. Implement it as locked (D3), but do not describe it as a live merchant alert. If the owner wants a visible merchant alert now, that is a separate Phase 4/6 dependency, not B3.
- **R2 Concurrent double-submit.** `AdminApproval` has no `@@unique(type, referenceId)`. A race between two submitters (admin+admin, or admin+merchant) could create two `MERCHANT_ONBOARDING` rows. Pre-existing latent issue; B3 widens the actor set but must NOT fix it here (a unique partial index is a migration, out of scope). Recommended future hardening: a unique partial index on `(type, referenceId) WHERE type='MERCHANT_ONBOARDING'`. Deferred follow-up; do not add in B3.
- **R3 Existing-test realignment from the D2 audit upgrade.** Current `submitForApproval` tests may assert the post-commit fire-and-forget `writeAuditLog` (or assert no audit inside the tx). Moving the audit in-tx via `writeAuditLogTx` will require realigning those assertions (now in-tx, now carries `actorType: 'MERCHANT_ADMIN'`). This is a shared-code test fix (compare the B2.4 `resolve-on-write.test.ts` mock that gained `$transaction`), not a weakening of coverage.
- **R4 `emitMerchantSubmittedAlert` signature change.** Adding the optional `opts?: { excludeAdminId }` is backward-compatible, but any existing test asserting the exact argument list of that emitter must be updated.
- **R5 Worktree visibility of the plan/spec.** The Option B spec is untracked and this plan lands on a feature branch, so neither is on `main`. A worktree subagent implementing B3 off `main` will not see them (B1 lesson). Mitigation: implement on the branch carrying this plan, or pass the plan inline to the subagent.

### 9.2 Additional files to touch / verify
- Verify the admin plugin registration wires `adminMerchantRoutes` under `authenticateAdmin` so `req.user.sub` + `req.user.adminRole` are populated before `requireAdminCapability('merchant:submit')` runs (the existing admin merchant routes already rely on this; the new route inherits it).
- Backend tests: add/extend under `tests/api/admin/merchants/**` (admin route) and `tests/api/merchant/onboarding/**` (core + merchant-path non-regression); update any `emitMerchantSubmittedAlert` test.
- Admin-web: if a capability truth-table test exists for `session.ts` (the B2.2 memory notes one), add `merchant:submit` to it.

### 9.3 Minor / flagged decisions (implementer judgment unless the owner wants to set them)
- **M1 Admin route response shape.** Return the full updated `Merchant` (no secrets on the Merchant row; the PIN lives on Branch, matching B2.1) vs a slim `{ id, status, onboardingStep, verificationStatus }`. Recommend the slim shape for the UI's needs.
- **M2 Card when not submittable.** When `canSubmitOnBehalf` is false (PENDING_APPROVAL/UNDER_REVIEW/LIVE/SUSPENDED), hide the action. Optional nicety: show a one-line current-state hint (e.g. "Submitted, in review" / "Live") so the admin still sees state. Recommend hide-action + optional hint.
- **M3 Resubmit self-silence parity.** If `actor.type === 'ADMIN' && reviewerAdminId === actor.id`, optionally skip the resubmit alert for parity with D4. Recommended one-line guard; not load-bearing.
- **M4 Card placement / naming.** A dedicated "Submit for review" / "Onboarding" card after the read-only header; exact position matches the existing visual rhythm.

## 10. Drift recorded as a follow-up (NOT patched in B3)

**Section-B3-GATE-DRIFT:** CLAUDE.md business rule #7 lists "docs uploaded + branch user assigned" among the approval gates, but the live submit checklist enforces only `branch>=1` + `contractStatus==='SIGNED'` + `rmv>=2`; main-branch-location-confirmed is enforced at GO-LIVE (`approveApproval`), not at submit. B3 deliberately reuses the live submit checklist unchanged (no weaker path, no new gate). Whether the documented rule or the live code is the intended source of truth is a future spec decision, not a B3 change.

**Section-B3-APPROVAL-RACE (from R2):** `AdminApproval` has no `@@unique(type, referenceId)`; concurrent first-submits could create duplicate `MERCHANT_ONBOARDING` rows. Pre-existing; widened by B3's second actor class. Recommended future hardening: a unique partial index (a migration), explicitly out of B3 scope.

Add both to `project_deferred_followups_index.md` when B3 lands.

## 11. Closed-scope exclusions

NOT in B3 (held; require separate owner approval): B4 document upload, B5 voucher co-build, Merchant Portal, B1 photo-apply, PR3 branchCount, stash restore, Section-B24-TIMELINE, and any unrelated cleanup. B3 adds NO new submit gates, NO admin contract-signing path, NO auto-approve / go-live, and NO schema/migration (stop-and-ask if D3 forces a new `NotificationType`).

## 12. PR sequence

1. **B3-core** (PR 1): cap + `submitForApprovalCore` seam + admin route + D2 audit + D3 owner-notify + D4 self-action-silence + `getMerchantDetail` read extension + backend tests + blast-radius sweep.
2. **B3-web** (PR 2): capability mirror + api client/schema + `useSubmitMerchant` + submit card/checklist + `SubmitMerchantDialog` + `NamedGateBanner` mapping + admin-web tests + `next build`.

Each PR: independent review + Codex pass, CI green, before merge.
