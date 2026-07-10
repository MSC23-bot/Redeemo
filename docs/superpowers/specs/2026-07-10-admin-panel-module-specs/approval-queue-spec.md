# Admin Panel — Approval Queue + Review/Actioner (module spec)

Implementation-grade spec grounded in the prototype HTML
`Redeemo Admin - Foundation.dc.html`. Every selector / state key / vals name / label below is
quoted from source (line refs in parentheses). Two screens: **1.3 Approval Queue** (`isQueue`,
template 377-540) and **1.4 Review / Actioner** (`isReview`, template 7815-8760). Both are
`shellScreen` values inside the operator shell (`shellScreen === 'queue'` / `'review'`,
nav ids `queue` and `actioner`, line 13671). Decisions: D37 (two-court + two-tier correction +
per-item audit timeline), D56 (edit-on-behalf lanes), D59 (assign-then-claim, deferred to Wave 2).

---

## A. SCREEN INVENTORY + LAYOUT

### A.1 Approval Queue (list/triage screen) — `isQueue`
Single scrolling `<main>` on cool-neutral canvas (`background:var(--neutral)`), `max-width:1240px`
centred, padding `26px 30px 60px`. Root `<div class="q-root {{ narrowClass }}">` (378-379).

Structure top→bottom:
1. **Header block** (381-403): eyebrow `Operations · Approval Queue`; H1 `Approval queue`
   (`font-family:var(--font-display);font-weight:600;font-size:30px`); subtitle
   `One list across onboarding, voucher, merchant-edit and branch-lifecycle approvals. Oldest first; you judge priority, there is no countdown.`
   Right cluster: `+ New merchant` gradient button (`openCreateDraft`); `Last updated {{ lastUpdated }}`
   text; refresh icon-button (`refreshNow`, `{{ refreshIcon }}`); auto-refresh toggle
   (`toggleAuto` / `{{ autoLabel }}` = "Auto-refresh: on (45s)"). NOTE: `+ New merchant`,
   `lastUpdated`, refresh, auto-refresh are REAL affordances to build (create-draft entry + poll).
2. **Prototype state switcher** (395-401) — DO NOT BUILD (see §F): "REVIEW" label +
   `Populated / Loading / Empty / Error / Denied` buttons (`setQReady`/`setQLoading`/`setQEmpty`/
   `setQError`/`setQDenied`) + divider + `Narrow` toggle (`toggleNarrow`).
3. **Two-court tabs** (405-410): bottom-bordered tab strip, `sc-for {{ qTabs }}`. Each tab =
   label + count pill. Active tab: `font-weight:700`, `color:var(--navy)`, `borderBottom:2px solid var(--rose)`
   (`qTabStyle`, 13500). Tabs: **"Needs you"** (`key:'needs'`) and **"Awaiting merchant"**
   (`key:'merchant'`) (17608-17611). Selecting a tab also resets `qFilter:'all'`.
4. **Filter chips** (412-421): `sc-for {{ qChips }}`, chips = All / Onboarding / Voucher /
   Merchant edit / Branch lifecycle (17614-17616). Active chip = navy fill (`chipStyle`, 13890).
   Each chip shows a count (or a shimmer bar when loading, 416-417). Counts are scoped to the
   ACTIVE court tab (`courtRows(s.qTab)`).
5. **Body** — mutually-exclusive `sc-if` blocks keyed off `queueState`:
   - `qLoading` skeleton table (423-436): header bar + 5 shimmer rows (`animation:sk`).
   - `qError` (438-446): red-bordered card, alert icon, **"Could not load the approval queue"** /
     `The service did not respond. No items were changed. This is different from an empty queue.` +
     `Retry` (`retryQueue`). DISTINCT from empty.
   - `qDenied` (448-456): grey card, lock icon, **"You do not have access to the approval queue"** /
     `This area needs the approval:read capability. Your role does not hold it. Nothing is broken; ask an admin if you need access.` + `Request access` button.
   - `qEmpty` (458-466): **"No items match"** / `Nothing is waiting under this filter. Approvals appear here as merchants submit them.` + `Clear filter` (`clearFilter`).
   - `qReady` (468-534): the **wide table** (`.q-wide`) + the **narrow card list** (`.q-narrow`) +
     footer `Read and triage only. Selecting a row opens it in Review / Actioner (next screen); no actions are taken here.` (532).
   State drivers (17619-17625): `qEmpty = queueState==='empty' || (ready && sortedQueue().length===0)`;
   `qReady = ready && sortedQueue().length>0`; `qLoading/qError/qDenied` map to `queueState`.

**Wide table** (469-509): columns MERCHANT / TYPE / COURT / WAITING / VERIFICATION / STATUS /
OWNER-CLAIM. Sortable headers (cursor pointer + rose arrow glyph): Merchant (`qsort_merchant`),
Type (`qsort_type`), Waiting (`qsort_age`), Owner/claim (`qsort_owner`); Court/Verification/Status
NOT sortable. Rows clickable → `row.onOpen` (opens Review at that `reviewSelId`, 17604). Hover
tint `var(--tint)`.

**Narrow card list** (511-531): `.q-narrow` — one card per row (merchant + age pill header; type/
court/lifecycle/appr pill row; merchant-court why-note; footer verif + owner/Unclaimed). CSS class
toggles wide↔narrow. **CP-1/CP-2 carry (now root-caused & CLOSED at 2.13): must REPLACE the table,
never stack below it** — enforce via stylesheet `display` on `.q-wide`/`.q-narrow`, never inline
`display:flex`.

### A.2 Review / Actioner (split-pane) — `isReview`
Full-height flex column `<main>` (`display:flex;flex-direction:column;min-height:0`), NOT the
scrolling max-width container.

1. **Top bar** (7817-7820, flex:none, white, bottom-bordered): left = `‹ Queue` back button
   (`goQueue`) + eyebrow `Operations · Review / Actioner` + `{{ reviewSurfaceLabel }}`
   (= `surfaceName + ' review'`, e.g. "Branch creation review"). Right = prototype state switcher
   (DO NOT BUILD): `By me / By other / Unclaimed / Orphaned / Loading / Denied`
   (`setRvMe`…`setRvDenied`, drives `reviewState`).
2. **Body split** (7836): flex row.
   - **Left rail** (`width:300px`, flex:none, white, bordered, scroll): sticky header
     "Review queue"; `sc-for {{ reviewRows }}` — each item = merchant + age pill + type chip +
     lifecycle pill; selected item has a rose left-accent bar (7852) + `var(--tint)` bg; click →
     `reviewSelId`. List = `reviewList` (17646-17650) = a synthetic Onboarding item + all `QROWS` +
     a synthetic Media item.
   - **Right pane** (7851, flex:1, column, relative): mutually-exclusive by `reviewState`:
     - `rvLoading` skeleton (7853-7860).
     - `rvDenied` (7862-7870): lock, **"You do not have access to review this item"** /
       `This needs the approval:review capability, which your role does not hold. Nothing is broken; ask an admin if you need it.`
     - `rvContent` (`!['loading','denied'].includes(reviewState)`, 17684): scrolling detail body
       (`padding:22px 26px 132px` — bottom padding clears the sticky bar) + the **sticky action bar**
       at the pane foot.

**Sticky action bar** (bottom of right pane, 8698-8740) — 4 mutually-exclusive claim-state blocks:
`rvUnclaimed`, `rvOther`, `rvOrphaned`, `rvMe` (§C.1).

---

## B. DATA FIELDS

### B.1 Queue row model (`QROWS`, 13730-13744; view-map `qRows`, 17587-17606)
Row fields: `id`, `merchant`, `type` ∈ {`Onboarding`, `Voucher`, `Merchant edit`, `Branch lifecycle`},
`ageHours`, `verif{label,tone}`, `life` (lifecycle), `appr` (approval), `owner` (name|null),
`claimedHours`, and merchant-court-only: `court:'merchant'`, `mReason` ∈ {`changes`,`correction`},
`mHours` (merchant wait-age).

| Column (header) | Source | Rendering |
|---|---|---|
| **Merchant** | `r.merchant` | bold text; sortable |
| **Type** | `r.type` | `typeChip(type)` coloured chip (§E); sortable |
| **Court** | `courtOf(r)` → `courtPill` | pill w/ dot: you="Needs you" green, other="Claimed by other" grey, merchant="Awaiting merchant" amber (13503) |
| **Waiting** | `effAge(r)` via `fmtAge` | `agePill` tinted by age (§E); sortable. Merchant-court rows add sub-line `{{agePrefix}} · {{whyNote}}` = "with merchant · awaiting correction approval" or "changes requested" (17600-17601) |
| **Verification** | `r.verif.label` + `verifDot(tone)` | dot + label; labels seen: "Location: postcode centroid", "Documents pending", "Location: needs review", "Verified", "Unverified", "Location: geocoded" |
| **Status** | `lifePill(r.life)` + `apprPill(r.appr)` | TWO pills side by side: lifecycle (In review/Submitted/Changes needed/…) + approval (Pending/Changes requested/Approved/Rejected) |
| **Owner / claim** | `r.owner` / `r.claimedHours` | avatar (initials) + name + `claimed {age} ago`; `OVER 24H` amber badge when `claimedHours>24` (`stale`, 17602); else dashed-dot **"Unclaimed"**; sortable |

Court derivation (13482-13486): `courtOf` = `r.court` if present, else `'you'` when unowned or
owned by `OPERATOR` (self), else `'other'`. `effAge` = merchant rows use `mHours`, others `ageHours`.
`sortedQueue()` filters by `qTab` (merchant-court vs not) then `qFilter` (type), sorts by
`qSortCol`/`qSortDir` (13484-13498). Court-tab membership is fixed by `court` field, NOT by owner.

### B.2 Per-type review detail fields — see §D.

---

## C. INTERACTIONS + ACTIONS

### C.1 Single-actor claim-to-act model (sticky bar, 4 states)
`reviewState` ∈ `unclaimed | me | other | orphaned` (+ demo loading/denied). The claim model is a
REAL machinery port (claim/release, claimer-or-Super-Admin release guard).

- **Unclaimed** (`rvUnclaimed`, 8699-8704): text `Claim this item to take action. Claims are exclusive to one operator.` + gradient **"Claim to act"** button (`claimIt` → `reviewState:'me'`).
- **Claimed by me** (`rvMe`, 8724-8739): text `You claimed this. Today one operator can claim and approve; a separate countersigner is not enforced.` + underlined **"Release claim"** (`releaseIt`). Then the ACTION SET (below).
- **Claimed by other** (`rvOther`, 8706-8717): avatar + `Claimed by Aisha K. 3h ago. Only the claimer or a Super Admin can release it; you cannot act or steal the claim.` Action buttons rendered DISABLED (`opacity:.5;pointer-events:none`).
- **Orphaned** (`rvOrphaned`, 8718-8723): red text `Approval and go-live are blocked while the merchant record is orphaned. Escalate to a Super Admin.` + disabled primary. (Onboarding body also shows a full orphaned banner, 8160-8166.)

Honesty lock (both `rvMe` action row and approve dialog, 10259): "A single operator can claim and
approve today; a separate countersigner is not yet enforced." — no four-eyes claim.

### C.2 Sticky action SET (per-surface, `rvMe` only)
Which buttons appear is computed from the surface flags (17672-17681):
- `stickyShowPrimary = !reviewIsMedia` → primary approve button, label `stickyPrimaryLabel`
  (`primaryApproveLabel`, 17177): Onboarding="Approve and go-live", Voucher="Approve voucher",
  Merchant edit="Approve edit", Branch create="Approve branch", Branch close="Approve closure".
  Opens approve dialog (`openApprove`).
- `stickyShowReject = !reviewIsMedia` → reject button, `stickyRejectLabel` = "Reject edit" for
  merchant-edit else "Reject" (`rejectLabel`, 17178). Opens reject dialog (`openReject`).
- `stickyShowCorrect = reviewIsVoucher || reviewIsMerchantEdit` → "Correct on behalf"
  (`openCorrect` sets `correctCtx` = 'voucher'|'merchantEdit', 17678).
- **Request-changes** is split: `stickyRequestPrimary = reviewIsOnboarding` → prominent
  "Request changes" button; `stickyRequestIsFallback = reviewIsVoucher` → de-emphasised underlined
  "Request changes (needs merchant)" with tooltip `Fallback: only for items the merchant must supply`
  (8732-8733). Both call `openChanges`.
- `stickyIsMedia = reviewIsMedia` → no dialog buttons; inline note
  `Approve or reject each photo above; admin approval is the moderation gate.` (per-photo actions live in body).

Per-surface action matrix:
| Surface | Primary | Reject | Correct | Request changes |
|---|---|---|---|---|
| Onboarding | Approve and go-live | Reject | — | prominent (primary) |
| Voucher | Approve voucher | Reject | Correct on behalf | fallback (underlined) |
| Merchant edit | Approve edit | Reject edit | Correct on behalf | — |
| Branch create | Approve branch | Reject | — | — |
| Branch close | Approve closure | Reject | — | — |
| Media/photo | — (per-photo) | — | — | — |

### C.3 Review dialog (`reviewDialog` ∈ `changes|reject|approve`; template 10227-10276)
Single modal, title/body driven by `reviewDialogTitle`/`reviewDialogBody` (17199-17200):
- **Request changes** (`rdChanges`): title "Request changes from the merchant"; body
  `Your reason is sent to the merchant and recorded in the audit trail. The item returns to the merchant to fix and resubmit.`
  Adds **Quick reasons** chip row (`quickReasons`, 17743): "Branch location unconfirmed",
  "Voucher wording unclear", "Document missing or expired", "Category mismatch". Required reason
  textarea (min 8 chars). On confirm (17755): toast `Change request sent to the merchant with your reason. Recorded in the audit trail.`
- **Reject** (`rdReject`): title "Reject this {surface}"; body
  `This is recorded in the audit trail and the merchant is notified with your reason.` Required
  reason (min 8). Confirm → error toast `{Surface} rejected. Reason recorded and the merchant notified.`
- **Approve** (`rdApprove`): title/body from `approveTitleMap`/`approveBodyMap` (17181-17197),
  keyed by type. Branch-close approve REQUIRES a closure reason (`rdApproveNeedsReason`, min 8,
  10251-10256). Onboarding + branch-create approve run a GATE re-check on submit (17759, §D):
  if the location gate is unmet → close dialog, set `gateFail:true`, error toast
  `Cannot go live: the location gate is not met.` Confirm button disabled until valid
  (`reviewConfirmDisabled`, 17752); reason count shown.

Reason threshold everywhere = **min 8 chars** (`rok = reviewReason.trim().length >= 8`).

### C.4 Correction-on-behalf two-tier flow (D37; modal `correctOpen`, 9334-9398)
Opened via `correctCtx` = `voucher | merchantEdit | onboarding` (17767; onboarding via
`openCorrectOnboarding`). Field set from `FIELD_SETS[correctCtx]` (10603-10630). Each field carries
`material:boolean`. **Material = money + legal identity**: voucher `saving` (Value/saving); merchant-edit
`businessName`, `tradingName`; onboarding same identity pair. Cosmetic = title/description/terms/
availability/image/website/contact/category/opening-hours.

Modal: header "Correct on behalf" + "Net-new concept" tag; sub `Author the fix to the {{correctCtxLabel}} yourself, in place. You are acting on behalf of the merchant; the reason and your identity are written to the audit trail.`
(`correctCtxLabel` from `CORRECT_TITLES`: voucher→"voucher", merchantEdit→"merchant profile",
onboarding→"onboarding submission"). Editable fields (input/textarea); a touched material field
gets amber wrap + **"Needs merchant approval"** tag (9349, `showMarker`). Required reason
(min 8, `correctReason`). Two mutually-exclusive outcome banners (17772-17776):
- `correctTouchedMaterial` (amber, 9369-9373): `You changed a money or identity field. The cosmetic parts could apply now, but the whole correction waits on the merchant to approve the material change before it goes live. Routing identity and value corrections to the merchant is a net-new concept, not yet built.`
  Primary label → **"Send to merchant for approval"** (navy button).
- `correctCosmeticOnly` (green, 9375-9378): `Cosmetic fields only. This applies directly and goes live with no merchant round-trip (audited). Applying cosmetic corrections directly is a net-new concept, not yet built.`
  Primary label → **"Apply and approve"** (glow button).

Footer: `Logged against Shebin C. (Operations)` (synthetic operator) + Cancel + primary
(disabled until any field touched AND reason ok). On submit (17784-17786): fires appropriate toast,
closes. **KEY RULE: cosmetic/operational = direct/live; ANY material field taints the whole
correction → routes to merchant.** "Who edits the proposed" = the operator.

### C.5 Assign-then-claim (D59) — NOT in this prototype build
D59 (assignment ROUTES, claim COMMITS; `assignedToId/assignedById/assignedAt` schema addition;
`approval:assign`/`task:assign` cap; fires `ADMIN_REVIEW_ASSIGNED`) is the **first Wave-2 focused
pass**, designed on the Tasks & Follow-ups (2.3) surface, and back-ports an "Assigned, awaiting
claim" state onto this queue. This module today only has self-claim (`claimedById`). Build the queue
so an assigned-but-unclaimed state can be added (a 5th owner-cell rendering + a court/filter facet)
without rework. See §G ambiguities.

### C.6 Per-item audit-history timeline (D37; template 8635-8687, data `auditTimeline` 10844-10851)
Rendered at the foot of every review detail body (in onboarding body here; applies to all types).
Header "Audit history (this item)" + green **"Real"** tag. Vertical timeline, `sc-for {{auditEvents}}`.
Each event: coloured dot (actor-type: operator=navy, merchant=amber `#B45309`, system=grey, 17665);
`action` title + `time`; `actor` (name + role); optional `Reason:` line; optional `note` line;
optional **diff rows** — `field · before(strikethrough) → after(green)` with a `material` amber tag
when `d.material` (8683). Footer: `Every action is recorded with actor, reason and timestamp; nothing is redacted except a branch redemption PIN (never shown). This per-item history rolls up into the platform-wide Global Audit (built later).`
Sample events (10848-10850): "Corrected on behalf" (diff Title + Saving[material]), "Sent to
merchant for approval" (note: material routed, cosmetic held). Correction-flow event types are
NET-NEW; audit infra is REAL.

---

## D. PER-APPROVAL-TYPE REVIEW TREATMENTS

Surface resolved from `reviewSel.type` (17106-17112): `reviewIsOnboarding/Voucher/MerchantEdit/
Branch/Media`. Branch sub-type from merchant name hack (`branchAction`: Green Fork Deli='close'
else 'create', 17112). Every body opens with a title row + **"Read only"** tag and a cream
on-behalf shield banner. Bodies:

### D.1 Onboarding (`reviewIsOnboarding`, 8344-8695) — field-parity with Merchant 360
The richest body. Order:
- Optional **orphaned** banner (8346-8351) + **gate-fail** banner (8353-8358):
  `Cannot go live: a gate re-check failed on submit. Main branch location is not confirmed (highlighted below). Confirm the branch location, then approve again.`
- **Header**: merchant name + cyan **"Submitted"** pill + Completion row (Email verified ✓ /
  Phone verified (pending) / Agreement signed ✓) (8180-8186).
- **Merchant profile** card (green "Real record"): cover+logo; grid — Business name, Trading name,
  Description, Website (+ inline "Direct edit" → `editWebsite`), Phone, Company number "(free text)",
  VAT "(free text)". **Category chain** (full): Primary category / Subcategory / Cuisine(s) chips /
  Specialties chips (all "Real") + generated "Category label" ("Derived"). **Owner / responsible
  person** (Account · partly real): Title[M3] / Position(Real) / First+Last name[split M3] /
  Email(Real) / Mobile(Real) / Landline[M3]. **Richer profile** ("not stored yet — needs schema
  (M3)"): Business type / Registered office / Head-office contact / Price range / Service options /
  Social links. Footer: `Company number and VAT are free text, not validated against Companies House or HMRC today.` + "Propose identity change" (`proposeIdentity`).
- **Acquisition source** card (Real derived): Self-serve vs Admin-created draft (`acqSelfServe`/
  `acqAdminCreated`); Future: richer source not tracked.
- **Business verification** card ("Concept, not built"): Google Place Details / Companies House /
  FHRS / Duplicate detection dashed tiles + Manual verification status "Unverified" (Real).
- **Branches** section (per-branch card w/ manager assignment note, till/scan users, branch-email
  recipients + owner-receives toggle [concept/Phase 6], **Redemption PIN** row [Net-new · on-behalf:
  masked "Hidden by policy", Reveal + Reset PIN — D46, opens `pinDialog`, PIN value never rendered],
  **Location (automated)** map w/ 3-tier ladder + Confirm/Nudge/Flag).
- **Documents** card (Real record): per-doc status (Uploaded/Pending "Awaiting merchant") + "Open
  (signed link)" (`openDoc`) + operator notes. Honesty: signed links only, raw paths never shown.
- **Vouchers** card ("Mandatory 2 / 2" + "1 custom"): per-voucher (banner, type, title, kind
  RMV/RCV, approval pill, terms/value/expiry/redemptions/window/reuse, advisory value meter
  weak/good/strong, **Category value benchmark** [Net-new, quartile vs peers], concierge proposal
  hint). Note: `Voucher approval is its own review lane, not an onboarding gate.`
- **Go-live checklist** (`gates`, 17114-17119): 5 hard gates — "At least one branch exists" /
  "A main branch is set" / "Contract signed (click-to-agree)" / "Two mandatory (RMV) vouchers
  configured" / "Main branch location confirmed" (only this one dynamic = `locationConfirmed`).
  Unmet gate under `gateFail` gets red highlight + "Blocking go-live". Plus advisory (non-blocking)
  gates below a dashed divider.
- **Staff captured** card (Real record): Portal managers (Active / Invited-pending).
- **Agreement / contract** card (green "Real evidence"): Terms version, Timestamp, Signatory name
  [net-new M3], Signatory title [M3], Signature method [M3] "Click-to-agree (clickwrap) + drawn
  signature on file", IP address. **"Honest gaps"**: 12-month end date not set / contract text
  placeholder / Zoho e-sign unused option.
- **Editing on behalf** card: on-behalf shield; **"Correct on behalf"** entry (Net-new concept) →
  `openCorrectOnboarding`; three lanes — **Direct** (green: simple fields e.g. website → `editWebsite`),
  **Propose** (amber: sensitive identity name/description/logo/banner/address → `proposeIdentity`),
  **Fallback** (dashed: "Request changes: only for items the merchant must supply e.g. a missing
  document"). Future notes: propose lane = admin self-review today (not four-eyes); per-merchant
  apply-vs-send preference = future.
- **Audit history** (§C.6).

Approve gate (17175-17176): `approveNeedsGate` true; `approveGateOk = gatesMet`. Approve dialog body:
`On submit, the server re-checks every go-live gate. If all pass, the merchant goes live and its vouchers become visible to customers.`

### D.2 Voucher (`reviewIsVoucher`, 7877-7960) — customer preview + concierge diff
- Header: voucher title + grey "Pending" pill + `{merchant} · Custom voucher (RCV) · dedicated voucher-approval lane`.
- Shield banner: `Deciding this voucher's approval status. This is the voucher review lane, separate from any onboarding go-live gate...`
- **Two-column** grid (1fr / 300px): LEFT = **Voucher detail** card (Type, Approval lane,
  Description, Terms, Value/saving, Expiry, Availability window) + **advisory value meter**
  (bar + "Weak value" pill + `advisory only; no enforced minimum-value gate`) + **Category value
  benchmark** (Net-new; "Below median"; marker vs median; `Saves about £4.50 · category median about £8 · below median for Restaurants and cafes · mains ... may be worth a concierge nudge`;
  honesty: needs cross-merchant aggregation, not built). RIGHT = **Customer preview** phone card
  (voucher-type accent stripe, Discount tag, title, merchant·town, "Saves about £4.50" chip,
  window·in-store) + caption `How the voucher will appear to customers.`
- **Concierge proposal** card (7960): blue "Merchant asked for help" tag; `An allow-listed rewrite is proposed. Review the diff, then apply on behalf of the merchant.`
  Field / Current / Proposed diff grid (Title/Description/Terms/Saving/Image; proposed cells green)
  + **"Apply proposal on behalf"** (`applyProposal`).
- Actions: Approve voucher / Reject / Correct on behalf / Request changes (fallback).

### D.3 Merchant edit (`reviewIsMerchantEdit`, 7963-8013) — current→proposed diff + photo apply
- Header: merchant name + `Sensitive-identity edit via the propose lane`.
- Shield: `Applying this on behalf of the merchant. This propose lane is admin self-review today (one admin proposes, an admin approves); it is not merchant sign-off and not four-eyes...`
- **Field diff** card (current→proposed): `sc-for {{editDiffRows}}` — Field / Current / Proposed;
  changed cells green, unchanged show "No change".
- **Branch photo change** card (green "Apply supported"): old→new thumbnails (Remove/Add badges) +
  **"Apply photo change"** (`applyPhotoEdit`). This is the direct photo-apply lane (D56 admin-direct).
- Actions: Approve edit / Reject edit / Correct on behalf. (No request-changes.)

### D.4 Branch lifecycle (`reviewIsBranch`, 8015-8098) — create (map-confirm) / close (reason)
Sub-type by `branchAction`.
- **Create** (`branchIsCreate`, 8040-8085): green "New branch" pill; **Proposed new branch** card
  (Branch name, Phone, Address, Opening hours, Redemption PIN "Hidden by policy"). **Location
  (automated) · go-live gate**: schematic map + auto-resolved pin; 3-tier ladder `locTiers`
  (Postcode centroid → Address geocoded → Confirmed, 17121-17125); confidence badge
  (`branchConf`: confirmed=green / address-geocoded=blue / postcode-centroid=amber / needs-review=red,
  17130). Actions when unconfirmed: **Confirm pin** (`confirmLocation` → sets `locationConfirmed`,
  clears gateFail, toast "Auto-resolved pin confirmed…") / **Nudge pin** / **Flag for review**;
  once confirmed → "Pin confirmed; location gate met". Note: `No coordinate typing: the pin auto-resolves and the operator only verifies and confirms it. This confirm is the branch go-live location gate.`
  Optional gate-fail banner (8030) mirrors onboarding. Approve gate (17176):
  `approveGateOk = locationConfirmed`.
- **Close** (`branchIsClose`, 8087-8097): red "Branch closure" pill; **Branch to close** card
  (Branch, Status "Active (2 live vouchers)", Address) + red warning `Closing soft-deletes the branch and stops redemption there. A mandatory reason is required at approval, and the action is written to the audit trail. It can be restored from the soft-deleted state.`
  Approve dialog requires a closure reason (min 8).

### D.5 Media / Photo review (`reviewIsMedia`, 8100-8140) — scanner-stub honesty
- Header: merchant name + `Branch photo moderation`.
- Shield: `Admin approval is the moderation gate. The automated image scanner is a stub today, so a photo is only published once an operator approves it. Each action is on behalf of the merchant and written to the audit trail.`
- **Submitted photos** grid: `sc-for {{mediaPhotos}}` — each tile has Approved(green)/Pending(amber)
  badge; pending tiles get inline **Approve** (`photo.onApprove`) / **Reject** (`photo.onReject`);
  approved tiles show "Published". Header has **"Approve all pending"** (`mediaApproveAll`).
- Sticky bar: no dialog buttons; inline note only (per-photo is the action). `stickyShowPrimary`/
  `Reject` both suppressed for media.

---

## E. DESIGN-SYSTEM NOTES (tokens / tones / typography)

Fonts: display "Mustica Pro" 600 for H1s (`--font-display`); body "Lato" (`--font-body`). Canvas =
cool neutral `--neutral #F8F9FA` (owner-accepted density choice), NOT warm cream. On-behalf banners
use `--cream`.

Badge/tone tables to encode exactly:
- **Court pill** (`courtPill`, 13503): you `#E7F5EC/#0F7A3E` "Needs you"; other `#F3F4F6/#6B7280`
  "Claimed by other"; merchant `#FDF1E3/#B45309` "Awaiting merchant". Each has a matching dot.
- **Waiting-age pill** (`agePill`, 10663): **≥36h → red `#FBE9E9/#B91C1C`; ≥12h → amber
  `#FDF1E3/#B45309`; <12h → neutral `#F3F4F6/#4B5563`.** (Shared-context said 12h neutral boundary;
  exact code thresholds are ≥12 amber, ≥36 red.)
- **Type chip** (`typeChip`, 10667): Onboarding `#E6F2F5/#0E7490` (info/cyan); Voucher
  `#F1ECFB/#7C3AED` (violet); Merchant edit `#EAF0FB/#2563EB` (blue); Branch lifecycle
  `#E7F5EC/#0F7A3E` (green). Aligns with voucher-type/functional accents.
- **Verification dot** (`verifDot`, 10672): success `#0F7A3E`, warning `#B45309`, info `#0E7490`,
  neutral `#9CA3AF`.
- **Two-pill Status** = `lifePill` (13874) + `apprPill` (13886). Lifecycle: Live green / In review +
  Changes needed amber / Submitted cyan / Suspended red / Inactive grey. Approval: Approved green /
  Pending grey / Changes requested amber / Rejected red.
- **Stale badge** "OVER 24H" amber `#FDF1E3/#B45309`; material tag amber `#FDF1E3/#B45309`.
- Radii pill-999 for pills, 12/14 for cards; `--shadow-glow` reserved for the ONE primary CTA
  (Claim to act / Approve / gradient buttons); brand gradient `linear-gradient(135deg,#E20C04,#E84A00)`.

**Divergence from plain-neutral shadcn to flag:** the prototype is a bespoke, information-dense,
multi-tone system (coloured type chips, court pills, two-pill status, age tints, gradient primary
CTAs, display font headings, rose active-tab underline, rose selected-row accent). It is NOT stock
neutral shadcn. Building on shadcn primitives requires a token layer mapping every tone above +
custom Badge variants (court/verif/lifecycle/approval/age) + a bespoke split-pane actioner shell.
Do not collapse the tones to shadcn defaults.

---

## F. PROTOTYPE-ONLY / DO-NOT-BUILD (this module)
1. **Queue state switcher** (395-401): the `Populated / Loading / Empty / Error / Denied` + `Narrow`
   buttons (`setQReady`…`setQDenied`, `toggleNarrow`). These flip `queueState`/`forceNarrow` for demo;
   real states derive from data/role/viewport. (Build the states, not the toggles.)
2. **Actioner state switcher** (7826-7833): `By me / By other / Unclaimed / Orphaned / Loading /
   Denied` (`setRvMe`…`setRvDenied`). Demo `reviewState` flips; real claim/role state is server-driven.
3. **Synthetic data**: `QROWS` (13 rows) + `reviewList` extras + all merchant names (The Old Foundry
   Kitchen, Green Fork Deli, Harbour Yoga, Brew and Bloom, Northside Barbers), operators (Shebin C.,
   Aisha K., Tomás R., Priya N.), `.example` domains, hardcoded `auditTimeline`, `mediaPhotos`,
   `editDiffRows`, fixed vouchers/gates. Replace with live queries.
4. **Hardcoded badges/counts**: nav "Approval Queue 24" (13667 area), the "Auto-refresh: on (45s)"
   timer copy, `lastUpdated 01:38`, tab counts, chip counts, `claimed Xh ago`, "OVER 24H" — all
   derive from real data.
5. **`branchAction` name-hack** (17112: Green Fork Deli ⇒ close) — real sub-type comes from the
   approval payload, not the merchant name.
6. Top-bar role-switcher avatar (global) — build role-gating (`approval:read` / `approval:review` /
   `approval:apply-edit` caps), never the cycler.

---

## G. AMBIGUITIES FOR PLANNER

1. **D59 assign-then-claim not modelled here.** Queue has only self-claim; no assigned-unclaimed
   state, no assign action/cap, no `assignedToId/By/At`. Planner must decide whether 1.3/1.4 ship
   self-claim-only first and add the assigned facet in the Wave-2 D59 pass, and reserve the
   owner-cell + a court/filter facet for it.
2. **`approval:read` vs `approval:review` capabilities** are two distinct gates (queue-denied vs
   review-denied copy) — confirm the real cap names + which roles hold each (blueprint capability
   matrix is still an owner-side open item per CP-1/CP-2 carries).
3. **Correction two-tier is labelled "net-new concept, not yet built"** in every banner. The
   backend applier (cosmetic-direct vs material-route-to-merchant) extends MerchantPendingEdit/
   BranchPendingEdit + Option B (D56). Planner must confirm the exact field→lane (material) map;
   prototype only fixes: voucher `saving`; merchant/onboarding `businessName`+`tradingName`. Real
   D56 material set is broader (legal/registered name, description, commercial, public contact,
   opening hours, public branch name) — reconcile against the shipped Pending-edit lanes.
4. **Court membership vs owner**: `courtOf` treats unowned/self-owned as "you" court, but the
   `court:'merchant'` field is what actually pins a row to the Awaiting-merchant tab. Confirm the
   real signal (an item is "awaiting merchant" iff it's in a merchant-round-trip state:
   changes-requested or material-correction-sent), independent of claim owner.
5. **Age-tint thresholds**: shared-context said "<12h neutral / amber / red"; code is exactly
   ≥12h amber, ≥36h red. Confirm the intended amber/red hour boundaries with owner (no SLA countdown
   by design — "you judge priority").
6. **Merchant-edit "propose lane = admin self-review today"**: it is NOT merchant sign-off and NOT
   four-eyes (one admin proposes, an admin approves). Planner should confirm whether real 1.4 keeps
   single-actor approve-your-own-proposal or introduces a countersigner before go-live.
7. **Media scanner**: honestly a stub; admin approval IS the moderation gate. Confirm no automated
   image scan is expected at launch (pure manual moderation).
8. **Onboarding field-parity M3 fields** (Title/name-split/Landline/Signatory/Business type/
   Registered office/Social/Price range/Service options) are labelled "not stored yet — needs schema
   (M3)". These are display-only until the M3 schema lands; planner must not treat them as writable.
9. **Reject vs Request-changes semantics**: request-changes returns the item to the merchant to fix +
   resubmit (round-trip, → Awaiting merchant court); reject is terminal + notifies. Confirm the real
   state transitions (esp. whether reject soft-archives the approval and whether request-changes
   auto-moves the row to the merchant court).
10. **Screenshot-only / unread in HTML**: `mediaPhotos`, `editDiffRows`, `branchOB` (per-branch
    onboarding sub-model), `advisoryGates` view-maps were referenced but their full data bodies were
    not exhaustively read; planner should treat the D.1–D.5 field lists as authoritative structure
    and pull exact seed strings from the vals if a pixel-faithful reseed is needed.
