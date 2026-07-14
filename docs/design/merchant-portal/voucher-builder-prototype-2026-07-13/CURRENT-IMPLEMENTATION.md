# Current merchant-web voucher builder implementation

Status: reference snapshot for gapping against the prototype in this same folder
(`Redeemo-for-Business.dc.html` + `proto-*.png`). Written 2026-07-13. Read-only
research; no code changed to produce this document.

Scope: `apps/merchant-web` vouchers module (list / detail / two builders) + the
backend endpoints in `src/api/merchant/voucher/*` those screens call. All paths
below are repo-root-relative unless stated otherwise.

---

## 0. Two builders exist today, not one

This is the single most important fact for gapping a prototype against: the
portal ships **two independent builder implementations** that share some pure
logic modules but have separate components, separate state models, and
separate screens:

1. **Flagship (RMV) onboarding builder** - `components/onboarding/vouchers/*`,
   mounted at `app/(app)/onboarding/vouchers/page.tsx`. Used only to build the
   two mandatory RMV-001/RMV-002 vouchers during onboarding. Type choice is
   restricted to 5 eligible types (§3 below); "Time limited" and "Reusable"
   render disabled-with-copy. No TIME_LIMITED window editor, no REUSABLE
   cooldown editor exist in this builder (they are impossible types here).
2. **Day-2 (custom/RCV) builder** - `components/vouchers/builder/*`
   (`DayTwoBuilder.tsx` is the orchestrator), mounted inline on
   `app/(app)/vouchers/page.tsx` (create) and `app/(app)/vouchers/[id]/page.tsx`
   (edit/duplicate). All 8 backend `VoucherType` values are selectable (7
   picker cards; Discount is one card with an internal fixed/percent toggle).
   This is the only builder with TIME_LIMITED availability-window and REUSABLE
   cooldown UI.

Both builders reuse the same pure, React-free logic in `lib/voucher/`
(`compose.ts`, `config.ts`, `terms.ts`, `scoring.ts`, `typeMeta.ts`) for the 5
structured types (BOGO / Spend & Save / Discount / Freebie / Package Deal), so
composed-title/description text, suggestion chips, the terms-clause engine,
and the advisory score all behave identically in both builders for those 5
types. A prototype redesign has to decide whether it is replacing one builder,
both, or unifying them - the current code does not unify them.

---

## 1. Routes / screens

| Route | File | Purpose |
|---|---|---|
| `/onboarding/vouchers` | `apps/merchant-web/app/(app)/onboarding/vouchers/page.tsx` | Flagship builder: type picker -> guided builder -> submit, one voucher at a time, "1 of 2" / "2 of 2". Resumes an existing DRAFT RMV automatically. Redirects to hub (`/`) once both flagships are submitted. |
| `/vouchers` | `apps/merchant-web/app/(app)/vouchers/page.tsx` | List page. Flagship cards pinned/locked at top (read-only), custom (RCV) cards below, filterable. `?create=1` deep-link opens the Day-2 builder inline on the same page (`DayTwoBuilder`, gated on `canManage`). |
| `/vouchers/[id]` | `apps/merchant-web/app/(app)/vouchers/[id]/page.tsx` | Per-voucher detail. Renders `VoucherDetail` (read-only) for every state; for a custom DRAFT voucher, Edit switches the SAME route to `DayTwoBuilder` in edit mode; Duplicate switches to `DayTwoBuilder` in create mode prefilled from the source (title suffixed " (copy)"). `?duplicate=1` deep-link opens duplicate mode directly. Also resolves a flagship id (no per-id RMV read exists; matched against the cached flagship list) and renders the same `VoucherDetail` with `flagship` styling + `VoucherGovernedMenu` instead of Edit/Submit/Delete. |

There is no standalone `/vouchers/new` route or `/vouchers/[id]/edit` route -
create and edit are modal-like in-page states (`creating` boolean on the list
page; `mode: 'view' | 'edit' | 'duplicate'` on the detail page), not distinct
URLs. A prototype that expects dedicated builder URLs is a routing-model gap.

### Component tree - `/vouchers` (list)

```
VouchersPage (app/(app)/vouchers/page.tsx)
├─ (create mode) DayTwoBuilder                      [components/vouchers/builder/DayTwoBuilder.tsx]
│   ├─ TypePicker (7 cards)                         [components/vouchers/builder/TypePicker.tsx]
│   ├─ ConciergeDiff (only if resuming CHANGES_REQUESTED prefill)
│   ├─ BuilderFields (per-type)                     [components/vouchers/builder/BuilderFields.tsx]
│   ├─ TextAreaField (description)                  [components/vouchers/builder/fields.tsx]
│   ├─ FileUpload (photo)                           [components/ui/file-upload.tsx]
│   ├─ TermsSection (structured types) OR TextAreaField (terms, time/reusable)
│   ├─ BuilderPreview (customer preview card)        [components/vouchers/builder/BuilderPreview.tsx]
│   └─ BuilderScore (advisory score, structured types only) [components/vouchers/builder/BuilderScore.tsx]
└─ (list mode) VouchersList                          [components/vouchers/VouchersList.tsx]
    ├─ VoucherCard × flagship rows (locked)          [components/vouchers/VoucherCard.tsx]
    ├─ Stat strip (Total / Live / In review / Draft)
    ├─ VoucherStatusFilter (All/Live/In review/Draft/Finished tabs) [components/vouchers/VoucherStatusFilter.tsx]
    ├─ VoucherCard × custom rows
    └─ VoucherGovernedMenu (kebab per card)           [components/vouchers/VoucherGovernedMenu.tsx]
        ├─ RequestChangeModal (flagship, live)        [components/vouchers/RequestChangeModal.tsx]
        └─ RequestEndModal (custom, live)             [components/vouchers/RequestEndModal.tsx]
```

### Component tree - `/vouchers/[id]` (detail)

```
VoucherDetailPage (app/(app)/vouchers/[id]/page.tsx)
├─ (edit/duplicate mode) DayTwoBuilder (same tree as above, prefilled via fromDetail())
└─ (view mode)
    VoucherDetail                                    [components/vouchers/VoucherDetail.tsx]
    ├─ state banner + approvalComment
    ├─ changesBanner slot:
    │   ├─ PendingVoucherEditBanner (open governed CHANGE/END request) [components/vouchers/PendingVoucherEditBanner.tsx]
    │   └─ ConciergeReadOnly (legacy CHANGES_REQUESTED, no open request) [components/vouchers/ConciergeDiff.tsx]
    ├─ Description / Terms / (When available | How often reusable) / Where it applies sections
    ├─ Customer-preview aside card
    ├─ Redemptions aside card + "View redemptions" link
    ├─ actions slot: DetailActions (Edit/Submit/Delete, DRAFT only) + DuplicateAction + VoucherGovernedMenu
    └─ VoucherAnalytics (canViewInsights only)        [components/vouchers/VoucherAnalytics.tsx]
```

### Component tree - `/onboarding/vouchers` (flagship builder)

```
VouchersPage (app/(app)/onboarding/vouchers/page.tsx)
├─ (stage: picker) TypePicker                        [components/onboarding/vouchers/TypePicker.tsx]
│   └─ redemption-cycle primer card (PRIMER copy from lib/voucher/typeMeta.ts)
└─ (stage: builder) BuilderForm                      [components/onboarding/vouchers/BuilderForm.tsx]
    ├─ per-type structured fields card (renderBogo/Spend/Discount/Freebie/Package)
    ├─ "What customers will see" card: FileUpload, Title, Description, Estimated saving
    ├─ Terms card (checklist + custom terms, same model as Day-2 TermsSection)
    ├─ "Ask the Redeemo team to help" concierge toggle (askHelp)
    ├─ sticky footer: Back / Save as draft / Save voucher N of 2 (Submit)
    └─ aside: VoucherPreview (mini card) + ScoreCard  [components/onboarding/vouchers/ScoreCard.tsx]
```

---

## 2. Current builder UX in detail

### 2a. Day-2 (custom) builder - `DayTwoBuilder.tsx`

Layout: single card, no type picker + builder step split once a type is
picked - picking a type immediately shows the full form. Two-column CSS grid
on desktop (`grid gap-6 lg:grid-cols-[1fr_360px]`): left column is the form,
right column (360px, sticky-feeling but not `position:sticky`) stacks
`BuilderPreview` then `BuilderScore`.

Type picker (`components/vouchers/builder/TypePicker.tsx`), 7 cards, all
enabled:
- "Buy one, get one free" - "The easiest to understand and the strongest at bringing people in."
- "Spend & save" - "Reward customers who spend a little more in one visit."
- "Discount" - "A straight saving off the price, fixed or a percentage."
- "Freebie" - "Give a free item, on its own or with a purchase."
- "Package deal" - "Bundle a few items together at one set price."
- "Time limited" - "A saving on your quieter days or hours."
- "Reusable" - "A small offer customers can come back and use again."

Field order for a structured type (e.g. BOGO), top to bottom:
1. Per-type fields card (`BuilderFields.tsx`) - e.g. BOGO: "What do they buy?"
   (suggestion chips + free-text "Buy item" + "Its full price" money field),
   then "What do they get free?" (chips + "Free item" + "Its value").
2. "Description (optional, but recommended)" textarea, placeholder "Tell
   customers why they will love this offer."
3. Photo upload - label toggles "Add a photo (optional)" / "Replace photo";
   hint "JPG or PNG, landscape, at least 1200 by 600 pixels, up to 5 MB.";
   below it a contextual "Remove photo" / "Use the saved photo instead" link
   depending on session vs saved-baseline state (nullable-clear affordance,
   see §3).
4. Terms - `TermsSection` for the 5 structured types (checklist of built-in
   clauses with Caution/Restrictive tier badges + a free-text "Add your own
   term" box, 
   copy: "Pick from this set so customers always know what to expect. The
   fewer you pick, the more people will redeem. Caution terms may put some
   customers off; Restrictive terms can stop people redeeming altogether.");
   plain `TextAreaField` labelled "Terms (optional)" for TIME_LIMITED/REUSABLE.
5. Footer: Cancel / Save as draft / Submit for review.

Right column:
- `BuilderPreview`: "Customer preview" eyebrow, composed/overridden title,
  "Save about £X" (green, only if saving > 0), composed/overridden description.
- `BuilderScore` (structured types only - returns null for TIME_LIMITED/
  REUSABLE): "How this voucher stacks up" heading + a Too weak/Good/Great
  pill, description, Strengths list, To improve list, and the fixed
  `PLATFORM_FRAMING` disclaimer line. **Advisory only - never blocks Save or
  Submit** (locked invariant CC-1, restated in code comments in both
  builders).

TIME_LIMITED-only fields (`BuilderFields.tsx` `TimeLimitedFields`):
- "When is the offer available?" - one or more day+time window rows (day
  select, open time, close time, Remove); zero-state shows 3 one-tap presets
  ("Weekday lunchtimes", "Weekday early evenings", "Weekend mornings"); "Add a
  time window" button.
- "Does this offer end on a date?" (helper: "Optional. Leave off and the
  offer runs until you end it.") - checkbox "Ends on a date" + a date input
  when checked. This is the **only** UI surface for the generic `expiryDate`
  field across either builder.

REUSABLE-only fields (`ReusableFields`):
- "How often can a customer use it?" (helper: "A reusable offer can be
  redeemed again after a cooldown. The minimum is 30 minutes.") - 4 preset
  pill-radios (30 minutes / 1 hour / 1 day / 1 week) + a free "Or every [N]
  [hours|days|weeks]" custom control, floor-clamped to 1800s client-side.

### 2b. Flagship (onboarding) builder - `BuilderForm.tsx`

Layout: `flex lg:flex-row` two columns - left form column flexes, right aside
is `lg:max-w-sm` (narrower than the Day-2 builder's fixed 360px). No type
picker inline; the type is chosen on the prior `TypePicker` screen (5 eligible
cards + 2 disabled cards) and passed in as a prop - one type per mount.

Distinguishing UX vs the Day-2 builder:
- A "Flagship voucher 1 of 2" / "2 of 2" pill badge above the heading.
- "What customers will see" is its own card with explicit "Use our
  suggestion" reset links next to Title and Description once the merchant
  edits them away from the composed default (`titleEdited`/`descEdited`
  flags) - the Day-2 builder has no equivalent reset affordance; overrides
  there are one-way once typed.
- Estimated saving is **read-only** (computed, greyed field) for Spend &
  Save / Freebie / Package Deal (`savingReadOnly`); only BOGO and Discount
  allow a manual override. The Day-2 builder never marks saving read-only for
  any type.
- A dedicated warning card when `effectiveSaving < 5`: "Below Redeemo's
  minimum saving" / "Offers need to save a customer at least £5 to be worth
  their trip. Raise the saving, or make the free item more generous." with a
  "Set saving to £5" quick-fix button. The Day-2 builder has no equivalent
  card (the same £5 floor is silently substituted as a fallback in
  `toCreatePayload`, not surfaced to the merchant).
- A concierge toggle card: "Ask the Redeemo team to help with this offer" /
  "Turn this on if you would like our team to help build or improve this
  offer with you. You always approve it before it goes live." (Switch +
  "Flagged for the Redeemo team" pill when on). The Day-2 builder's
  `askHelp` field exists in its state model but is never surfaced as UI (dead
  toggle in the data model only - a gap worth flagging to the design lead).
- Footer button label is dynamic: `Save voucher {1|2} of 2` for Submit
  (rather than "Submit for review"); Save as draft is a plain "Save as draft".
- No photo-remove affordance (no `savedImageUrl` baseline tracking) - unlike
  the Day-2 builder, which supports revert/remove against a saved baseline.
- No availability-window or cooldown UI - impossible here (TIME_LIMITED /
  REUSABLE are not selectable as flagship types).

`ScoreCard.tsx` (onboarding) vs `BuilderScore.tsx` (Day-2): near-identical
content (meter bars, Strengths/Improvements, `PLATFORM_FRAMING`) but
different container styling (`Card` component vs a raw bordered div) and the
onboarding version has an explicit "Pick what runs first" empty state before
a type is chosen (not applicable in Day-2, where the type picker is a
distinct pre-form screen).

### 2c. Per-type field copy differences worth flagging to design

Both builders implement the same 5 structured types via shared config
(`lib/voucher/config.ts` suggestion chips, `lib/voucher/compose.ts`
title/description composition) but the onboarding builder's field helper
copy is more elaborate (heading + helper + optional `subHelper` three-tier
copy) while the Day-2 builder only has heading + helper (no `subHelper`
slot exists in its `FieldBlock`). Example (Spend & Save):
- Onboarding: heading "How much does a customer need to spend?", helper "The
  amount a customer spends in one visit to unlock the saving.", subHelper
  "The total a customer spends in one visit before the saving applies."
- Day-2: heading "How much do they spend?" only (chip + money field), no
  helper/subHelper text at all.

A prototype that assumes one shared copy set across both builders would be
wrong; the two are copy-forked today.

---

## 3. Contracts and locks a redesign must not violate

Read `.claude/rules/merchant-web.md` in full before implementing; summary of
voucher-specific locks below with file:line evidence.

1. **Flagship (RMV) lane is byte-identical/locked where marked.** A live
   (ACTIVE) flagship voucher is never directly editable/deletable from the
   builder - only via the governed "Request a change" flow
   (`RequestChangeModal.tsx`, backend `requestFlagshipVoucherChange` in
   `src/api/merchant/voucher/service.ts:1059`). `VoucherDetail.tsx:116-120`
   renders "Always live: edits go to review, and this voucher cannot be
   deleted." A prototype must not add a direct Edit/Delete button on a live
   flagship card or detail page.

2. **Nullable-clear contract** (`imageUrl` / `expiryDate`): an explicit
   `null` on PATCH clears the saved column; omission preserves; the two
   fields are independently evaluated - never coupled.
   - Zod schema: `src/api/merchant/voucher/routes.ts:59-60`
     (`imageUrl: z.string().url().nullable().optional()`, `expiryDate:
     z.string().datetime().nullable().optional()`).
   - Backend enforcement: `service.ts:418-426` (expiryDate presence-based
     clear/convert/omit) and the `imageUrl` copy-loop above it.
   - Frontend: `builderModel.ts:243-250` (`imageUrl: state.imageUrl === null
     ? null : state.imageUrl || undefined`, comment: "The two lines are
     deliberately INDEPENDENT per-field checks - never couple them.") and
     `builderModel.ts:273-277` (`normalizeExpiryDate`).
   - **DRAFT-only**: the whole PATCH (`updateVoucherSchema`) only ever
     applies to a `DRAFT` voucher - `EDITABLE_STATUSES = ['DRAFT']`
     (`service.ts:14`, enforced at `service.ts:396-398`). A redesign cannot
     add a "quick edit" affordance on a non-DRAFT custom voucher; it must
     route through the request-change/request-end governed lanes instead.

3. **End-date UI is TIME_LIMITED-only in the current builder**, but note the
   backend `expiryDate` field is generic (any voucher type can technically
   carry one - it is not type-gated server-side, unlike `availabilityWindows`
   and `cooldownSeconds` which ARE type-gated). The "Ends on a date" toggle
   only exists inside `TimeLimitedFields` (`components/vouchers/builder/
   BuilderFields.tsx:312-342`). A redesign that wants an end-date affordance
   on other types is not blocked by the backend, only by the current UI's
   placement - flag this explicitly as a design decision, not an assumed lock.

4. **Governed `VoucherPendingEdit` lane for live vouchers** (2026-07-07,
   D1-D4). One shared model covers two kinds:
   - `CHANGE` - a live flagship's proposed field edits (title/description/
     estimatedSaving/terms/imageUrl subset), reviewed before applying.
   - `END` - a live **custom** voucher's requested deactivation. **D4 lock:
     a flagship can never be ended** - rejected both client-side (
     `VoucherGovernedMenu.tsx:105-108`, `canRequestEnd = canManage &&
     !isFlagship && ...`) and server-side (`service.ts:1175`,
     `if (voucher.isRmv || voucher.isMandatory) throw new
     AppError('VOUCHER_EDIT_NOT_ALLOWED')` - checked on EITHER flag,
     defence-in-depth against legacy seed rows).
   - **At most one PENDING `VoucherPendingEdit` per voucher** (app-layer
     guard `assertNoPendingVoucherEdit`, `service.ts:1043-1052`); a second
     request while one is open returns `PENDING_EDIT_EXISTS`, surfaced as a
     dedicated notice in both modals (not a generic error).
   - Self-service withdraw exists for both an in-review submission
     (`withdrawVoucherSubmission`, instant, `DRAFT` rollback) and an open
     governed request (`withdrawVoucherPendingEdit`).
   - A redesign must preserve: no direct field edit on a live voucher of
     either kind; mandatory reason text on both Request modals; the
     pending-request banner taking over the "make another request" slot
     until resolved.

5. **RMV template model drives the flagship builder.** `createFlagshipRmvVoucher`
   (`service.ts:709-782`) looks up an `RmvTemplate` row (per top-level
   category + `VoucherType`) and seeds `title`/`description`/`estimatedSaving`
   from it; `updateRmvVoucherCore` (`service.ts:795-831`) validates every PATCH
   key against `RmvTemplate.allowedFields` (a `Json` array on the template,
   e.g. `['title','description','estimatedSaving','terms','imageUrl',
   'merchantFields']`) and rejects an out-of-list key with
   `RMV_FIELD_NOT_ALLOWED`. The governed "Request a change" allow-list
   (`VOUCHER_PROMOTABLE_FIELDS`, `service.ts:1034`) is additionally
   intersected with the SAME `RmvTemplate.allowedFields` set
   (`service.ts:1086-1089`) - a redesign that adds a new proposable field to
   the Request-a-change form (e.g. a photo) requires a corresponding
   `RmvTemplate.allowedFields` / template-seed change, not just a frontend
   change.

6. **`ELIGIBLE_FLAGSHIP_TYPES`** (`src/api/merchant/voucher/shared.ts:15-22`):
   exactly `['BOGO', 'SPEND_AND_SAVE', 'DISCOUNT_FIXED', 'DISCOUNT_PERCENT',
   'FREEBIE', 'PACKAGE_DEAL']`. `TIME_LIMITED` and `REUSABLE` are permanently
   ineligible as a flagship type; the create-flagship endpoint rejects them
   with `VOUCHER_TYPE_NOT_ELIGIBLE` (`service.ts:723-725`). Also locked:
   `FLAGSHIP_RMV_CAP = 2` (`shared.ts:39`) - exactly two mandatory flagships
   per merchant, counted across DRAFT + PENDING_APPROVAL + ACTIVE
   (`service.ts:734-739`); a redesign must not imply a merchant can have
   more or fewer than 2 flagship slots.

7. **Advisory score never gates Save/Submit (CC-1, locked).** Comments in
   both `BuilderScore.tsx:16-19` and `ScoreCard.tsx:8-11` and the footer
   buttons in both builders (`DayTwoBuilder.tsx:355-364`,
   `BuilderForm.tsx:559-568`) are never `disabled` based on score. A
   prototype must not make the score a blocking gate.

8. **`merchantFields` is client-readable/echoed (invariant B-13)** - it must
   never carry server-private data. Two keys are server-owned and stripped
   from any merchant-supplied bag before every write:
   `ADMIN_OWNED_MERCHANTFIELDS_KEYS = ['adminProposed', 'adminNote']`
   (`service.ts:31-39`, applied on create `service.ts:336`, update
   `service.ts:442`, and resubmit `service.ts:581-583`). A redesign's builder
   state must never let the merchant set these two keys directly.

9. **`merchantFields` size guard**: 16KB max serialized size, 50 top-level
   keys max (`service.ts:50-59`, `MERCHANT_FIELDS_TOO_LARGE`). Relevant if a
   redesign adds a much richer structured bag (e.g. many custom terms or
   many window rows encoded into the bag as well as their own columns).

10. **Duplicate is entirely client-orchestrated** - there is no backend
    duplicate endpoint (`components/vouchers/DuplicateAction.tsx:6-11`
    comment). The detail page reads the source voucher via `getVoucher`,
    prefills the builder in create mode with `" (copy)"` appended to the
    title, and a normal `createVoucher` POST follows. A redesign that wants
    server-side duplication is new backend work, not a frontend-only change.

11. **Privacy**: the vouchers surfaces never render customer PII or a
    redemption PIN (explicit comments on `VoucherCard.tsx:21`,
    `VoucherDetail.tsx:19,27`, `service.ts` selects are curated/narrow). Any
    new preview/analytics widget in a redesign must keep to aggregate/curated
    fields only - this is reinforced by the analytics endpoint's ordinal
    (0-3) intensity bands rather than raw counts (`lib/api/voucher.ts:310-314`,
    `voucherAnalyticsSchema`).

12. **Capability gate is display-only, fail-closed** - `useVoucherCapability`
    (`lib/voucher/useVoucherCapability.ts`) is explicitly a client display
    gate (`canManage` false while loading); every privileged action it
    unlocks is independently re-enforced server-side via
    `resolveMerchantContext` + `assertCanManageVouchers`
    (`src/api/merchant/shared.ts:150-168`, OWNER or a BRANCH_MANAGER granted
    `canManageVouchers`). A redesign must keep both sides.

---

## 4. Backend surface

Base path: `/api/v1/merchant/vouchers` (Fastify routes in
`src/api/merchant/voucher/routes.ts`; service logic in
`src/api/merchant/voucher/service.ts`).

### Custom (RCV) voucher endpoints

| Method + path | Zod schema | Notes |
|---|---|---|
| `GET /` | - | `listVouchers` - curated select (no raw `merchantFields`), adds `redemptionCount` + `pendingEdit` (at most 1 PENDING row). |
| `POST /` | `createVoucherSchema` (`routes.ts:88-90`) | `createVoucher` - requires OWNER/canManageVouchers; `SAVING_INVALID` if `estimatedSaving` not finite/positive or overflows `Decimal(10,2)`; `INVALID_AVAILABILITY_WINDOWS` on malformed/overlapping windows or windows on a non-TIME_LIMITED type; strips admin-owned `merchantFields` keys; `MERCHANT_FIELDS_TOO_LARGE` guard. |
| `GET /:id` | - | `getVoucher` - full row incl. `merchantFields`, `availabilityWindows` (relation, explicitly included), `pendingEdit`. |
| `GET /:id/analytics` | - | `getVoucherAnalytics` - read-only aggregation (see §analytics below). |
| `PATCH /:id` | `updateVoucherSchema` (partial of base) | `updateVoucher` - **DRAFT-only** (`VOUCHER_NOT_EDITABLE` otherwise); nullable-clear contract for `imageUrl`/`expiryDate`; `merchantFields` MERGES (never replaces) after stripping admin-owned keys; cross-field `COOLDOWN_REUSABLE_ONLY` check against the effective (post-merge) type; window replacement is wholesale (`deleteMany` + `create`) when the key is supplied; rejects a type change away from TIME_LIMITED while windows are still attached. |
| `POST /:id/submit` | - | `submitVoucher` - **DRAFT-only** (`VOUCHER_NOT_SUBMITTABLE`); `TIME_LIMITED_REQUIRES_WINDOW` if zero windows; atomically flips status to `PENDING_APPROVAL` + creates/reopens an `AdminApproval{type:'VOUCHER'}` row; clears admin-owned `merchantFields` keys on resubmit. |
| `DELETE /:id` | - | `deleteVoucher` - **DRAFT-only** (`VOUCHER_NOT_DELETABLE`). |
| `POST /:id/request-end` | `governedReasonSchema` (`reason` 1-2000 chars) | `requestVoucherEnd` - **custom-only** (D4); ACTIVE-only; creates `VoucherPendingEdit{kind:'END'}` + `AdminApproval{type:'VOUCHER_EDIT'}`; `PENDING_EDIT_EXISTS` if one is already open. |
| `POST /:id/withdraw` | - | `withdrawVoucherSubmission` - instant self-service; only valid on `status:PENDING_APPROVAL` + `approvalStatus != APPROVED` (`VOUCHER_WITHDRAW_NOT_PENDING` otherwise); flips voucher to `DRAFT` + approval to `WITHDRAWN`. |
| `POST /pending-edits/:id/withdraw` | - | `withdrawVoucherPendingEdit` - withdraws an own PENDING edit (either kind); `PENDING_EDIT_NOT_FOUND` if missing/not-PENDING/cross-tenant. |

### Flagship (RMV) endpoints (`/rmv` sub-prefix)

| Method + path | Zod schema | Notes |
|---|---|---|
| `GET /rmv` | - | `listRmvVouchers` - includes `rmvTemplate`, `redemptionCount`, `pendingEdit`. |
| `POST /rmv/create-flagship` | `{ voucherType: VoucherTypeEnum }` | `createFlagshipRmvVoucher` - eligibility gate first (`VOUCHER_TYPE_NOT_ELIGIBLE`), then cap gate (`FLAGSHIP_RMV_LIMIT_REACHED` at 2), then template lookup (`NO_RMV_TEMPLATE` if the (category, type) template is missing/inactive). |
| `PATCH /rmv/:id` | `z.record(z.string(), z.unknown())` (routes.ts:241, no field-shape validation at the Zod layer) | `updateRmvVoucher` -> `updateRmvVoucherCore` - **DRAFT-only**; validates PATCH keys against `RmvTemplate.allowedFields` (`RMV_FIELD_NOT_ALLOWED` otherwise); merges the WHOLE body into `Voucher.merchantFields`; writes NOTHING to top-level columns (title/description/estimatedSaving/imageUrl stay at template defaults until submit). |
| `POST /rmv/:id/submit` | - | `submitRmvVoucher` -> `submitRmvVoucherCore` - **DRAFT-only**; promotes merchant-authored fields from the `merchantFields` bag onto the top-level columns (type-guarded: strings must be strings, saving must be sane + fit the column); re-links `type`/`rmvTemplateId` if the discount kind was toggled fixed<->percent in the bag; flips to `PENDING_APPROVAL`. |
| `POST /rmv/:id/request-change` | `requestChangeSchema` (`routes.ts:259-266`: `reason` + optional `title`/`description`/`terms`/`imageUrl`/`estimatedSaving`) | `requestFlagshipVoucherChange` - **ACTIVE-only** (`VOUCHER_EDIT_NOT_ALLOWED` otherwise - a DRAFT flagship keeps the direct PATCH path); proposed keys intersected against `RmvTemplate.allowedFields` (`RMV_FIELD_NOT_ALLOWED`); creates `VoucherPendingEdit{kind:'CHANGE'}` + `AdminApproval{type:'VOUCHER_EDIT'}`; voucher stays untouched (ACTIVE) pending review. |

### Fields that exist server-side (Voucher model, `prisma/schema.prisma`)

`id, merchantId, code, isMandatory, type (VoucherType), title, description?,
terms?, imageUrl?, estimatedSaving (Decimal 10,2), expiryDate?,
cooldownSeconds? (REUSABLE only, null = 4h platform default, floor 1800s at
redemption), status (VoucherStatus), approvalStatus (ApprovalStatus),
approvalComment?, approvedAt?, approvedBy?, isRmv, rmvTemplateId?,
merchantFields (Json?), publishedAt?, createdAt, updatedAt, isTestData` +
relations `redemptions`, `cycleStates`, `favouritedBy`, `rmvTemplate`,
`availabilityWindows` (`VoucherAvailabilityWindow[]`), `pendingEdits`
(`VoucherPendingEdit[]`).

`VoucherAvailabilityWindow`: `id, voucherId, dayOfWeek (0-6), openTime
("HH:mm"), closeTime ("HH:mm" or "24:00")`.

`VoucherPendingEdit`: `id, voucherId, merchantId, kind (CHANGE|END),
proposedChanges (Json?), reason?, status (PendingEditStatus), reviewedBy?,
reviewNote?, createdAt, reviewedAt?`.

`RmvTemplate`: `id, categoryId, voucherType, title, description,
allowedFields (Json), minimumSaving (Decimal 10,2), isActive, createdAt,
updatedAt` - unique on `(categoryId, title)`.

### Validation rules of note

- `estimatedSaving`: must be finite, `> 0` (`assertSavingSane`,
  `service.ts:73-77`, `SAVING_INVALID`); must fit `Decimal(10,2)` after
  half-away-from-zero rounding (`assertSavingFitsColumn`,
  `service.ts:92-97`) - there is **no advisory floor enforced server-side**
  (the £5 "minimum saving" language in the onboarding builder UI is a
  client-only advisory input to the score, per `D8b`).
- `cooldownSeconds`: `REUSABLE`-only (Zod cross-field refine on create,
  service-layer cross-field check against the effective type on PATCH,
  `COOLDOWN_REUSABLE_ONLY`); floor 1800s enforced at 3 layers (Zod, runtime
  clamp at read, DB CHECK constraint).
- `availabilityWindows`: `TIME_LIMITED`-only
  (`INVALID_AVAILABILITY_WINDOWS` on any other type); per-row `HH:mm` format
  (`closeTime` may also be the `24:00` sentinel, never as `openTime`);
  `closeTime > openTime` (no cross-midnight in one row); no overlapping
  windows per `(voucherId, dayOfWeek)`; `TIME_LIMITED_REQUIRES_WINDOW` blocks
  submit with zero windows. Branch-hours overlap and literal Europe/London
  wall-clock enforcement are NOT enforced server-side (documented as v1 gaps
  in `service.ts:110-112`).
- `title`: 1-200 chars; `description`/`terms`: 0-2000 chars (Zod, `routes.ts:50-53`).

### Builder-relevant fields that do NOT exist server-side

- No per-voucher "category" or "tag" field distinct from the merchant's
  overall category - vouchers are merchant-wide, not per-branch or
  per-category.
- No structured discount/BOGO/etc. columns - all 5 structured types'
  buy/free/spend/save/discount/package inputs live ONLY inside the opaque
  `merchantFields` JSON bag (client-composed into `title`/`description`/
  `terms` before the top-level columns are written); there is no queryable
  "spendAmount" or "bogoBuy" column.
- No server-side advisory-score persistence - the score is computed
  entirely client-side from the same inputs the preview uses; nothing is
  stored.
- No image/photo metadata beyond the single `imageUrl` string (no alt text,
  no multi-image gallery, no crop metadata).
- No `askHelp` column - it lives inside `merchantFields` only, and (per §2b)
  is only actually surfaced as UI in the onboarding builder today.
- No "featured"/"trending" linkage on the voucher itself (those are separate
  models, `FeaturedMerchant` / merchant-level trending, not voucher-level).

---

## 5. Test baseline (must stay green / be consciously updated)

Jest suites under `apps/merchant-web` (`it`/`test` block counts from a static
grep, not a live run):

| File | Blocks |
|---|---|
| `app/(app)/vouchers/__tests__/page.test.tsx` | 22 |
| `app/(app)/vouchers/[id]/__tests__/page.test.tsx` | 15 |
| `app/(app)/vouchers/[id]/__tests__/flagship.test.tsx` | 8 |
| `app/(app)/vouchers/[id]/__tests__/actions.test.tsx` | 13 |
| `app/(app)/onboarding/vouchers/__tests__/page.test.tsx` | 11 |
| `components/insights/tabs/__tests__/VouchersTab.test.tsx` | 11 |
| `components/vouchers/__tests__/RequestEndModal.test.tsx` | 4 |
| `components/vouchers/__tests__/VoucherAnalytics.test.tsx` | 3 |
| `components/vouchers/__tests__/VoucherGovernedMenu.test.tsx` | 12 |
| `components/vouchers/__tests__/PendingVoucherEditBanner.test.tsx` | 5 |
| `components/vouchers/__tests__/RequestChangeModal.test.tsx` | 8 |
| `components/vouchers/__tests__/ConciergeDiff.test.tsx` | 7 |
| `components/vouchers/builder/__tests__/builderModel.test.ts` | 12 |
| `components/vouchers/builder/__tests__/DayTwoBuilder.test.tsx` | 9 |
| `components/vouchers/builder/__tests__/builder-v1-parity.test.tsx` | 32 |
| `components/onboarding/vouchers/__tests__/ScoreCard.test.tsx` | 4 |
| `components/onboarding/vouchers/__tests__/TypePicker.test.tsx` | 6 |
| `components/onboarding/vouchers/__tests__/BuilderForm.test.tsx` | 20 |
| `lib/voucher/__tests__/useVoucherCapability.test.tsx` | 4 |
| `lib/voucher/__tests__/typeMeta.test.ts` | 8 |
| `lib/voucher/__tests__/displayState.test.ts` | 8 |
| `lib/voucher/__tests__/terms.test.ts` | 22 |
| `lib/voucher/__tests__/scoring.test.ts` | 15 |
| `lib/voucher/__tests__/compose.test.ts` | 19 |
| `lib/voucher/__tests__/config.test.ts` | 20 |
| `lib/api/__tests__/voucher-custom.test.ts` | 15 |
| `lib/api/__tests__/voucher.test.ts` | 5 |
| `lib/api/__tests__/voucher-governed.test.ts` | 8 |

**Total: ~308 jest `it`/`test` blocks across 28 files.** Run with `npx jest`
in `apps/merchant-web` (per root `CLAUDE.md` §11).

Playwright browser-smoke lane (`e2e/vouchers-builder-edit.spec.ts`, 1 file):
covers the edit-existing journey end to end in a real browser - opening a
DRAFT custom voucher, hydrating the Edit builder from saved values, the
"always resend a PATCH" contract (unchanged fields still ride along),
the nullable-clear contract for `imageUrl`/`expiryDate` in a real browser,
and Cancel firing no PATCH. Uses `TIME_LIMITED` as its fixture type
specifically because it is non-structured. Run with `npx playwright test` in
`apps/merchant-web`; CI job is advisory (per `.claude/rules/merchant-web.md`).

Any redesign that changes builder field names, DOM structure/`data-testid`s,
or the create/edit/duplicate state machine will need to touch most of the
component-level and page-level suites above, not just the pure-logic
`lib/voucher/__tests__/*` suites (those only break if the composition/scoring/
terms/config logic itself changes).

---

## 6. Styling baseline

**Tokens**: `apps/merchant-web/app/globals.css` (imported via `app/layout.tsx`)
is the live source of truth, bridging Tailwind v4 `@theme inline` onto brand
tokens. A parallel prototype/spec copy lives at
`docs/design/merchant-portal/design-system/tokens.css` (referenced in a
comment at the top of `globals.css`); the two are close but not
byte-identical (e.g. the doc copy adds a `--type-*` fluid type scale and
`--space-*` grid that `globals.css` does not carry verbatim as CSS variables
in the excerpt inspected - treat `globals.css` as authoritative for what the
running app actually uses).

Key tokens relevant to a voucher builder redesign:
- Brand spine: `--rose:#E20C04`, `--coral:#E84A00`, `--navy:#010C35`,
  `--brand-gradient: linear-gradient(135deg, #E20C04, #E84A00)`.
- Warm neutrals: `--cream:#FFF9F5`, `--tint:#FEF6F5`, `--tint-deep:#FEF0EE`,
  `--neutral:#F8F9FA`, `--subtle:#F3F4F6`, `--border-subtle:#E5E7EB`.
- **Voucher-type accent tokens already exist and are wired to the `Chip`
  component**: `--vt-bogo:#7C3AED`, `--vt-discount:#E20C04`,
  `--vt-freebie:#16A34A`, `--vt-spendsave:#E84A00`, `--vt-package:#2563EB`,
  `--vt-timelimited:#D97706`, `--vt-reusable:#0D9488` (`components/ui/chip.tsx`
  hardcodes the same hex values in an `ACCENT` map rather than reading the
  CSS vars directly - worth normalising in a redesign).
- Functional signals: `--success:#0F7A3E`, `--savings:#16A34A`,
  `--warning:#B45309` / `--warning-bg:#FEF6EC`, `--danger:#B91C1C` /
  `--danger-bg:#FEECEC`.
- Fonts: display = `'Mustica Pro', Georgia, 'Times New Roman', serif`
  (self-hosted `MusticaPro-SemiBold.otf`, weight 600 only); body = `'Lato',
  system-ui, -apple-system, sans-serif` (self-hosted Light/Regular/Medium/
  Semibold/Bold). Font files load from `apps/merchant-web/public/fonts`.
  Builder heading copy consistently uses `font-display` (`font-display
  text-xl font-semibold`); body copy uses default (Lato).
- Radii: `--radius-sm:10px`, `--radius-md:14px`, `--radius-lg:18px`,
  `--radius-pill:999px` - the builder components use raw arbitrary Tailwind
  values (`rounded-[12px]`, `rounded-[14px]`, `rounded-[16px]`) rather than
  consistently referencing these named tokens; a redesign should decide
  whether to tighten this to the token scale.
- Shadows: `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-glow`
  (navy-tinted + a brand-rose glow variant used e.g. on the active TypePicker
  card border in `components/vouchers/builder/TypePicker.tsx:48`).

**Form component library** (`apps/merchant-web/components/ui/`): `button.tsx`,
`card.tsx`, `chip.tsx`, `dialog.tsx`, `file-upload.tsx`, `input.tsx`,
`label.tsx`, `popover.tsx`, `skeleton.tsx`, `stepper.tsx`, `switch.tsx`,
`table.tsx`, `textarea.tsx`, `toast.tsx`, `badge.tsx`. These are shadcn-style
primitives, brand-mapped via the CSS vars above (per `components.json` +
`shadcn` registry usage noted in CLAUDE.md's tooling). **The two builders do
NOT consistently use this shared library for their own inner fields** -
`components/vouchers/builder/fields.tsx` and `components/onboarding/vouchers/
fields.tsx` each define their own bespoke `TextField`/`MoneyField`/
`Segmented`/`FieldBlock` primitives (two near-duplicate implementations, one
per builder, both hand-rolled with raw Tailwind + inline hex colours rather
than the `components/ui/input.tsx` / `label.tsx` primitives). Only the
top-level chrome (`Card`, `Button`, `Textarea`, `Switch`, `Dialog`,
`FileUpload`) reuses the shared library; a redesign has an opportunity (and
arguably a mandate) to consolidate the two field-primitive sets into one,
ideally on top of `components/ui/*` rather than a third bespoke set.

**Two-column builder + live-preview layout already exists** and can be
reused/extended rather than invented:
- Day-2 builder: CSS grid `grid gap-6 lg:grid-cols-[1fr_360px]`
  (`DayTwoBuilder.tsx:261`), right column stacks `BuilderPreview` (customer
  preview card) above `BuilderScore` (advisory score card).
- Onboarding builder: flex row `flex flex-col gap-6 lg:flex-row
  lg:items-start` (`BuilderForm.tsx:307`), left flex-1 form, right
  `lg:max-w-sm` aside stacking a smaller `VoucherPreview` card above
  `ScoreCard`.
- Both collapse to a single stacked column below `lg` (no responsive
  breakpoint distinct from Tailwind's default `lg` in either).

Neither preview panel is genuinely sticky (`position: sticky`) today - both
just render in normal flow in the right column, so on a long form the
preview scrolls out of view. Flag this to design/build as a likely
improvement if the prototype shows a persistently-visible preview.
