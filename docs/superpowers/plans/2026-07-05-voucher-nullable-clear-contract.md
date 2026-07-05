# Voucher nullable-clear contract: saved photo (imageUrl) + end date (expiryDate)

Status: DRAFT - implementation plan for owner approval. IMPLEMENTATION IS OWNER-GATED: do not build until the owner explicitly approves the companion spec + this plan.
Companion design spec: `docs/superpowers/specs/2026-07-05-voucher-nullable-clear-design.md` (durable design semantics; this plan carries the implementation detail).
Date: 2026-07-05. Provenance: every anchor was read from source at `origin/main` @ `8621c9a1`; re-verified through `fd8e80b6` (the PR base) and `2945bf78` (current main at correction time). Proof: `git diff --name-only 8621c9a1..2945bf78` touches ONLY `docs/PROJECT-STATE.md`, the Merchant roadmap, and `apps/merchant-web/app/(app)/staff/__tests__/page.remove-confirm.test.tsx` - none of this plan's source anchors (voucher routes/service, builder components, voucher API client, prisma schema, redemption service) changed in either range, so all file:line citations remain byte-accurate.
Tier: 1 (bounded change inside the existing custom-voucher DRAFT-edit lane), documented at Tier-2 rigour because it widens a PATCH contract and enables deletion of saved values.
Predecessor record: `docs/superpowers/plans/2026-07-04-merchant-vouchers-v1-builder-parity.md` (PR #366) shipped the honestly-constrained UI and recorded this contract change as the gated follow-up. The roadmap Vouchers row carries the same recorded follow-up.

## 0. Problem statement

Both columns are already nullable in Prisma (`prisma/schema.prisma:1080` `imageUrl String?`, `:1082` `expiryDate DateTime?`), but a merchant can never clear a saved value:

1. Zod ingress rejects explicit null: `src/api/merchant/voucher/routes.ts:49-50` `imageUrl: z.string().url().optional()`, `expiryDate: z.string().datetime().optional()` (inside `baseVoucherFields`, shared by `createVoucherSchema` and `updateVoucherSchema = z.object(baseVoucherFields).partial()` at `routes.ts:103-105`).
2. The service allow-list copy is presence-based and already null-safe (`service.ts:396-399` `if (key in data) safe[key] = data[key]`), but the follow-up conversion `service.ts:400` `if (data.expiryDate) safe.expiryDate = new Date(...)` is truthy-guarded: correct by accident for null (the loop already copied null; the guard merely skips conversion), which is too fragile to be the contract.
3. The frontend never produces null by design: `DayTwoBuilder.tsx:283-318` (saved photo: replace-only + honest note), `BuilderFields.tsx:311-343` (`lockEndDateRemoval` locked toggle + note), `builderModel.ts:238-239` (`state.imageUrl || undefined`, `normalizeExpiryDate(state.expiryDate || undefined)` - falsy coerced to omission).

No migration is required. No new re-approval interaction exists: merchant edits are DRAFT-only (`EDITABLE_STATUSES = ['DRAFT']`, `service.ts:14`, enforced `service.ts:378-380`), and admin approval actions require `PENDING_APPROVAL` - mutually exclusive statuses by construction. `expiryDate` is a general hard-expiry field (redemption guard `src/api/redemption/service.ts:96-98` runs for every type), NOT the TIME_LIMITED window mechanism (`useTimeLimited` never references it; windows are `availabilityWindows`).

## 1. Contract semantics (the heart of the change)

For `imageUrl` and `expiryDate` on `PATCH /api/v1/merchant/vouchers/:id`:

| Request field state | Meaning | Persisted effect |
|---|---|---|
| Key omitted | preserve | column untouched (`safe` lacks the key; Prisma skips) |
| Key present, explicit `null` | CLEAR | column set to NULL |
| Key present, valid value | replace | column set to the new value |
| Key present, invalid non-null (bad URL / bad datetime) | reject | 400 VALIDATION_ERROR, unchanged (existing behaviour, must not loosen) |

Non-negotiable rule (proposal defect guard): `imageUrl` and `expiryDate` are decided by two fully independent presence checks. The Sonnet proposal's illustrative `toCreatePayload` snippet gated `expiryDate` on `state.imageUrl` (a self-flagged copy-paste hazard). No shared conditional, no shared helper that couples the two fields; each field gets its own test asserting it clears while the OTHER retains its saved value.

## 2. Backend changes

- `routes.ts` `baseVoucherFields`: `imageUrl: z.string().url().nullable().optional()`, `expiryDate: z.string().datetime().nullable().optional()`. Affects create and update (shared shape kept deliberately; see §3).
- `service.ts` `updateVoucher`: replace the truthy line 400 with an explicit presence branch: `if ('expiryDate' in data) safe.expiryDate = data.expiryDate == null ? null : new Date(data.expiryDate as string)`. `imageUrl` needs no service change (presence copy already correct); the explicit branch exists so the clear path is deliberate, not incidental.
- `service.ts:285-286` create-params type (`imageUrl?: string`, `expiryDate?: string`): widen to `string | null` so the route-to-service TS contract matches Zod. (Missed by the proposal's file list; found in this pass.)
- Create path behaviour needs zero logic change: `service.ts:331` `imageUrl: data.imageUrl` passes null through to a nullable column on create (identical to omission); `service.ts:332` truthy-guard maps null to `undefined` (identical to omission). Pinned by a test, not assumed.

## 3. Create vs update behaviour

Create accepts explicit null and treats it exactly like omission (a new voucher has no photo/date by default). Rationale for not forking the Zod shape: one shared `baseVoucherFields` stays simple; the create-with-null = create-with-omit equivalence is pinned by a dedicated test. Update follows the §1 table strictly.

## 4. Frontend three-state representation

`BuilderState.imageUrl` / `.expiryDate` widen from `string | undefined` to `string | null | undefined`:

- `undefined` = never set / untouched-empty (create mode, or no saved baseline)
- `string` = saved baseline or in-session value
- `null` = EXPLICIT clear of a saved baseline (edit mode only)

Changes: `builderModel.ts` state fields (`:53,58`) + `toCreatePayload` (`:238-239`) become two independent expressions - `imageUrl: state.imageUrl === null ? null : (state.imageUrl || undefined)` and `expiryDate: state.expiryDate === null ? null : normalizeExpiryDate(state.expiryDate || undefined)`; `normalizeExpiryDate` widens to pass null through (`if (v === null) return null`); `DayTwoBuilder.tsx` setters (`:163,170`) widen to accept null.

## 5. Saved-photo removal (UI)

`DayTwoBuilder.tsx:283-318`: the saved-baseline branch (currently static note "A saved photo can be replaced, not removed, for now.") becomes a real Remove-photo control calling `setImageUrl(null)`. The session-upload removal path (revert to saved baseline) is UNCHANGED. The removal-constraint comment block updates to describe the working contract. The retired copy string is deleted after a repo-wide grep confirms single use.

## 6. Saved-end-date removal (UI)

`BuilderFields.tsx` `TimeLimitedFields`: drop `disabled={lockEndDateRemoval}` and the locked note ("A saved end date can be changed, not removed, for now."); remove the `lockEndDateRemoval` prop end-to-end (`BuilderFields.tsx:45,222,319,338-342` + `DayTwoBuilder.tsx:270`). Untick semantics: `null` when `state.savedExpiryDate` exists (edit with a real saved value), `undefined` otherwise (create/duplicate) - mirrors the photo distinction.

SCOPE LOCK: end-date UI exists only inside `TimeLimitedFields` today; this plan does NOT add end-date controls to the other 6 voucher types. Extending it is a separate product decision (recorded as an open owner call, §13).

Type interactions verified: clearing `expiryDate` on TIME_LIMITED has zero effect on window logic; on REUSABLE the D44 `cooldownExtendsPastExpiry` flag short-circuits to false - a safe degrade (customer sees the normal cooldown countdown instead of the expiry-edge message). No type-conditional guard, no new error code.

## 7. Edit + duplicate hydration

`fromDetail` (`builderModel.ts:345-348`) seeds `imageUrl`/`savedImageUrl`/`expiryDate`/`savedExpiryDate` via `?? undefined` - a DB null hydrates as `undefined` (correct: nothing saved, nothing to clear). Duplicate mode has no `voucherId`, therefore no saved baseline and no clear semantics; it keeps today's free removal (omission on CREATE genuinely means none). The always-resend mechanic (an edit resends current unchanged values rather than omitting them) is deliberately preserved; explicit null is the ONLY clear signal.

## 8. Consumers of the widened nullable state (audit, this pass)

Direct `state.imageUrl`/`state.expiryDate` consumers outside tests: `builderModel.ts` (6 refs), `DayTwoBuilder.tsx` (3), `BuilderFields.tsx` (2), `BuilderScore.tsx` (1). Implementation must audit each render/compute site for null-handling (falsy checks already treat null like undefined at most sites; the audit proves it rather than assumes it). Wire types: `apps/merchant-web/lib/api/voucher.ts` `CreateVoucherPayload.imageUrl/expiryDate` widen to `string | null`; `UpdateVoucherPayload = Partial<CreateVoucherPayload>` inherits.

## 9. RMV / flagship non-interference

`updateRmvVoucherCore` (`service.ts:755-791`) writes ONLY `merchantFields` (the JSON bag), never the top-level columns - no clear-blocker exists there (plain object-key semantics). `submitRmvVoucherCore`'s one-shot promotion (`service.ts:873-877`) promotes strings only, at submit time. This plan changes NEITHER function; pre-merge diff review confirms zero RMV-lane changes.

## 10. Rollback + compatibility

- Backward compatible both directions: the widened Zod schema is a strict superset (current frontend never sends null); the old frontend against the new backend is unchanged behaviour.
- Deploy order: backend-first or same-release ONLY (CodeRabbit #370 finding, accepted). The widened Zod schema is backward compatible with the old frontend, but the reverse is NOT order-free: a new frontend sending explicit null to the current backend fails the PATCH Zod validation (`routes.ts:49-50` rejects null) with a 400. The frontend clear controls must never ship ahead of the backend schema change; one PR shipping both is the recommended shape.
- Rollback = revert the PR; no data migration, no flag, no env change. Vouchers cleared while the feature was live simply hold NULL, which every read path already handles as first-class "no photo / no expiry" (favourites bucketing, Voucher Detail D4 expired-first derivation, redemption guard - all `if (expiryDate && ...)` guarded).

## 11. Test plan (contract, UI, adversarial)

Backend (`tests/api/merchant/voucher.test.ts` extensions):
1. PATCH `{ imageUrl: null }` on DRAFT with saved photo: 200; `prisma.voucher.update` receives `data.imageUrl === null` AND no `expiryDate` key (independence pin).
2. PATCH `{ expiryDate: null }` on DRAFT with saved date: 200; update receives `data.expiryDate === null` (literal null, not a Date, not "null") AND no `imageUrl` key (independence pin, mirror of 1).
3. PATCH `{ title }` only: update data lacks both keys entirely (omission = preserve, at the Prisma-arg level).
4. PATCH with real replacement values: still updates (regression contrast).
5. PATCH `{ imageUrl: 'not-a-url' }` / bad datetime: still 400 (nullable must not loosen non-null validation).
6. CREATE with `{ imageUrl: null, expiryDate: null }`: 201, identical persisted shape to omission.
7. Adversarial: PATCH `{ imageUrl: null }` on a non-DRAFT voucher: VOUCHER_NOT_EDITABLE (clear cannot bypass the edit gate); RMV route with null: unchanged RMV behaviour (bag-only).

Frontend (`builder-v1-parity.test.tsx` + `lib/api/__tests__/voucher.test.ts`):
- FLIP `:260` ("an EDIT with a hydrated end date locks the toggle and shows the honest note") to: enabled toggle, untick yields `expiryDate: null` on save, no locked copy rendered.
- KEEP `:311` ("a description-only EDIT preserves the saved imageUrl and expiryDate in the PATCH") - always-resend is unchanged; re-verify it does not assert the removed prop/copy.
- NEW: edit clears saved photo -> payload `imageUrl: null` while `expiryDate` still carries the saved value (independence); edit clears saved end date -> `expiryDate: null` while `imageUrl` still carries the saved value (independence mirror); untouched edit still resends unchanged values; CREATE with blank fields sends `undefined` (never null); duplicate-mode paths unchanged (existing pins stay green).
- Mutation-resistance rule: every new test asserts the WIRE payload or the rendered DOM, never internal state.

## 12. Source-to-proposal cross-check table

| Claim (proposal `proposal-nullable-clear.md`) | Source anchor | Re-verified this pass | Verdict |
|---|---|---|---|
| Zod is the root blocker (.optional() without .nullable()) | `routes.ts:49-50` | yes (read) | CONFIRMED |
| updateVoucherSchema inherits via .partial() | `routes.ts:103-105` | yes | CONFIRMED |
| Allow-list copy presence-based; imageUrl needs no service change | `service.ts:396-399` | yes | CONFIRMED |
| expiryDate truthy line skips conversion on null (accidentally correct) | `service.ts:400` | yes | CONFIRMED; rewrite for explicitness anyway (§2) |
| Columns already nullable, no migration | `schema.prisma:1080,1082` | yes | CONFIRMED |
| DRAFT-only edit gate; approval interaction moot | `service.ts:14,378-380`; voucherApprover PENDING_APPROVAL gate | yes | CONFIRMED |
| expiryDate independent of TIME_LIMITED windows; REUSABLE D44 safe degrade | `redemption/service.ts:96-98`; `useReusable.ts`; `useTimeLimited` no-ref | proposal (2 research passes) + spot-check | CONFIRMED |
| RMV lane never writes top-level columns on live edit | `service.ts:755-791,873-877` | yes | CONFIRMED |
| toCreatePayload coercions + fromDetail seeds | `builderModel.ts:238-239,345-348` | yes | CONFIRMED |
| Locked-copy strings + lockEndDateRemoval locations | `DayTwoBuilder.tsx:270,283-318`; `BuilderFields.tsx:311-343` | yes | CONFIRMED |
| Proposal snippet defect: expiryDate gated on state.imageUrl | proposal §5 item 3 | yes | REAL DEFECT; hard rule in §1 - independent checks + cross-field independence pins |
| File list complete | - | no | GAP FOUND: `service.ts:285-286` create-params TS type widening missing from the proposal's change list; added in §2 |
| BuilderState consumer risk (BuilderPreview/BuilderScore) | grep this pass | yes | Consumers = builderModel(6)/DayTwoBuilder(3)/BuilderFields(2)/BuilderScore(1); no BuilderPreview refs found; audit step retained (§8) |

## 13. Open owner decisions (implementation blocked until answered)

1. APPROVE this contract (present-with-null = clear) and its implementation as one Tier-1 PR? (~250 LOC estimate across 9-10 files, tests included.)
2. End-date clearing UI stays TIME_LIMITED-builder-only (where the control exists today)? Recommended yes; extending end-date UI to the other 6 types is a separate product decision.
3. Deletion of the two locked copy strings (photo + end date honest notes) - confirm no design-side attachment to the copy beyond the constraint it documents.

## 14. Risks

Carried from the proposal (Prisma null-vs-undefined semantics pinned at the update-arg level; consumer audit for widened state; copy-string single-use grep; REUSABLE degrade accepted and documented; RMV-lane zero-diff review) plus one added: the shared `baseVoucherFields` widening also affects CREATE - pinned by test 6 so the equivalence is proven, not presumed.
