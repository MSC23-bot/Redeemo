# Design spec: nullable-clear for saved voucher photo (imageUrl) and end date (expiryDate)

Status: DRAFT design spec for owner approval. IMPLEMENTATION IS OWNER-GATED.
Date: 2026-07-05. Provenance: anchors read at `origin/main` @ `8621c9a1`, re-verified through `2945bf78`; `git diff --name-only 8621c9a1..2945bf78` touches only two governance docs and one staff test file, none of the source anchors below.
Companion implementation plan: `docs/superpowers/plans/2026-07-05-voucher-nullable-clear-contract.md` (file-by-file changes, LOC, test file targets). This spec owns the durable design semantics; the plan owns execution.
Why a spec exists: this changes a customer-facing PATCH contract and permits deletion of saved values, which the project workflow classifies as durable-design work (spec + plan), not a plain Tier-1 fix.

## 1. Problem

Merchants who saved a wrong voucher photo or end date have no in-product way to remove them. `Voucher.imageUrl` and `Voucher.expiryDate` are already nullable columns (`prisma/schema.prisma:1080,1082`); the block is layered: the PATCH Zod rejects explicit null (`src/api/merchant/voucher/routes.ts:49-50`), and the builder UI was deliberately shipped honestly-constrained in PR #366 (replace-only photo; locked end-date toggle) rather than smuggling a contract change.

## 2. Contract semantics (design decision D1 - owner approval required)

On `PATCH /api/v1/merchant/vouchers/:id`, independently for each of `imageUrl` and `expiryDate`:

| Field state in the request | Semantics | Persisted effect |
|---|---|---|
| Omitted | preserve | column untouched |
| Present with explicit `null` | clear | column set to NULL |
| Present with a valid value | replace | column set to that value |
| Present with an invalid non-null (malformed URL / malformed datetime) | reject | 400 VALIDATION_ERROR; nothing written |

- **Independence rule (hard):** `imageUrl` and `expiryDate` are evaluated by two fully separate presence checks, backend and frontend. No shared conditional or helper couples them. This rule exists because the originating proposal contained a real coupled-field snippet defect (`expiryDate` gated on `state.imageUrl`). Verification pins independence in both directions: clearing one while the other retains its saved value, for each field.
- Rationale for explicit-null over alternatives: omission cannot mean clear (it must keep meaning preserve for every existing partial-PATCH caller); a dedicated `clearImageUrl: true` flag doubles the surface and drifts from the JSON-merge-patch convention already precedented in this codebase (the profile PATCH documents "Nulls clear a value", `apps/merchant-web/lib/api/profile.ts` MerchantProfileUpdateBody comment).

## 3. Create versus update

Today CREATE rejects explicit null exactly like PATCH does (`baseVoucherFields` is `.optional()` only, shared by both schemas). Because the proposed widening lands on that shared shape, CREATE will also start accepting explicit null once this ships. Design decision: create-with-null is DEFINED as identical to create-with-omission (a new voucher has no photo/date by default); the equivalence is pinned by a dedicated test rather than assumed. The alternative (forking the create/update schemas so only PATCH widens) was rejected as complexity without behavioural difference.

## 4. Edit boundary: DRAFT-only, no approval interaction

Merchant PATCH is gated by `EDITABLE_STATUSES = ['DRAFT']` (`src/api/merchant/voucher/service.ts:14,378-380`). Admin approval actions require `PENDING_APPROVAL` (`src/api/admin/approvals/voucherApprover.ts`). The statuses are mutually exclusive enum values, so a clear can never touch a submitted, approved-waiting, ACTIVE, or decided voucher, and no re-approval logic is designed or needed. The clear inherits every existing edit guard unchanged (tenant resolution, VOUCHER_NOT_EDITABLE, allow-list).

## 5. Frontend three-state representation

`BuilderState.imageUrl` / `.expiryDate` widen to `string | null | undefined`:
- `undefined`: never set / no saved baseline (create or duplicate mode)
- `string`: saved baseline or in-session value
- `null`: explicit clear of a saved baseline (edit mode only)

The always-resend mechanic is retained by design: an edit resends current unchanged values; explicit null is the only clear signal. UI: the saved-photo branch gains a real Remove control (`DayTwoBuilder.tsx:283-318` replaces the static honest note); the end-date toggle unlocks (`BuilderFields.tsx:311-343`, `lockEndDateRemoval` retired end-to-end); untick sends `null` when `savedExpiryDate` exists, `undefined` otherwise. End-date UI stays TIME_LIMITED-only (design decision D2 - the control exists only in `TimeLimitedFields` today; extending it to other types is a separate product decision). Duplicate mode has no saved baseline and keeps its existing free-removal semantics.

## 6. Saved-value deletion consequences (customer-facing)

Deleting a saved value can only occur on a DRAFT voucher (never customer-visible mid-flight), and NULL is already a first-class state on every read path:
- Redemption guard treats null expiry as never-expires (`src/api/redemption/service.ts:96-98` null-guarded).
- Customer favourites bucketing and Voucher Detail expired-first derivation are `if (expiryDate && ...)` guarded (verified in the plan cross-check).
- REUSABLE D44 `cooldownExtendsPastExpiry` short-circuits to false on null expiry: the customer sees the normal cooldown countdown instead of the expiry-edge message. Accepted, documented degrade - not a break.
- Null imageUrl renders the existing no-photo treatment on customer tiles (nullable from day one).
- TIME_LIMITED availability is window-driven (`availabilityWindows`); `expiryDate` is a separate general hard-expiry, so clearing it does not alter window behaviour.
No deletion is destructive beyond the single column: no cascade, no history mutation, audit remains the standard voucher-update audit path.

## 7. RMV / flagship non-interference

The RMV lane writes only the `merchantFields` JSON bag on live edits (`service.ts:755-791`) and promotes strings once at submit (`service.ts:873-877`); it never performs a top-level nullable clear and is explicitly out of scope. The implementation must show a zero diff on `updateRmvVoucherCore` / `submitRmvVoucherCore`.

## 8. Rollout ordering, rollback, compatibility

- **Backend-first or same-release ONLY.** The current backend Zod rejects explicit null, so frontend clear controls shipped ahead of the schema change would 400. The reverse is safe: the widened schema is a strict superset and the current frontend never sends null. One PR carrying both is the recommended shape.
- Rollback = revert; no migration, no flag, no env change. Vouchers cleared while live simply hold NULL, which every reader already handles.

## 9. Verification design (mutation-resistant)

- Backend pins assert the exact shape handed to `prisma.voucher.update` (null present vs key absent vs Date), not just HTTP codes - the null-vs-undefined Prisma distinction is the load-bearing mechanism.
- Cross-field independence pinned both directions (clear imageUrl, expiryDate retained; clear expiryDate, imageUrl retained).
- Negative pins: invalid non-null still 400s (nullable must not loosen format validation); non-DRAFT clear still VOUCHER_NOT_EDITABLE; RMV lane unchanged.
- Frontend pins assert the WIRE payload or rendered DOM, never internal state; the PR #366 locked-behaviour tests flip rather than being deleted (the lock test becomes the unlock test).
- Consumer audit: every non-test consumer of `state.imageUrl` / `state.expiryDate` (builderModel 6 refs, DayTwoBuilder 3, BuilderFields 2, BuilderScore 1 - counted at provenance SHA) is checked for null-handling during implementation.

## 10. Source-to-design cross-check table

| Design element | Source anchor | Verified |
|---|---|---|
| Columns already nullable, no migration | `prisma/schema.prisma:1080,1082` | yes |
| Zod is the sole ingress blocker | `routes.ts:49-50`; `updateVoucherSchema` `.partial()` `:103-105` | yes |
| Service allow-list presence-based; expiryDate truthy line rewritten for explicitness | `service.ts:396-400` | yes |
| Create-params TS widening required | `service.ts:285-286` | yes (gap found during adjudication, absent from the original proposal) |
| DRAFT-only edit gate | `service.ts:14,378-380` | yes |
| Admin lane mutually exclusive | `voucherApprover.ts` PENDING_APPROVAL gate | yes |
| Honest-constraint UI being replaced | `DayTwoBuilder.tsx:283-318`; `BuilderFields.tsx:311-343` | yes |
| Three-state payload coercion sites | `builderModel.ts:238-239,345-348` | yes |
| Null-safe read paths (redemption, favourites, detail, REUSABLE D44) | `redemption/service.ts:96-98`; `useReusable.ts`; favourites bucketing | yes (plan §12) |
| Profile-PATCH null-clears precedent | `lib/api/profile.ts` update-body comment | yes |
| Coupled-field defect codified as independence rule | originating proposal §5 snippet | yes - REAL defect, rule in §2 |

## 11. Open owner decisions (unapproved; do not implement)

1. D1: present-with-null = clear contract (this spec §2).
2. D2: end-date clearing UI stays TIME_LIMITED-only.
3. D3: deletion of the two obsolete constraint-copy strings ("A saved photo can be replaced, not removed, for now." / "A saved end date can be changed, not removed, for now.").

Codex has recommended approving all three once this corrected spec + plan pass review; that recommendation is recorded but is NOT owner approval. Implementation stays blocked until the owner approves explicitly.
