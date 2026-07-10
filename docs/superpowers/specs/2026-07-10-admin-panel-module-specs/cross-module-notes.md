# Admin Panel prototype: cross-module notes (nav / IA / interlinks / screenshot-vs-HTML)

READ-ONLY analysis. Source = `Redeemo Admin - Foundation.dc.html` (handoff bundle) + owner screenshots + committed exec log. Line numbers below refer to the handoff HTML.

## 1. Navigation / IA structure

The shell is a single React `Component` (class at HTML line 10280). Navigation is a fixed `NAV` array (line 13667), rendered by `buildNav(collapsed, role, showGated, activeId)` (line 13821). The shell has a left sidebar (collapsible to a 66px icon rail), a top bar (⌘K global search / notification bell with unread badge / role-labelled avatar "Shebin C. · Operations" / logout), and a content area. Footer: "Platform status: healthy · Admin v0 (CP-0) · synthetic data".

### 9 sidebar groups, in order (each item: id · label · tag/gate)
1. **Operations** — `home` Ops Home · `queue` Approval Queue (badge 24) · `actioner` Review / Actioner · `directory` Merchant Directory · `leads` Leads and Onboarding
2. **Relationships** — `m360` Merchant 360 · `c360` Customer 360 · `comms` Communications · `tasks` Tasks and Follow-ups (FUTURE) · `health` Account Health (FUTURE)
3. **Trust and Safety** — `reviews` Reviews Moderation (badge 7) · `fraud` Fraud and Reversals · `media` Media / Photo Review · `suggtags` Suggested-tag Moderation
4. **Support and Cases** — `cases` Case Queue (badge 12) · `dsar` DSAR / Data Requests (GATED: SUPER_ADMIN, SUPPORT) · `viewas` Read-only View-as (GATED: SUPER_ADMIN, SUPPORT)
5. **Members and Revenue** — `members` Members and Subscriptions (roles: SUPER_ADMIN, FINANCE, OPERATIONS) · `revenue` Revenue and Billing (GATED: SUPER_ADMIN, FINANCE) · `promo` Promo Codes and Trials · `engagement` Redemptions and Engagement (GATED) · `conversion` Conversion (GATED)
6. **Growth and Commercial** (whole group GATED) — `campaigns` Campaigns · `featured` Featured Placement · `trending` Trending
7. **Content and Taxonomy** — `taxonomy` Taxonomy Management · `legal` Legal and Agreements (EXTERNAL) · `announce` Announcements (FUTURE)
8. **Insights and Reporting** (group GATED) — `analytics` Platform Analytics (roles: SUPER_ADMIN, OPERATIONS, FINANCE)
9. **Platform** — `admins` Team & Roles (roles: SUPER_ADMIN, OPERATIONS) · `audit` Global Audit (roles) · `opstatus` Operational Status (roles: SUPER_ADMIN, OPERATIONS) · `flags` Feature Flags / Config (SUPER_ADMIN) · `notifs` Notifications

Note the three build-target modules live in TWO groups: Approval Queue, Review/Actioner, Merchant Directory, and Leads-and-Onboarding are all under **Operations**; Merchant 360 is under **Relationships**. (Merchant Directory = the list of all merchants; Merchant 360 = the single-merchant workspace. Different surfaces — an owner-flagged nav gap in Wave 1.)

### Tag / gate semantics (`tagStyleFor`, line 13801; `buildNav`, 13821)
- `future` = dashed grey pill (`#EEF0F4` bg / `#4B5563` fg / dashed `#C7CCD6` border) — item shown but does nothing (honest not-built).
- `external` = blue pill (`#EAF0FB` / `#2563EB`) — links out, never renders external data in-app.
- `gated` = lavender pill (`#F1ECFB` / `#7C3AED`) — capability-tiered; group-level tag propagates to the header.
- `roles: [...]` = role gate. Items outside the active role are LOCKED (greyed `#B0B6C0`, `cursor:not-allowed`) not hidden, when shown; `buildNavHidden` (13640) is an alternate hide-pattern (both patterns valid; per-role capability matrix is an open decision).
- `showGated` toggles whether gated/future tags are visible (a demo affordance).

### Screen state model
Shell state carries `view` ('shell'), `shellScreen` (the active nav id), plus per-screen sub-state: `m360Id` + `m360Tab` + `m360State`; `c360Id`/`c360Tab`; `qTab`/`qFilter`/`qSortCol`/`qSortDir` (queue); `draftState`/`draftForm`/`draftTouched` (create-draft); `assistedStep`/`assistedResumeId`/`assistedEmpty` (wizard); `reviewDialog` (actioner). Assisted wizard sets `shellChrome:false` (hides sidebar + top bar for full-screen mode; line ~17206).

### Roles
`ROLES` cycle order via the top-bar avatar (a PROTOTYPE control): OPERATIONS -> SUPER_ADMIN -> SALES -> FINANCE -> SUPPORT -> CONTENT. Resets to Operations on reload. Ops Home content is role-aware (`homeFor(role, state)`, line 13511). D57 (multi-module / combined access) and D58 (reframe "admins" as Redeemo STAFF) are FUTURE cards, not built.

## 2. How the three modules interlink (deep-link map)

Deep-links are `setState({ view:'shell', shellScreen:..., ... })` calls. Key cross-module handoffs found in the HTML:

- **Approval Queue / Review-Actioner row -> Merchant 360.** Queue and audit rows open the merchant workspace: `setState({ shellScreen:'m360', m360Id:<id>, m360Tab:'overview', m360State:'ready' })` (lines 11495, 11517, 12683). Global audit event -> M360 at the `audit` tab (10936). So a queue item is a lens INTO the merchant 360; the actioner is where the act happens, M360 is the durable record.
- **Global search (⌘K) -> M360 / C360 / Redemptions / Queue.** Search results route to `m360`/`c360` overview, to `m360` `redemptions` tab for a redemption-code hit (top-bar `openRedemptionFromSearch` -> `m360Id:'m-foundry', m360Tab:'redemptions', redState:'detail'`), and a queue link (12394-12397). D43 redemption lookup is reachable from global search + C360 + M360 Redemptions.
- **Notification bell -> Queue / M360 / Ops-status.** `notifDeepLink(ref)` (13407): `queue` refs open the Approval Queue; `merchant` refs open M360 overview; `opstatus` refs open Operational Status. The `review_assigned` notif (ADMIN_REVIEW_ASSIGNED) is the D59 assign-then-claim hook: type is REAL, emitter DEFERRED until the assign-flow exists.
- **Leads hub -> Create-draft / Assisted wizard / Queue.** Hub cards: "Create a draft" -> `shellScreen:'createDraft', draftState:'form'` (15183); "Start assisted onboarding" -> `shellScreen:'assisted', assistedStep:1, assistedResumeId:null, assistedEmpty:true` (15214); "View in queue" (inbound self-serve pointer) -> `shellScreen:'queue', qFilter:'Onboarding', qTab:'needs'` (15216); in-progress "Resume" -> `shellScreen:'assisted', assistedStep:r.stepN, assistedResumeId:r.id` (15220).
- **Prospect pipeline Convert -> Create-draft (prefilled) or Assisted wizard.** Convert dialog (`pipConvertId`) hands the prospect into one of the two existing admin-created routes: `createDraft` with `draftForm` PREFILLED from the lead (legal, trading, firstName, lastName, email, phone — line 15364) OR `assisted` step 1 (15369). This is the lead->onboarding handoff: convert does NOT rebuild; it seeds the real create-draft / wizard flow. Post-conversion stages (Draft created / Wizard in progress / Submitted / Live) are represented by the existing hub in-progress list + the approval queue, not by pipeline columns.
- **Create-draft submit -> M360 (new draft) or Queue.** After creating a draft the operator lands on `m360` `m-newdraft` overview (15173) or returns to queue (15172).
- **Assisted wizard Exit / finish -> Leads hub** (`shellScreen:'leads'`, 16632/16633); auto-advance-from-approve lands the final step (9).
- **Nav "Merchant 360" click -> entry picker** (`m360Id:null`, 13841) = the no-merchant-selected picker state (vs drilling in from Directory/Queue). Nav "Leads" -> `leads` (13850); nav "Approval Queue" -> `queue` (13839).

Interlink summary: **Leads (acquire) -> Create-draft / Assisted wizard (capture) -> Approval Queue + Review/Actioner (approve) -> Merchant 360 (durable manage).** The queue and 360 share the same merchant identity; the actioner's correction-on-behalf (D37) and M360's edit-on-behalf (D56) are the same two-lane model surfaced in two places.

## 3. Owner screenshots vs the handoff HTML (possible newer states)

IMPORTANT provenance caveat: the module screenshot sets (`merchant-360/` 23, `approval-queue/` 10, `leads-and-onboarding/` 23) were captured by the owner on 2026-07-09/10 from a **different / newer Claude Design project** (`claude.ai/design/p/eae5f333-5c1a-4868-9c5c-cdcdadead6fb`, per the reference README) than the handoff bundle export in this scratchpad. They may show states LATER than the handoff HTML. Treat screenshots as the fidelity target where they conflict with the handoff HTML, and flag conflicts.

Known / suspected discrepancies to verify during the build:
- **Merchant 360 tab count.** The reference README calls M360 a "13-tab design"; the exec log at one point says "12 tabs" (D48 landing note). The handoff HTML tab bar should be counted exactly (the M360 agent does this) and reconciled against the 13-tab screenshots — a 13th tab (or a tab added after the handoff export) is plausible.
- The 5 top-level root captures (`01-ops-home` … `05-leads-and-onboarding-pipeline`) are Wave-1/Wave-2 module shots; `05` matches the handoff HTML leads hub + prospect pipeline exactly (inbound LIVE pointer "6 awaiting review", Create-a-draft vs Assisted-onboarding NET-NEW cards, 3 in-progress resumes, prospect pipeline Lead 3 / Contacted 2 / Visit booked 2 + Lost section with Old City Vinyl). No divergence seen there.
- Any tab, field, or action visible ONLY in a screenshot and absent from the handoff HTML is called out in the per-module spec files' "Ambiguities for planner" sections; a planner should diff the newer prototype project directly if pixel-parity beyond the handoff export is required.
- The handoff bundle's own `project/screenshots/` folder contains CAMPAIGN/FEATURED-placement captures (e.g. `1-camden-exclusive-detail.png`, `2-end-early-dialog.png`), i.e. Growth-and-Commercial module states — NOT part of the three build-target modules. Ignore for this build.

## 4. Shared / repeated constructs across the three modules (build once, reuse)
- **Two-lane on-behalf editing** (correction/edit): actioner correction-on-behalf (D37) and M360 edit-on-behalf (D56) share the direct-vs-merchant-confirm distinction; material = money amount + legal identity name routes to merchant.
- **Automated location map-confirm** (no coordinate typing): appears in onboarding review (queue), M360 Branches, assisted wizard Step 3, branch-lifecycle review. One shared component: postcode -> geocoded -> confirmed tier stepper + Confirm / Nudge / Flag.
- **PIN-hidden-by-policy** everywhere, with the single D46 admin PIN-reset exception (M360 Branches + assisted Step 5 staff).
- **Honesty label set** (REAL / DERIVED / NET-NEW / CONCEPT / FUTURE / GATED / EXTERNAL / NOT-YET-SUPPORTED / partial-data) used identically across all three modules — a shared badge component.
- **Full state set** (loading-skeleton / empty / DISTINCT error / permission-denied-with-capability+role / partial-data / stale-conflict) is a cross-cutting requirement per screen.
- **Voucher full-detail + advisory value meter + category benchmark** (D41/D52) reused in queue voucher review, M360 Vouchers tab, and assisted wizard Step 4 (faithful port of the merchant-portal flagship builder).

## 5. Cross-module prototype-only / do-not-build
- Top-bar role-switcher avatar cycling (demo). Build role-gating, not the cycler.
- Per-screen STATE switcher chips (Populated / Empty / Loading / Error / Denied / Partial) — demo state togglers (e.g. leads pipeline "Populated/Empty/Loading/Error" chips visible top-right; opsStateSwitch; queue state chips).
- The two-deliverable toggle strip (Sign-in 1.1 / Operator shell / Design system) at the very top — prototype packaging.
- Synthetic operator "Shebin C.", synthetic merchants/customers/reps, .example/.test domains, hardcoded nav badges (24 / 7 / 12), dark email-readback demo panels.
- `showGated` visibility toggle (demo affordance for revealing gated tags).
