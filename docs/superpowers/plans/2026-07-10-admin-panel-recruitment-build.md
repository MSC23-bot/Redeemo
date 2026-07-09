# Admin Panel recruitment-phase build: Merchant 360 · Approval Queue fidelity · Leads & Onboarding

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or
> superpowers:executing-plans per slice. Read the module spec inventories in
> `docs/superpowers/specs/2026-07-10-admin-panel-module-specs/` BEFORE implementing a slice:
> they are the design contract, derived directly from the prototype HTML source.

**Status:** APPROVED-TO-BUILD for Phases A and B (owner direction 2026-07-10: build the
prototype onto the existing admin-web, Merchant 360 first, do NOT restart from scratch;
work autonomously). Phase C is partially owner-gated (see the decision packet §OD).

**Tier:** 2 for Phases A/B (multi-file admin-web + additive backend reads, NO schema).
The three schema-needing items (MerchantNote, MerchantLead, D59 assign fields) and
admin contract-signing on-behalf are carved out as Tier-3 owner-gated decision packets:
this plan STOPS at those boundaries rather than shipping migrations.

**Sources (authority order):** owner decisions 2026-07-10 → module spec inventories
(`2026-07-10-admin-panel-module-specs/`, derived from `Redeemo Admin - Foundation.dc.html`
in `docs/design/admin-panel/prototype-handoff/Redeemo-Admin-Panel-handoff.zip`) → owner
screenshots (`docs/superpowers/prototype-references/admin-panel/{merchant-360,approval-queue,leads-and-onboarding}/`)
→ prototype execution log (decision register D33-D67) → existing code conventions
(`.claude/rules/admin-web.md`: two-layer capability gating, jest per surface, wire pins,
`next build` mandatory).

**Locked owner decisions (2026-07-10, recorded verbatim in PROJECT-STATE §4.3):**
- Build ON TOP of the existing admin-web (queue, review router, merchants directory/detail,
  redemptions, timeline all stay); restructure/move, never rebuild.
- Sequence: Merchant 360 → Approval Queue → Leads & Onboarding.
- Global `/redemptions` page STAYS (improve it); each merchant account ALSO gets a
  merchant-scoped redemptions view.
- Reps must be able to fully create and manage a merchant account from the admin panel
  (merchants who never touch the portal).
- Identify prototype gaps and fold them in, not just copy the prototype.

**Visual direction (lead decision, reversible):** keep shadcn components but adopt the
prototype's badge/pill/court tone system via a small shared token layer
(`apps/admin-web/lib/ui/adminTones.ts` + Tailwind theme extension), because the prototype's
multi-tone language (court pills, age tints ≥12h amber / ≥36h red, verification dots,
two-pill status) is load-bearing for operator scanning. No brand fonts (admin stays neutral
per the existing rule). Prototype-only elements (demo switchers, role cycler, View-as,
synthetic seeds) are NEVER built: each spec file carries the do-not-build list.

---

## Phase A: Merchant 360 (workspace over the existing merchant detail)

Design contract: `merchant-360-spec.md`. Existing base: `app/(app)/merchants/[id]/page.tsx`
+ the Option-B dialog family + `GET /api/v1/admin/merchants/:id`.

### A1: Workspace shell + Overview + Business identity (pure frontend)
- Convert `merchants/[id]` into the workspace: header card (logo, trading name, lifecycle +
  verification pills, stat strip) + tab bar; URL-addressable tabs (`?tab=`), default Overview.
- Overview tab: composed summary of existing detail fields + submit checklist card.
- Business identity tab: rehome the existing read cards + ALL existing edit dialogs
  (website direct-edit, identity/category SUPER_ADMIN edits, propose-sensitive lane,
  submit-on-behalf). No new endpoints. Lifecycle actions (suspend/reactivate) move into the
  header, role-gated exactly as today; non-Active lifecycles render state-appropriate
  headers (Pending/Draft/Rejected have no lifecycle action: per spec ambiguity, handled
  honestly with status copy).
- Merchants DIRECTORY page gains nothing in A1 (entry picker deferred: directory already
  serves as the picker; recorded divergence from the prototype's recently-viewed picker,
  revisit at fidelity pass).
- Tests: page test rewrite (tab routing, capability fail-closed per tab), dialog tests
  unchanged (rehomed imports only). `next build` + full jest.

### A2: Branches · Documents · Activity tabs (pure frontend)
- Branches tab: rehome existing branch rows + add/edit/delete/confirm-location +
  LocationTrustPanel + provenance badges (all shipped); PIN affordance stays the guarded
  existing reveal route (D46 reset = NOT in scope: no reset route exists; record gap).
- Documents tab: rehome `MerchantDocumentsCard` (upload/view/delete on behalf).
- Activity tab: rehome the per-merchant Timeline (comms + audit rows). The prototype's
  separate Comms/Audit tabs collapse into one Activity tab for v1 (both feeds already come
  from the timeline read; split later if volume demands: recorded divergence).

### A3: Redemptions + Vouchers tabs
- Redemptions tab (owner-locked): embed the existing D67 list scoped `?merchantId=` with the
  same filters minus the merchant filter; link out to the global page. Zero backend work.
- Vouchers tab: RMV/flagship cards from the existing admin RMV read; WIRE the two existing
  but unconsumed RMV co-build routes (PATCH draft fields + submit) behind
  `merchant:manage-vouchers` for DRAFT flagships (this is the B5.1-web slice folded in,
  now needed for rep-driven onboarding). CUSTOM (RCV) voucher list needs an additive
  backend read: goes in A4. Advisory value meter / category benchmark (D41) = NOT in v1
  (needs net-new aggregation; recorded).

### A4: Additive backend enrichment batch (no schema) + Staff tab
- One backend PR: extend `GET /admin/merchants/:id` (or sibling reads) with: owner contact +
  agreement/contract dates (already computed for `getReviewContext`: reuse the same
  selects), counts for the header stat strip, an admin custom-voucher list (curated select,
  no customer PII), and an admin staff/BranchUser read (memberships + roles + branch scopes,
  read-only, no PII beyond name/email/role/status).
- Staff tab (read-only v1): renders that read. Staff MUTATIONS on behalf (invite, role
  change, remove: D44) = Phase C wizard scope + OD4 capability decision.
- Performance/Insights tabs: NOT BUILT in Phase A (aggregation endpoint is net-new;
  DPIA-gated for anything behavioural). Honest gated placeholders only, matching the
  prototype's own gating language.
- Notes tab: honest "not built: needs MerchantNote" placeholder pending OD2.

## Phase B: Approval Queue fidelity (two-court + per-type treatments)

Design contract: `approval-queue-spec.md`. Existing base: queue page + 5-lane review router.

### B1: Two-court queue + row treatments (pure frontend)
- "Needs you" (PENDING + UNDER_REVIEW) / "Awaiting merchant" (CHANGES_REQUESTED) court tabs
  over the existing filterable list; type chips; 7-column table with court pills, age tints
  (≥12h amber / ≥36h red per the prototype source), verification dots, claimed-by name
  (already in rows); narrow-viewport card view. Keep the existing status filter semantics
  underneath (court = presentation grouping, not new state).
### B2: Review console alignment (mostly frontend)
- Align the 5 existing lanes' layout/copy/tokens to the actioner spec (sticky action bar with
  the 4 claim states: all four already exist behaviourally). The correction-on-behalf
  two-tier modal (D37) maps to the SHIPPED Option-B lanes; the material-vs-cosmetic split
  follows the REAL MerchantPendingEdit/BranchPendingEdit allow-lists (spec ambiguity
  resolved in favour of shipped behaviour: prototype's 3-field material list is illustrative).
- Small additive read: edit/branch-lifecycle queue rows gain a summary batch (merchant name +
  changed-field count), mirroring the existing voucher-row enrichment pattern.
### B3: Global redemptions page improvements (owner: "keep + improve")
- Add merchant/branch quick-links into Merchant 360, voucher-title search (parity with
  merchant surface), and a detail drawer IF it stays within the D67 read-only contract
  (no new PII; identity stays masked pending the D48 tier decision, OD4).

## Phase C: Leads & Onboarding

Design contract: `leads-onboarding-spec.md`. Owner layout note: it currently reads as two
modules in one; v1 structure = ONE nav item "Leads & onboarding" with two clearly separated
sections (Onboarding routes hub on top; Prospect pipeline below, per the prototype) and the
wizard as a full-screen route. Revisit after use.

### C1: Hub (mostly existing)
- Inbound self-serve pointer card (queue deep-link + awaiting-review count), Create-draft
  route card (existing form rehomed), Assisted-onboarding route card, in-progress resume
  list (backed by draft merchants + their onboardingStep: REAL resume contract replaces the
  prototype's broken stepN seed mapping: spec ambiguity resolved: resume = map the draft's
  actual onboarding state to the wizard step).
### C2: Assisted onboarding wizard (Tier 2, reuses shipped on-behalf routes)
- 9 steps per the prototype rail (1 Category+identity · 2 Business profile · 3 Branches ·
  4 Vouchers · 5 Staff (optional) · 6 Documents (optional) · 7 Contract · 8 Go-live review ·
  9 Handover). Steps 1-4+6 map onto SHIPPED admin on-behalf routes (create-draft, identity/
  category/profile edits, branches incl. PIN set-not-shown at creation, RMV co-build wired in
  A3, documents upload). Step 5 staff = OD4-gated (route exists? invite-on-behalf does NOT:
  scope to "record intended staff as notes-free checklist" OR gate the step, decided at
  build with the honest-gating pattern). Step 7 Contract = **blocked: no admin
  contract-signing route exists** (OD6): v1 ships the step as the existing gate status
  (contract signed via the claim/portal path) with honest copy; full in-person evidence-pack
  signing (D65) is the OD6 packet. Step 8 review = submit-on-behalf + the 5-gate checklist
  (exists). Step 9 handover = claim email/link (existing token flow; while email is dark the
  wizard SHOWS the claim link for manual handover: gap-fix the prototype missed).
### C3: Prospect pipeline: BLOCKED on OD1 (MerchantLead schema). Not started until the
owner approves the model. UI is fully specced and ready to build once unblocked.

## OD: Owner decision packet (none block Phase A/B; answer async)

- **OD1 MerchantLead model** (Tier 3): minimal proposal in `code-mapping.md` §3 (name,
  category guess, location, contact, source enum, stage, next action + due, assigned rep,
  lost reason, convertedMerchantId). Unblocks C3. Also resolves the PROJECT-STATE §6
  MerchantLead/MerchantSource row.
- **OD2 MerchantNote model** (Tier 3): per-merchant operator notes (D51). Unblocks the
  Notes tab.
- **OD3 D59 assign-then-claim fields** on AdminApproval (Tier 3): defer to the Tasks wave or
  build with Phase B? Recommendation: DEFER; the queue reserves the Owner column already.
- **OD4 Capability matrix v1**: new surfaces currently gate on existing caps
  (SUPER_ADMIN/OPERATIONS via `merchant:read`/`approval:*`). Naming for staff-read, notes,
  lead:manage, redemption identity tiers (D48) needs the AdminRole-drift decision.
  Recommendation: ship Phases A/B on existing caps; one capability PR after the drift call.
- **OD5 Leads layout**: one nav item, two sections (as above): confirm or ask for a split.
- **OD6 Admin contract-signing on behalf** (D65 evidence pack; Tier 3): required for fully
  portal-less merchants: brainstorm-first packet after C2 ships its gated version.

## Verification discipline (every slice)
admin-web: `tsc --noEmit` + lint + full jest + `next build` (mandatory). Backend slices:
`tsc` + `npm run test:unit` (never plain vitest). Two-layer capability gating on every new
surface. Wire pins for any new payload (no `redemptionPin`, no customer PII beyond contract).
Per-slice PR, unmerged until SHA-bound owner approval. Opus adversarial review before PR on:
A4 (new reads), C2 (on-behalf writes), any capability change.

## Out of scope (recorded so nothing silently drops)
Ops Home (S5, deferred), Members & Revenue (S4, deferred), D48 identity reveal tiers,
D41 value meter/benchmarks, D42 Performance aggregation, Insights (DPIA-gated), View-as,
notifications page, assign-then-claim UI (OD3), auto media scanning (manual moderation
stays), step-up re-auth on suspend (recorded as a security nicety).
