# Voucher Builder prototype fidelity rebaseline (Tier 2)

Status: APPROVED-DIRECTION (owner directive 2026-07-13: "it needs to be just like the
prototype"; autonomous execution, Fable 5 leads, Opus/Sonnet execute). Plan written before
implementation per Tier 2 rules.

## 1. Goal

Rebuild the merchant-portal voucher builder so its structure, fields, live scoring,
live customer preview, terms composition, and visual system match the Claude Design
prototype ("Redeemo for Business - Merchant Portal", project 09a77423, page: voucher
builder), closing the gap the owner identified between the shipped builder and the
intended design.

## 2. Evidence base (all in docs/design/merchant-portal/voucher-builder-prototype-2026-07-13/)

- 22 sequential full-page prototype captures (proto-01_21_55 .. proto-01_31_37) plus one
  older capture; catalogued in PROTOTYPE-INVENTORY.md (flow map, per-screen verbatim
  copy, 7-type table, scoring panel behaviour, preview anatomy, terms checklist, visual
  system, 14 ambiguities).
- CURRENT-IMPLEMENTATION.md: full map of today's two builders, the 12 locked contracts,
  backend surface, test baseline (~308 jest blocks / 28 files + 1 Playwright spec).
- Redeemo-for-Business.dc.html: prototype source, TRUNCATED at 256KiB (transfer cap):
  it lacks the builder page markup/JS. Full-source recovery is an open evidence item
  (section 8); the inventory is screenshot-derived and sufficient to start slices 1-2.

## 3. Tier call and scope decisions (lead adjudication)

- Tier 2, frontend-only. No backend contract change is required: every structured
  per-type input the prototype shows already lives in the merchantFields JSON bag;
  the advisory score is client-side (and stays non-gating per CC-1); the two-column
  builder+preview layout already exists. If any slice discovers a genuine backend need
  (new column, new endpoint), that slice PAUSES and escalates to Tier 3 for that part.
- One shared component core, two lanes. Today's duplicated builders (onboarding
  flagship vs day-2 custom) both adopt new SHARED prototype-fidelity components
  (field primitives, score panel, preview card, terms composer). The flagship lane
  keeps its template-driven constraints; the custom lane keeps all 8 types.
- Prototype wrapper model for TIME_LIMITED and REUSABLE (they wrap a base mechanic)
  is represented client-side in the bag; stored VoucherType stays the wrapper type.
  Windows/cooldown validation is untouched.
- The prototype's "Preview suggestions as <category>" selector is DEMO-only by its own
  banner: the real merchant category drives suggestions in the product; no category
  picker ships.

## 4. Locks preserved (from CURRENT-IMPLEMENTATION.md section 3; violations = defects)

Flagship byte-lock on live RMV (no direct edit/delete); nullable-clear contract
(imageUrl/expiryDate independent, DRAFT-only PATCH); end-date UI placement stays
TIME_LIMITED-only unless the owner separately decides otherwise; governed
VoucherPendingEdit lane (one PENDING per voucher, flagship never endable, mandatory
reasons, withdraw paths); RmvTemplate.allowedFields governs both direct-edit and
request-change keys; ELIGIBLE_FLAGSHIP_TYPES (6) + FLAGSHIP_RMV_CAP=2; score never
gates Save/Submit (CC-1); admin-owned merchantFields keys stripped; 16KB/50-key bag
guard respected; duplicate stays client-orchestrated; no customer PII in previews;
capability gate stays display-only with server re-enforcement.

## 5. Slices

- S1 Shared core to prototype fidelity (custom lane first): new shared builder
  components under components/vouchers/shared/ (structured per-type field groups with
  prototype copy verbatim, chips/presets, typical-order-value input, minimum-spend
  toggle, suggested title/description generation, terms checklist, score panel with
  prototype rules, live preview card with type-coloured header). Day-2 custom builder
  (components/vouchers/builder/*) rewired to the shared core, all 8 types.
- S2 Onboarding flagship lane adopts the shared core (template-driven defaults,
  allowedFields-constrained, 6 eligible types, cap-2 language preserved).
- S3 Score-rule fidelity + ambiguity closure: reconcile lib/voucher/scoring.ts with the
  prototype's exact rules once full source is recovered (section 8); until then S1 ships
  the observed rules (Too weak / Good / Great, strengths + improvements lists) marked
  with a scoring-rules provenance comment.
- S4 Verification walk: Playwright + manual browser walk of both lanes against the 22
  captures; side-by-side fidelity check; jest/tsc/next build green; update the 1
  Playwright spec and affected jest suites consciously (test updates are in-scope work,
  not collateral).

Each slice is its own PR, SHA-bound approval as usual. Milestone pauses: end of S1 and
end of S2 (owner sees screenshots before the next slice proceeds).

## 6. Verification bar (every slice)

Root tsc + merchant-web tsc clean; merchant-web jest green (with consciously updated
suites); next build clean; browser walk evidence archived under
docs/design/merchant-portal/voucher-builder-prototype-2026-07-13/build-walk/;
no lock in section 4 violated (spot-check list in each PR body).

## 7. Open owner decisions

None at plan time. The owner's parity directive is the product decision; engineering
decisions (shared core, wrapper representation) are recorded in section 3. If S3
uncovers score rules that contradict CC-1 (a gating score) or any lock, that becomes
an owner decision before building it.

## 8. Open evidence items

- Full prototype source recovery (256KiB cap workaround): owner either signs into
  claude.ai in the automation browser (login page already open) or downloads
  "Redeemo for Business.dc.html" from the design app into ~/Downloads for pickup.
- The 14 inventory ambiguities: resolve empirically via the live prototype walk once
  auth exists; each resolution lands as an inventory addendum. S1/S2 build only on
  unambiguous evidence; ambiguous branches ship behind the observed default until
  resolved.

## S5: submission validity (owner requirement 2026-07-13)

Owner requirement (programme-wide, new): merchants may SAVE incomplete drafts, but
SUBMIT FOR REVIEW must FAIL CLOSED until every field needed to define the offer and to
calculate an honest estimated saving is present and valid. It applies to the custom and
flagship lanes, all structured types, the TIME_LIMITED / REUSABLE wrappers AND their
underlying mechanic, and every submit entry (fresh / resume / edit / resubmission,
frontend AND direct API). The advisory score stays NON-GATING: a "too weak but complete"
voucher still submits (with the existing warning); an "incomplete or invalid" voucher
never submits.

This section is THE contract both layers implement. S5-backend (this slice) is the
server fail-closed gate; the client-side gate on the Submit button is a follow-up slice
that reuses the SAME matrix so the two never diverge.

### S5.1 Two-layer enforcement statement

1. Backend (authoritative, this slice): both submit services validate the EFFECTIVE
   voucher (top-level columns + the merchantFields bag, after the flagship promotion /
   re-link bridge has computed the values that will be written) against the matrix
   below. On any failure the submit is rejected atomically BEFORE the status flip, with
   a single `VOUCHER_INCOMPLETE` (400) whose `details.fields` array lists every failing
   field. DRAFT saving (create / PATCH) stays permissive; only submit is gated.
2. Frontend (follow-up slice): the Submit button runs the identical matrix client-side
   for inline field errors and to disable submit; it is a UX convenience, never the
   source of truth. The backend gate stands alone against direct API calls.

Parity mechanism (2026-07-14): the matrix CASES live in ONE canonical executable
fixture, `tests/fixtures/voucher-submit-validity-cases.ts` (pure data + types, no
imports, no framework dependence). The backend vitest suite
(`tests/api/merchant/voucher-submit-validity.test.ts`) drives its lane x shape x
type cross-product from it, and the merchant-web jest suite for the client gate
consumes the SAME file by relative path (no cross-package imports needed). Scope of
the guarantee, stated precisely: case-list drift between the two layers is
test-enforced by the shared fixture; resolver-LOGIC drift (a layer interpreting a
case differently) is not made impossible, it surfaces as fixture-case failures in
that layer's suite. The authoritative RULE matrix stays in S5.3; the fixture is its
executable projection and the two change together.

The advisory score (`lib/voucher/scoring.ts`) is orthogonal to this gate and never
blocks submit (lock CC-1 preserved).

### S5.2 Where the fields live (TWO canonical stored shapes, both merged on main)

- FLAGSHIP (RMV, nested shape): `BuilderForm.buildPayload()` PATCHes
  `{ title, description, estimatedSaving, terms, imageUrl, merchantFields: <draft> }`;
  `updateRmvVoucherCore` merges that WHOLE body into `Voucher.merchantFields`. So the
  stored bag is `{ title, description, estimatedSaving, terms, imageUrl,
  merchantFields: { builderType, categoryKey, ...DraftFields, selectedClauseIds,
  customTerms, askHelp, ... } }`: the copy fields at the bag top level, and the
  per-type structured mechanic (the `DraftFields` model in `lib/voucher/compose.ts`)
  one level deeper under `merchantFields`, with the mechanic fields FLAT inside it
  (`discountKind` at its top level). `submitRmvVoucherCore` promotes the copy fields
  onto the top-level columns at submit; the discount type relink now happens at DRAFT
  SAVE time with a submit-time defence-in-depth pass (S5.7).
- CUSTOM (RCV, single-level shape): `builderModel.toCreatePayload()` (day-2 S1,
  merged) stores `Voucher.merchantFields = { askHelp, builderType: <pickerId>,
  draftFields: { <mechanic fields incl. discountKind> }, selectedClauseIds,
  customTerms, baseMechanic? }`. The pickerId is the mechanic id for the 5 structured
  types and `'time'` / `'reusable'` for the wrappers; a wrapper's underlying mechanic
  id lives in `baseMechanic` (written once Step 1 is completed). Top-level `type` /
  `title` / `estimatedSaving` are authoritative columns set at create/PATCH.

BOTH shapes are canonical. The validator's `resolveStructuredBag` normalises them to
ONE flat draft object (mechanic fields flat; the `builderType` / `baseMechanic`
markers authoritative on top) so `resolveMechanicType` and the matrix read them
identically. The unrelated custom keys (`askHelp` / `selectedClauseIds` /
`customTerms` / edited flags) are never read by the matrix. Precedence: the nested
flagship shape wins when both are somehow present (it is the more specific write).

Structured-bag detection (the compatibility boundary, see S5.6): the mechanic matrix
is evaluated ONLY when the bag matches one of the two shapes above, i.e. it carries a
string `builderType` (nested, or at the bag top level). Any other bag (null, `{}`, a
flat opaque legacy bag WITHOUT `builderType`, an admin-concierge bag) is treated as
NON-structured: the universal + wrapper invariants still apply, but the per-type
mechanic matrix is skipped (nothing reliable to validate). This is what "validate
what is derivable; never hard-crash on an unknown bag" means in code.

### S5.3 Required-field matrix (authoritative)

Numbers must be finite; any required number rejects when missing (REQUIRED), when
non-finite / wrong-typed / <= 0 (INVALID), or when it contradicts a sibling field
(INCONSISTENT). Text fields reject when missing or blank (REQUIRED). `estimatedSaving`
is validated on the EFFECTIVE (promoted, scale-2-rounded) value.

Universal (every type, both lanes):

| Field | Rule | Field-code on failure |
|---|---|---|
| `title` | non-empty trimmed string | REQUIRED |
| `type` | a known VoucherType enum | INVALID |
| `estimatedSaving` | finite number > 0, fits Decimal(10,2) after scale-2 rounding | REQUIRED / INVALID |

Per-type mechanic (evaluated only for a structured bag, EITHER shape; discount fixed
vs percent is resolved from `discountKind` when present, else the top-level type):

| Type | Required (all present + valid) | Cross-field contradiction (INCONSISTENT) |
|---|---|---|
| BOGO | `bogoBuy` (text), `bogoFree` (text), `bogoFreePrice` (> 0) | none |
| SPEND_AND_SAVE | `spendAmount` (> 0), `spendSave` (> 0) | `spendSave >= spendAmount` |
| DISCOUNT_FIXED | `discAmount` (> 0) | none |
| DISCOUNT_PERCENT | `discPercent` (> 0 and <= 100); pricing basis: `discMin` (> 0) OR `discTypicalOrder` (> 0) | none |
| FREEBIE | `freeItem` (text), `freeWorth` (> 0); if `freeNeedsPurchase === true` then `freeQualify` (text) | none |
| PACKAGE_DEAL | `packageItems` (text), `packagePrice` (> 0), `packageNormal` (> 0) | `packagePrice >= packageNormal` |

Wrapper types (custom-only; the underlying mechanic is resolved from the structured
bag's `baseMechanic` (the custom single-level shape), falling back to its
`builderType` when that is itself a mechanic id (a nested-shape wrapper bag from a
direct API caller), then validated with the base row above, PLUS):

| Wrapper | Additional requirement | Enforced by |
|---|---|---|
| TIME_LIMITED | at least one availability window | existing `TIME_LIMITED_REQUIRES_WINDOW` (400) gate, KEPT alongside; runs before the matrix |
| REUSABLE | `cooldownSeconds` present and >= 1800 | folded into `VOUCHER_INCOMPLETE` (`field: cooldownSeconds`) |
| both | a STRUCTURED wrapper bag with NO derivable underlying mechanic (the S1 builder writes `builderType: 'time'/'reusable'` before Step 1 picks the base offer) | `VOUCHER_INCOMPLETE` (`field: baseMechanic`, `code: REQUIRED`) |

Flagship RMVs are only ever the six base types (`ELIGIBLE_FLAGSHIP_TYPES`), so the
wrapper rows never apply to the flagship lane.

Deliberate NON-gates (owner anchors corrected against real code / UX, recorded so the
follow-up client layer matches):

- estimatedSaving CEILING (saving <= mechanic-derived maximum) is NOT enforced. It is a
  subjective honesty judgement; the advisory score plus admin review are the backstop
  (CC-1). The hard gate enforces completeness + internal contradiction + positive finite
  saving only. This avoids wrongly blocking legitimate edited savings.
- `terms` are NOT gated. The prototype terms composer legitimately allows zero selected
  clauses, so a blank terms string is a valid (if weak) offer; admin review is the
  backstop. (The owner's universal list named "terms present where the product
  requires"; no structured type in the real builder makes terms load-bearing for
  defining the offer or the saving, so v1 leaves terms advisory.)
- `bogoBuyFullPrice` is NOT required: the BOGO saving is `bogoFreePrice`; the full price
  feeds only the advisory saving-percent.

### S5.4 Error-code contract

Single stable envelope for any completeness/validity failure:

```
AppError('VOUCHER_INCOMPLETE', { fields: Array<{ field: string; code: FieldCode; message: string }> })
-> HTTP 400
-> body.error = { code: 'VOUCHER_INCOMPLETE', message, statusCode: 400, fields: [ ... ] }
```

`FieldCode` is a small stable set (per-field-useful, so both layers can key inline UI):

| FieldCode | Meaning |
|---|---|
| `REQUIRED` | field absent or blank |
| `INVALID` | present but wrong type, non-finite, out of range, or <= 0 |
| `INCONSISTENT` | present and individually valid but contradicts a sibling field |

Pre-existing codes are unchanged and still fire (they run before the matrix or on the
top-level column write): `VOUCHER_NOT_SUBMITTABLE` (non-DRAFT), `SAVING_INVALID`
(flagship bridge poisoned bag saving), `TIME_LIMITED_REQUIRES_WINDOW` (kept as the
window gate), `INVALID_AVAILABILITY_WINDOWS`, `MERCHANT_FIELDS_TOO_LARGE`.

New in the 2026-07-14 hardening pass: `RMV_TEMPLATE_UNAVAILABLE` (422). A flagship
discount edit or submit implies the OTHER discount mechanic (the bag's discountKind
differs from the stored type) but the ACTIVE sibling RmvTemplate for the same
top-level category cannot be resolved (row missing, inactive, or the voucher's own
template link unreadable). The write is rejected BEFORE any update or status
transition: a silent keep of the old type while carrying the new mechanic's fields
would be a dishonest offer. See S5.7.

### S5.5 Implementation shape

- New module `src/api/merchant/voucher/submitValidation.ts`: pure, prisma-free.
  Exports `assertVoucherSubmittable(effective)` and the small helpers
  (`resolveStructuredBag`, `resolveMechanicType`). It builds the `details.fields` array
  and throws `VOUCHER_INCOMPLETE` when non-empty.
- `submitVoucher` (custom): after the status gate and the retained
  `TIME_LIMITED_REQUIRES_WINDOW` check, validate the effective voucher (top-level
  columns + bag + window count + cooldown) before the transaction.
- `submitRmvVoucherCore` (flagship): after computing `promoted` + `relink` (the
  existing bridge), validate the effective (promoted) type / title / saving + nested
  structured bag before the transaction. The existing `assertSavingSane` on a poisoned
  bag saving still runs first (keeps `SAVING_INVALID`).
- `resolveStructuredBag` recognises BOTH stored shapes (S5.2) and normalises them to
  one flat draft; `resolveMechanicType` derives a wrapper's underlying mechanic from
  `baseMechanic` first, then `builderType`-as-mechanic-id as the fallback.

### S5.6 Legacy / resume compatibility rule (documented invariant)

- The per-type mechanic matrix runs ONLY for a structured bag: one of the two S5.2
  shapes, detected by a string `builderType` (nested, or at the bag top level).
  Legacy vouchers with null bags, admin-concierge bags, empty bags, flat opaque bags
  WITHOUT `builderType`, and template-default flagship drafts carry no structured
  bag, so they are validated on the universal + wrapper invariants only and are never
  blocked by a mechanic field they never stored. A bag that DOES carry the
  `builderType` marker engages the matrix even when its mechanic fields are missing
  (marker-only A3-era bags included): the offer was never structurally defined, so it
  fails closed and the merchant completes it by resuming the builder (which writes
  `draftFields`). A partially-filled matrix draft IS blocked: that is the intended
  fail-closed behaviour, not a regression.
- Every bag read is defensive: non-object bags, non-object nested bags, and
  wrong-typed values degrade to "field absent" (REQUIRED) rather than throwing, so no
  poisoned or unknown bag shape can produce a 500.
- Resubmission after NEEDS_CHANGES uses the same DRAFT submit path, so it is gated
  identically to a first submit (a voucher sent back for changes must be complete to
  return to review).

### S5.7 Discount relink honesty (2026-07-14 hardening: items 1+2, round-2 ordering fix)

- DRAFT-TIME RELINKING (lead-adjudicated): when `updateRmvVoucherCore` saves a bag
  whose `discountKind` implies the OTHER discount mechanic, the voucher's `type` +
  `rmvTemplateId` are re-linked to the ACTIVE sibling template of the same top-level
  category ATOMICALLY with the bag write (one row update inside the transaction: the
  bag write and the relink succeed or fail together). Drafts are therefore always
  TRUTHFUL: the Option B admin reads (co-build `listAdminRmvVouchers`, the review
  read in `approvals/service.ts`) are per-request pass-throughs of type/template and
  surface the merchant's real mechanic immediately.
- EFFECTIVE-TEMPLATE AUTHORITY (round-2 ordering fix): the shared resolver
  `resolveEffectiveTemplate` returns BOTH the relink columns AND the DESTINATION
  template's `allowedFields`. `updateRmvVoucherCore` validates proposed KEYS against
  the destination list (not the stale current one) BEFORE the transaction, so a flip
  can never persist a field the destination forbids while a field allowed only by the
  source template is rejected with `RMV_FIELD_NOT_ALLOWED` and zero writes. On a
  non-flip save the effective template IS the current one (behaviour unchanged).
- SUBMIT-TIME RELINK + PROMOTION GATE stays in `submitRmvVoucherCore` as
  defence-in-depth: a no-op for truthful drafts; still corrects legacy drafts saved
  before this rule. The promoted copy fields are additionally GATED by the effective
  (post-relink) template's `allowedFields`, so a flip-at-submit cannot promote a copy
  field the destination forbids (dropped, column keeps its existing value). When no
  template/allowedFields is resolvable the gate is a no-op (legacy behaviour).
- FAIL CLOSED, both call sites (shared `resolveEffectiveTemplate`): when a flip is
  implied but the ACTIVE sibling cannot be resolved (missing/inactive row, or the
  voucher's own template link unreadable), the request is rejected with the typed
  422 `RMV_TEMPLATE_UNAVAILABLE` BEFORE any write or status transition. Never a
  silent keep of the old type; never a 5xx.
- Adjacent-path sweep result: the admin edit-on-behalf / co-build save + submit
  routes (`admin/merchants/routes.ts`) call the SHARED `updateRmvVoucherCore` /
  `submitRmvVoucherCore`, so this one fix covers the admin path (no sibling function
  repeats the bug). `createFlagshipRmvVoucher`, `provisionRmvVouchers`, and
  `handleCategoryChange` create fresh vouchers from a template lookup by the chosen
  type (no proposed-field-vs-stale-template mismatch is possible) and already fail
  closed on a missing template (`NO_RMV_TEMPLATE`). A plain submit whose linked
  template has been deactivated (no kind flip) performs NO template resolution
  (nothing silently degrades: the voucher keeps its existing link) and is
  deliberately not blocked: admin review is the backstop, and blocking would freeze
  previously valid drafts when an admin retires a template.
