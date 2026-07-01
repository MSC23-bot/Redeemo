# Admin Panel: Claude Design master context (shared, paste FIRST)

This is the shared context for the whole Redeemo Admin Panel prototype. Upload it and paste Section A (master context) into the Admin Claude Design session first, then Section B (design direction). Every wave-specific pack inherits this; the wave packs do not repeat it.

Source of truth: the merged Admin Panel blueprint (`docs/superpowers/specs/2026-07-01-admin-panel-platform-blueprint.md`). This context is a faithful compression of it. If in doubt, the blueprint wins.

---

## A. MASTER CONTEXT PROMPT (paste first; let Claude Design acknowledge before continuing)

You are designing the **Redeemo Admin Panel**: the internal operational control centre for the Redeemo platform. Design the COMPLETE admin panel described below, not a narrow slice; the listed modules, screens, flows and states are anchors, and you should add the sub-states and system states a full operations console needs.

**What Redeemo is.** Redeemo is a UK, location-first digital voucher marketplace. Consumers pay a subscription to unlock in-store redemption of exclusive vouchers from local businesses (merchants). Merchants join free and pay later for featured placement and campaigns. There are four product surfaces: the Customer app + website, the Merchant Portal (web) + a lean merchant staff mobile app, and this Admin Panel. This prototype is the Admin Panel.

**Same platform as the Redeemo Merchant Portal.** A "Redeemo for Business" Merchant Portal prototype was previously created for this same platform. Do NOT assume you personally designed or remember it: the attached curated reference pack (the merchant reference summary, the brand/design-system foundations, and a few merchant screenshots) IS that context. Rely on the supplied references, not on any assumed cross-project memory, even if this session runs in the same claude.ai account as the merchant project (a shared account is a convenience, not a context guarantee). The Admin Panel is the OPERATOR side of that same platform: it governs, reviews, and acts on or alongside the very merchants, branches, vouchers, redemptions, staff, onboarding, notifications and Insights the Merchant Portal exposes. Keep brand and interaction continuity with that portal (same fonts, palette, status-pill language, terminology, voucher-card look, shell chrome), but the Admin Panel is NOT a copy or an enlarged Merchant Portal: it is a dense, capability-gated operations console with its own information architecture, homepage, and authority model. Reuse the shared design system; diverge the density, layout and workflows. (The reference-pack files explain exactly what to reuse and what must differ.)

**The operator.** The user is a trained Redeemo operator (operations, super-admin, sales/lead-owner, finance, support, or content). They do high-volume triage and governed actions. Favour information density, scannable tables, split-pane review, keyboard efficiency and calm restraint over marketing generosity. Rose (the brand red `#E20C04`, the same accent the Merchant Portal calls Rose) is for the primary action and focus only.

**Operating principles (design these in):**
- **Act FOR the merchant, never AS the merchant.** Operators correct, co-build and assist as the real admin actor, always with a reason and an audit trail. They never impersonate a merchant, never accept a merchant's legal terms, and never see or set a merchant's password. Show the "acting on behalf, with reason" framing on every on-behalf action.
- **Every intake has an outlet.** Anything the platform captures from users (reported reviews, fraud/screenshot signals, merchant-suggested tags, bounced-email alerts) has an operator surface to action it. Do not design a surface that collects but cannot act.
- **Safety by default.** Destructive or high-risk actions require a mandatory reason, a confirmation, and (where noted) a step-up re-auth. Customer-impacting and lifecycle actions route through an approval lane, not a direct edit.
- **Capability-gated.** Every operator sees only the navigation and actions their role holds. An operator without a capability sees a clear "access denied" state, not a broken screen. Design the empty-capability views.
- **Honest status.** Do not imply something is live or built when it is gated or future. Show gated/future modules with a short "what this will do, what unlocks it, who decides" panel, never a fake working surface. (Status semantics are in Section E.)
- **No customer-home mapping.** You may map merchant and branch locations and anonymized regional supply. You must NEVER plot an individual customer's home address or precise coordinates. Any customer address/postcode is reveal-on-demand and audited, never plotted on a map or shown by default. A regional customer-derived aggregate (for example members-per-locality) is a separate GATED middle state, distinct from anonymized business supply: it would need a DPIA and minimum-cohort suppression before it could ever be shown, and is not designed here.

**Personas and authority (Section C has the full model).** Roles: SUPER_ADMIN, OPERATIONS, SALES/LEAD-OWNER, FINANCE, SUPPORT, CONTENT (and a PROPOSED "Platform Manager" tier). Each on-behalf or lifecycle action maps to one of six authority outcomes: (1) direct action; (2) direct + merchant notification; (3) admin proposal requiring merchant review/acceptance; (4) independent Redeemo approval (a separate approval step; today single-actor, four-eyes countersign is a future addition); (5) emergency/platform-safety override; (6) prohibited. Design the confirmation, reason and audit affordances that match each outcome.

**Complete information architecture (Section D has the full nav).** A dense left sidebar grouped into: Operations; Relationships; Trust and Safety; Support and Cases; Growth and Commercial; Content and Taxonomy; Insights and Reporting; Platform. A role-aware home ("Ops Home"), NOT a redirect to the queue. A top bar with global search, a notification bell, the operator identity + role, and logout. Keep the whole grouped nav visible from the start (with gated/future items clearly marked) so the system reads as a complete operating system.

**Cross-product truth (Section C glossary).** Reflect the real states the merchant, customer and platform have: merchant lifecycle (registered, pending approval, active, suspended, inactive, deleted) and onboarding steps; branch triple-axis (active vs soft-deleted vs lifecycle create/close) and location-confidence; voucher lifecycle + approval status (including "approved but waiting to go live"); redemption (issued, validated) with no reversal state today; subscription states; merchant staff roles and branch scope; notification/delivery states; Insights operational-vs-behavioural split. Do not invent states the backend does not have.

**Safety, privacy and legal boundaries (design these visibly):** operator PII access to customers is gated and audited (reveal-on-demand); customer deletion is anonymise-in-place (some fields are retained by design); analytics that touch customer behavioural or demographic data are default-off and gated ("not available" until a privacy gate opens); a branch's redemption PIN is NEVER shown to an operator; legal/agreement content is owner/legal-owned and external; documents open via short-lived signed links, never raw storage paths.

**Guardrails (do not silently invent approved decisions):** Several product and security decisions are NOT yet approved (admin session/auth model, step-up auth, view-as/impersonation, redemption-reversal schema, DSAR processing, analytics privacy gating, payment/provider operations, deployment, per-person capability grants, the lead/CRM schema, curated voucher-terms). Where the blueprint marks something GATED, FUTURE or a proposed decision, DESIGN THE OUTCOME as a clearly-labelled concept and STOP-AND-FLAG it in a short note; do not present it as an approved, built, or final decision. Never design write-impersonation, an admin-signs-contract path, a customer-home map, exact-count demographics, or a bulk mass-mutate without its full safeguards envelope: scoped selection, a server-computed dry-run/preview diff, step-up re-auth, a different-actor countersign, per-row transactional audit, a rate/quota bound, and reversibility where the snapshot allows.

Acknowledge this context, then wait for the design direction (Section B) before designing anything.

---

## B. DESIGN DIRECTION PROMPT (paste second)

Brand is non-negotiable and identical to the previously-created Redeemo Merchant Portal prototype (represented by the attached reference pack; do not assume any cross-project memory of it).

- **Colour (exact):** Rose (brand red) `#E20C04`, coral `#E84A00`, navy `#010C35`, cream `#FFF9F5`. This is the Merchant Portal's palette; "Rose" is that portal's name for the brand red, used here for continuity. The Rose/coral gradient is reserved for the single primary action per view. Navy is the typographic ink, never a status colour. Cream is the calm canvas. Status colour lives in labelled pills, never colour-alone.
- **Type (exact, two families only):** Mustica Pro SemiBold for display/headings; Lato (Regular/Medium/Semibold/Bold) for body and labels. No third font. Exact type fidelity requires the actual Mustica Pro SemiBold + Lato font FILES supplied at CP-0 (a font name is not the font asset); if they cannot be supplied or Claude Design cannot ingest them, STOP and report the limitation, and any fallback typeface needs explicit owner approval.
- **60-30-10:** cream/white 60-30, brand accent under ~10 per cent per screen.
- **No emojis. No em-dashes** in any UI text (use colon, semicolon, parentheses, hyphen). British English.
- **Density and register (this is where Admin DIVERGES from the Merchant Portal):** the Merchant Portal is warm and generous for a cafe owner. The Admin Panel is a dense operations console for a trained operator. Prefer multi-column data tables and split-panes over big rounded marketing cards. Use Mustica for the single dominant element per screen (page title, or the merchant name on a review screen); keep operational content in Lato at table density. Tighter spacing, hairline dividers, calm restraint. One glow primary action per view; most actions are secondary/ghost so the queue does not shout.
- **Reuse the merchant shell chrome** (grouped left sidebar, top bar with bell + avatar, status-pill language, voucher-card visual) but adapt it to the admin nav groups and denser content region.
- **Every screen ships its full state set:** loading (skeleton, not just a spinner), empty, error (distinct from empty), permission-denied, stale/conflict, success, destructive-confirmation, partial-data ("not set" placeholders), and responsive behaviour. Desktop-first (operators are on desktop), but design sensible responsive collapse for the key screens.
- **Accessibility basics:** roles/labels/focus/keyboard; never colour-alone status; 44px targets; visible focus ring in Rose.
- **Design-system + shell FIRST (checkpoint CP-0):** before ANY screen, produce the shared design system (palette, two fonts, base components, dense tables, status pills, split-pane, review cards) and the grouped operator shell (8-group sidebar + top bar), then PAUSE for review. Do not generate feature screens until that foundation is approved.

---

## C. Personas, authority, and cross-product state glossary

### C.1 Personas (design a lens for each; some are future/gated but must be represented)
- **SUPER_ADMIN**: owner/root/break-glass; platform-critical powers (role management, kill-switches, hard-delete, config, legal/pricing). Holds every capability.
- **OPERATIONS**: the daily actioner: approvals, merchant lifecycle, edit-on-behalf (operational tier), trust-and-safety triage.
- **SALES / LEAD-OWNER**: supply recruitment; leads, qualification, representative-assisted onboarding, relationship notes; may initiate but never approves its own merchants. (Role is PROPOSED; represent it.)
- **FINANCE**: billing, refunds, disputes, payouts (future/gated; holds no capabilities today, but model the persona and its future surfaces).
- **SUPPORT**: customer relationships, cases, DSAR intake, read-only view-as (future/gated).
- **CONTENT**: content/taxonomy, comms/broadcast, announcements (future/gated).
- **Platform Manager (PROPOSED)**: broad operational + financial oversight, cannot hold platform-critical. Label PROPOSED; do not imply it exists as a role today.

### C.2 Authority model (reflect on every on-behalf/lifecycle action)
Two lenses, aligned to blueprint §9 and to Section A's outcome list:

- **Authority levels (how much bar an action clears):** L0 read · L1 direct-low (operational fields) · L2 direct-high (SUPER_ADMIN, higher bar) · L3 propose (routes into an approval lane) · L4 independent-approval (a separate approval step; SINGLE-ACTOR today on the Redeemo side, so do NOT label it "four-eyes" or "dual-control" as if a second countersigner is enforced; four-eyes is a future addition) · L5 lifecycle/takedown (immediate, capability-gated, reason-audited).
- **Authority outcomes (classify each action as exactly one, matching Section A):** (1) direct; (2) direct + merchant notification; (3) admin proposal requiring merchant review/acceptance; (4) independent Redeemo approval; (5) emergency/platform-safety override; (6) prohibited.

Two policy-gated columns to show as not-yet-buildable: legal/financial (no admin contract-sign, no billing today) and access/ownership (no admin staff-management or ownership-transfer today).

Note on the blueprint's authority table: where it prints "FOUR-EYES" as a column value it denotes the merchant's own submit-then-approve staging (the merchant approval lane), which is still a SINGLE-ADMIN-actor decision on the Redeemo side. Never render it as an enforced dual-operator countersign badge.

### C.3 Cross-product state glossary (reflect these; do not invent others)
- **Merchant lifecycle:** REGISTERED, PENDING_APPROVAL, ACTIVE, SUSPENDED (immediate takedown: vouchers instantly hidden), INACTIVE, DELETED. Onboarding steps: registered, branch added, contract signed, RMV configured, submitted, under review, approved, live, needs changes, rejected, suspended.
- **Branch:** three orthogonal axes: active/inactive (reversible) vs soft-deleted (not reversed by the active toggle) vs lifecycle (pending-create, live, pending-close, closed); plus location confidence (manually-confirmed, address-geocoded, postcode-centroid, needs-review). A branch redemption PIN is NEVER shown to an operator.
- **Voucher:** DRAFT, PENDING_APPROVAL, ACTIVE, INACTIVE, EXPIRED, cross-cut by approval status; plus "approved but waiting to go live" (approved while the merchant is not yet live). Two mandatory flagship vouchers (RMV) per merchant; custom vouchers (RCV). Voucher types: BOGO, Spend and Save, Discount (fixed/percent), Freebie, Package, Time-Limited, Reusable.
- **Redemption:** issued (with an 8-char code shown to the customer) then validated in-store by staff. There is NO reversal/void state today (that is a gated, schema-dependent future). Never show individual customer identity in a redemption row; savings are per-redemption, aggregates are anonymous.
- **Merchant staff:** OWNER / Branch Manager / Staff, with branch scope; managed by the merchant owner today (no admin staff-management surface yet).
- **Notifications:** in-app bell (per recipient) + a separate delivery log (queued/sent/failed/bounced); email is currently dark/not-live.
- **Insights:** operational aggregates run un-gated; behavioural metrics (repeat-rate, new-vs-returning, event-level export) and any demographics are DPIA-gated, default-off, "not available" until a privacy gate opens.

---

## D. Complete information architecture (the nav to keep visible from the start)

Left sidebar, grouped; a role-aware Ops Home; top bar (search, bell, operator + role, logout). Items marked (gated) or (future) render honest placeholder panels.

1. **Operations**: Ops Home (role-aware) · Approval Queue (unified) · Review / Actioner (the queue detail) · Merchant Directory · Leads and Onboarding.
2. **Relationships**: Merchant 360 · Customer 360 · Communications · Tasks and Follow-ups (future) · Account Health (future).
3. **Trust and Safety**: Reviews Moderation · Fraud and Redemption Reversals (reversal is gated) · Media/Photo Review · Suggested-tag Moderation.
4. **Support and Cases**: Case queue (build-vs-integrate) · DSAR / Data Requests (gated) · read-only View-as (gated).
5. **Growth and Commercial** (gated on billing): Campaigns · Featured placement · Trending · Promo codes · Subscriptions / Billing / Refunds.
6. **Content and Taxonomy**: Taxonomy management · Versioned Legal/T&C/FAQ (external/gated) · Announcements (future).
7. **Insights and Reporting** (data + DPIA gated): platform analytics.
8. **Platform**: Admin Users and Roles · Global Audit / Activity Explorer · Operational Status (bounded) · Feature flags / config · Notifications.

Wave 1 delivers the Operations spine + Platform governance (Admin Users, Global Audit, Operational Status including a config/feature-flag health slice, Notifications); the fuller Feature-flags/config register concept lands in Wave 3. Wave 2 delivers the Relationships/Support/Trust-and-Safety + Customer 360; Wave 3 Growth/Content/Insights + the Feature-flags/config register. (Rationale in the manifest.)

---

## E. Status and maturity semantics (how to show honest state, without cluttering)

The blueprint's ENGINEERED / PARTIAL / GATED / FUTURE / EXTERNAL tags are review annotations, not mandatory UI badges. In the prototype, distinguish three things:
- **Feature availability / configuration** (operator-facing where useful): a disabled action with a reason ("requires a signed contract"; "email delivery is not enabled in this environment").
- **Live operational status** (first-class UI, a bounded control room, NOT an embedded Railway/Neon/Vercel/GitHub/Stripe/Resend/APM replacement): dynamic healthy / degraded / down / unverified / external / gated / unavailable-not-built for real entities and jobs. Separate five layers per signal: source capability, configured capability, deployed-runtime state, provider/account state, observability maturity. A wired provider is NOT operationally live, and runtime/provider bindings are UNVERIFIED (owner-reported where applicable), never inferred; `/health` proves process liveness ONLY; DB/Redis dependency health, worker heartbeat, deployed-SHA/version and APM are net-new or external; raw logs, environment values, secrets and provider telemetry stay external; never embed live credentials, incident details or transient provider values.
- **Maturity** (mostly design-review only): show a GATED or FUTURE module as a labelled "coming/where-it-is-going" panel with what unlocks it and who decides; do NOT fake a working surface. EXTERNAL surfaces (host metrics, legal pages) link out; never fabricate them in-app.

---

## F. Synthetic sample data (use ONLY this; never real PII, secrets, or PINs)

Use one fictional merchant and a small synthetic operator/customer set. Do not use real names, emails, phones, DOBs, addresses, or real redemption history.

- **Merchant:** "The Old Foundry Kitchen" (trading as Old Foundry), category Cafe and Bakery, Huddersfield. Owner: Priya Shah, priya@oldfoundry.example. Status flowing REGISTERED to LIVE across screens. Two branches: "Old Foundry - Market St" (main, location manually confirmed) and "Old Foundry - Station Rd" (pending create, postcode-centroid).
- **Vouchers:** RMV-001 "Buy one brunch, get one free" (BOGO, save about GBP 9), RMV-002 "20 per cent off first order" (Discount), RCV-001 "Free coffee with any cake" (Freebie, pending approval).
- **Operators:** "Shebin C. (OPERATIONS)", "A. Rep (SALES)", "S. Admin (SUPER_ADMIN)".
- **Customers (only ever aggregate/anonymous in UI):** show counts and anonymised initials at most; never a plottable address. For the support-lookup, Customer 360 and DSAR screens use a single synthetic "Customer #4821": on a Monthly plan (active, cycle anchor day 14, promo "WELCOME20"); a short anonymised redemption history (a couple of Old Foundry redemptions, saved about GBP 9, validated in-store); marketing-consent ON, terms v1.0 accepted. Address/postcode is masked and reveal-on-demand + audited, never plotted. For the deletion/DSAR disclosure use a second synthetic "Customer #3300 (Deleted)" that still retains DOB/gender/postcode/geo by design (anonymise-in-place).
- **Redemption codes:** synthetic 8-char like `A7K2P9X4`; a branch PIN is never shown (render as "PIN hidden by policy").

---

## G. Global acceptance checklist (applies to every wave)

- Feels like a dense operator control centre, not an enlarged Merchant Portal.
- Same brand as the merchant portal (palette, two fonts, status-pill language, voucher card), diverged to density.
- Complete grouped nav visible from the start; gated/future items honestly labelled, not faked.
- Role-aware Ops Home, not a redirect.
- Every on-behalf action shows actor + reason + the correct authority outcome; no impersonation, no admin-signs, no password exposure.
- Every intake (reported reviews, fraud signals, suggested tags, bounced emails) has an action surface.
- Customer PII gated + reveal-on-demand + audited; no customer-home map; redemption PIN never shown; no individual identity in redemption rows.
- Analytics touching behavioural/demographic data show "not available" until the gate opens; operational aggregates are fine.
- All non-happy-path states present (loading skeleton, empty, error, permission-denied, stale, destructive-confirm, partial-data, responsive).
- Nothing gated/future is presented as approved or built; anything that would cross a stop-and-review line is flagged, not silently designed.
