# Merchant 360 — implementation-grade spec (from prototype)

Source of truth: `Redeemo Admin - Foundation.dc.html`. Template tree (visual truth) lines
~5656-6946; Component class data/actions (contract truth) lines ~10540-17585. Screenshots
`prototype-references/admin-panel/merchant-360/` (01 entry/overview, 10 Notes, 23 entry picker)
cross-checked and consistent with the HTML.

Nav id: `shellScreen: 'm360'`. Entry gate `isM360` (template 5656). Two sub-states:
`isM360Entry` (no merchant selected → picker) vs `isM360Workspace` (merchant selected).
Sample merchant record: `m-foundry` "The Old Foundry Kitchen" (DIR_MERCHANTS, line 10701);
screenshots also show `Quayside Pizza Co` (a Pending-approval variant) — same layout.

Design decisions this module realises: D41 (voucher detail + advisory + benchmark), D42
(Performance aggregate-only), D43 (Redemptions lookup + reveal), D44 (Staff & Access on-behalf),
D45 (branch manager routing), D46 (PIN reset), D47 (contact on Overview), D48 (redemption
customer-identity role-gated 3 tiers), D51 (Notes), D56 (edit-on-behalf TWO LANES).

---

## (a) Screen inventory

### A1. Entry / picker state (`isM360Entry`, template 5660-5679)
No merchant selected. Layout, single column, max-width 460 for search:
- Eyebrow "RELATIONSHIPS · MERCHANT 360"; H1 "Merchant workspace" (font-display 30px).
- Sub-copy: "Open a merchant's 360 workspace to view and act on one merchant. This is
  different from the Merchant Directory, which lists every merchant."
- Search input `m360EntrySearch` / `onM360EntrySearch`, placeholder "Open a merchant's
  workspace: search by name" (search icon left).
- "RECENTLY VIEWED" grid, 2 cols (`m360Recent`, vals 17218-17224): 4 cards, seeded from
  ids `['m-foundry','m-northside','m-brew','m-southville']`. Each card: initials avatar,
  trading name, "{town}, {region}", lifecycle pill; click → open workspace on `overview`.
- Footer note: "You also reach a merchant's 360 from the Merchant Directory, from global
  search, or from a review item." (Confirmed by cross-surface entry points listed in A6.)

### A2. Workspace shell (`isM360Workspace`, template 5681-5751)
Top bar row: back button "‹ Directory" (`m360Back` → shellScreen 'directory'); eyebrow
"RELATIONSHIPS · MERCHANT 360"; right-aligned demo state switcher (PROTOTYPE-ONLY, see (f)):
"Review" label + Populated/Loading/Denied (`setM360Ready/Loading/Denied`, state key
`m360State`).

Three workspace states (`m360State`): `loading` (skeleton, 5702), `denied` (5694), `ready`
(=`m360Content`, everything else).
- Denied copy: "You do not have access to this merchant / Merchant 360 needs the
  **merchant:read** capability, which your role does not hold."

### A3. Workspace header block (`m360Content`, template 5712-5745; vals 17475-17494)
White card, shadow-sm. Left: logo initials tile (`m360.logoStyle` cream, 52px); H1 trading
name (font-display 26px); sub-line "{biz} · {town}, {region}"; pill row = lifecycle pill
(`m360.lifePill`) + verification pill (`m360.verifPill`) + optional "Featured" badge
(coral/amber, `m360.featured`).
Right (action column):
- Lifecycle action button, computed (vals 17478, 17487-17491):
  `lifeAction` = 'Suspend' if life==='Active'; 'Reactivate' if life==='Suspended'||'Inactive';
  else none. Gated by `canLifecycle = role ∈ {SUPER_ADMIN, OPERATIONS}`.
  - Has-action + can → "Suspend merchant" (danger outline) `m360Suspend`, or
    "Reactivate merchant" (brand-gradient + glow) `m360Reactivate`.
  - Has-action + cannot → "Lifecycle action gated" lock chip (`lifeGatedHidden`).
  - No action (e.g. Pending approval / Draft) → neither shown.
- "View as merchant" button (eye icon) shown when `m360CanViewAs` = role ∈ VIEWAS_READ
  (`m360ViewAs` → opens View-as start dialog prefilled kind=merchant).
Stat strip (5736-5744): Branches / Active vouchers / Redemptions this period / Rating
(★ n.n + "{reviews} reviews", OR "—" + "No rating yet" when `rating<=0`).

### A4. Tab bar (template 5747-5751; vals `m360Tabs` 17557-17566)
Horizontal, overflow-x auto, active tab = rose underline + navy bold. State key `m360Tab`
(default `'overview'`, line 10541). Set via `setState({m360Tab})`. ALL 13 tabs `soon:false`
(the "Part B" not-built path exists in code but no tab uses it now).

| # | key | label | vals/builder |
|---|---|---|---|
| 1 | `overview` | Overview | inline template + `contactVals` |
| 2 | `identity` | Business identity | inline template + `editAff` lanes |
| 3 | `branches` | Branches | `branchesTabVals` (14227) |
| 4 | `vouchers` | Vouchers | `vouchers` list (const 17131, mapped 17706) |
| 5 | `performance` | Performance | `perfTabVals` (14171) + inline perfBars/perfTop |
| 6 | `redemptions` | Redemptions | `redemptionsTabVals` (14060) |
| 7 | `documents` | Documents | inline (static rows) |
| 8 | `notes` | Notes | `notesTabVals` (13943) |
| 9 | `staff` | Staff and access | `staffTabVals` (14363) |
| 10 | `comms` | Comms | `commsList` (17550) |
| 11 | `commercial` | Commercial | inline (gated cards) |
| 12 | `audit` | Audit | `auditEvents` from `auditTimeline` (10844/17664) |
| 13 | `insights` | Insights | inline (DPIA-gated placeholders) |

### A5. Global dialogs used by this module
- Suspend dialog (`dialogOpen`, template 9308-9332): 480px modal, danger shield icon, title
  "Suspend {merchant}?", body "This immediately hides all of the merchant's vouchers from
  customers. It is reversible. The merchant is notified and the reason is written to the
  Global Audit." Required reason textarea (min 8 chars, `reason`/`onReason`, count shown),
  footer note "Logged against operator Shebin C. (Operations)", plus a step-up chip: "Step-up
  re-auth would be required here (gated concept, not yet built)." Cancel / "Suspend merchant"
  (disabled until reason≥8; `confirmSuspend`). On confirm: toast + "Reason logged to Global
  Audit." (`m360Suspend` opens it via `dialogOpen:true`.)
- Correct-on-behalf dialog (`correctOpen`, template 9334+; vals 17767-17789) — shared with
  Review/Actioner. Title "Correct on behalf" + "Net-new concept" tag; body "Author the fix to
  the {voucher|merchant profile|onboarding submission} yourself, in place. You are acting on
  behalf of the merchant; the reason and your identity are written to the audit trail."
  Field set from `FIELD_SETS[correctCtx]`; required reason (min 8, `correctReason`). Primary
  label is COMPUTED by whether a MATERIAL field was touched: "Send to merchant for approval"
  (material, navy) vs "Apply and approve" (cosmetic-only, glow). This is the D56/D37 two-tier
  engine. Opened from Business identity (`openCorrectEdit`, ctx `merchantEdit`) and Vouchers
  (`onCorrect`/`openCorrectVoucher`, ctx `voucher`).
- PIN reveal/reset dialog (`pinDialogOpen`) — Branches tab, see A7-Branches.
- Redemption reveal dialog (`redRevealOpen`) — Redemptions tab, see A7-Redemptions.

### A6. Cross-surface entry points into M360 (all `setState shellScreen:'m360'`)
Global search entity (10936, opens `audit` tab); Directory row `onOpenMerchant` (11495);
Approval/Review (11517, 11860); Tasks link (12394); Customer-360/global refs (13410); Reviews
(16019); Campaigns ex-merchant (16060); Featured (16978); Leads/assisted `draftOpen360`
(15173, id `m-newdraft`); "open redemption from search" (17281 → `redemptions` tab,
`redState:'detail'`).

---

## (b) + (c) Per-tab content, fields, interactions

Field labels below are verbatim from the prototype and become API-contract requirements.

### Tab 1 — Overview (5753-5848)
Two-column grid (1.5fr / 1fr). Cards:
- **Identity summary**: Category ("{cat} · {sub}"), Location ("{town}, {region}"), On
  platform since ({createdLabel}), Contract ({contract} + "· renewal net-new"). Button
  "Open business identity" (`goIdentityTab`).
- **Outstanding work**: seeded rows — "1 custom voucher awaiting review" (Pending pill →
  "Open" `goVouchersTab`); "1 correction sent for approval (saving change)" (Awaiting-merchant
  amber); a "Thin area" dashed chip "Accountable signatory identity not captured yet."
- **Recent activity**: 3 timeline items ("Corrected on behalf … 30 Jun" / "New branch
  approved · 24 Jun" / "Merchant activated · 12 Nov 2025"); header note "rolls up to Global
  Audit".
- Right column: **Status** (Lifecycle pill / Verification pill / Dormancy "Active");
  **Acquisition source** ("Self-serve registration / Not an admin-created draft" — driven by
  `acqSelfServe` = `m360Id !== 'm-newdraft'`; admin-created draft variant exists);
  **Primary contact (account owner)** (D47), `contactVals` (14197). Fields: owner name
  (Marta Okafor) + "Owner" tag; email ("marta@oldfoundry.example") + "Verified email" dot;
  phone ("0117 496 0000" / "Not set" italic when missing) + "Optional field". Actions Copy /
  Email (mailto) / Call (tel; disabled if no phone). Note copy: "This is the account owner's
  own contact. There is no separate business-level contact email or phone; branch-level
  contacts live on the Branches tab." A demo variant switcher Full / No phone / Multi-owner
  (`contactVariant`) is PROTOTYPE-ONLY, but the three real cases (phone set / phone missing /
  multiple owners "+2 more owners") must be handled.

### Tab 2 — Business identity (5850-6005) — EDIT-ON-BEHALF LANES (D56)
Top on-behalf banner (cream): "You act **on behalf of** the merchant. Every edit shows its
lane (Direct, Super Admin, Correct-on-behalf, or not-yet-supported), needs a reason, and is
written to the audit trail."
Card "Business profile" + "Real record" tag. Cover-banner + logo preview block (logo edit =
`affLogo` not-supported lane).
Field rows (label / value / maturity tag / edit button, lane from `editAff(kind, role)`,
10816):
- Legal / registered name — "The Old Foundry Kitchen Ltd" — lane `correct` → `openCorrectEdit`
  (MATERIAL: routes to merchant).
- Trading name — lane `correct` → `openCorrectEdit` (business/trading name is material).
- Description — lane `correct` → `openCorrectEdit`.
- Website — "theoldfoundry.example" — lane `direct` → `m360EditField` (live).
- Company number — "08421337 (free text, unvalidated)" — lane `direct-reclass` → `m360EditReclass`.
- VAT registered — "Yes" — lane `direct-reclass`.
- VAT number — "GB 214 5566 21 (free text, unvalidated)" — lane `direct-reclass`.
- Primary category — "Food & Drink" — lane `direct-reclass`.
- Subcategory — "Restaurant" — tag "Real" (read-only display).
- Cuisine(s) — chips ["British"] — "Real".
- Specialties — chips ["Locally sourced","Family-friendly","Artisan"] — "Real".
- Category label — "British Restaurant · generated from the chain" — tag "Derived".
- Note: adding a new subcategory/cuisine/specialty not in the taxonomy is deferred to the
  future taxonomy module.
- **Owner / responsible person** sub-card ("Account · partly real"): Title (Ms, net-new M3),
  Position (Owner, Real), First name (Elaine, split net-new M3), Last name (Turner, split
  net-new M3), Email (Real), Mobile (Real), Landline ("Not set", net-new M3).
- **Secondary contact** sub-card (all "not stored yet — needs schema (M3)"): Title/Position/
  First name/Last name/Email/Mobile/Landline.
- **Richer profile** dashed-purple card (all "not stored yet — needs schema (M3)"): Business
  type ("Limited company (Ltd)…"), Registered / head-office address, Head-office phone,
  Head-office email ("· distinct from owner"), Price range ("££ · moderate"), Values /
  highlights (chips), Service options ("Food & Drink options only": Dine-in/Takeaway/Delivery),
  Social links (Instagram/Facebook/X/TikTok).
Footer lane-legend note (5964): Direct & Operations apply immediately; Correct-on-behalf uses
the two-tier model (cosmetic applies+approves; business/trading name is material → routes to
merchant); company number/VAT/category/tags shown Operations-editable = "owner-decided
re-classification to implement" (backend gates to Super Admin today); M3 fields captured in
assisted onboarding but no column yet; logo/banner edit not built.

**`editAff` lane semantics (contract):**
| kind | `show` | label | tag | enabled | behaviour |
|---|---|---|---|---|---|
| `direct` | Ops/Super | Edit | "Direct" (green) | always | live edit, audited, no pending |
| `direct-reclass` | Ops/Super | Edit | "Operations" (info) | Ops/Super only | live but flagged reclassification |
| `direct-high` | all | Edit | "Super Admin[ only]" | Super only | Super-only live edit |
| `correct` | Ops/Super | "Correct on behalf" | "Propose" (amber) | always | opens two-tier correct dialog (MATERIAL→merchant) |
| (else) | all | "Not yet supported" | "Not built" (dashed grey) | disabled | `m360NotSupported` error toast |

### Tab 3 — Branches (6007-6238; `branchesTabVals` 14227) — D45 + D46
Header "Branches ({n})" + demo state switcher (Populated/Loading/Denied, PROTOTYPE) +
"Add branch (review)" button (`m360BranchLifecycle` → routes to branch-lifecycle review).
Per-branch collapsible card (`branchExpanded`), seeded HS/HB/OB. Collapsed summary row:
locality ("Bristol · BS1 4ST"), today's hours label, manager (`sumManager` — "Devan Roy" or
"Owner (default)" = D45 default-to-owner), "{n} app users", "{photos} photos", "{amenities}
amenities", location status ("Location confirmed" / "Needs review"). Expanded fields:
- Address (full), tag lane `affBranchAddr` (not-supported).
- Contact ("0117 496 0000 · hello@quaysidepizza.example"), lane `affBranchContact` (direct).
- Opening hours · Mon–Sun (multi-window real BranchOpeningHours: windows[] / "Open 24 hours" /
  "Closed"; today highlighted), lane `affBranchHours` (direct).
- Branch users list (name + status pill Active/Deactivated).
- **Branch PIN** (D46): masked "• • • •" by default; "Reveal PIN" and "Reset PIN" actions.
  - Reveal → `pinDialog{mode:'reveal'}`: reason required (≥6 chars); on confirm reveals the
    value in-UI; toast "PIN revealed … the PIN value is never written to logs." Toggle to
    "Hide PIN".
  - Reset → `pinDialog{mode:'reset'}`: reason required (≥6); on confirm "New PIN generated …
    and sent to the branch recipients via the existing channel. Audit logged the reset and
    reason — never the value." (D46 hard-lock reversal.)
  - **Owner-also-receives toggle** (D45 notification routing): `ownerOptIn` per branch
    ("Owner also receives: on/off"); toggling fires audited info toast.
- "Close (review)" button (danger, `m360BranchLifecycle`).
Branch states: `branchState` populated/loading/denied.

### Tab 4 — Vouchers (6239-6314; const 17131, mapped 17706) — D41
Top voucher-lane banner: "Voucher edits route to the voucher review / correction lane:
cosmetic changes apply and approve directly; a value or saving change routes to the merchant
for approval."
Header: "Vouchers" + "Mandatory 2 / 2" (green) + "1 custom" pill.
Per-voucher collapsible card (`voucherExpanded`). Collapsed: type chip (vt colour), title,
"Saves ~£{bm.saving}", advisory pill, approval pill, chevron. Expanded three bands:
- **"What customers see"** (cream band): voucher image banner, title + kind, approval pill,
  description, Terms, Value / saving, Expiry.
- **"Performance & value"** (neutral band, "Internal"): Redemptions, Availability window,
  Reuse / cooldown, Kind; **Advisory** meter (weak/good/strong bar + label + "advisory only;
  no enforced minimum") + optional "Merchant asked for help" (blue) / "Concierge proposal"
  (purple) chips; **Category value benchmark** (Net-new): quartile pill + marker-on-scale
  (Lower/Median/Higher) + "Saves about £X · category median about £Y · {quartile} of {cat}
  vouchers across the platform."
- Footer: "Approval history: {history}" + "Correct on behalf" button (`onCorrect`, ctx
  voucher → two-tier dialog).
Voucher data fields (const 17131-17135): id, vt, vtLabel, title, kind ("Mandatory (RMV)" /
"Custom (RCV)"), reuse, desc, terms, value, expiry, windows, appr (Approved/Pending),
advisory (weak/good/strong), assist, proposal, redemptions, history, bm{saving, median, pos,
quartile, qtone, cat}. Footer note: benchmark is net-new (needs cross-merchant aggregation).

### Tab 5 — Performance (6316-6388; `perfTabVals` 14171 + inline) — D42 (aggregate-only)
Header "Aggregate performance" + "Net-new roll-ups" tag. Cards:
- Redemptions over time (8-bar chart `perfBars` W1-W8; "312 this period"; note "Aggregate
  counts only, never an individual customer identity").
- Active-member reach ("~180 members redeemed / Aggregate reach; no member identities").
- Rating trend ("★ 4.6 ▲ 0.2 / 128 reviews, last 90 days").
- Top vouchers (`perfTop`: 3 rows type+title+bar+"{n} redeemed").
- Redemptions by branch (`perfByBranch`: High Street 214 / Harbourside 98).
- Savings delivered ("£3,240" Net-new; "Sum of estimated savings, this period").
- Validation rate ("96% / 298 of 312 validated"; QR 82% / Manual 18% split bar).
- Redemptions by voucher (`perfByVoucher`: 4 rows).
- Category performance benchmark (Net-new): "Where this merchant sits versus **Restaurants
  and cafes** peers on redemptions per active voucher … upper third; category median marked."
- Footer: aggregate only; individual rows live on Redemptions tab (masked-by-default).
No individual-identity data anywhere on this tab (enforced D42).

### Tab 6 — Redemptions (6391-6531; `redemptionsTabVals` 14060) — D43 + D48
Header "Redemptions" + "Net-new · individual + audited reveal" + demo state switcher
(Populated/Loading, PROTOTYPE). **Role-gated identity banner** (D48, 3 tiers computed from
role):
- `default` (SUPPORT, OPERATIONS, SUPER_ADMIN): green banner "sees it by default"; identity
  inline, contact masked, every view audited.
- `reveal` (SALES, FINANCE): amber banner "can reveal it with a reason"; per-row Reveal.
- `none` (else): grey banner "cannot access it"; "Not permitted for your role".
Support-lookup note (cream): "a customer says they redeemed here — track it down … reachable
from global search (type a redemption code) and from Customer 360 — this tab is the
per-merchant slice."
List view (`redState:'populated'`): search by code (`redSearch`), voucher `<select>`, Clear;
branch chips (All / High Street / Harbourside), status chips (All / Validated / Not
validated). "Showing {n} of {total} redemptions". Table columns: **Code / Voucher / Branch /
Redeemed / Status (+ method pill QR|Manual) / Saving / Customer**. Customer cell per tier:
name (default), "Customer — hidden" + Reveal button (reveal), lock + "Not permitted for your
role" (none). Row click → detail.
Detail view (`redState:'detail'`): back link; code (font-display) + status pill + method pill;
grid Voucher / Branch / Redeemed / Validated / Estimated saving / Method; Customer sub-card
per tier with "Open Customer 360" (when name shown) and/or "Reveal customer" button.
Row/record fields (ROWS 14066): id, code (e.g. "A7K2 P9X4"), vt/vtLabel, voucher, branch, dt
(redeemed), validated (bool), method (QR/Manual/"—"), validatedAt, saving, customer, contact
(masked "a•••@gmail.com").
Reveal dialog (`redRevealOpen`): reason required (≥6 chars); on submit sets revealed, toast
"Logged to Audit: who revealed, which redemption, and the reason — never shown by default,
never in aggregate." Denied state (`redDenied`): "You cannot reveal customers on redemptions …
needs the redemption:reveal-customer capability."

### Tab 7 — Documents (6533-6544)
Card "Documents" + "Upload on behalf" button (`uploadOnBehalf`: "merchants cannot upload
today. Recorded in the audit trail."). Static rows: Business verification 1 (Uploaded 12 Nov
2025 → "Open (signed link)"), Business verification 2 (same), Price list ("Not provided" +
"Unavailable" tag), Agreement (T&C v3.1) ("Click-to-agree, 28 Jun 2026" → Open). All opens via
`openDocM` = short-lived signed link (5-min), raw storage paths never shown. Footer restates
signed-link + admin-on-behalf-only upload.

### Tab 8 — Notes (6546-6683; `notesTabVals` 13943) — D51
Header "Notes" + "Net-new · needs schema". Banner: internal notes about a business, audited,
factual/professional; customer-side notes are DSAR data and live on Customer 360, not here.
Role gating:
- Read roles (`notesCanRead`): SUPER_ADMIN, OPERATIONS, SALES, FINANCE, SUPPORT.
- Write roles (`notesCanWrite`): SUPER_ADMIN, OPERATIONS, SALES.
- No-access → lock card "You cannot view internal notes … needs the notes:read capability."
- Read-only (can read, not write) → grey banner "needs the notes:write capability."
Add-note composer (write roles): textarea (`noteDraft`); "Attach a file" (server-proxied,
signed link — `noteAttach`); "Save note" (disabled until non-empty). Save prepends note,
toast "Internal note added … Audited (author, time, attachment) and would appear in Global
Audit."
Note card (`notesList2`): author avatar/initials, author name, role label, timestamp,
"Edited" tag if edited, status pill Active/Retracted, body. Fields: id, author, role, ts,
body, edited/editedAt, status (active|retracted), retractedBy/At/Reason, attachments[]{name,
size}, history[]{action Added|Edited|Retracted, who, when}.
Actions (own + active notes, write role): **Edit** (inline textarea → Save changes; prior
version kept in history; toast "prior version is kept in history and the edit is written to
Audit"), **Retract** (soft-delete with reason; toast "It stays in the record marked retracted
… Nothing is ever hard-deleted"), **History (n)** toggle (timeline of add/edit/retract with
who+when). Retracted note shows strike-through body + "Retracted by {who} on {when}" + reason +
"Soft-delete for accountability … never hard-deleted." Attachments open via signed link.

### Tab 9 — Staff and access (6684-6868; `staffTabVals` 14363) — D44
Header "Staff and access" + "On-behalf · net-new" + demo state switcher (Populated/Invite/
Guard/Empty/Loading/Denied, PROTOTYPE — but each maps to a REAL state to build). Acting-for
banner: "Acting for **{merchant}** as Shebin C. (Operations). You can perform the same
account-maintenance a merchant does … Every action here is a direct operator action (no
merchant round-trip), takes a mandatory reason, and is written to the audit trail as
**Managed on behalf**." Three lock chips: "No impersonation · no 'log in as merchant'",
"Redemption PIN never shown", "Operators never set or see passwords".
- **Portal access · members** section (`portalMembers`, count badge). Fields per member: name,
  email, role (Owner/Branch manager/Staff, role pill colours), status (Active/Invited-pending/
  Removed), scope ("All branches"/branch), vouchers (Can manage vouchers Yes/No). Actions:
  Change role / scope, Toggle vouchers, Re-issue access link (tokenised claim/reset; operators
  never type/see password), Remove (soft remove, status→Removed). "Invite member" button.
  Note: role/scope/vouchers real; finer per-action capability matrix is placeholder.
- **App / branch logins** section (`appBranches`, grouped by branch): mobile scan-and-validate
  staff (separate identity from portal). Per login: name + status; actions Reset password
  (link only, never typed/seen), Deactivate/Reactivate. "Add app login (net-new)" (dashed).
  "The branch redemption PIN is never shown here."
- **Invite view** (`staffInviteView`): form — Email, Role `<select>` (Owner/Branch manager/
  Staff), Branch scope `<select>` (All branches/High Street/Harbourside), Voucher management
  toggle. Validation: valid email; duplicate email → error "That email already belongs to a
  portal member for this merchant." Success screen "Invite created / A secure claim link has
  been emailed to {email} so they set their **own** password … tokenised and expires in 72
  hours. Until they claim it, they show as **Invited-pending**." (No password ever set by
  operator.)
- **Guard state** (`staffGuard`): last-Owner protection — "Marta Okafor is the last remaining
  Owner / You cannot remove or change the role of the only Owner. Assign another member as
  Owner first…" Triggered when acting on the only Owner (`ownerCount<=1`).
- Empty ("No portal members yet" + Invite), Loading (skeleton), Denied ("needs the
  merchant:manage-staff capability").
- Footer: portal Staff & Access model is real/shipped; the admin-side on-behalf equivalent is
  net-new (no admin staff-management endpoint today); every mutation carries actor/reason/
  before-after into this merchant's Audit tab → Global Audit.

### Tab 10 — Comms (6871-6883; `commsList` 17550)
Card "Communications" + "Email delivery is dark today" tag. Timeline of messages: subject,
channel (Email/In-app), state pill (Queued/Sent/Failed/Bounced with tone colour), time.
Seeded 5 rows. Footer: "Delivery states are shown honestly … Email delivery is dark today, so
email rows show as queued or failed. Message payload is never rendered here." (Read-only,
consistent with D61 — no send affordance on M360.)

### Tab 11 — Commercial (6886-6907)
Provider/billing-gated banner: "This is a labelled concept, not live money. Featured placement
must not go live without a confirmed paid status." Three cards, each with "Manage (gated)"
(`commercialGated` toast):
- Featured placement — "Requested, unpaid" pill + "Cannot go live: paid status not confirmed."
- Campaigns — "Summer Local / Enrolled; commercial terms gated."
- Merchant billing — "Not set / Provider integration gated. No live money."

### Tab 12 — Audit (6910-6922; `auditEvents` from `auditTimeline` 10844)
Card "Merchant audit history" + "Real" tag. Timeline events: action, actor (colour by
actorType merchant/operator/system), time, optional Reason, optional diff rows (field / before
→ after / "material" tag when material). Seeded from the correction round-trip
(Submitted → Claimed → Corrected on behalf → Sent to merchant → Merchant accepted → Approved).
Footer: "Actor, reason, and before / after are recorded; secrets and the branch redemption PIN
are never shown. This is the merchant-scoped slice of the platform-wide Global Audit (1.8)."

### Tab 13 — Insights (6925-6943)
- "Operational aggregates (reference)": 312 Redemptions period / ~180 Active-member reach /
  ★ 4.6 Rating (small stat cards).
- "Member behaviour and demographics" card, **DPIA-gated**: four dashed placeholders (Member
  age mix / Where members are from / Interests / Retention cohorts) all showing "—". Copy:
  "Not available until the privacy gate opens. Behavioural and demographic member analysis is
  DPIA-gated and default-off; this is a labelled reference, not a live dashboard. Who decides:
  the DPO with the Platform owner."

---

## (d) States / honesty labels to preserve

Workspace: `loading` (skeleton), `denied` (merchant:read), `ready`. Per-tab states:
Branches populated/loading/denied; Redemptions populated/loading/detail/denied +
per-row role tiers (default/reveal/none) + empty ("No redemptions match"); Staff populated/
invite/guard/empty/loading/denied; Notes no-access/read-only/populated/empty.
Permission-denied copy always names the capability + role: `merchant:read`, `merchant:manage-
staff`, `redemption:reveal-customer`, `notes:read`, `notes:write`, plus lifecycle gating
(`SUPER_ADMIN`/`OPERATIONS`) and `redemption:reveal-customer` tiers.
Maturity labels observed (keep every one): **Real / Real record** (green); **Derived** (grey);
**Net-new / Net-new roll-ups / Net-new · needs schema / Net-new concept** (purple/lavender);
**not stored yet — needs schema (M3)** (dashed purple); **Not built / Not yet supported**
(dashed grey); **Operations** reclassification (info blue); **Super Admin[ only]** (amber);
**Propose** (amber, correct lane); **Thin area** (dashed grey chip on Overview); **DPIA-gated**
(Insights); **Provider / billing gated** + "Requested, unpaid" + "gated" (Commercial); **Email
delivery is dark today** + Queued/Failed/Bounced (Comms); "renewal net-new" (contract).
Honesty invariants: redemption PIN NEVER rendered except the D46 reveal/reset (reason-gated,
value never logged); documents/attachments via short-lived signed links only, raw paths never
shown; no impersonation; operators never set/see passwords; redemption customer identity
role-gated + every view/reveal audited + never in aggregate; Performance/Insights aggregate-
only (no individual identity); suspend step-up re-auth is a labelled not-built concept.

## (e) Design-system notes (module-specific)

- Cards: white on cool-neutral `--neutral` canvas, `--border-subtle`, radius 12-14, section
  eyebrows are 10.5px uppercase 700 grey `#9CA3AF`. Header H1 font-display; stat numbers
  font-body 22px 700. This matches the owner-accepted "cool neutral ops shell" density choice
  (not the warm cream customer canvas).
- Warm cream `--cream` + `#F0D9CE` border is used deliberately for on-behalf / caution banners
  (identity, vouchers, redemptions, staff, notes) — a recurring "you are acting on behalf"
  affordance. Keep the cream banner pattern.
- Voucher-type accent colours via `--vt-*` tokens (bogo/discount/freebie/spendsave/package/
  timelimited/reusable) on type chips + voucher banners.
- Badge tones per shared-context OPS_STATE_META / maturity tags: green real, lavender net-new,
  blue external/info, amber warning/super, dashed grey future/not-built. Advisory meter uses
  weak=red / good=amber / strong=green (`vAdvMap`).
- Brand-gradient + `--shadow-glow` reserved for the ONE primary CTA (e.g. Reactivate merchant,
  Save note when enabled) — do not overuse.
- DIVERGENCE FROM PLAIN NEUTRAL SHADCN: this module leans on brand cream banners, brand-
  gradient primary buttons, voucher-type colour system, and font-display headings — richer
  than default shadcn. Flag to planner: reconcile against admin-web's neutral-shadcn
  convention (either adopt these tokens or map to neutral equivalents).

## (f) Prototype-only / do-not-build (this module)

- All demo state switchers: workspace Review Populated/Loading/Denied (`setM360Ready/Loading/
  Denied`); Redemptions Populated/Loading; Staff Populated/Invite/Guard/Empty/Loading/Denied;
  Branches Populated/Loading/Denied; Overview contact Full/No-phone/Multi-owner switcher. Build
  the underlying REAL states; do NOT build the chip togglers.
- Role-switcher dependence: the D48 redemption tiers and all capability gating are driven in
  the prototype by the top-bar role cycler. Build ROLE-GATING off real auth; do not build the
  cycler.
- Synthetic data: merchant names (The Old Foundry Kitchen / Quayside Pizza Co / Brew and
  Bloom / etc.), operator "Shebin C.", `.example`/`.test` emails, seeded PINs, hardcoded
  counts (312 redemptions, ~180 reach, 24/7/12 nav badges), the fixed `m360Recent` 4-card
  list, and all seeded vouchers/branches/notes rows.
- "View as merchant" is a REAL gated feature (View-as, D-2.10) — keep; distinguish from the
  role cycler.

---

## Ambiguities for the planner

1. **D48 tier→role mapping is explicitly illustrative.** Banner says "Illustrative tiering;
   the final role-to-visibility mapping is set with the capability matrix." The exact
   role→{default/reveal/none} sets for redemption customer identity are NOT locked.
2. **Business-identity reclassification (`direct-reclass`).** Prototype shows company number/
   VAT/category/tags as Operations-editable while stating the backend gates them to Super
   Admin today; this is an "owner-decided re-classification to implement." The per-role grant
   matrix for these fields is a later decision.
3. **Which identity fields are MATERIAL (route to merchant) vs cosmetic (apply live).** The
   correct dialog computes this from `FIELD_SETS`/material flags; the definitive material list
   (beyond "legal/registered name, trading name = material; money/saving = material") needs to
   be enumerated against the real MerchantPendingEdit/BranchPendingEdit schema + Option B
   applier.
4. **M3 schema-gated fields.** Owner title/name-split/landline, secondary contact, and the
   entire "Richer profile" block are "not stored yet — needs schema (M3)". Planner must decide
   what M3 actually persists vs. what stays display-only.
5. **Capability names are placeholders.** `merchant:read`, `merchant:manage-staff`,
   `redemption:reveal-customer`, `notes:read`, `notes:write` are prototype strings; confirm
   against the real admin capability matrix.
6. **Suspend step-up re-auth** is labelled "gated concept, not yet built" — is step-up in
   scope for the first build or deferred?
7. **Notes attachments + schema** — the whole Notes surface is net-new/needs-schema; the
   attachment storage model (server-proxied signed link) is asserted but not built.
8. **Add app login** is a "net-new, limited affordance" (portal creates app logins today) —
   confirm whether admin can create branch/app logins at all in v1.
9. **Reveal reason minimums differ** (PIN reveal/reset ≥6, redemption reveal ≥6, suspend ≥8,
   correction ≥8) — confirm the intended minimum-reason policy.
10. **Documents list is static** in the prototype (2 verification docs + price list +
    agreement). Real document types/categories and the upload-on-behalf flow need definition.
11. **Screenshot vs code merchant mismatch** (screenshots show "Quayside Pizza Co, Pending
    approval"; code default is "The Old Foundry Kitchen, Active") is only a demo-state
    difference, not a content divergence — but note the Pending-approval header shows NO
    lifecycle action button (neither Suspend nor Reactivate), which the build must handle for
    non-Active/non-Suspended lifecycles (Pending/Draft/Rejected).
