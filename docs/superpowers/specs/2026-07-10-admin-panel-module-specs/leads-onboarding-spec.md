# Leads & Onboarding — implementation-grade spec (admin-web)

Source of truth: prototype `Redeemo Admin - Foundation.dc.html` (template lines ~4171-5700; vals
`createDraftVals` 15114, `leadsVals` 15187, `pipelineVals` 15250, `branchStepVals` 14520,
`voucherStepVals` 14872, `staffStepVals` 16303, `docsStepVals` 16448, `assistedVals` 16514).
Screenshots cross-checked: 01 (hub + pipeline), 04 (Step 1 Category), 08 (Step 3 Branch form).
Decisions: D44/D45/D46/D49/D51/D52/D55/D59, 2.11. Honesty convention BC-1 preserved throughout.

This module is FOUR route-level screens under one nav item `leads` (Operations group):
1. **Leads & Onboarding HUB** (`shellScreen==='leads'`, `isLeads`) — the landing; contains the
   prospect pipeline as a section.
2. **Create-draft form** (`shellScreen==='createDraft'`, `isCreateDraft`).
3. **Assisted 9-step wizard** (`shellScreen==='assisted'`, `isAssisted`) — full-screen focus mode.
4. (The prospect pipeline is a SECTION of the hub, not a separate route — 2.11 amendment.)

Cross-links: Convert → createDraft OR assisted (pre-filled); hub cards → createDraft / assisted;
"View in queue" → Approval Queue filtered `Onboarding`; draft/handover success → Merchant 360.

> STEP-ORDER CORRECTION (verify against rail, lines 16518-16528): the actual 9 steps are
> **1 Category and identity · 2 Business profile · 3 Branches · 4 Vouchers · 5 Staff and access
> (optional) · 6 Documents (optional) · 7 Contract · 8 Go-live review · 9 Handover.**
> The task brief's assumed "6 Contract / 7 Documents / 8 Review / 9 Approve" is WRONG — Documents
> is 6, Contract is 7, Go-live review is 8, Handover is 9. D49's "auto-advance-from-approve lands
> step 9" is confirmed: `onAssistedApproveLive` sets `assistedStep: 9` (Handover).

---

## (a) SCREEN INVENTORY + LAYOUT

### A1. HUB (`isLeads`) — template 4171-231
Centered column `max-width:1080px; padding:26px 30px 60px`, canvas `--neutral` (cool ops grey).
Header: eyebrow `OPERATIONS · LEADS AND ONBOARDING`, display h1 30px "Leads and onboarding",
intro paragraph (`max-width:680px`): "How merchants get onto the platform. Some sign up themselves
and you approve them. Some you bring on directly, either by handing them a setup link or by
building the whole account with them in person." Top-right **State demo switcher** (Ready/Loading
— PROTOTYPE-ONLY).

Sections top-to-bottom:
1. **Inbound self-serve card** (read-only pointer): rounded-14 white card, inbox icon tile, title
   "Inbound · self-serve registrations" + green `LIVE` badge, body "Merchants who signed up on
   their own and are waiting for approval. They onboard themselves; you review and approve in the
   queue. This is a read-only pointer.", a big count `6 awaiting review` (display font), button
   "View in queue →" (`onLeadsInbound` → queue, `qFilter:'Onboarding'`, `qTab:'needs'`).
2. Eyebrow "ADMIN-CREATED: BRING A MERCHANT ON DIRECTLY".
3. **Two admin-created route cards** (2-col grid `1fr 1fr`):
   - **Create a draft and hand off** (light path): tint/rose icon tile, title, body "A short
     form: six essentials. The owner gets a secure setup email, sets their own password and
     finishes onboarding themselves. Best when the merchant is willing and able to use the
     Merchant Portal.", 3 green-tick bullets ("Fast: under a minute for the operator" / "Merchant
     does their own onboarding" / "Operator never sets a password"), primary navy button "Create
     a draft" (`onLeadsDraft`). Locked note if capability absent: "Needs merchant:create-draft".
   - **Assisted onboarding** (heavy path) + `Net-new` (amber) badge in title: navy icon tile,
     body "You build the entire account with the merchant, in person: profile, branches, staff,
     vouchers, documents, so they never have to touch the Merchant Portal. Best for a rep sitting
     with a non-technical business.", 3 rose-tick bullets ("Rep drives every step on behalf" /
     "Merchant never uses the portal to onboard" / "Every step audited; merchant sets password at
     handover"), gradient CTA "Start assisted onboarding" (`onLeadsAssist`). Locked note: "Needs
     merchant:assisted-onboard".
4. **In-progress assisted onboardings** list: eyebrow with count `· {N}`, right-aligned muted
   "Started but not finished; resume any time". White rounded card with rows: initials tile,
   trading name + legal biz name, right block "Reached: **{step}** · step {N}/5" + "Updated {when}
   · {by}", navy "Resume" button (`r.onResume`). Footer line (neutral bg): "Nothing here is live.
   Each resumes the on-behalf stepper; go-live happens only after the final review." (honesty).
5. **Prospect pipeline** section (2.11 amendment) — see A2.

### A2. PROSPECT PIPELINE (hub section) — template 4270-227, vals `pipelineVals`
Header row: "Prospect pipeline" (16px 800 navy) + `Net-new` amber chip; right "**+ Add lead**"
rose button (only if `pipCanManage`). Sub-line: "The front half of onboarding: tracking prospects
before anyone creates a draft. Once a prospect converts, it hands off to the two admin-created
routes above." **Pipeline demo chips** (PROTOTYPE-ONLY): Populated / Empty / Loading / Error.
- **Honesty note** (cream `--cream` card, info icon): "A lead model is net-new; no lead table
  exists yet. One future intake: the customer app's 'Request a merchant' entry point is deferred,
  and once it ships those requests will land here as leads (shown below tagged as a future
  source). Assign-then-claim semantics apply, and Lost requires a reason and is audited, so the
  pipeline reflects that most prospects do not convert."
- **Kanban**: 3-col grid `1fr 1fr 1fr; align-items:start`. Each column = neutral card with a 3px
  top tone bar (`col.tone`), header (label 13px 800 + count pill + hint), body = vertical stack of
  prospect cards. Columns (`PIPELINE_STAGES`, line 15243):
  - **Lead** — tone `#6B7280`, hint "Captured, not yet contacted"
  - **Contacted** — tone `#2A63C4`, hint "Reached out, in conversation"
  - **Visit booked** — tone `#B45309`, hint "Meeting or on-site scheduled"
- **Lost section** (below kanban, `pipHasLost`): eyebrow "Lost", stacked rows (opacity .9): biz +
  grey `Lost` pill + locality; "Reason: {lostReason}".
- **Converted section** (`pipHasConverted`): eyebrow "Converted", green-bordered rows: biz + green
  `Converted` pill. (Empty in seed; appears after a Convert if modelled that way.)
- Empty state (`pipEmpty`): dashed card "No prospects yet" / "Add your first, or wait for customer
  requests once that intake ships." Loading = 3 skeleton columns. Error = "Could not load the
  pipeline" + navy "Try again". Denied (`pipDenied`): "Pipeline is restricted" / "Your role
  ({role}) does not hold the lead:manage capability. Ask a Super Admin if you need it."

### A3. CREATE-DRAFT (`isCreateDraft`) — template 4233-371, vals `createDraftVals`
Centered `max-width:720px`. Eyebrow "LEADS AND ONBOARDING · CREATE DRAFT", h1 "New merchant
draft". Top-right **State demo switcher** (Form / Success / Email exists / Gate error — PROTOTYPE).
Views (mutually exclusive on `draftState`): form / success / error-exists / error-gate; plus
`draftCapDenied` gate. See A3 fields in (b).

### A4. ASSISTED WIZARD (`isAssisted`) — template 4543-257, vals `assistedVals` (+ step vals)
**Full-screen focus mode**: sidebar and top-bar of the normal ops shell are HIDDEN; `<main>` is a
flex column filling the viewport. This is a deliberate DIVERGENCE from the standard shell chrome
(flag in design system §e).
- **Persistent on-behalf header** (navy `--navy`, white text, flex:none): "Exit to admin" button
  (`assistedBackToLanding` → hub), merchant initials tile, merchant trading name + `Assisted · on
  behalf` badge, sub-line "Acting on behalf, in person · Operator: Shebin C. · Every step is
  audited · Nothing goes live until the final review · Focus mode (still your operator session,
  still audited; not a separate login)", right "Save and continue later" button
  (`assistedSaveLater` → toasts + returns to hub).
- Body split: **left step rail** (270px, white, `overflow:auto`) + **step content** (flex:1,
  `overflow:auto`, padding 24/30). Content wrap `max-width:760px` centered EXCEPT step 4 Vouchers
  which widens to `max-width:1180px` for the two-column builder.
- **Step rail** (`assistedStepRail`): eyebrow "Build the account", 9 clickable rows (each: status
  dot with mark ✓/!/number, label, sub, per-step status label). Divider. Eyebrow "Final steps" +
  cream note: "Net-new capability. The shell-create and the eventual email transfer are real;
  running the full onboarding on behalf is net-new. The owner signs the contract and sets their
  password themselves."
- **Step nav footer** (`assistedShowStepNav`, only steps ≤6): "‹ Previous step" (if `assistedHasPrev`),
  muted "Nothing is live yet · move freely", navy "Next step ›". Steps 7/8/9 use their own inline
  Continue/Approve/Handover buttons instead.
- Capability gate (`assistedCapDenied`): centered card "You cannot run assisted onboarding" / "This
  needs the merchant:assisted-onboard capability, which your role ({role}) does not hold."

---

## (b) DATA FIELDS

### B1. Create-draft form — 6 fields (exact labels, template 4258-306)
1. **Business (legal) name** * — placeholder "e.g. Southville Sourdough Ltd"; error "Business
   legal name is required."
2. **Trading name** (optional) — "e.g. Southville Sourdough"
3. **Owner first name** * / **Owner last name** * (2-col) — errors "Required."
4. **Owner email** * — placeholder "owner@business.example"; errors "Owner email is required." /
   "Enter a valid email address." Duplicate check against seed `existingEmails`
   (marta@oldfoundry.example, owner@brewandbloom.example, hello@greenforkdeli.example) → error-exists.
5. **Owner phone** (optional) — "+44 …"
Shield note: "No password is set here. On submit, **a secure setup email will be sent to the
owner** so they set their own password and finish onboarding. Nothing goes live until the merchant
completes onboarding and it is approved through the queue." Actions: Cancel (→ queue) / "Create
draft & send setup email" (disabled until valid: legal+first+last+email present & email format ok).
Success view: "Draft created" + `Pending · not live` pill; 3 "What happens next" steps (setup
email will be sent to {email}; owner sets own password + completes; enters approval queue, live
only once approved); shield note "Acquisition source is recorded as **Admin-created draft**…No
password or token ever appears here or in logs."; actions "Open the merchant's 360" / "Create
another" / "Back to queue".

### B2. Prospect lead card anatomy (template 4168-189, data `PIPELINE` line 15245)
Per card: **biz name** (13.5px 700 navy); **{cat} · {locality}** (cat always suffixed "(guess)",
e.g. "Food and drink (guess)"); **source chip(s)** — `sourceLabel` from `pipSourceLabel`
(rep→"Rep visit", inbound→"Inbound enquiry", customer→"Customer request") + if `source==='customer'`
an amber `Future intake` chip; **contact** name + ` · {phone}` if present; **Next action box**
(neutral): "Next: {nextAction}" + "Due {nextDue}" (red + "Overdue" tag when `overdue`); **Rep:
{rep}**; **action buttons** (see c). Add-lead card is NOT shown for `visit` stage's Move (see c).
Overdue is computed vs `today = 2026-07-05` (hardcoded prototype "today").
Seed leads (8, all `.example` domains, Bristol/Bath): Anchor Street Coffee, Fern and Fable Books,
Harbourside Thai (customer/future-intake), Redcliffe Barbers, The Green Larder, Montpelier Cycles,
Clifton Nails and Spa, Old City Vinyl (lost).

### B3. Nine-step field inventory (assisted wizard)

**STEP 1 · Category and identity** (template 4593-4644, vals 16558-16620). Category-first,
gates step-4 voucher types. Chain built from `TAX` map (11 top-levels):
- **Primary category** tiles (3-col grid): Food & Drink, Health & Beauty, Fitness & Wellbeing,
  Retail & Shopping, Leisure & Entertainment, Home & Trades, Professional Services, Automotive,
  Pets & Animals, Travel & Hospitality, Education & Kids.
- **Subcategory** chips ("Which best fits?") — per top-level (e.g. Food&Drink: Restaurant, Café,
  Bakery, Bar & Pub, Takeaway, Street food).
- **Cuisine** * chips (only when subcategory ∈ `cuisineFor`, i.e. Food&Drink Restaurant/Takeaway/
  Street food): Indian, Italian, Chinese, Thai, Japanese, Turkish, Greek, Mexican, British,
  Caribbean, Vietnamese, Lebanese — "choose at least one"; error if none.
- **Specialties** (optional, "What are you known for?") — per-category, e.g. Vegan options,
  Locally sourced, Halal, Gluten-free, Artisan, Family-friendly. Dashed "+ Add your own (needs
  admin approval — deferred)" — NON-functional label (routes to Suggested-tag Moderation once
  intake exists).
- **Generated customer-facing label** card: composed `{cuisines} {subcategory}` (e.g. "British
  Bakery"); green "Category set" pill when complete.
- Shield note: "Category is a hard prerequisite for building the flagship vouchers (step 4).
  Changing the top-level category later discards any draft flagship vouchers (a confirm-guard).
  Saved on behalf and audited."

**STEP 2 · Business profile** (template 4646-4788, vals 16621-16720). Summary vs Editing modes.
Three cards:
- **Public profile** (green "What customers see" tag): Logo upload (square ≥512, ≤2MB) + Cover/
  banner (wide ≥1600×600, ≤5MB); **Business description** * (textarea, `{len}/600`, "Tell
  customers what makes this business special"); **Public website** (https://…).
- **Business name and registration** (grey "Private · for verification" tag): Registered/legal
  name *; Trading name (optional); Company number (optional, "8 digits, or letters then 6
  digits"); VAT registered? toggle → VAT number ("GB then 9 digits"). Note "Free text; not
  validated against Companies House or HMRC today."
- **Richer profile** (dashed purple `Net-new: not stored yet, would need a schema update`):
  Business type chips (Sole trader / Limited company / Partnership / LLP / Charity / Franchise /
  Other) → conditional Charity number / UTR; Registered/head-office address (line1/line2/town/
  postcode); Head-office phone / email (distinct from owner); **Owner / responsible person**
  sub-card (Title select [Mr/Mrs/Ms/Mx/Dr/Prof/Other], first/last; Position job chips [Owner/
  Founder/Director/Partner/General Manager/Branch Manager/Marketing Manager/Other]; contact email/
  mobile/landline; optional **secondary contact** toggle with same fields); Your values chips
  (Locally sourced/Sustainable/Family-run/Community-focused/Independent/Award-winning); Instagram/
  Facebook/X/TikTok; Price range (£/££/£££/££££); category-eligible **service options** (per
  `SERVICE_OPTS`, e.g. Food&Drink: Dine-in/Takeaway/Delivery/Click&collect; + "Other" → free text).
  Save disabled until description + legal name present. Save button "Save profile on behalf".

**STEP 3 · Branches** (template 4790-176 of chunk, vals `branchStepVals` 14520). List vs Form
modes. First branch auto = main branch. List: each branch card shows name + Main/loc badges +
"Edit on behalf"; Address; **Hours** (`hoursTxt`); Amenities chips. Empty: "No branches yet" / "+
Add the main branch". Shield: "Still needed for go-live: at least one branch with a confirmed
location and opening hours." **Branch FORM** — 8 numbered sub-sections:
  1. **Basics**: Branch name * ("e.g. North Street"); Branch description (optional, `{n}/600`, "Use
     my business description" button).
  2. **Address**: Address lookup (Google Places autocomplete, "pick a result to autofill —
     coordinates resolve automatically"); Address line 1 * / line 2 (opt); Town/city * / Postcode
     *. "Country: United Kingdom (GB) · set for all branches."
  3. **Contact** (all optional): Branch phone / email / website.
  4. **Opening hours** (MULTI-WINDOW): per-day rows (Mon–Sun); Open/Closed toggle; "Open 24 hours"
     toggle; **split windows** — each window = from/to `type=time` inputs + remove (×); "+ Add
     split window"; helpers "Copy Monday to weekdays" / "Copy to all days"; per-day validation
     error line.
  5. **Amenities** ({category} label): only category-eligible chips shown (e.g. Food&Drink:
     Wheelchair access, Outdoor seating, Dog friendly, Free WiFi, Parking, Baby-changing, Vegan
     options, Licensed bar, Other → free text).
  6. **Images**: Branch logo (customer-facing, defaults to merchant logo; "Upload a different logo
     for this branch" / "Revert to merchant logo"); Branch banner (≥1600×600, ≤5MB); Branch photos
     (up to 8, each `Pending` until moderation). Note "Photos stay pending until approved…".
  7. **Redemption PIN** (D46): "4-digit in-store validation PIN, set with the merchant. Stored
     encrypted." 4-char numeric input; "✓ 4-digit PIN set". (The value is entered here during
     capture; elsewhere PINs are never rendered — this is the capture exception.)
  8. **Location** (automated, D-branch-trust): "pin auto-resolves from the postcode and address —
     you only verify it. No manual coordinate entry." Map thumb + "Confirm location" + "Nudge /
     flag"; "Location confirmed" state.
  Save bar (cream on-behalf/audited note): "Save branch on behalf" / "Cancel"; hours-invalid
  guard.

**STEP 4 · Vouchers** (template 5115-280, vals `voucherStepVals` 14872) — D52 faithful port of
merchant-portal flagship builder. List vs Builder modes. Tracker chip "Flagship vouchers {n}/2".
Two RMV slots ("Flagship · RMV 1/2"); each slot card: type dot, title, `rmvBadge`, tier pill
(Too weak/Good/Great), summary, saving chip, "Build this voucher"/"Edit on behalf". Intro: "Create
the two flagship vouchers (RMVs) this business needs to go live, on behalf. The value tool helps
you and the owner build good offers together — it's advisory guidance, not a gate. Custom vouchers
are a day-2 addition after go-live." Shield: flagship vouchers have no expiry; custom (incl.
time-limited/reusable) added after go-live.
  **Builder** — category-driven (types depend on Step-1 category via `resolveCatData`):
  1. **Type picker**: eligible tiles = BOGO (Recommended), Spend & Save, Discount, Freebie,
     Package. Disabled tiles Time-limited / Reusable ("Not available for flagship vouchers — add
     as a custom voucher later").
  2. **You decide** (mechanics, per-type fields with **suggestion chips** that fill fields, keyed
     off category `vCatLabel`/`vExampleLine`):
     - BOGO: Buy/qualifying item (+chips) & its full price; Free item (+chips) & value.
     - Spend & Save: Spend threshold (+£ chips) / Save amount (+£ chips).
     - Discount: Fixed(£)/Percentage(%) toggle; amount/min-spend (+chips) OR percentage +
       reference (Typical order value / Minimum spend, "estimate to compute the saving — not shown
       to customers").
     - Freebie: The free item (+chips) & worth; "Requires a qualifying purchase" checkbox → item.
     - Package: What's in the package (+chips); Package price / Normal total (+chips).
  3. **What customers will see**: Photo (landscape ≥1200×600, "goes to moderation"); **Title**
     (auto-composed, editable, `{n}/60`, "Reset to auto-composed"); **Description** (auto-composed,
     editable, `{n}/300`); **Estimated saving (£)** — editable or read-only "from the fields
     above"; **minimum saving £5** warning ("Below Redeemo's minimum saving of £5" + "Set to £5").
  4. **Your terms**: "Always on" core terms (green Fair); optional toggle terms (tagged Fair/
     Caution/Restrictive); computed terms; add-your-own (80 chars, restrictive-detection warning);
     escalating warnings "becoming restrictive" / "too restrictive".
  Right **sticky rail**: live customer preview card (type pill, title, merchant, desc, "Save
  £X"); **"How this voucher stacks up"** — 3-segment meter (Too weak / Good / Great) + tier banner
  + "What's strong" / "What could make it better" lists (real `scoreVoucher`/`computeVoucher`
  advisory, client-side). Footer: "A 'Too weak' voucher can still be saved — admin review is the
  quality backstop." Save "Save flagship voucher".

**STEP 5 · Staff and access** (optional; template 4969-324, vals `staffStepVals` 16303). "Skip
for now" ↔ "Add staff on behalf". Intro: "Staff is optional. The owner is automatically the
account admin and the default user for every branch…It never blocks go-live." Three populations:
  - **(a) Branch managers & branch emails** (`Net-new`, D45): per-branch manager select; defaults
    to owner (`{owner} (owner) — default`) until assigned; "The branch manager receives that
    branch's automated emails (redemption summaries, alerts)." Nudge when all still route to owner.
    (D44: branch-manager-defaults-to-owner. D45: branch-email routing.)
  - **(b) Portal managers** (MerchantMembership, REAL): invited by secure claim link (set own
    password; operator never sets it); limit 8. Form: first/last, email (claim link sent here,
    dup-checked), Portal role (Branch manager / Staff; Owner implicit), Branch scope (All / Specific
    chips), "Can manage vouchers" (Branch-manager only; Owner implicit-yes; Staff never).
  - **(c) Branch / till users** (BranchUser, REAL): scan-app logins, one per branch v1, limit 20.
    Form: Name, Branch, Email (dup-checked), Temporary password (min 6, Generate button; "change
    on first login").
  Shield: "On the live account, an admin can add, suspend, reactivate, or reset passwords for
  staff on the owner's behalf — the same actions a merchant can do in the portal (the manage side
  lives on Merchant 360). Branch-manager routing and the branch-email preference are net-new;
  portal managers and till users are real."

**STEP 6 · Documents** (optional; template 5398-87, vals `docsStepVals` 16448). `Net-new for
merchant/assisted` + status pill (Pending review / Not submitted). "Documents are optional and
never block go-live…Documents are admin-only today — capturing them on the merchant/assisted side
is net-new." Doc slots (generic; default 3): "Business verification document 1" (e.g. certificate
of incorporation), "…document 2" (e.g. proof of address or food hygiene), "Price list" (optional);
"+ Add another document". Each uploaded slot → `Pending review` badge, Remove, and **operator
note** (D51): "Add a note" → textarea ("What is this document / what did you check? e.g.
Certificate of incorporation, matches Companies House #12345678"), collapsed/expanded views, Edit/
Hide/Save/Cancel/Remove note; "Operator note · internal — not shown to the merchant or customers.
Saved on their behalf and audited." Shield: uploads go to moderation, nothing auto-approved.

**STEP 7 · Contract** (template 5486-159, vals in `assistedVals`). 12-month agreement; owner
signs in person on this device; operator CANNOT sign. Three states:
  - **Pre-sign**: "Redeemo Merchant Agreement" + `v2.3 · 12-month term`; scrollable summary text
    (Term/Placement/Redemption/Fees clauses; "full agreement text is owner/legal-owned and pending
    final legal sign-off" — links to future D55 agreements module); shield "The operator (you)
    cannot accept this agreement. Acceptance is the owner's own act. Hand the device to the owner
    …"; button "Hand to the owner to review and sign ›". Shield: "Today the system stores only
    version, timestamp, IP, and method — the signatory's name, title, and a drawn signature are
    all net-new evidence." (ties D65 evidence-pack, cross-ref screen 2.12).
  - **Owner acceptance panel** (navy): "Owner only · hand the device over"; Your full name * /
    Your title * ("e.g. Owner, Director"); **Sign here** (optional canvas, drawable, Clear); "I am
    the business owner, and I have read and accept…" checkbox; "Not now" / "I accept the
    agreement" (enabled when name ≥3 + confirmed). Records name/title/time/IP/method/version/
    signature; "The operator does not sign."
  - **Signed**: green "Agreement signed by the owner"; evidence grid — Signatory (name+title),
    Method ("Accepted in person on the operator's device"), Timestamp, IP, Agreement version,
    Drawn signature (Captured/Not provided), "Accepted by admin? No — owner's own act". Button
    "Continue to go-live review ›".

**STEP 8 · Go-live review** (template 5558-194). Top-right **Demo gates** switcher (All green /
Gate fail — PROTOTYPE). Intro "The five real go-live gates. Because you verified the business in
person, you can approve and take it live here." **5 real gates** (matches CLAUDE.md §6.7 enforced
gates): "At least one branch exists" · "Merchant agreement signed by the owner" · "Two mandatory
(RMV) vouchers configured" · "A main branch is set" · "Main branch location confirmed". Gate-fail
banner names the two unmet gates (agreement + RMV). When all green: **In-person verification
attestation** checkbox ("I met the owner ({name}) in person, confirmed this is a genuine trading
business, and confirmed I am dealing with the right person authorised to represent it."); shield
"single-actor create-and-approve…the in-person attestation and a post-hoc audit flag are the
accountability controls"; "Approve and take live" (disabled until attested & gates green) → confirm
modal "Take {merchant} live?" → `onAssistedApproveLive` sets live + **auto-advances to step 9**.
Live banner: "{merchant} is live · Flagged for post-hoc audit review (same operator built and
approved). Continue to handover."

**STEP 9 · Handover** (template 5593-224). Pre: `Live` badge; Owner email *; shield "A secure
tokenised setup link will be sent to the owner. They set their own password and take ownership.
The operator never sets or sees a password. The transfer/claim mechanism is real."; "Send setup
link & hand over" (disabled until valid email). Done: "Account handed over" + "The operator never
set or saw a password" pill; "Open the merchant's 360" / "Finish & exit to admin"; "Assisted
onboarding complete. Built and approved on behalf, signed by the owner, live, and handed over.
Flagged for post-hoc audit review."

---

## (c) INTERACTIONS / ACTIONS

- **Hub cards**: "View in queue →" → Approval Queue (`Onboarding` filter). "Create a draft" →
  createDraft. "Start assisted onboarding" → assisted (fresh, `assistedStep:1`, `assistedEmpty:true`).
  Both admin-created actions capability-gated (`merchant:create-draft` / `merchant:assisted-onboard`;
  prototype uses roles SUPER_ADMIN/OPERATIONS/SALES).
- **In-progress Resume** (`r.onResume`): → assisted with `assistedStep: r.stepN`, `assistedResumeId:
  r.id`, `assistedEmpty:false`. RESUME BEHAVIOUR = jump straight to the step reached (populated seed
  merchant Southville). ⚠ See Ambiguities: the seed `stepN` values (1/2/4) and "/5" label are
  inconsistent with the 9-step wizard mapping.
- **Pipeline card actions** (per stage): **Move** (`advanceLabel`) — "Move to Contacted" (lead) /
  "Move to Visit booked" (contacted); **Visit-booked stage has NO Move** (`advanceLabel: null` —
  terminal pre-draft stage). **Convert** (gradient) — opens convert dialog. **Task** — opens
  pre-filled task-create (`openTaskPrefilled('followup', …, 'Follow up with {biz} (prospect {id})')`,
  integrates screen 2.3). **Lost** (rose text) — opens lost dialog.
- **Convert dialog** (`pipConvertOpen`, template 9822-9843): "Convert {biz}" / "Hand off to one of
  the two admin-created routes. The lead details are carried across to pre-fill it." Two buttons:
  - **Create a draft and hand off** (`onConvertDraft`): → createDraft with `draftForm` pre-filled
    (legal=biz, first/last split from contact, email, phone). REAL flow — not a rebuild.
  - **Start assisted onboarding** (`onConvertAssisted`): → assisted (fresh, step 1). (NOTE: does
    NOT carry lead detail into the wizard in the prototype — assisted starts empty; flag.)
- **Lost dialog** (`pipLostOpen`, template 9844-9860): "Mark {biz} as Lost" / "A reason is
  required. The prospect stays in the record under Lost, and the reason is audited." Reason
  textarea (≥4 chars to enable "Mark Lost"); on confirm sets stage=lost + fires "Prospect marked
  Lost with a reason. It stays in the record. Audited." AUDITED, reason-required.
- **Add-lead dialog** (`pipAddOpen`, template 9766-9820): "Add a lead" / "Quick capture. It enters
  the pipeline as a Lead. Audited." Fields: Business name, Category guess, Locality, Contact name,
  Source (Rep visit / Inbound enquiry / Customer request (future intake)), Phone (opt), Email
  (opt). Validation: business name ≥2 chars enables "Add lead". On submit fires "Prospect added to
  the pipeline as a Lead. Audited." (`onSubmitPipAdd`).
- **Wizard step navigation**: free movement (rail rows clickable `onGo`; footer Prev/Next for
  steps ≤6). "Nothing is live yet · move freely." Steps 7-9 gated by inline continue buttons.
- **Auto-advance** (D49): step-8 Approve → auto lands step 9. Confirmed via `onAssistedApproveLive`
  `assistedStep:9`.
- **Save and continue later** (`assistedSaveLater`): toasts "saved…resume any time. Nothing is
  live; every step is on behalf and audited." → returns to hub (the in-progress list is where it
  reappears).
- **Per-doc operator notes** (D51): add/edit/expand/collapse/remove; internal-only, audited.
- **Voucher builder** (D52): suggestion chips fill fields; real `scoreVoucher`/`computeVoucher`
  advisory meter + strengths/improvements; min-£5 saving nudge; "Too weak" still saveable.
- **Assign-then-claim (D59)**: honesty-note states "Assign-then-claim semantics apply" and rep is
  shown per card; the actual assign action is NOT built in this module (it's the 2.3/queue
  cross-surface flow). `lead:manage` cap = Sales/Lead-owner + Operations + Super Admin.
- **Every save is "on behalf" + audited**: pervasive shield/cream notes and toasts on every step.

---

## (d) STATES (list all; honesty preserved)

Hub: Loading (skeletons) / Ready. Pipeline: Populated / Empty / Loading / Error / Permission-denied
(`lead:manage`). Create-draft: Form / Success / Email-exists (`EMAIL_ALREADY_EXISTS`) / Gate-error
(`DRAFT_CREATE_FAILED`) / Capability-denied (`merchant:create-draft`). Wizard: Capability-denied
(`merchant:assisted-onboard`) / active; per-step: empty vs populated (empty flow = "New merchant",
only current step reached; populated = seed "Southville Sourdough"); Step-3 empty ("No branches
yet" → "+ Add the main branch"); Step-5 skipped / active / "Add a branch in step 3 first" (managers
+ till empty); Step-6 skipped / active / Not submitted / Pending review; Step-8 gate-fail / all-green;
Step-9 pre / handed-over.
**Honesty / maturity labels to preserve (BC-1):**
- Inbound card `LIVE`; Assisted card `Net-new`; Prospect pipeline `Net-new`.
- Pipeline honesty note: "no lead table exists yet", customer-request `Future intake` chip = the
  customer-app "Request a merchant" FUTURE intake stub; "Lost requires a reason and is audited";
  "most prospects do not convert".
- In-progress footer: "Nothing here is live…go-live happens only after the final review."
- Wizard header: "Nothing goes live until the final review · Focus mode (still your operator
  session, still audited; not a separate login)."
- Rail "Final steps" note: "shell-create + email transfer are real; running full onboarding on
  behalf is net-new; owner signs contract + sets password themselves."
- Step 1: "+ Add your own (needs admin approval — deferred)".
- Step 2: Richer profile `Net-new: not stored yet, would need a schema update`; "not validated
  against Companies House or HMRC today"; owner-record real-vs-net-new note.
- Step 5: `Net-new` on branch-manager routing; "portal managers and till users are real".
- Step 6: `Net-new for merchant/assisted`; "Documents are admin-only today".
- Step 7: contract evidence "signatory name/title/drawn signature are net-new"; "full agreement
  text pending final legal sign-off" (D55 future); "The operator does not sign."
- Step 8: "single-actor create-and-approve…post-hoc audit flag"; "Flagged for post-hoc audit
  review (same operator built and approved)".
- Step 9: "The operator never set or saw a password"; "transfer/claim mechanism is real".
- Create-draft: "Pending · not live"; "Acquisition source is recorded as Admin-created draft";
  "No password or token ever appears here or in logs."
- PIN: always encrypted-at-rest framing; entered only during capture, never re-rendered elsewhere.

---

## (e) DESIGN-SYSTEM NOTES

- Fonts: display "Mustica Pro" (600) for h1/h2/section titles; body "Lato". Ops canvas = cool
  `--neutral #F8F9FA` (not the warm cream).
- Badge tones: `Net-new` = amber (`#B45309` on `#FDF1E3`/`#FEF6E7`) on hub/pipeline/steps, but
  purple/lavender (`#7C3AED` on `#F1ECFB`, dashed `#C4A2F5`) on the Step-2 Richer-profile card —
  two different net-new visual treatments; unify or document. `LIVE`/success = green (`#0F7A3E`/
  `#E7F5EC`). Source chips = neutral grey pill (`#F3F4F6`/`#4B5563`). `Future intake` = amber.
  Overdue tint = danger red (`#B91C1C`) on due text + "Overdue" tag. Pending (docs/photos) = amber.
- Voucher-type dots use the `--vt-*` accent tokens (bogo purple, discount rose, freebie green,
  spendsave coral, package blue, timelimited/reusable teal/amber for disabled tiles).
- Step-rail dot states: current = rose fill; done = green ✓; partial = amber !; todo = white/grey
  numbered. Status labels Captured/In progress/Editing/Not started.
- Gradient rose→coral CTA + `--shadow-glow` reserved for the ONE primary action per screen
  (Assisted CTA, Convert, submit-draft, Save-profile, Approve-live, Owner-accept).
- **DIVERGENCE from neutral shadcn** (flag for build): the assisted wizard is a **bespoke
  full-screen "focus mode"** — it hides the standard ops sidebar + top bar and substitutes a
  persistent navy on-behalf header + 270px left step rail. This is the largest chrome divergence
  in the module and needs a deliberate route/layout that escapes the shell. The Step-7 owner
  acceptance panel (navy card with an interactive `<canvas>` signature pad) and the Step-4
  two-column sticky builder are also non-standard composite components.

---

## (f) PROTOTYPE-ONLY / DO-NOT-BUILD (this module)

- Hub **State switcher** (Ready / Loading) — demo control.
- Pipeline **demo chips** (Populated / Empty / Loading / Error) — demo state togglers.
- Create-draft **State switcher** (Form / Success / Email exists / Gate error) — demo control.
- Step-8 **Demo gates** switcher (All green / Gate fail) — demo control.
- Synthetic operator "Shebin C." / "Aisha K(han)."; synthetic merchants (Southville Sourdough,
  Anchor Street Coffee, etc.); all `.example`/`.test` domains; hardcoded "today" `2026-07-05`;
  hardcoded counts (6 awaiting review, badge 24/7/12, in-progress 3).
- Seeded `pipLive` overrides, seeded profile/branch/voucher/staff/doc data, seeded signed-contract
  evidence (name/IP/timestamp) — all synthetic.
- The drawn-signature `<canvas>` capture is a real interaction pattern but its stored artefact is
  demo-only (no backend); build the ceremony, not the fake evidence record.
- The role-cycling top-bar avatar (global) — build role-gating, not the cycler.

---

## AMBIGUITIES FOR PLANNER

1. **STEP-ORDER vs task brief**: actual order is Documents=6, Contract=7, Go-live review=8,
   Handover=9 (NOT the brief's Contract=6/Documents=7/Review=8/Approve=9). Confirm the build
   follows the prototype rail, not the brief.
2. **Resume mapping inconsistency**: in-progress seed rows use `stepN` 1/2/4 with a "step {N}/5"
   label, but the wizard has 9 steps and `onResume` sets `assistedStep = stepN` directly. Result:
   Southville (Vouchers, stepN 4) lands step 4 = Vouchers ✓, but Harbour (labelled "Branches",
   stepN 2) lands step 2 = Business profile ✗, and Clifftop (labelled "Business profile", stepN 1)
   lands step 1 = Category ✗. The "/5" denominator is stale (should be /9). Planner must define the
   real resume contract (persist actual step index; fix the /5 → /9 label).
3. **Converted column** exists in template/vals (`pipHasConverted`, green rows) but seed has zero
   converted leads, and Convert routes AWAY to createDraft/assisted rather than moving the card to
   a Converted column in-place. Clarify whether Convert should also leave a "Converted" record in
   the pipeline (2.11 says post-conversion stages live on other surfaces — the in-progress list +
   queue — so the Converted column may be vestigial). Decide: keep, drop, or wire.
4. **Convert → Assisted does not carry lead data**: `onConvertDraft` pre-fills the draft form, but
   `onConvertAssisted` starts the wizard empty (no lead pre-fill). Confirm whether assisted-convert
   should seed identity/contact from the lead.
5. **Add-lead does not persist**: `onSubmitPipAdd` only closes + toasts; it does not append to the
   list (no lead table). Confirm the real backend contract for lead creation (Lead model is
   entirely net-new).
6. **Capability naming**: prototype gates use enum roles SUPER_ADMIN/OPERATIONS/SALES for
   create-draft, assisted, AND pipeline; but D-notes name distinct caps `merchant:create-draft`,
   `merchant:assisted-onboard`, `lead:manage`. SALES is a FUTURE role (real enum has 5 roles, no
   SALES). Planner must map caps→real roles and decide whether pipeline `lead:manage` truly matches
   the two admin-created-route caps (prototype treats all three identically).
7. **Assign-then-claim (D59) surface**: the honesty note claims assign-then-claim applies, but no
   assign/claim control exists in this module (rep is display-only). Confirm the assign action
   lives in Tasks (2.3)/queue and this module only reflects assignment.
8. **Voucher advisory port (D52)**: `scoreVoucher`/`computeVoucher`/`voucherTerms`/`resolveCatData`
   are the merchant-portal builder logic ported into the prototype; the build must reuse the REAL
   merchant-portal builder + real `scoreVoucher`, not re-implement. Confirm shared-component reuse.
9. **Contract text + versioning (v2.3)**: agreement text is placeholder "pending final legal
   sign-off"; owns to the future D55 agreements module and D65 evidence-pack. Confirm what version
   store + evidence fields (name/title/drawn-sig/hash) are in-scope now vs deferred.
10. **PIN capture exception**: Step-3 renders a 4-digit PIN input during capture — the only place a
    PIN is entered in admin. Confirm this is acceptable under the "PIN hidden by policy" rule
    (it's set-not-shown), and that it writes encrypted with no read-back.
11. **Two net-new visual treatments** (amber vs purple/lavender) for "net-new" within one module —
    pick one for consistency.
12. Minor synthetic-data nit (screenshot 08): branch address seed shows lowercase "12 bath Street"
    — cosmetic, fix on port.
