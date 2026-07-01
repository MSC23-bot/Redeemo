# Admin Panel prompt pack: Wave 1 (foundation, operational spine, governance)

Inherits the shared master context (`00-admin-master-context.md`) and design direction. Do not re-paste them; open the Admin session that already has them, then paste the wave intro below and work screen by screen.

**Wave 1 goal:** the dense operator shell + the proven, already-built operational spine (approvals, merchant lifecycle, edit-on-behalf) re-homed into the platform-level IA, plus the governance surfaces (Global Audit, Admin Users) that must exist early because they oversee everything else. This is the wave with the most ENGINEERED backend behind it: design it faithful to how it actually works.

## Wave 1 intro (paste into the Admin session)

Design Wave 1 of the Admin Panel: the operator shell and the operational + governance spine. Keep the complete grouped nav visible (later-wave groups shown but their items marked coming/gated). Establish the shared design system and the dense shell FIRST, then the screens below with their full state sets. Everything here maps to real backend behaviour; do not invent states it does not have.

## Screens (design each with its states)

**How to use this list:** each screen's paragraph below IS the prompt for that screen. Paste it (lightly trimmed if you like) into the Admin session, then ask for its full state set. Work one screen at a time in the given order; do not paste the whole list at once.

### 1.1 Design system + operator shell + sign-in (do this first)
The shared palette + two fonts applied; base components (buttons, inputs, tables, status pills, split-pane, cards for review panels only); the grouped left sidebar (all 8 groups from IA Section D, with gated/future items marked); the top bar (global search, notification bell with unread count, operator identity + role chip, logout with confirmation). Also design the operator sign-in / auth entry as a clean concept: a sign-in screen (email + a one-time-code step, mirroring the merchant portal's two-step pattern) and a signed-out state. NOTE the admin session/auth model itself is an OPEN decision (see the guardrails): design the sign-in surface honestly but do not imply a specific session mechanism is locked. States: collapsed/expanded nav; a role with fewer capabilities showing a shorter nav; loading; signed-out / sign-in; OTP-step.

### 1.2 Ops Home (role-aware landing; replaces the queue-first redirect)
A calm operator landing: today's work summary (open approvals by type + age, oldest-first), a launch-readiness / supply signal for the target market, alert tiles, quick actions. KPIs that depend on analytics must be labelled "gated on the analytics surface" (do not show fabricated live numbers). States: loading skeleton; gated-analytics empty; partial-data; a SALES persona seeing a lead-focused home; a SUPPORT persona seeing a case-focused home.

### 1.3 Approval Queue (unified work list)
One queue over onboarding, voucher, merchant-edit and branch-lifecycle approvals. Columns: merchant, type, waiting-age (age-tinted, neutral/amber/red, oldest-first, NO SLA countdown), verification, status, owner/claim. Status-filter chips with counts. 45s freshness + manual refresh + "last updated". A ">24h claimed" stale flag. States: loading (skeleton rows + count skeleton), empty ("no items match"), error (distinct, retry), permission-denied (a role without approval:read), responsive collapse.

### 1.4 Review / Actioner (the queue detail; the quality-control point)
A split-pane review screen that dispatches by approval type into five surfaces, sharing one shell and a sticky action bar:
- **Onboarding review:** read-only merchant header (name, status/verification/contract pills), business profile, branches (with location-confidence pills and a "confirm location" affordance; "branch PINs are never shown here"), documents (open via short-lived signed link or an "unavailable" badge; never a raw path), vouchers (mandatory n/2 + custom), a go-live checklist, and "thin area" flags for data the model does not yet capture. Sticky bar: Request changes (reason + quick-reason chips), Reject (mandatory reason + confirm), Approve and go-live (serious confirm; server re-checks gates; a named-gate banner on failure with the failed checklist row highlighted).
- **Voucher review:** voucher details, availability windows, customer preview, and Approve / Reject / Request-changes with an allow-listed concierge proposal.
- **Merchant-edit review (apply-on-behalf):** field-by-field current-to-proposed diff, plus branch photo add/remove preview (photo apply IS supported); Approve-edit / Reject-edit.
- **Branch-lifecycle review:** proposed branch-create (with a location-confirm gate) or branch-close (with reason); approve/reject.
- **Media / photo review:** the branch photo add/remove surface (the apply lane is real; the automated scanner is a stub and admin approval is the moderation gate; note that clearly).
Claim-to-act model: an item is worked under an exclusive claim; the claimer (or SUPER_ADMIN) can release; an ordinary admin cannot steal a claim. IMPORTANT authority truth: today one operator can claim AND approve the same item (submit and approve capabilities are both held by OPERATIONS, with no different-actor guard); design the claim/approve affordances honestly and do NOT imply a second countersigner is enforced. States: claimed-by-me / claimed-by-other (read-only) / unclaimed; orphaned-merchant notice; gate-fail banner; loading; permission-denied.

### 1.5 Merchant Directory
Searchable, filterable, paginated merchant list (name, trading, status, verification, created, per-row lifecycle actions gated by capability). Entry point to Merchant 360. States: loading, empty, error, permission-denied, responsive (tables are the weak spot: design a sensible narrow view).

### 1.6 Merchant 360 (workspace; read + edit-on-behalf per the authority matrix)
A tabbed operator workspace, not a directory row: business/legal identity + owner/contacts (note: an "accountable signatory" identity record is a future field, not shown as existing); branches/verification/hours/amenities/media; vouchers/terms/approval history/performance; redemptions (aggregate; never individual customer identity); staff/roles/branch-scope (read; admin staff-management is not yet a surface); documents + agreements (signature evidence is thin today: method/version/timestamp/IP only); notifications + comms timeline; subscription/billing (future/gated); Insights/health (reference, gated); lifecycle/audit/outstanding-work. Each edit affordance shows its authority outcome: direct-low (e.g. website), direct-high SUPER_ADMIN (e.g. VAT/company number, category), propose-then-approve (sensitive name/description), and clearly-labelled NOT-YET-SUPPORTED for logo/banner, branch address text, hours/amenities, custom vouchers, staff management. Suspend/reactivate (mandatory reason + confirm; suspend is immediate takedown). States: partial-data ("not set"), cap-gated affordances hidden/disabled with reason, denial, loading.

### 1.7 Create merchant draft + secure handoff (admin-created onboarding)
A short create-draft form (six fields; no category/town). Success panel makes clear a secure claim email is sent to the owner to set their own password and finish onboarding: NO password is set here, nothing goes live until approved. States: form validation, success, error (named-gate banner), permission-denied.

### 1.8 Global Audit / Activity Explorer (governance; sequence EARLY)
A platform-wide audit browser: query by actor, entity, event type, and time; each row shows actor + reason + before/after. This is the oversight backstop for edit-on-behalf and (future) bulk/delegated powers. Redact secrets/payload/PIN. States: loading, empty, error, permission-denied, a filtered "everything operator X did" and "all edit-on-behalf last week" view.

### 1.9 Admin Users and Roles (governance)
Manage operators: list, invite (tokenised; no admin-set passwords), deactivate, assign role. Show the capability set per role, including the currently-empty FINANCE/CONTENT/SUPPORT roles and the bootstrap-first-SUPER_ADMIN concept. Represent per-person capability grants as a labelled FUTURE concept (the grant model is not built; do NOT imply a live grant toggle). States: last-owner guard, empty-role default view, step-up-before-sensitive placeholder, permission-denied.

### 1.10 Operational Status (bounded, in-app; Platform group)
A bounded status page fed only by the approved allow-list of in-app signals: outbox delivery health (queued/failed/bounced counts), job-queue depth/failed counts, config/feature-flag health (approved booleans only, e.g. email on/off, NEVER a secret value), SMS/email spend-vs-cap gauge, key-rotation service parity, stale-claim count. NEVER expose secrets/credentials/connection-strings or unbounded queries. Host metrics (CPU/latency/uptime) are EXTERNAL: link out, do not fabricate. An Incident model / history / ack-mute is FUTURE: label it. States: healthy/degraded panels, external link-out, gated-history notice.

### 1.11 Notifications / bell
The header bell feed + a notifications page: recent alerts, mark-read/mark-all, deep-link to the relevant queue item. Per-admin mute/preferences is a FUTURE concept (label it). States: loading, empty ("all caught up", distinct from error), error, rows.

## Wave 1 clickable flows
- Claim to act: open queue to claim to review to (approve-and-go-live | request-changes | reject) with each result state.
- Edit-on-behalf: Merchant 360 to a direct-low edit (reason to audit); to a propose-sensitive edit (routes into the review lane); to apply a merchant-requested edit in the review lane (diff to apply, including a photo add/remove).
- Lifecycle: suspend (reason to immediate takedown) to reactivate; confirm a branch location (pin-drop concept) unblocking go-live.
- Onboarding: create draft to the "claim email sent" success (no password shown).
- Oversight: bell alert to the queue item; Global Audit filter to "operator X actions"; invite an admin user (tokenised).

## Wave 1 acceptance (in addition to the global checklist)
- Approx scope: ~12 screens (design system + shell + sign-in, Ops Home, Approval Queue, Review/Actioner with its 5 dispatched surfaces, Merchant Directory, Merchant 360, create-draft, Global Audit, Admin Users, Operational Status, bell), each with its full state set.
- The five review surfaces are distinct but share one shell + sticky bar.
- Claim/approve is shown honestly (single-actor today; not labelled four-eyes).
- Documents open via signed link/unavailable badge; branch PIN never shown; redemption rows never show individual customer identity.
- Ops Home is role-aware and does not fabricate gated KPIs.
- Global Audit + Admin Users are present (governance-early), with grants/step-up labelled FUTURE, not faked.
- Operational Status shows only allow-listed signals; host metrics link out; no secret ever rendered.
