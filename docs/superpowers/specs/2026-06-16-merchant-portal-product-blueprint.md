# Merchant Portal Product Blueprint

**Status:** Product blueprint + audit. NOT a spec, NOT a plan, NOT implementation-authorised. Feeds a Claude Design clickable prototype, then (after prototype approval) the Tier-3 `brainstorming` to `writing-plans` flow for Phase 3.
**Date:** 2026-06-16 (v1.2)
**Owner:** Redeemo
**Tier:** 3 (new surface + backend contracts + likely schema). This document is closed-scope planning only.
**Source of truth for the underlying model:** `docs/superpowers/specs/2026-06-10-merchant-portal-admin-onboarding-design.md` (the June-10 design spec). This blueprint does not re-decide what that spec locked; it designs the merchant-facing operating experience over it and surfaces the genuinely-open product/UX forks.

**v1.1 refinements (2026-06-16, second pass):** the reporting area is named **Insights & reports** and analytics are **distributed** across four surfaces (section 4 + 5.6); customer privacy is protected by an **aggregate-only, minimum-cohort, no-exact-address** model with a stop-and-review checkpoint (section 5.6.4 + 8.4); **location/maps/verification** is treated as a platform capability with the verified code reality (section 11); the left navigation is **regrouped** (section 2.1); and a **cross-check table** of owner clarifications to decisions is added (section 12).

**v1.2 location decisions locked (2026-06-16):** merchant pin placement is submitted-for-review and does NOT by itself confer discovery visibility; new Google billable endpoints are a stop-and-approve checkpoint; and Google quota/cost protection must move to a multi-instance-safe limiter before any merchant-facing flow goes live (sections 11.2-11.4, 8.4, 12).

---

## 0. Owner decisions locked in this session (grill-me, 2026-06-16)

Six portal-experience forks were walked one at a time. The answers anchor this blueprint.

1. **Onboarding experience model = dashboard-first + dominant setup checklist.** The merchant sees the real portal home from day one, driven by a "Get your business live" checklist card. Day-2 modules are visible but locked until approved.
2. **Navigation = grouped left sidebar + persistent live-status pill.** Reuses the admin-web shell; collapses to a drawer + bottom tabs on mobile. Final grouping in section 2.1.
3. **Device = desktop-first, fully responsive.** The dedicated staff scan/validate mobile app is a separate Phase 4 product.
4. **Day-2 home = redemption-activity hero inside a full professional business dashboard.** Charts, performance summary cards, pending-action cards. Widgets classified MVP / fast-follow / prototype-only.
5. **Offer builder = ladder + type picker + one type (BOGO) drawn end-to-end, wrapped in a teaching/helper layer.** The blueprint defines the full 8-type system and how the helper pattern generalises.
6. **Visual register = warm, branded, premium-but-professional.** Follows the brand tokens and the Phase-A design-system; the portal is the Phase-B greenfield target.

---

## 1. Source audit

### 1.1 Sources inspected

| Source | Type | Contributes | Status / source-of-truth |
|---|---|---|---|
| `docs/superpowers/specs/2026-06-10-merchant-portal-admin-onboarding-design.md` | Design spec (22 sections + appendices) | The entire lifecycle model, RBAC, onboarding gates, verification, contract, offer engine (sections 7/20/21/22), actioner, edit tiering, go-live, day-2. | **Canonical.** |
| `docs/superpowers/specs/2026-06-10-rmv-templates-9-categories.md` | Content draft | Per-category RMV template catalogue. | First-pass content for owner review; not seeded. |
| `docs/superpowers/specs/2026-06-16-rmv-public-offer-model-correction-brainstorm-seed.md` | Inspection record | The `merchantFields` write-only finding. | Reconciled / superseded by the June-10 spec. |
| `docs/superpowers/specs/2026-06-07-merchant-admin-platform-strategy.md` | Strategy / audit | Chokepoint diagnosis, phased roadmap, hosting/domain, vendor lock-in. | Canonical strategy. |
| `docs/superpowers/specs/2026-05-14-merchant-exact-pin-confirmation-design.md` | Design spec | The exact-pin / Google Places confirmation design. | Design; partially implemented (admin manual confirm only; see section 11). |
| `docs/superpowers/specs/2026-06-10-brand-design-system-foundations-design.md` | Design-system spec | Brand tokens, typography, 60-30-10, voice, Phase A/B/C. | Approved; portal = Phase-B greenfield. |
| `docs/superpowers/plans/2026-06-14-admin-panel-actioner-plan.md` (+ slice-a, + WP1-5) | Plans | The admin-web app the merchant portal mirrors. | Shipped M0-M8 + WP1-5. |
| `docs/superpowers/plans/2026-06-10-merchant-portal-phase-0-foundations.md` | Plan | Backend foundations (Resend, notify, R2, moderation, limiter, BullMQ, staging). | Shipped (dark by default). |
| `docs/runbooks/deploy-security-runbook.md` | Runbook | Domain facts (`merchant.redeemo.co.uk`), hosting, email policy, launch gates. | Operational. |
| `src/api/merchant/**` | Code | ~25 merchant routes already exist. | The portal consumes these; no UI exists yet. |
| `src/api/admin/**` | Code | The actioner, edit-on-behalf, documents, B5.1-core RMV co-build, `confirm-location`. | Shipped. |
| `src/api/lib/googlePlaces.ts` | Code | Google Places Text Search wrapper (capped, field-masked). | Exists; wired only to a CLI (section 11). |
| `src/api/shared/atomicLimiter.ts` | Code | Redis atomic limiter (gate/abuser/victim classes). | Exists; not used by Google Places. |
| `src/api/customer/discovery/service.ts` | Code | `getCustomerVoucher` select (the customer render contract). | Key offer-engine dependency. |
| `prisma/schema.prisma` | Code | Merchant / Branch / Voucher / RmvTemplate / Membership / Approval / AuditLog / LocationConfidence. | Source of truth for data. |
| `apps/admin-web/**` | Code | Next 15 + Tailwind 4 + shadcn + React Query, port 3002, shell, capability mirror, NotificationBell. | The tech + shell the portal reuses. |

### 1.2 The three decisive findings

1. **The merchant backend already exists; the portal is a missing front end.** ~25 authenticated merchant routes are live and tested (auth incl. token-claim, profile with a direct-vs-sensitive edit split, onboarding checklist + contract + submit, full branch CRUD + hours + amenities + PIN + soft-delete, branch-user create/reset/deactivate, custom + RMV voucher CRUD). Much of "build the portal" is "build the UI and the read/aggregate endpoints," not "build the domain."

2. **`merchantFields` is write-only and customer-invisible (verified).** `getCustomerVoucher` selects `id, title, type, description, terms, imageUrl, estimatedSaving, expiryDate, code, status, approvalStatus, cooldownSeconds` and NOT `merchantFields`. The offer engine's structured per-type fields have no customer render path today (section 6.6).

3. **The admin side of every lifecycle transition is already shipped.** The merchant portal is the OTHER face of flows the admin actioner already drives (submit, claim-to-review, request-changes, reject, approve/go-live, suspend/reactivate, edit-tiering, document review, RMV co-build, manual pin-confirm). The portal must stay coherent with admin's view.

### 1.3 Conflicts / outdated references resolved

- **`merchantFields` correction** is designed in the June-10 spec (sections 21 + 20 + the section A3 swap). The 2026-06-16 seed is the reconciled inspection record.
- **Registered-identity edit tier mismatch (flag).** June-10 section 12 puts registered identity (VAT/company) in the approval-gated tier; the live backend allows direct PATCH. The portal follows the spec; recorded in section 8.4.
- **B5.1-web retired.** Admin RMV co-build via UI must not be exposed before the section 10 merchant-confirmation gate exists. B5.1-core stays shipped/inert.
- **Location/verification reality vs spec.** The verification pre-score (Google Place Details, FHRS, Companies House, duplicate-detection) is spec-only, not implemented (section 11). The Google Places Text Search wrapper and the admin manual pin-confirm route do exist.

---

## 2. Portal information architecture

### 2.1 Left navigation (regrouped)

The earlier three-group split (Run my business / My business / Grow) read thin. The revised grouping clusters by the merchant's mental model and feels full without artificial labels. A live-status pill sits at the top; Home stands alone; Settings and Help are pinned at the bottom.

```
+--------------------------+-------------------------------+
|  Redeemo for Business    |                               |
|  [ status pill ]         |   <module content>            |
|                          |                               |
|  Home                    |                               |
|                          |                               |
|  VOUCHERS & CUSTOMERS     |                               |
|   Vouchers               |                               |
|   Redemptions            |                               |
|   Insights & reports     |                               |
|                          |                               |
|  LOCATIONS & TEAM         |                               |
|   Branches               |                               |
|   Staff & access         |                               |
|                          |                               |
|  BUSINESS                 |                               |
|   Business profile       |                               |
|   Documents              |                               |
|                          |                               |
|  GROW YOUR BUSINESS       |  (Phase 5 - "Coming soon")    |
|   Promote                |                               |
|   Payments & billing     |                               |
|                          |                               |
|   Settings               |                               |
|   Help & support         |                               |
+--------------------------+-------------------------------+
```

Reasoning per cluster:
- **Home** (alone): the daily landing / dashboard.
- **Vouchers & customers**: the commercial core, the offers and the people redeeming them, and what the data says. Vouchers (manage + build), Redemptions (the event log + validate), Insights & reports (deep performance).
- **Locations & team**: the physical footprint and the people who run it. Branches, Staff & access.
- **Business**: the business record and compliance. Business profile, Documents.
- **Grow your business** (Phase 5 placeholder, labelled "Coming soon"): discretionary paid growth and the billing that funds it. Promote (campaigns & featured), Payments & billing.
- **Pinned**: Settings, Help & support.

Status / phase labelling for the nav: Home, Vouchers, Redemptions, Insights & reports, Branches, Staff & access, Business profile, Documents, Settings, Help & support = **MVP**. Promote + Payments & billing = **Phase 5** (visible as "Coming soon" in the prototype to show the roadmap). Multi-user invites within Staff & access = fast-follow.

On mobile the sidebar collapses to a hamburger drawer; Home, Vouchers, Redemptions, and Insights also surface as a bottom tab bar.

### 2.2 Top navigation bar

- **Left**: a sidebar collapse toggle + the "Redeemo for Business" wordmark.
- **Right (three controls)**:
  1. **"Validate a code"** button: the in-store validation entry for an owner/manager (the redemption-verify route already accepts a merchant admin). Its primary home is the Redemptions module; the topbar surfaces it as a global quick action.
  2. **Notifications bell** (unread badge): approved / changes-requested / rejected / suspended, voucher approval outcomes, document requests, branch-pin reminders, redemption milestones, and later campaign/payment receipts. Wiring is Phase 6 (schema ready); designed now. Mirrors the admin bell.
  3. **Business-logo avatar** (initials fallback), clickable, opening the **account menu**: business name + owner name, then "My account" (the logged-in user: profile, password, devices, notification preferences), "Business profile," "Switch branch" (franchise, future), "Help & support," and **"Log out" with a confirmation** ("Log out of Redeemo for Business?") to avoid accidental logout on shared devices.

### 2.3 Role / access assumptions

Per spec section 3, identity is separate from membership; MVP roles are OWNER / BRANCH_MANAGER / STAFF.

- **OWNER** (MVP primary portal user): whole account, all modules, vouchers (merchant-wide), contract, identity, ownership, staff, documents, billing.
- **BRANCH_MANAGER** (designed now, built as needed): assigned-branch operations and details only; operational edits instant (audited, revertible), identity edits queued; NOT vouchers; NOT contract/identity/ownership.
- **STAFF** (= `BranchUser`): validate-only; not a portal management user (the verify flow today, the Phase 4 mobile app later). The portal MVP is OWNER-centric with role-gating designed into the shell.

### 2.4 Visible-before-onboarding vs after-approval / live

| Module | Setting up (pre-submit) | Submitted / In review | Live | Suspended |
|---|---|---|---|---|
| Home | Checklist-led setup home | "We are reviewing" status home | Full business dashboard | Read-only + suspension banner |
| Vouchers | Build the 2 RMVs (+ optional custom) | Locked (read-only) | Full (build, edit, submit; day-2 approvals) | Read-only |
| Redemptions | Locked teaser ("unlocks when live") | Locked teaser | Full event log + validate | Read-only snapshot |
| Insights & reports | Locked teaser | Locked teaser | Full reporting | Read-only snapshot |
| Business profile | Full draft edit | Locked | Day-2 edit tiering | Read-only |
| Branches | Add main branch, edit, hours, PIN | Locked | Full + per-branch readiness | Read-only |
| Staff & access | Add staff (validation works once live) | Available | Full | Read-only |
| Documents | Optional proactive upload | Read own | Full | Read-only |
| Promote / Payments | Hidden or "Coming soon" | "Coming soon" | "Coming soon" (Phase 5) | n/a |
| Settings | Account, security | Available | Available | Limited |

Reassurance copy throughout pre-live: "Nothing is public until we approve your business."

---

## 3. End-to-end merchant lifecycle

### 3.1 Registration / account claim / login
- **Self-register** (organic / rep / email / social): the merchant creates the account, sets their own password, verifies email + phone via OTP, picks a category, accepts terms themselves.
- **Token-claim** (phone-assisted / admin-created draft): a tokenised claim link is emailed; the merchant sets their own password, verifies, accepts terms. The admin never knows the password and never accepts terms. The claim route exists (`POST /merchant/auth/claim`).
- **Login**: email + password, OTP on a new device. A suspended merchant drops to a read-only state (SEC-M2, live-DB status).

### 3.2 Onboarding (3 gates; spec section 4)
- **Gate 1 (account, about 60s)**: email + password + business name + phone + OTP + category (drives RMV provisioning + discovery).
- **Gate 2 (portal + resumable checklist)**: business profile, main branch, the 2 mandatory RMVs (the offer engine), documents (optional at submit), contract (OWNER-only clickwrap). Endowed progress, save-and-continue, "why" beside each step.
- **Gate 3 (submit to review to live)**: submit locks the draft and enqueues the onboarding approval the admin actioner reads.

### 3.3 The state machine (merchant-facing projection)

| Projection | Backend state | What the merchant sees | What the merchant can do |
|---|---|---|---|
| Setting up | REGISTERED | Checklist-led home; "not live yet" | Full draft edit; build offers; submit when complete |
| Submitted | PENDING_APPROVAL / SUBMITTED | "Submitted. We are reviewing." | View only |
| In review | PENDING_APPROVAL / UNDER_REVIEW | "An admin is reviewing." | View only |
| Changes needed | PENDING_APPROVAL / NEEDS_CHANGES | Banner with the admin's reason + items | Edit the flagged areas; resubmit |
| Live | ACTIVE / LIVE | Full business dashboard | Day-2 management; edit tiering; new vouchers queue |
| Suspended | SUSPENDED | "Suspended. [reason]. Contact Redeemo." | Read-only |
| Rejected (reopenable) | INACTIVE / REJECTED | "Not approved. [reason]." | Read-only until reopened |

### 3.4 Edit tiering once live (spec section 12)
- **Instant + audited + revertible (operational/marketing)**: hours, phone, email, website, description, operational toggles. Photos instant only when moderation is wired, else pending review.
- **Approve-before-publish (identity/integrity)**: business name, trading name, registered identity, address, postcode, map location, logo, banner. These queue as pending-edits.
- **Vouchers**: new or materially-edited vouchers queue for VOUCHER approval.

---

## 4. Dashboard / home (analytics surface #1 of 4)

Analytics live in four places (section 5.6): the **Home dashboard** (at-a-glance), **per-voucher performance** inside Vouchers, **operational counts/filters** inside Redemptions, and the deep **Insights & reports** section. Home is the executive glance.

### 4.1 Pre-live home (Setting up)
The dominant element is the "Get your business live" checklist card, surrounded by a plain-language welcome, locked day-2 teasers, and reassurance that nothing is public yet.

```
+----------------------------------------------------------+
|  Welcome to Redeemo for Business.                        |
|  List your business free. Nothing is public until we      |
|  approve you.                                             |
+----------------------------------------------------------+
|  GET YOUR BUSINESS LIVE                       3 of 5      |
|   [x] Create your account                                 |
|   [x] Choose your category                                |
|   [ ] Add your main branch                  >             |
|   [ ] Set up your 2 starter offers          >             |
|   [ ] Sign the merchant agreement           >             |
|                                            [ Submit ]      |
+--------------------------------+-------------------------+
|  Locked: Activity dashboard    | Locked: Performance      |
|  Unlocks when you go live      | Unlocks when you go live |
+--------------------------------+-------------------------+
```

### 4.2 Live home (the professional business dashboard)

```
+----------------------------------------------------------+
|  Today  12      This week  47      This month  186        |
|  Saved for customers this month  GBP 1,240                |
+----------------------------------------------------------+
|  LIVE ACTIVITY                                            |
|   14:14  BOGO main offer   High Street   manual  (Sam)    |
|   13:50  Free dessert      High Street   manual  (Sam)    |
|   13:32  BOGO main offer   Mill Road     manual  (A...)   |
|                                          [ View all ]     |
+-----------------------------+----------------------------+
|  Redemptions over time      |  Offer performance         |
|  [ 30-day line chart ]      |  [ ranked bar chart ]      |
+-----------------------------+----------------------------+
|  Top offer        Busiest branch     Needs attention      |
|  BOGO main (118)  High Street (134)  1 voucher pending    |
|                                       Confirm Mill Rd pin  |
+----------------------------------------------------------+
```

### 4.3 Dashboard widget classification

| Widget | Tier | Data source / note |
|---|---|---|
| Today / week / month redemption counts | **MVP** | count over `VoucherRedemption` |
| Live / recent redemption feed (offer, branch, time, method, staff) | **MVP** | `VoucherRedemption` (no customer identity) |
| Redemptions-over-time chart (30 days) | **MVP** | group by day |
| Offer performance ranking ("Top offer") | **MVP** | group by voucherId |
| Branch comparison ("Busiest branch") | **MVP** | group by branchId |
| Savings delivered this month | **MVP** | sum `estimatedSaving` |
| Tasks / pending-action cards | **MVP** | merchant-scoped approval + edit state |
| Setup checklist progress (pre-live) | **MVP** | existing onboarding checklist endpoint |
| Period-over-period deltas, lifetime savings | Fast-follow | aggregation history |
| First-time vs repeat snapshot | Fast-follow | pseudonymous cohort over userId |
| Validation-method split (manual vs QR) | Fast-follow | after Phase 4 QR |
| Customer demographics (age / location of redeemers) | Prototype-only + privacy-gated | aggregate only, see 5.6.4 |
| Reviews and ratings summary | Prototype-only (future) | Phase 4 reviews |
| Campaign / featured-placement performance | Prototype-only (future) | Phase 5 |
| Payouts / settlements | Prototype-only (future) | Phase 5 |

Prototype-only widgets are drawn with a small "Preview" label.

---

## 5. Modules / screens

### 5.1 Vouchers
- The voucher builder **opens from here** (not a nav item): a "Create voucher" CTA, and the onboarding "Set up your starter offers" step, launch the full-screen two-pane builder (section 6.7), returning to this list on save.
- **List = a table**: voucher (banner thumbnail + title + type chip), code, Mandatory/Custom tag, status, approval status, estimated saving, created date, redemptions count.
- **Two status columns**: lifecycle status (Draft / Pending / Active / Inactive / Expired) and approval status (Pending / Approved / Changes requested / Rejected). Colour-with-label.
- **Mandatory vouchers (RMVs)**: shown but locked. A full read-only detail (title, type, description, banner, estimated saving, terms, created date). The merchant cannot edit; a **"Request a change"** action opens a request to the admin (their comments + what they want), because RMV content is template-owned. View always; amend by request.
- **Custom vouchers (RCV)**: editable; row actions by status: Draft (View, Edit, Submit, Delete); Pending (View, Withdraw); Active (View, Edit which re-queues, Deactivate/"hold", Duplicate); Changes-requested/Rejected (View with reason, Edit, Resubmit); Inactive/Expired (View, Reactivate or Duplicate/Renew, Archive).
- **Per-voucher performance (analytics surface #2)**: the list shows a redemptions count; a voucher detail has a Performance panel (its redemptions over time, branch split, share of total).
- **Search / filter / sort**: by title or code; filter by type, status, approval status; sort by created date, redemptions, saving.

### 5.2 Redemptions (analytics surface #3, operational)
- **Its own module.** Hero: a stat strip (today / week / month, total saved) above the table.
- **Table rows**: redemption code, voucher (title + type), branch, date/time, validation method (manual now, QR after Phase 4), validation status (Validated / Pending), validating staff. **No individual customer identity by default** (section 5.6.4).
- **"Validate a code"**: the owner/manager enters a customer's code to validate in-store (the verify route accepts a merchant admin). MVP. QR scan is the Phase 4 mobile app.
- **Actions from a row**: View detail; Validate (if pending and being done in-store).
- **Search / filter / sort**: by code / voucher / branch; filter by branch, voucher, date range, validation status, method; sort by date / branch / voucher.
- **Export**: CSV (fast-follow), aggregate-respecting (no row-level customer identity).

### 5.3 Branches
- **List**: branch logo, name, main-branch tag, location, status (Live / Pending pin / Under review / Suspended), contact, assigned-users count, PIN status, verification/location-confidence.
- **Branch detail (drill-in)**: logo + banner, name, full address + an interactive map pin (section 11), contact, branch manager, opening hours, about, photo gallery (moderation state), amenities, ratings & reviews (read-only, customer-generated), assigned users, redemption PIN (view/set/send), location-confidence + confirm-pin, and that branch's redemption snapshot.
- **Add a branch fields**: logo, banner, name, address with autocomplete + map pin (section 11), contact number, branch email, branch manager (assign a user), website, opening hours, about, photo gallery, amenities. Ratings/reviews are customer-generated, not an input.
- **Actions**: Save as draft or Submit for review (a new day-2 branch is created hidden and goes through per-branch approval + pin-confirmation before it appears). Edit (operational instant / identity queued), manage hours/photos/amenities/PIN/users, soft-delete (guards: not main or last-active).

### 5.4 Staff & access
- Assign users to branches. **Add-user fields**: contact person/name, position/job title, contact number, email, password (or a set-password invite), status. Manage credentials: reset password, deactivate/reactivate, send PIN. Quick-add from a branch detail page. The backend has create/reset/deactivate; needs a list endpoint. Multi-user OWNER/MANAGER invites = fast-follow.

### 5.5 Business profile + My account
- **Business profile (the business)**: logo, business name, trading name, contact person, position, HQ contact number, HQ email, website, description, category, registered identity (VAT/company). Identity fields approval-gated (propose-change lane); operational fields direct. Category locked once RMVs are configured.
- **My account (the logged-in user, from the avatar menu)**: name, email, phone, change password, device/OTP management, notification preferences. Separate from the business record.

### 5.6 Insights & reports (analytics surface #4, the deep reporting section)

Name chosen over "Analytics," "Performance," and "Reports" because it covers both the at-a-glance **insight** cards and the exportable deeper **reports**. This is the cross-business reporting area; the other three analytics surfaces (Home, Vouchers, Redemptions) handle glance, per-voucher, and operational views respectively.

#### 5.6.1 The distributed analytics model (recap)
1. **Home** = the executive glance (KPI cards + key charts).
2. **Vouchers** = per-voucher performance.
3. **Redemptions** = the operational event log + filters + validate.
4. **Insights & reports** = trends, breakdowns, cohorts, comparisons, heatmaps, retention, export.

#### 5.6.2 Reports available now (MVP, no customer PII)
- Redemption trends (volume over time).
- Top vouchers / voucher performance.
- Busiest branches / branch comparison.
- Peak redemption times (time-of-day and day-of-week heatmap, derived from timestamps).
- Total savings delivered.

#### 5.6.3 Reports soon (fast-follow, pseudonymous, no identity)
- First-time vs repeat customers (over `userId`, no identity surfaced).
- Customer retention / repeat rate over time.
- Branch with the highest repeat rate.
- CSV / PDF export.

#### 5.6.4 Reports gated by privacy review (future; aggregate demographics)
Useful but sensitive, and they require linking customer-profile data (locality / DOB / gender) to redemptions. Drawn on the prototype with a "Preview" label; NOT MVP; gated behind the safeguards below.
- City / area breakdown (coarse geography only: town / locality / region; never an exact address or an individual postcode).
- Age-bracket analysis (bucketed).
- Gender-based redemptions (special-category caution).

#### 5.6.5 Privacy safeguards (apply to every aggregate insight)
- **Aggregation only**: no individual customer identity in any merchant-facing surface by default. Redemption rows show redemption data, not who the customer is.
- **No exact address**: the coarsest useful geography only; never a customer's postcode or street.
- **Data minimisation**: compute and show only what is operationally useful to the merchant.
- **Minimum cohort thresholds (k-anonymity)**: suppress any aggregate cell below a threshold (recommend at least 5, to be confirmed in the privacy review) so small branches and rare brackets cannot re-identify a person.
- **Special-category caution**: gender and age need an explicit lawful basis and a DPIA before exposure, even in aggregate.
- **Stop-and-review checkpoint**: any demographic or location-derived insight goes through a privacy / DPIA review (likely with ICO / solicitor input) before build. Recorded in section 8.4.
- **Data-availability note**: customer locality / gender / DOB exist on the customer profile and `VoucherRedemption` carries `userId`, so these aggregates are computable via a join, but that join is exactly what triggers the review (it links customer PII to merchant-visible output).

### 5.7 Documents
- Merchant self-serve upload is NOT built (admin-only today); the portal needs merchant document routes (section 8.3). Optional proactive upload during onboarding. View own documents (signed URLs, mirror admin redaction; raw keys never returned).

### 5.8 Settings
- Notification preferences (email notifications, newsletter toggle), account actions (deactivate/close), data protection (personal-data export/delete = merchant DSAR, a real GDPR obligation, fast-follow), cookie/privacy settings, compliance links (terms, privacy policy).

### 5.9 Grow your business (Phase 5 commercial - placeholder)
- **Promote (campaigns & featured)**: browse available campaigns, request/create a campaign, see current featured listings, subscribe and pay in-portal. **Payments & billing**: payment methods, transaction history, receipts/invoices. This is the Phase 5 commercial layer (Stripe + admin-managed pricing/placement) with its own brainstorm; designed as a "Coming soon" placeholder in the prototype, not MVP.

### 5.10 Help & support
- MVP: FAQs, troubleshooting, email/contact, plus the contextual help inside the builder. Fast-follow/future: resource library, tutorials/guides/manuals, live chat, feedback/suggestions, community forum.

### 5.11 Contract / terms acceptance
- Read the agreement (versioned), accept via clickwrap (OWNER-only, merchant-session-bound; an admin can never accept), view the signed copy + date, re-accept on version drift before go-live. Lives inside the onboarding checklist and the Business profile.

---

## 6. Voucher / offer engine

### 6.1 Mandatory RMVs
Two per merchant, provisioned from the category's `RmvTemplate`s when the category is set (codes RMV-XXX, `isMandatory`, `isRmv`, status DRAFT). The checklist counts `rmv_configured` as 2 RMVs in PENDING_APPROVAL or ACTIVE (status-based, content-agnostic).

### 6.2 Custom vouchers (RCV)
The bonus tier. Full CRUD exists (DRAFT-gated). Per-type validation (TIME_LIMITED windows, REUSABLE cooldown). Day-2 submissions queue for VOUCHER approval.

### 6.3 Merchant-authored fields and the structured-fields model
Spec section 21: each `VoucherType` has a structured field set in `Voucher.merchantFields`. Today `merchantFields` is write-only and customer-invisible (section 6.6).

### 6.4 Curated clauses / terms (spec section 20, no free-text)
Terms are SELECTED from an admin-managed, versioned `TermsClause` library scoped by category + voucher type, with a rules engine enforcing guardrails at save (conflicts, type-bans, value-erosion cap, trading-hours floor, max one RESTRICTIVE clause). CAUTION/RESTRICTIVE clauses render as visible badges. RMVs default open; valid-days/times blocked on RMVs by default.

### 6.5 Merchant acceptance / confirmation + admin co-build (spec section 10)
Admin co-built or materially-changed vouchers require lightweight merchant confirmation before go-live ("Approve, this is my offer" / "Request a change"). A portal surface. B5.1-core (admin RMV edit + submit on behalf) is shipped but UI-inert; admin co-build is gated by this confirmation; do not expose admin co-build UI before it exists.

### 6.6 Customer-app render dependency (the section A3 swap) and the MVP sequencing choice
The builder produces structured per-type data, but the customer app renders from top-level columns + per-type copy keyed off `type`, NOT from `merchantFields`. Two paths:
- **Path A (recommended MVP)**: the builder writes structured `merchantFields` (source of truth + validation) AND composes the customer-visible `title` / `description` / `estimatedSaving` / `terms` columns the app already renders. No customer-app change; lower risk.
- **Path B (fast-follow)**: the section A3 structured-render swap (extend `getCustomerVoucher` + the customer schemas + per-type rendering) so the live preview and the real card are identical. Touches customer app + customer-web (out of scope here); a Phase 3 stop-and-report.

### 6.7 The teaching / helper layer (owner direction)
The builder educates while the merchant builds and must not assume the merchant understands Redeemo. Applied to every type, fully drawn for BOGO:
- **Orientation**: plain-English "what this offer is for," "how it appears to customers" (the live preview), and "why Redeemo needs strong introductory offers."
- **Per-step helper text** in plain language.
- **A calibration meter** with worked examples: "Good" / "Too weak" / "Too risky for your margin," driven by the `minimumSaving` floor and the value/margin logic.
- **A clear merchant-owned vs Redeemo-guardrail split**: merchant-owned = offer content (qualifying item, free item, saving/value, expiry, chosen clauses); guardrails = the minimum-saving floor, the curated clause library, blocked weak/over-restrictive offers, and confirmation-before-go-live for co-built offers.
- **Live customer-app preview** updating as fields change.

### 6.8 The BOGO exemplar, end-to-end (fully drawn in the prototype)
1. Enter via the ladder ("Choose your flagship offer"), the recommended template pre-selected, a type picker showing all 8 types, with "help me build" and "propose your own" escapes.
2. Type-specific fields (low-friction): qualifying item, free item, "cheaper item applies" toggle with a plain-English explanation, pre-filled from the template default.
3. Value/margin readout: "Customers save about GBP 12; you absorb about GBP 5 per redemption; regulars keep paying full price." Calibration shows Good.
4. Curated terms: pick from the scoped clause list; RESTRICTIVE clauses badged; conflicts blocked in real time with an inline reason.
5. Validation/warnings: too-weak or too-restrictive blocked with the reason and a suggested fix.
6. Live preview: the customer-app coupon card + detail, live.
7. Save / submit.

### 6.9 The full 8-type system (defined; prototype draws BOGO in full)

| Type | Structured fields (to `merchantFields`) | estimatedSaving | Notes |
|---|---|---|---|
| BOGO | qualifyingItem, freeItem, cheaperItemApplies | value of the free item | the anchor; cheaper-item rule is the key teaching moment |
| SPEND_AND_SAVE | threshold, saveAmount | = saveAmount | min-spend captured at validation where basket known |
| FREEBIE | freeItem, triggerPurchase? | value of the free item | spend-to-unlock is `triggerPurchase`, NOT a min-spend clause (banned) |
| PACKAGE_DEAL | includedItems[], packageValue, packagePrice | packageValue minus packagePrice | bundle clarity |
| DISCOUNT_FIXED | amount, eligibleScope | = amount | clean for high-ticket |
| DISCOUNT_PERCENT | percentage, eligibleScope | derived from typical spend | de-emphasised, floor-policed |
| TIME_LIMITED | validDays, validTimes (+ underlying offer) | = the underlying offer | optional / non-RMV |
| REUSABLE | cooldownSeconds (+ underlying offer) | per the underlying offer | platform-default cooldown if null |

### 6.10 What belongs in Phase 2 vs Phase 3
- **Phase 2 (backend, seeded)**: the `RmvTemplate` offer-engine migration; the `TermsClause` library + rules config, seeded so the actioner re-validates at approval.
- **Phase 3 (portal)**: the type-specific builder UI + live preview + clause selection + teaching layer (the 5-rung ladder); Path A display-column compose; the merchant-confirmation surface.
- **Phase 3 fast-follow**: the Path B section A3 structured-render swap; "help me build" + AI suggestions; the admin-panel CRUD for the engines.

---

## 7. UX state model

Every surface is designed for: **empty** (teaches the next action), **loading** (skeletons matching the layout), **error** (inline, plain-language, retry; transient backend failures map to friendly copy, the admin `NamedGateBanner` vocabulary is the reference), **locked** (pre-live or role-gated, shown not hidden), **changes-requested** (banner + reason + deep links), **submission / in-review** (read-only on the submitted scope), **live** (edit tiering visibly communicated), **suspended** (full-width banner, read-only), **rejected** (read-only + reason).

**Mobile/desktop**: desktop-first; on mobile the sidebar becomes a drawer + bottom tabs, tables become stacked cards, the offer builder becomes a vertical step flow with the live preview pinned or toggled, and the dashboard charts become swipeable cards. Touch targets at least 44pt.

---

## 8. Data / API / backend implications

### 8.1 Reusable endpoints (already live)

| Area | Endpoints (prefix `/api/v1/merchant`) |
|---|---|
| Auth | `auth/login`, `auth/otp/verify`, `auth/refresh`, `auth/logout`, `auth/forgot-password`, `auth/reset-password`, `auth/claim`, `auth/deactivate`, `auth/reactivate` |
| Profile | `profile` (GET/PATCH), `profile/edit-request` (POST), `profile/edit-requests` (GET), `profile/edit-requests/:id` (DELETE) |
| Onboarding | `onboarding/checklist` (GET), `onboarding/contract` (GET), `onboarding/contract/accept` (POST), `onboarding/submit` (POST) |
| Branches | `branches` (GET/POST), `branches/:id` (GET/PATCH/DELETE), `branches/:id/edit-request` (+ list/withdraw), `branches/:id/hours`, `branches/:id/amenities`, `branches/:id/photos/edit-request`, `branches/:id/pin` (GET/PUT), `branches/:id/pin/send` |
| Staff | `branches/:branchId/user` (POST), `.../user/reset-password`, `.../user/deactivate`, `.../user/reactivate` |
| Vouchers | `vouchers` (GET/POST), `vouchers/:id` (GET/PATCH/DELETE), `vouchers/:id/submit`, `vouchers/rmv` (GET), `vouchers/rmv/:id` (PATCH), `vouchers/rmv/:id/submit` |
| Redemption (validate) | `POST /redemption/verify` (accepts a merchant admin; backs "Validate a code") |

### 8.2 Missing endpoints the portal needs
- **Dashboard + Insights aggregation (merchant-scoped)**: counts (today/week/month), redemptions-over-time, per-offer, per-branch, savings-sum, recent feed, heatmap buckets; fast-follow cohorts (first-time/repeat, retention); privacy-gated demographics (behind the section 5.6.5 review).
- **Merchant self-serve documents**: GET (list own), POST (presigned R2), DELETE.
- **Staff list**: GET branch users for a merchant/branch.
- **Offer engine reads**: `TermsClause` library, per-type field config, value/margin computation, the live-preview render contract.
- **Merchant-confirmation**: confirm / request-change on an admin co-built voucher (section 10).
- **RMV change-request**: a merchant request-to-admin lane for a locked RMV (section 5.1).
- **Merchant-facing category picker**: categories + subcategories with RMV-template awareness.
- **Location**: address autocomplete + map-pin confirm endpoints (section 11), merchant self-confirm if enabled.
- **Notifications (merchant bell)**: list / unread-count / mark-read (Phase 6).

### 8.3 Likely schema / migration needs (additive; spec section 13 + new)
- Already shipped: `MerchantMembership` (+ branch join), `AuditLog` actor fields, `AdminApproval.claimedBy*`, photo-moderation, comms outbox.
- Still needed: `MerchantLead`, `MerchantSource`, `AdminCapabilityGrant`, `MerchantContract += userAgent` + accepted-version copy, the `RmvTemplate` offer-engine migration, `TermsClause` + `VoucherTermsClause`. Possibly: an `ADDRESS_GEOCODED` writer path (section 11), reporting rollup tables if live aggregation is too heavy (decide in Phase 3).

### 8.4 Stop-and-report checkpoints (the standing hard rule)
- Any schema / Prisma / migration change: stop, report exact SQL + rollback first.
- The Path B section A3 customer-render swap: touches customer app + customer-web; plan + stop-and-report in Phase 3.
- The registered-identity edit-tier reclassification (VAT/company DIRECT today vs spec section 12 approval-gated).
- The offer-builder display-column compose vs structured-render decision (section 6.6).
- The merchant-confirmation gate semantics (section 10).
- **Privacy / DPIA review for any demographic or location-derived insight (section 5.6.5)**, before build, likely with ICO / solicitor input.
- **Location quota migration (pre-live gate)**: move Google Places quota from the file-based counter to the Redis limiter before any merchant-facing flow is live (sections 11.3-11.4).
- **New Google billable endpoints**: Autocomplete / Place Details / Address Validation are each a stop-and-approve checkpoint (section 11.4); the Text Search wrapper does not make them production-ready.
- **Discovery-visibility predicate**: merchant self-confirm must NOT confer discovery visibility; reconcile spec section 19.1's `ADDRESS_GEOCODED` inclusion (and the `hasExactPosition` vs `ranking.ts` mismatch) to admin-confirmed-only for MVP (section 11.4). Touches customer discovery.

### 8.5 Security / privacy / redaction
Branch `redemptionPin` is AES-256-GCM encrypted and never exposed cross-context; documents are signed-URL-only (raw keys never returned); the merchant sees only their own data; SEC-M1 / SEC-M2 live-status are go-live prerequisites; OWNER-only legal/identity/ownership; audit captures actor + before/after with PII-retention awareness; aggregate-only customer insight (section 5.6.5).

---

## 9. Prototype plan for Claude Design

Goal: a clickable web prototype the owner can open and click through. Warm, branded, premium-but-professional. Realistic sample data. Desktop primary with key mobile frames.

### 9.1 Screens to include
1. Login (+ OTP) - light.
2. Onboarding home (Setting up): checklist hero + locked day-2 teasers.
3. Onboarding steps: business profile, add branch (autocomplete + map pin), category pick, contract (clickwrap), documents (optional).
4. Offer builder - BOGO end-to-end with the teaching layer, calibration meter, curated clause selection, value/margin readout, the live customer-app preview. Entry via the ladder + type picker. (Optional lighter Freebie pass.)
5. Submit-for-review + states: submitted, in review, changes-needed (banner + reason).
6. Live home: the full professional business dashboard.
7. Vouchers list: RMVs (locked + "Request a change") + custom, with statuses and row actions.
8. Redemptions: the event log + filters/search + "Validate a code" + a redemption detail.
9. Insights & reports: trends, top vouchers, branch comparison, peak-times heatmap, and "Preview"-labelled demographic cards.
10. Branches: list + branch detail (readiness state, hours, PIN, map).
11. Staff & access: list + add user.
12. Business profile (identity propose-lane + direct fields) + the My account menu.
13. Settings.
14. Grow your business: a "Coming soon" Promote + Payments placeholder.
15. Suspended state (read-only banner).
16. Help & support + a contextual helper panel.
17. Mobile frames: live dashboard, offer builder, redemptions.

### 9.2 Clickable flows
- **A (register to live)**: register, onboarding home, complete the checklist (profile, branch with map pin, build the BOGO offer, sign contract), submit, "in review," then (a demo jump) approved, live dashboard.
- **B (build an offer)**: ladder, BOGO fields, a "too weak" warning, fix, "good," preview, save.
- **C (day-2)**: live dashboard, drill into Redemptions, then into Insights & reports, then a voucher's performance.
- **D (changes requested)**: banner + reason, fix the flagged item, resubmit.
- **E (validate)**: "Validate a code," enter a code, validated confirmation.
- **F (optional)**: suspended read-only.

### 9.3 Sample merchant data
A Food and Drink merchant in Huddersfield (matches the seed locality): "The Old Foundry Kitchen," owner "Priya Shah." Branches: High Street (main, live), Mill Road (pending pin). Offers: BOGO RMV ("Buy one main, get one free," saves about GBP 12), Freebie RMV ("Free dessert with any main," saves about GBP 6), a custom Spend-and-Save ("Spend GBP 30, save GBP 8"). A believable redemption feed across both branches, manual validation, staff names. Dashboard numbers: today 12, this week 47, this month 186, GBP 1,240 saved. Insights show realistic but anonymous aggregates (top vouchers, branch comparison, a weekday-evening peak).

### 9.4 Visual direction and UX principles
Warm, branded, premium-but-professional. White page, cream `#FFF9F5` identity surfaces, navy `#010C35` ink, brand rose `#E20C04` to coral `#E84A00` gradient sparingly (one-voice rose, at most about 10% per screen), voucher-type colours on type chips only. Mustica Pro Semibold for display/headings, Lato for body/labels. Generous spacing, rounded cards, soft navy-tinted shadows, glow reserved for the primary CTA. Friendly plain-language microcopy; teach-as-you-go in the builder. WCAG AA. 60-30-10. One dominant element per screen, one primary action per view. The Brand Full Stop device may appear once per marketing-flavoured header, never in body, labels, or legal text.

### 9.5 Design-system constraints Claude Design must follow
Brand tokens above; no other brand colours. No emojis. No em-dashes in any copy (use colons, semicolons, parentheses, or hyphens). Never colour-alone (always a label or icon). Touch targets at least 44pt. Charts use the functional palette, not the brand rose. Maps use a neutral, on-brand style.

The paste-ready prompts are in the appendix.

---

## 10. Recommended implementation sequencing (after prototype approval)

1. **Do NOT build until the prototype and the product model are owner-approved.** Held: any schema/migration; the section A3 customer-render swap; the merchant-confirmation gate; admin co-build UI; any demographic/location insight pending privacy review; the location quota migration + new Google endpoints; billing/campaigns/featured (Phase 5).
2. **Phase 2 backend is largely shipped** via the admin actioner (M0-M8). Remaining: self-register polish, `MerchantLead` + claim, `MerchantSource`, verification pre-score, the offer-engine seed.
3. **Phase 3 portal - backend-first slices**: dashboard + Insights aggregation; merchant self-serve documents; staff list; clause library + per-type field config; offer-builder validation + Path A compose; the merchant-confirmation endpoint; the category picker; the location autocomplete/confirm endpoints + Redis quota.
4. **Phase 3 portal - frontend slices, in order**: (a) scaffold `apps/merchant-web` mirroring the admin-web shell + auth; (b) onboarding home + checklist + business profile + branches (with the map/location capability); (c) the offer builder + clause system + teaching layer; (d) submit / review / changes states; (e) the live dashboard + Redemptions + Insights & reports; (f) day-2 modules (staff, documents, settings); (g) responsive polish + suspended/edge states.
5. **Phase 3 fast-follow**: Path B structured render; richer cohorts + demographics (post privacy review); multi-user invite; the admin-panel CRUD for the curated engines.
6. **App boundary**: a separate `apps/merchant-web` Next.js app at `merchant.redeemo.co.uk` (clean security boundary, distinct JWT realm), same stack as admin-web, reusing the shell and capability-mirror pattern.

---

## 11. Location, maps, and business-verification platform

Treated as a platform capability, not a single branch widget. This section states the VERIFIED code reality first (the owner asked not to assume), then the capability the portal needs and its safeguards.

### 11.1 Code reality (verified 2026-06-16; do not assume beyond this)

| Capability | Status | Evidence |
|---|---|---|
| Google Places **Text Search** wrapper (`searchPlaces`, `bestCandidateConfidence`) | **EXISTS** | `src/api/lib/googlePlaces.ts`: new Places API, field-masked (id/name/formattedAddress/location/types only, no phone/website/hours/photos), 5-result cap, 10s timeout, 6 error codes, HIGH/LOW confidence heuristic (within 50m + business type + name-token match) |
| Google Places **cost cap** | EXISTS but **file-based** | daily 500 / monthly 4,500 in `.cache/google-places-usage.json` (single-process; NOT multi-instance-safe) |
| Where Google Places is wired | **CLI only** | `prisma/suggest-branch-pin.ts` (owner-run). NOT in any route, merchant, customer, or onboarding flow |
| Branch-create location resolution | **postcodes.io** | `src/api/merchant/branch/service.ts` `resolvePostcode` then `locationConfidence = POSTCODE_CENTROID`. No Google on create |
| `LocationConfidence` enum | 4 values; 2 written | `MANUALLY_CONFIRMED` (admin confirm) + `POSTCODE_CENTROID` (create) are written; `ADDRESS_GEOCODED` + `NEEDS_REVIEW` are defined but never written |
| Admin manual pin-confirm | **EXISTS** | `POST /admin/branches/:id/confirm-location` (manual lat/lng, capability `branch:confirm-location`, atomic audit, sets `MANUALLY_CONFIRMED`). No Google in the route; no merchant self-confirm |
| Address autocomplete-as-you-type | **NOT BUILT** | customer PC2 uses postcodes.io postcode lookup, not Google; no per-keystroke Autocomplete anywhere |
| Interactive map-pin UI | **NOT BUILT** | no map component in any app for branch location |
| Merchant self-confirm location (`ADDRESS_GEOCODED`) | **NOT BUILT** | the value is defined but never written |
| Business-verification pre-score (Google Place Details phone/website/status, FHRS, Companies House, duplicate-detection, structured findings) | **PLANNED-ONLY** | June-10 spec section 5; zero code |
| Redis atomic limiter | EXISTS, **not used by Google** | `src/api/shared/atomicLimiter.ts`; Google uses its own file counter |

### 11.2 The platform capability the portal needs (and build status)
- **Branch address autocomplete** (NEW): the intended UX is Google Places Autocomplete + map pin. Autocomplete (and Address Validation / Place Details) are different, billable endpoints from the Text Search wrapper we already have; the wrapper does NOT make those flows production-ready. **Locked: any new Google billable endpoint is a stop-and-approve implementation checkpoint** (section 11.4). The prototype designs the autocomplete + map-pin UX; the live integration is gated.
- **Map pin placement** (NEW frontend): a map component with a draggable pin so the merchant can place or correct their branch location. **Locked: merchant pin placement is merchant-submitted location data that supports admin review and location-confidence scoring; it does NOT by itself make the branch publicly discoverable** (section 11.4).
- **Location confidence** (EXISTS): the discovery-visible gate for MVP is admin confirmation (`MANUALLY_CONFIRMED`). `ADDRESS_GEOCODED` is reserved for a FUTURE, explicitly-approved automated high-confidence rule and is not reachable by unilateral merchant action in MVP. A merchant self-confirm must not write a discovery-visible confidence on its own.
- **Business / location verification support** (PLANNED): surfaced in onboarding as the admin-facing pre-score; the merchant portal shows the merchant their resolved location + confidence, not the verification findings.

### 11.3 Safeguards (the owner's list, made concrete)
- **Rate limiting (LOCKED pre-live gate)**: before ANY merchant-facing Google Places flow goes live, the quota/cost protection MUST move from the file-based counter to the **Redis `atomicLimiter`** (or an equivalent multi-instance-safe limiter), with per-user + per-IP + per-merchant/session + global daily/monthly budget caps. The current file counter is single-process and unsafe in production. This is a go-live gate, not a recommendation (section 11.4).
- **Quotas / caps**: keep the global daily/monthly budget caps; add per-merchant/per-session caps for autocomplete (the highest-volume, per-keystroke call).
- **Abuse protection**: client-side debounce + a minimum query length on autocomplete; reuse the public-form CAPTCHA/honeypot protections on the registration entry points.
- **Provider-cost safeguards**: field-masking (already done for Text Search; apply to any Place Details); Autocomplete **session tokens** (Google bills an Autocomplete-then-Details flow as one session when a session token is used); billing alerts.
- **Fallback states**: if Google fails or is over-cap, fall back to postcodes.io postcode resolution + manual lat/lng entry + a "location lookup is unavailable, enter it manually" state, with the admin pin-drop as the backstop. Never block branch creation on a maps outage.

### 11.4 Locked location decisions (2026-06-16)
1. **Merchant self-confirm does not confer discovery visibility.** A merchant may place or correct a branch pin; this is merchant-submitted location data that supports admin review and location-confidence scoring. Public discovery requires admin confirmation (`MANUALLY_CONFIRMED`) OR a future, explicitly-approved automated high-confidence rule. This prevents a merchant placing themselves at the wrong location, accidentally or maliciously.
2. **New Google billable endpoints are a stop-and-approve checkpoint.** The prototype is designed around Google Places Autocomplete + map pin (the intended UX), but Autocomplete / Place Details / Address Validation are each a stop-and-approve implementation checkpoint. The existing Text Search wrapper does not make those flows production-ready.
3. **Quota/cost protection must be multi-instance-safe before go-live.** Before any merchant-facing Google flow is live, move the quota from the file-based counter to the Redis `atomicLimiter` (or equivalent) with per-user, per-IP, per-merchant/session, and global daily/monthly caps, plus client debounce + a minimum query length and a fallback to postcode/manual entry.

**Reconciliation note (stop-and-report).** Spec section 19.1's discovery-visible predicate currently includes `ADDRESS_GEOCODED`, and the code is already inconsistent (`hasExactPosition` keys on `MANUALLY_CONFIRMED` only, while `ranking.ts` accepts both). Decision 1 resolves the direction (admin-confirmed only for MVP visibility); the actual predicate reconciliation touches customer discovery and is a Phase 2/3 stop-and-report.

---

## 12. Cross-check: owner clarifications to blueprint decisions

| Owner clarification | Blueprint decision | Status | Backend / data dependency |
|---|---|---|---|
| Keep Redemptions and reporting separate; better name than "Analytics" | Reporting section named **Insights & reports** (over Performance / Reports); Redemptions stays a separate operational module | MVP (basic reports) / fast-follow (deep) | merchant-scoped aggregation endpoints |
| Analytics should be distributed, not one section | **Four analytics surfaces**: Home cards, per-voucher performance in Vouchers, operational counts/filters in Redemptions, deep reporting in Insights & reports (5.6.1) | mixed (see each) | aggregation + per-voucher/per-branch rollups |
| Useful customer/business insight, but protect privacy | **Aggregate-only** insights; no individual identity in redemption rows; min-cohort thresholds; no exact address; special-category caution; stop-and-review (5.6.4-5.6.5) | MVP (non-PII) / fast-follow (pseudonymous cohorts) / future + privacy-gated (demographics) | customer-profile join (locality/DOB/gender) under DPIA |
| Aggregate insights list (city, age, repeat, retention, peak times, voucher/branch performance, trends, heatmaps, export) | Catalogued and classified across 5.6.2-5.6.4 with safeguards | MVP / fast-follow / future per item | timestamps (MVP); userId cohorts (fast-follow); profile join (future) |
| Google Places / location as a platform capability | New section 11: autocomplete + map pin + confidence + verification support + safeguards + fallbacks | Text Search wrapper + admin manual confirm EXIST; autocomplete + map pin + merchant self-confirm + verification = NEW / planned | Google Places (billable); Redis limiter migration; postcodes.io fallback |
| Cross-check Google/verification code reality, do not assume | Verified (11.1): Text Search wrapper + admin manual confirm exist; autocomplete, map UI, merchant self-confirm, FHRS/CH/dup verification are NOT built | audit only | n/a |
| Merchant self-confirm location (locked) | Merchant pin = submitted location data supporting review/confidence; does NOT confer discovery visibility; public discovery needs admin confirm or a future approved auto-high-confidence rule (11.4) | MVP (place/correct pin) / future (auto-high-confidence rule) | confidence write path; spec 19.1 predicate reconciliation (stop-and-report) |
| New Google billable endpoints (locked) | Prototype designs Autocomplete + map pin; each new billable endpoint (Autocomplete / Place Details / Address Validation) is a stop-and-approve checkpoint (11.4) | prototype-only UX; implementation gated | Google billing; cost review |
| Google quota/cost protection (locked) | Before any merchant-facing Google flow is live, move quota to the Redis atomicLimiter with per-user / per-IP / per-merchant-session + global daily/monthly caps + debounce / min-query-length + postcode/manual fallback (11.3-11.4) | pre-live gate | Redis limiter migration |
| Revisit nav grouping (3 groups thin/awkward) | New grouping (2.1): Home + Vouchers & customers + Locations & team + Business + Grow your business (Phase 5) + pinned Settings/Help | MVP nav; Grow = Phase 5 placeholder | n/a |
| Top bar contents (bell, logo, logout, clickable avatar) | Defined (2.2): collapse + wordmark; Validate a code; notifications bell; business-logo avatar to account menu with logout confirmation | MVP (bell wiring Phase 6) | notifications read endpoints (Phase 6) |
| "Offers" should be "Vouchers" | Renamed throughout; the builder opens from Vouchers (5.1, 6.7) | MVP | existing voucher routes + offer-engine reads |
| Mandatory vouchers viewable but not editable; change-by-request | RMVs locked, full read-only detail, "Request a change" to admin (5.1) | MVP-portal + small backend | RMV change-request lane |
| Validate vouchers from the portal | "Validate a code" in Redemptions + topbar quick action (2.2, 5.2) | MVP | existing `POST /redemption/verify` (accepts merchant admin) |
| Campaigns / featured / payments in the portal | "Grow your business" group as a Phase 5 "Coming soon" placeholder (5.9) | Phase 5 | Stripe + admin-managed pricing (own brainstorm) |

---

*This is a product blueprint, not a spec or plan. Implementation requires owner approval of the prototype, then the Tier-3 brainstorming to writing-plans flow for Phase 3. No code, schema, or customer-app change is authorised by this document.*

---

## Appendix A. Claude Design paste-ready prompts

Drafts to refine after the blueprint is approved. Use the master prompt once, then a per-screen prompt for each screen.

### A.1 Master / context prompt (paste first)

> You are designing a clickable web prototype for "Redeemo for Business," the merchant portal of Redeemo, a UK location-first voucher marketplace. The user is a non-technical small-business owner. Tone: warm, friendly, premium, but a credible operational business tool.
>
> Brand: white page background; cream `#FFF9F5` for identity surfaces; navy `#010C35` for text and grounding; a brand gradient from rose `#E20C04` to coral `#E84A00` used sparingly (no more than about 10% of any screen, mostly on the primary call to action). Voucher-type accent colours (chips only): BOGO `#7C3AED`, Discount `#E20C04`, Freebie `#16A34A`, Spend and Save `#E84A00`, Package `#2563EB`, Time-Limited `#D97706`, Reusable `#0D9488`. Typography: Mustica Pro Semibold for headings/display, Lato for body and labels. Generous spacing, rounded cards, soft navy-tinted shadows. WCAG AA contrast. 60-30-10 colour balance. No emojis. No em-dashes in any copy. Always pair colour with a label or icon. Charts use the functional palette, not the brand rose.
>
> Layout: a grouped left sidebar with a live-status pill at the top, then Home, a "Vouchers & customers" group (Vouchers, Redemptions, Insights & reports), a "Locations & team" group (Branches, Staff & access), a "Business" group (Business profile, Documents), a "Grow your business" group shown as Coming soon (Promote, Payments & billing), and pinned Settings + Help & support. A topbar with a "Validate a code" button, a notifications bell, and a business-logo avatar that opens an account menu (My account, Business profile, Help, Log out). Desktop-first, but every screen reflows to a usable mobile layout (sidebar becomes a drawer plus bottom tabs).
>
> Sample merchant: "The Old Foundry Kitchen," a Food and Drink business in Huddersfield, owner Priya Shah, two branches (High Street, live; Mill Road, pending pin). Offers: a BOGO "Buy one main, get one free" (saves about GBP 12), a Freebie "Free dessert with any main" (saves about GBP 6), and a custom Spend-and-Save "Spend GBP 30, save GBP 8." Dashboard numbers: today 12 redemptions, this week 47, this month 186, GBP 1,240 saved for customers this month. All customer-level data shown to the merchant is anonymous and aggregate.

### A.2 Per-screen prompts (one each, after the master prompt)
- **Onboarding home**: "Design the Setting-up home. The dominant element is a 'Get your business live' checklist card (account done, category done, add main branch, set up 2 starter offers, sign the merchant agreement; 3 of 5 complete) with a Submit button. Around it: a short plain-language welcome, and two locked 'unlocks when you go live' teaser cards. Reassure that nothing is public until approval."
- **Offer builder (BOGO)**: "Design the BOGO offer builder as a two-pane layout: left = the build form (type BOGO with a change link, qualifying item, free item, a 'cheaper item applies' toggle with a plain-English explanation, then a curated terms picker with badges for stricter clauses), right = a live customer-app coupon preview. Include a plain-English value/margin readout and a calibration meter (Good / Too weak / Too risky). Clearly separate merchant-owned content from Redeemo guardrails. Show one inline 'too weak' warning state."
- **Live dashboard**: "Design the live business dashboard: a top stat strip (today 12, this week 47, this month 186, GBP 1,240 saved), a live redemption-activity feed as the hero (offer, branch, time, method, staff; no customer identity), then a 30-day redemptions line chart and an offer-performance bar chart, then summary cards (top offer, busiest branch) and a 'needs attention' card. Add small 'Preview' labels on future widgets."
- **Redemptions**: "Design the Redemptions page: a stat-strip hero, a 'Validate a code' action, and a filterable table (redemption code, voucher, branch, date/time, method, validation status, validating staff). No individual customer identity. Include filters (branch, voucher, date, status) and a search box."
- **Insights & reports**: "Design the Insights & reports page: redemption trend, top vouchers, branch comparison, and a time-of-day/day-of-week heatmap, all anonymous aggregates, plus a few 'Preview'-labelled demographic cards (age brackets, area breakdown) clearly marked as coming later. Include an Export button."
- **Branches + add branch**: "Design the Branches list and an Add-branch form with address autocomplete and an interactive map with a draggable pin. When the merchant places or moves the pin, show calm microcopy that the location is submitted for review and goes live after Redeemo confirms it (placing a pin does not make the branch publicly visible on its own). Include a branch detail (status pill: live / pending pin / under review; opening hours; redemption PIN with reveal; staff at this branch)."
- **Vouchers list**: "Design the Vouchers table: mandatory vouchers shown locked with a 'Request a change' action and a read-only detail, custom vouchers with status + approval-status chips and row actions (view, edit, submit, deactivate, duplicate). Include a 'Create voucher' CTA that starts the builder."
- **Changes-requested state**: "Design the home in the Changes-needed state: a prominent banner with the admin's reason and the specific items to fix, deep-linking to each, plus a Resubmit action."
- **Suspended state**: "Design the suspended read-only state: a full-width banner ('Your account is suspended. Reason: ... Contact Redeemo.') with the whole portal visibly read-only."
