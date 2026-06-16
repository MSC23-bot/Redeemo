# Option B B3-web — Admin Submit-on-Behalf UI (implementation plan)

- **Date:** 2026-06-16
- **Tier:** Option B slice (plan-first; owner decisions locked below before any code)
- **Status:** PLAN COMMITTED, PAUSED before implementation
- **Sequence:** B3-core SHIPPED (PR #256, merge `b40038f`) -> **B3-web (this doc)** -> B4 / B5 / Merchant Portal (held)
- **Backend reference:** `docs/superpowers/plans/2026-06-16-option-b-b3-admin-submit-on-behalf.md` (B3-core, on main)

## 1. What B3-web is

The admin-web UI for the B3-core backend. A SUPER_ADMIN or OPERATIONS admin can submit (or resubmit) a merchant's onboarding application for review on the merchant's behalf, from `/merchants/[id]`. B3-web is admin-web ONLY: it consumes the already-shipped backend route, capability, and detail fields. NO backend, Prisma, or schema (migration) changes.

The action ONLY queues/reopens review. It does NOT approve, take live, verify, accept contracts, or impersonate the merchant. Contract acceptance remains a merchant-owner action (enforced by the backend `contractStatus === 'SIGNED'` submit gate; B3-web adds no contract path).

## 2. Locked decisions

- **D-W1 invalidation:** `useSubmitMerchant` invalidates merchant detail + merchants directory + `QUEUE_KEY`, on success AND error. (Submit creates/reopens a `MERCHANT_ONBOARDING` approval, so the queue must refresh; the detail's `canSubmitOnBehalf` flips and the directory status badge changes.)
- **D-W2 placement:** the "Submit for review" card sits AFTER the read-only header and BEFORE the Business identity card.
- **D-W3 copy:** "Submit for review" vs "Resubmit for review" chosen by `onboardingStep === 'NEEDS_CHANGES'`.
- **D-W4 `ONBOARDING_GATES_INCOMPLETE` copy:** leave the shared NamedGateBanner copy unchanged (it is accurate for go-live). The card checklist (sourced from `submitChecklist`) is the submit-context UX; this code is effectively unreachable from the submit dialog because the card disables the button when gates are unmet.
- **D-W5 non-submittable state:** HIDE the card when `canSubmitOnBehalf` is false (no state hint).

Plan anchors (also locked): add `merchant:submit` to the admin-web capability mirror + `ALL_SLICE1_CAPS`; add `submitChecklist` + `canSubmitOnBehalf` to `merchantDetailSchema.merchant`; add `merchantsApi.submit(id, { reason })`; add `useSubmitMerchant`; add `SubmitMerchantDialog` (mandatory reason, NO checkbox, legal-boundary copy, NamedGateBanner); add the Submit/Resubmit card; card visible only when `can('merchant:submit') && canSubmitOnBehalf`; card checklist shows ONLY `branch_created` / `contract_signed` / `rmv_configured` (NO docs-uploaded or branch-user gates, §B3-GATE-DRIFT); button disabled when `!submitChecklist.all_complete` with unmet rows visible; add `ALREADY_SUBMITTED` to NamedGateBanner.

## 3. Inspected files / components / hooks

- `apps/admin-web/app/(app)/merchants/[id]/page.tsx` — `OpenDialog` state machine; card order (header -> Business identity (B2.5) -> Website -> Business registration (B2.2) -> Category (B2.3) -> Branches); `can(...)` gating; `onDialogSuccess` = `setDialog(null)` + `refetch()`.
- `apps/admin-web/lib/api/merchants.ts` — `merchantsApi` + `merchantDetailSchema`. The `merchant` object is a plain `z.object` (NO `.passthrough()`), so it STRIPS unknown keys: `submitChecklist`/`canSubmitOnBehalf` are silently dropped until added to the schema. `editAckSchema = z.object({ id }).passthrough()` is the minimal-parse precedent.
- `apps/admin-web/lib/merchants/useMerchantActions.ts` — `useInvalidateAfterEdit(merchantId)` (detail + `MERCHANTS_LIST_KEY`); each mutation invalidates on success AND error. `QUEUE_KEY` is already imported here (from `@/lib/queue/useQueue`).
- `apps/admin-web/lib/merchants/useMerchantDetail.ts` — `merchantDetailQueryKey(id)`, `useMerchantDetail(id, enabled)`.
- `apps/admin-web/lib/auth/session.ts` — `AdminCapability` union + `ALL_SLICE1_CAPS` mirror; does NOT yet include `merchant:submit`. `hasCapability` short-circuits SUPER_ADMIN.
- `apps/admin-web/features/review/NamedGateBanner.tsx` — `CODE_MESSAGES` map + `GATE_LABELS` (the 3 gate labels) + `failedChecklistGates` (reads `error.body.error.checklist`). `ONBOARDING_GATES_INCOMPLETE` mapped (approval-context copy + payload-driven unmet-list); `ALREADY_SUBMITTED` NOT mapped.
- `apps/admin-web/features/merchants/ProposeMerchantEditDialog.tsx` — the closest dialog (reason-only, NO checkbox, shared `Dialog` primitive, NamedGateBanner inside, success/cancel callbacks). The template for `SubmitMerchantDialog`.
- Keys: `MERCHANTS_LIST_KEY = ['admin-merchants']` (`useMerchantsList.ts`); `QUEUE_KEY = ['admin-queue']` (`useQueue.ts`).
- Test layout: `features/merchants/__tests__/*.test.tsx`, `app/(app)/merchants/[id]/__tests__/page.test.tsx`, `features/review/__tests__/NamedGateBanner.test.tsx`, `lib/merchants/__tests__/useMerchantActions.test.tsx`, `lib/auth/__tests__/session.test.ts`, `lib/merchants/__tests__/useMerchantDetail.test.tsx`.

## 4. Cross-check table (expectation -> live reality -> B3-web decision)

| # | Expectation | Live reality | B3-web decision |
|---|---|---|---|
| 1 | Detail payload exposes submit readiness | Backend returns `submitChecklist` + `canSubmitOnBehalf`; `merchantDetailSchema.merchant` (plain `z.object`) STRIPS them | Add both to the schema (load-bearing; without it the UI gets `undefined`) |
| 2 | API client can submit | No `submit` method | Add `merchantsApi.submit(id, { reason })` -> `POST /admin/merchants/:id/submit`; parse `{ id, status, onboardingStep, verificationStatus }` |
| 3 | Mutation hook | `useInvalidateAfterEdit` = detail + directory only | Add `useSubmitMerchant`; invalidate detail + directory + `QUEUE_KEY` (D-W1) |
| 4 | Capability mirror | `merchant:submit` absent | Add to the client union + `ALL_SLICE1_CAPS` (OPERATIONS) |
| 5 | Card affordance | No submit card | Add a card gated `can('merchant:submit') && canSubmitOnBehalf` (D-W2 placement) |
| 6 | Checklist shown to admin | NamedGateBanner extracts checklist from the ERROR payload | C1 throw is PAYLOAD-FREE -> the CARD renders the checklist from `submitChecklist`, not the error (D-W4) |
| 7 | Error copy | `ALREADY_SUBMITTED` unmapped; `ONBOARDING_GATES_INCOMPLETE` = "Cannot go live" | Add `ALREADY_SUBMITTED`; leave `ONBOARDING_GATES_INCOMPLETE` unchanged (D-W4) |
| 8 | Reason required, no checkbox | B2.5 ProposeMerchantEditDialog precedent | Reason-only `SubmitMerchantDialog` (D5 from B3-core) |
| 9 | No new gates (§B3-GATE-DRIFT) | Card derives from `submitChecklist` (branch + contract + RMV) | Card shows ONLY those 3 gates |
| 10 | Resubmit affordance | `canSubmitOnBehalf` true for REGISTERED AND PENDING_APPROVAL+NEEDS_CHANGES | Submit/Resubmit copy by `onboardingStep === 'NEEDS_CHANGES'` (D-W3) |
| 11 | Non-submittable state | `canSubmitOnBehalf` false for under-review / ACTIVE-LIVE / SUSPENDED | Hide the card (D-W5) |
| 12 | Backend / Prisma changes | B3-core already shipped | NONE — admin-web only |

## 5. Card placement + visibility

- **Component:** a dedicated `apps/admin-web/features/merchants/SubmitForReviewCard.tsx` (the checklist + disabled-state logic earns its own testable component; the simpler inline cards stay inline). The page mounts it after the header, before the Business identity card.
- **Visibility:** render only when `can('merchant:submit') && data.merchant.canSubmitOnBehalf` (D-W2 + D-W5). Hidden otherwise.
- **Copy (D-W3):** title + CTA "Submit for review" by default; "Resubmit for review" when `data.merchant.onboardingStep === 'NEEDS_CHANGES'`. (`onboardingStep` is already on the schema, no schema change for it.)
- **Body:** the 3-gate checklist (see Section 8) + the action button. A one-line subtitle states the action queues for review and is on the merchant's behalf.

## 6. SubmitMerchantDialog — fields + copy

`apps/admin-web/features/merchants/SubmitMerchantDialog.tsx`, mirroring ProposeMerchantEditDialog; opened from the card only when `submitChecklist.all_complete`:
- **One field:** `reason` (textarea, mandatory; label "Reason (recorded in the audit log)"). NO confirmation checkbox.
- **Props:** `merchantId`, `isResubmit: boolean` (drives CTA copy to match the card), `onSuccess`, `onCancel`.
- **Legal-boundary copy (locked, must be explicit):** "This submits the merchant's application for review on their behalf. It does NOT approve the merchant, take them live, verify them, or accept their contract. The merchant's contract acceptance and the admin review are separate steps."
- **CTA:** "Submit for review" / "Resubmit for review" (-> "Submitting..." while pending). Disabled until `reason.trim()` is non-empty and not pending.
- **Error:** `NamedGateBanner` inside the dialog (`mutation.error`).
- **Success:** `onSuccess()` (page closes the dialog + `refetch()`).
- Uses the shared `Dialog` primitive (focus-trap, Escape + scrim close, focus-restore).

## 7. Capability gating

Add `'merchant:submit'` to the client `AdminCapability` union AND `ALL_SLICE1_CAPS` in `session.ts` (OPERATIONS holds it; SUPER_ADMIN via the short-circuit; FINANCE/CONTENT/SUPPORT do not), with a comment aligned to the backend `src/api/admin/capability.ts`. The card + button gate on `can('merchant:submit')`. The backend `requireAdminCapability('merchant:submit')` remains the real enforcement; the client gate is UX only.

## 8. How submitChecklist + canSubmitOnBehalf control state

- **`canSubmitOnBehalf`** gates the whole card's existence (with the cap). It encodes the backend's submittable-state gate (REGISTERED first-submit OR PENDING_APPROVAL+NEEDS_CHANGES resubmit), so the card never shows for a non-submittable merchant.
- **`submitChecklist`** drives the in-card checklist: 3 rows, each met (Check icon) or unmet (a non-color-only indicator + text, for accessibility):
  - `branch_created` -> "At least one branch"
  - `contract_signed` -> "A signed contract"
  - `rmv_configured` -> "2 mandatory RMV vouchers"
  Labels reuse `GATE_LABELS` from NamedGateBanner. To keep ONE source of truth, EXPORT `GATE_LABELS` from `NamedGateBanner.tsx` and import it in the card (preferred over duplicating the 3 strings). The "Submit for review" button is DISABLED when `!submitChecklist.all_complete`, with the unmet rows visibly marked so the admin sees what is blocking. This realises C1: per-gate state comes from the detail read, not an error payload (why B3-core kept the throw payload-free).
- **Self-heal on stale race:** the hook invalidates on error too, so an `ALREADY_SUBMITTED` / `ONBOARDING_GATES_INCOMPLETE` race refetches the detail, the card updates (`canSubmitOnBehalf` may flip false -> card hides; or `submitChecklist` updates -> button disables).

## 9. Error handling via NamedGateBanner

- **Add `ALREADY_SUBMITTED`** to `CODE_MESSAGES`: "This merchant is not in a submittable state (already submitted, under review, or live). The page has refreshed." (Also covers the SUSPENDED-on-admin-path case, which the backend surfaces as `ALREADY_SUBMITTED`.)
- `MERCHANT_NOT_FOUND` already mapped.
- `ONBOARDING_GATES_INCOMPLETE` (D-W4): left unchanged. Payload-free for submit, so no unmet-gate list renders; the card prevents reaching the dialog when gates are unmet, so this surfaces only on a rare stale race, where the directionally-correct shared message plus the on-error refetch are acceptable.

## 10. File-by-file tasks

1. `apps/admin-web/lib/auth/session.ts` - add `'merchant:submit'` to the union + `ALL_SLICE1_CAPS`.
2. `apps/admin-web/lib/api/merchants.ts` - add `submitChecklistSchema` (`{ branch_created, contract_signed, rmv_configured, all_complete }` booleans) + `submitChecklist` + `canSubmitOnBehalf: z.boolean()` to `merchantDetailSchema.merchant`; add `SubmitOnBehalfInput { reason: string }` + `submitOnBehalfResponseSchema` (`{ id, status, onboardingStep, verificationStatus }`, drift-resilient enums) + `merchantsApi.submit(id, input)`.
3. `apps/admin-web/lib/merchants/useMerchantActions.ts` - add `useSubmitMerchant(merchantId)` + a `useInvalidateAfterSubmit` closure (detail + `MERCHANTS_LIST_KEY` + `QUEUE_KEY`); invalidate on success AND error.
4. `apps/admin-web/features/review/NamedGateBanner.tsx` - add `ALREADY_SUBMITTED` to `CODE_MESSAGES`; EXPORT `GATE_LABELS`.
5. `apps/admin-web/features/merchants/SubmitForReviewCard.tsx` (new) - checklist + Submit/Resubmit button (disabled when `!all_complete`), testIDs.
6. `apps/admin-web/features/merchants/SubmitMerchantDialog.tsx` (new) - reason-only dialog (Section 6).
7. `apps/admin-web/app/(app)/merchants/[id]/page.tsx` - add `OpenDialog` variant `{ kind: 'submit' }`; mount `SubmitForReviewCard` (gated) after the header, before Business identity, wiring the button to `setDialog({ kind: 'submit' })`; mount `SubmitMerchantDialog` (passing `isResubmit` from `onboardingStep === 'NEEDS_CHANGES'`).

## 11. Additional findings / corrections / minor decisions (beyond the anchors)

- **F1 (schema strip):** the plain-`z.object` strip of `submitChecklist`/`canSubmitOnBehalf` is the one genuinely load-bearing change; a schema regression pin should assert they are parsed (not stripped).
- **F2 (GATE_LABELS reuse):** export `GATE_LABELS` from NamedGateBanner so the card and the banner share one label source (vs duplicating 3 strings). Minor.
- **F3 (a11y):** checklist met/unmet must not rely on colour alone (icon + text). Pin in the card test.
- **F4 (submit response schema):** parse the slim `{ id, status, onboardingStep, verificationStatus }` with drift-resilient enums (mirror `merchantSummarySchema`), even though the UI relies on invalidation, so contract drift surfaces clearly.
- **F5 (B2.5 queue-invalidation gap, NOT fixed here):** B2.5 propose-edit also creates a queue item but only invalidates detail+directory. B3-web does the correct thing (also invalidates QUEUE) but does NOT retro-fix B2.5 (out of scope; note only).

## 12. Test plan

- `features/merchants/__tests__/SubmitMerchantDialog.test.tsx` (new): reason-required (button disabled until non-empty), submit calls the hook with `{ reason }`, NamedGateBanner on error, `onSuccess` on success, legal-boundary copy present, Submit vs Resubmit CTA by `isResubmit`.
- `features/merchants/__tests__/SubmitForReviewCard.test.tsx` (new): checklist renders met/unmet (icon+text, not colour-only); button disabled when `!all_complete` with unmet rows visible; enabled + opens dialog when `all_complete`; Submit vs Resubmit copy by `onboardingStep`.
- `app/(app)/merchants/[id]/__tests__/page.test.tsx` (extend): card visible only when `can('merchant:submit') && canSubmitOnBehalf`; hidden for SUPPORT (no cap) and when `canSubmitOnBehalf` false; placement after header / before Business identity.
- `lib/merchants/__tests__/useMerchantActions.test.tsx` (extend): `useSubmitMerchant` invalidates detail + directory + queue on success AND error.
- `features/review/__tests__/NamedGateBanner.test.tsx` (extend): `ALREADY_SUBMITTED` mapping pin.
- `lib/auth/__tests__/session.test.ts` (extend): `merchant:submit` held by OPERATIONS + SUPER_ADMIN, not FINANCE/CONTENT/SUPPORT.
- `lib/merchants/__tests__/useMerchantDetail.test.tsx` (extend) or a schema test: `merchantDetailSchema` parses `submitChecklist` + `canSubmitOnBehalf` (regression pin against the strip).

## 13. Build checks

- admin-web `tsc --noEmit` clean.
- admin-web jest green.
- **`next build` (8/8) verified in the MAIN checkout** (CI's `next build` catches Next 15 prerender errors that tsc/lint/jest miss; a worktree implementer cannot run `next build` because of the globals.css artifact, so the controller verifies in the main checkout before merge).

## 14. Legal / account boundary (keep explicit)

- B3-web queues/reopens review ONLY. It does NOT approve, go live, verify, accept contracts, or impersonate the merchant.
- Contract acceptance remains a merchant-owner action; the backend `contractStatus === 'SIGNED'` gate enforces it, and B3-web adds NO contract path.
- The card surfaces ONLY the live backend gates (branch + contract + RMV); no docs-uploaded or branch-user gates (§B3-GATE-DRIFT preserved).
- The dialog copy states the boundary explicitly (Section 6).

## 15. Schema / migration statement

NONE. B3-web is admin-web only. The only "schema" touched is the admin-web client-side Zod `merchantDetailSchema` (TypeScript), NOT Prisma. No backend route, capability, or DB change (B3-core shipped all of those). If implementation ever appears to need a backend change, STOP and ask.

## 16. Closed-scope exclusions

Confined to `apps/admin-web/**` (capability mirror + api client/schema + `useSubmitMerchant` + `SubmitForReviewCard` + `SubmitMerchantDialog` + page wiring + NamedGateBanner copy + tests). NOT in B3-web: B4 doc upload, B5 voucher co-build, Merchant Portal, B1 photo-apply, PR3 `branchCount`, stash restore, §B24-TIMELINE, the B2.5 queue-invalidation retro-fix (F5), the §B3-GATE-DRIFT / §B3-APPROVAL-RACE backend follow-ups, and any unrelated cleanup.

## 17. PR

Single PR (admin-web only): the 7 file-by-file tasks + the test files. Independent review + Codex pass + CI green (incl. `next build`) before a SHA-bound merge. Do NOT merge without owner sign-off.
