# Redeemo Admin Panel: Platform Operating Model, Information Architecture & Existing-Capability Relocation Blueprint

## 0. Front matter

- **Status:** BLUEPRINT (design intent). This document describes the complete Admin Panel needed to operate Redeemo. It is NOT a statement that these surfaces are built. Every claim about what exists is tagged and source-cited; everything else is design.
- **Authority:** This is the platform-level target operating model and information architecture. It supersedes the shape of the current `apps/admin-web` enabling slice (see 1.1). Where it names something as built, `origin/main` source is the authority.
- **Freshness:** verified against `origin/main` @ base SHA `37cc0f69483500b7f512881953283e66ce52531a` (`docs(crypto-rotation) #344`). Re-verify before relying on any "built" claim.
- **Scope of this artifact:** documentation only. It does not authorize implementation, schema, API, auth, provider, deployment, or Claude Design work. Approved process decisions: D1 (operating-model-and-IA-first), D2 (durable platform blueprint before Claude Design), D14 (one master blueprint plus separate wave-specific Claude Design prompt packs). D20 (NHS / key-worker / community partnership schemes) is owner-decided FUTURE / DEFERRED. All other product, security, legal, provider and schema decisions remain PROPOSED and separately gated.
- **How to read:** read Section 1 (framing) and Section 2 (cross-product) first, then Section 3 (personas), Section 4 (IA), and Section 5.0 (the five boundary contracts) which govern every module. Sections 5 to 9 are the domain design. Section 12 is the binding "nothing silently discarded" relocation contract. Section 13 lists what stays gated. Section 15 sequences the prototype waves. Section 17 is the evidence base.

### 0.1 Corrections carried (binding, verified this pass)

- Branch photo review/apply is **ENGINEERED** (PR #313, commits `45ac3773`/`2442f214`); `EDIT_PHOTO_APPLY_NOT_SUPPORTED` is no longer thrown (dead code). The CLAUDE.md/memory "photo-apply deferred" line is stale.
- Merchant Insights provides an existing **aggregation + eligibility foundation** (`src/api/merchant/insights/*`, PR #331 / `00582a6e`), reusable as a **reference**. **Admin analytics is NOT BUILT** (no admin-wide analytics API, authz model, or UI). Redemption merchant attribution already works via `VoucherRedemption -> Branch -> Merchant` (`branch.merchantId`); `VoucherRedemption.merchantId` denormalisation is **not** a settled prerequisite.
- Merchant Insights `gate.ts`: operational aggregates run un-gated; **behavioural** metrics (repeat-rate, new-vs-returning, customer-history, event-level CSV) are DPIA fail-closed by `behaviouralGateOpen()` (default-off, production-fail-closed).
- `apps/merchant-web` is engineered/merged and a useful **design reference**; it is **not** staging-accepted or production-proven.
- The current Admin UI is an enabling slice, not the final Admin IA.

### 0.2 Style

British English. No emojis. No em-dashes (use `:` `;` `()` `·` and hyphens). Real Redeemo brand hexes referenced by name where relevant: brand red `#E20C04`, coral `#E84A00`, navy `#010C35`, cream `#FFF9F5`. Note: `apps/admin-web` today is neutral-brand (no brand fonts); brand alignment is a separate design decision, not locked here.

---

## 1. Operating model and principles

### 1.1 Enabling slice vs final Admin Panel (the governing framing)

The current `apps/admin-web` was built primarily as an **operational enabling slice** so Merchant Portal onboarding, approvals and lifecycle operations could function end to end. It is the "first operational slice, not the launch bar" (verbatim, `docs/superpowers/specs/2026-06-14-admin-panel-actioner-design.md` §18.3): it exists to operate the previously write-only approval chokepoint (`2026-06-07-merchant-admin-platform-strategy.md` §2, §3) so a merchant can move from lead to live through the product rather than through seed scripts.

It is therefore **not** the approved final Admin Panel operating model, information architecture, module hierarchy, navigation, homepage, page composition, naming, layout, or visual design. The full Admin Panel is a larger, later scope (strategy §4.2 enumerates roughly fourteen domains).

**Design rules for this blueprint:**

1. Design the complete Redeemo Admin Panel operating model and IA from the platform level first (Sections 1 to 4).
2. Then map every existing capability into the module, screen and hierarchy where it properly belongs (Section 12).
3. Preserve valid backend capabilities, authorization boundaries, business rules, safety controls, tests and proven workflow behavior.
4. Make no assumption that the current sidebar, queue-first homepage, grouping, labels, layouts or visual composition survive.
5. Allow existing frontend surfaces to be retained, redesigned, moved, split, combined or superseded.
6. Ensure nothing already built is silently discarded (Section 12 is the binding contract).
7. Represent the complete Admin Panel needed to operate Redeemo, not an enlarged merchant-support console.

### 1.2 Mission

The Admin Panel is Redeemo's internal operational control centre. It governs the two-sided marketplace end to end: merchant supply (leads, onboarding, verification, approvals, lifecycle, relationships, assisted operations), customer demand (accounts, subscriptions, support, consent, trust and safety), the content and taxonomy that shape discovery, the commercial and communications operations, and the platform governance (roles, audit, oversight, operational status) that makes powerful tools safe.

### 1.3 Principles (load-bearing; each cross-checked in Section 17)

- **Act FOR the merchant, never AS the merchant.** Admins may correct, co-build and assist, always as the real ADMIN actor with reason and audit; they never impersonate, never accept terms, never set or learn a merchant password. (Verified: no admin contract-signing path; no admin password path; `EditActor` mandatory reason on every on-behalf mutation.)
- **No weaker path.** Every admin-on-behalf action runs the same shared core (`fnCore`) the merchant path runs, with a tighter (never looser) input allow-list. (Verified: `src/api/merchant/shared.ts` `EditActor`; Option B B1 to B5.1.)
- **Every intake has an outlet.** Any data the platform captures from users (reported reviews, fraud/screenshot telemetry, suggested tags, bounced-email signals) must have an admin surface to action it, or be explicitly scoped out. Silent dead-ends are prohibited (see the DEAD-ENDED disposition in Section 12).
- **Safety by default.** Destructive and high-risk actions require mandatory reason, confirmation, capability gating, transactional audit, and (proposed) step-up. Customer-impacting and lifecycle actions route through the approval lane, not direct edit.
- **Capability-gated, backend-enforced.** `requireAdminCapability` over `AdminRole` is the authz spine; any UI mirror is UX only and never the enforcement.
- **No customer-home mapping.** Merchant and branch locations and anonymized regional supply may be mapped; individual customer home addresses and precise coordinates must never be plotted (see boundary contract 4).
- **Native Redeemo relationship operations, not a generic CRM.** Redeemo owns relationship operations that require live platform state or in-product side-effects; general prospecting, nurture and conversational support are candidates for external integration (see boundary contract 5).
- **PII and DPIA discipline.** Customer surfaces are PII-heavy and inherit the DPIA fail-closed posture for any behavioural or demographic aggregate; PII access is gated and audited; deletion is anonymise-in-place today (see Section 6.2 and boundary contract 4).
- **Honest status.** The blueprint annotates maturity so nothing pretends to be built; those annotations are review artifacts, not mandated UI badges (see Section 4.3).

### 1.4 Cross-product invariants the Admin Panel must respect

Branch-first cardinality; domain canon (`redeemo.co.uk`; never emit `redeemo.com`; `admin.redeemo.co.uk` not provisioned); subscription-anchored cycles; no-emoji/no-em-dash/brand-hex style; Node 24 for admin-web/backend/CI; insights eligibility cleanliness (exclude `isTestData` on redemption+branch+merchant, QA emails, `User.status=DELETED`; join redemptions via `branch.merchantId`); the Decimal-as-string coercion rule (`z.coerce.number()` for Prisma `Decimal` in any admin-web schema); plan-first Tier 2/3 discipline; git-safety hooks. Merged is the floor, not the bar: the Definition of Complete (all states incl. denial, a11y, responsive, wire-accurate contract tests, staging acceptance) is the completion standard.

---

## 2. Cross-product operating model

The Admin Panel is one surface in a coordinated platform. Its actions have live-query downstream effects (no event bus; a customer sees the effect the instant the DB transaction commits).

| Connects to | What the Admin Panel does / must respect | Evidence |
|---|---|---|
| **Customer app / web** | Governs customer accounts, subscriptions, consent, trust and safety; its approve/suspend actions change discovery visibility and redemption eligibility. No admin customer surface exists today (net-new). | discovery filters on `merchant.status=ACTIVE` + `voucher.status=ACTIVE`+`approvalStatus=APPROVED` + `!isTestData`; redemption gate `src/api/redemption/service.ts` |
| **Merchant Portal** | Operates the chokepoint the portal feeds; edits on behalf via the same cores; approves what the portal submits. Merchant billing does not exist on either side. | `src/api/merchant/**`; Option B B1 to B5.1 |
| **Public website / content** | Owns specific versioned content and taxonomy; legal/FAQ pages are static and owner/legal-signed (the hard launch gate); `CmsContent` is unwired by runbook decision. | boundary contract 2; `deploy-security-runbook` §12 |
| **Backend / schema** | Reuses the shipped authz, audit, approval, edit-on-behalf, notification and insights primitives; most net-new domains need new schema (flagged per module). | Section 17 |
| **Providers** | Monitors and acts on Stripe (subscriptions/refunds/disputes: no admin surface, disputes not even webhook-handled), Twilio (SMS caps), Resend (email dark; read-only per-merchant comms only), FCM (Phase 6), R2 (docs; flag-gated). | `src/api/subscription/**`, `shared/smsLimiter.ts`, `webhooks/resend.ts`, `shared/storage.ts` |
| **Support / finance / legal / privacy / ops** | Native relationship operations, DSAR/retention, commercial operations, legal/agreement evidence, and platform governance; largely net-new and gated. | Sections 6 to 9, 13 |

**Downstream-effect summary (built, verified):** approve to go-live makes a merchant and its RMVs discoverable and redemption-eligible; suspend is immediate takedown plus session revoke plus in-flight cycle refund; confirm-location earns a map pin and go-live eligibility; approve/reject voucher, apply/reject edit (including branch photos), approve/reject branch lifecycle are precisely scoped, allow-listed, ADMIN-audited mutations.

---

## 3. Personas and authorization model

### 3.1 Persona ladder (complete operating model; some future/gated)

Do not omit FINANCE, SUPPORT or CONTENT because their current backend capabilities are empty. Each persona is modeled fully; implementation may be future or gated.

| Persona | Operating role | Backend state today |
|---|---|---|
| **SUPER_ADMIN** | Owner / root / break-glass; platform-critical powers (role management above tier, kill-switches, hard-delete/purge, legal/pricing config, irreversible actions). | `AdminRole.SUPER_ADMIN`; superuser short-circuit holds every current and future capability (`capability.ts:113`). |
| **OPERATIONS** | Day-to-day actioner: queue, review, merchant lifecycle, edit-on-behalf (operational tier), trust and safety triage. | `AdminRole.OPERATIONS` holds `ALL_SLICE1_CAPS` (10 caps). |
| **SALES / LEAD OWNER** | Supply recruitment: leads, qualification, acquisition-source attribution, representative-assisted onboarding, relationship notes; may initiate, never approves its own merchants. | No `AdminRole` value; **PROPOSED**. `MerchantLead`/`MerchantSource` design-only. |
| **FINANCE** | Billing, refunds, disputes, payouts, commercial operations. | `AdminRole.FINANCE` exists but holds zero capabilities; commercial code largely absent. |
| **SUPPORT** | Customer relationships, cases, DSAR intake, read-only view-as. | `AdminRole.SUPPORT` exists but holds zero capabilities; a natural home for CRM-case ownership; no support routes/tables. |
| **CONTENT** | Content and taxonomy management, comms/broadcast, announcements. | `AdminRole.CONTENT` exists but holds zero capabilities. |
| **Platform Manager (PROPOSED)** | Broad operational plus financial oversight, can manage department staff, cannot hold platform-critical. | **PROPOSED persona label only.** There is NO `AdminRole.ADMIN` / Platform-Manager enum value or backend role today; do not imply one exists. |

### 3.2 Capability model (current, verified) and its evolution

- Current: 15 capabilities (10 in `ALL_SLICE1_CAPS` held by OPERATIONS + 5 SUPER_ADMIN-only = 15); a de-facto two-tier gate: OPERATIONS holds `ALL_SLICE1_CAPS` (10 caps); the five higher-bar caps (`merchant:edit-identity`, `merchant:edit-category`, `merchant:manage-branches`, `merchant:propose-edit`, `merchant:manage-documents`) are SUPER_ADMIN-only via the short-circuit; FINANCE/CONTENT/SUPPORT hold none. (`capability.ts:87-115`.)
- Evolution (design intent, not locked): three capability classes (operational / financial / platform-critical) and per-user grants. **`AdminCapabilityGrant` is design-only and unshipped.** Define required responsibilities, restrictions and access outcomes WITHOUT locking that schema or a granular grant engine. Hard constraint to surface: fixed-`AdminRole` RBAC cannot express per-person exception grants until `AdminCapabilityGrant` ships, so delegating a specific power to one operator is blocked on that net-new model.

### 3.3 Grant, step-up and view-as: OUTCOMES only (all verified-absent, net-new, gated)

- **Step-up / re-auth** before destructive actions: absent (grep zero). Represent the OUTCOME (a re-authentication gate on suspend, identity edit, category change discarding RMVs, branch/document delete, reversal, bulk) without locking httpOnly/BFF/cookie mechanism. Admin session/auth architecture is a separate security decision.
- **Maker-checker / four-eyes** on a single mutation: absent. The shipped `AdminApproval` submit/approve split has **separate capabilities and workflow stages, but is NOT role/actor separation, maker-checker or four-eyes**: both `merchant:submit` and `approval:action` are granted to OPERATIONS (`capability.ts`) with no submitter-vs-approver service guard, so one OPERATIONS admin can currently submit, claim and approve the same item. Different-actor countersign is NET-NEW; do not describe the current split as role separation or dual-control anywhere in this blueprint.
- **Impersonation / view-as:** absent; the one `impersonate` string in source is an anti-forgery warning (`customer/plugin.ts:19`). Model only a **read-only, fully-audited view-as**; never write-impersonation. GATED (security).

### 3.4 Governance early, without approving its schema

Audit, admin-user management and permission oversight may appear early in the prototype because powerful operational tools require governance. This does not approve their implementations or schemas. Their substrate today: enforcement is solid; admin-user CRUD, bootstrap, `AdminCapabilityGrant`, and a global audit query endpoint are all net-new (Section 12, Section 13).

---

## 4. Information architecture and global shell

### 4.1 Proposed navigation groups (to validate during IA design; not an evolution of the current two-item nav)

Rationale: operations-first (the daily work surface); trust and safety separated so every intake has an outlet; relationships (Merchant 360 / Customer 360) as first-class; commercial grouped behind one billing gate; governance visible early; gated and future surfaces honestly labeled.

1. **Operations:** Ops Home (role-aware) · Approvals / Work Queues · Merchant Directory · Leads and Onboarding.
2. **Relationships:** Merchant 360 · Customer 360 · Communications · Tasks and Follow-ups · Account Health.
3. **Trust and Safety:** Reviews Moderation · Fraud and Redemption Reversals · Media/Photo Review · Suggested-tag Moderation.
4. **Support and Cases:** Case queue · DSAR / Data Requests · read-only View-as (audited).
5. **Growth and Commercial:** Campaigns · Featured Placement · Trending · Promo Codes · Subscriptions / Billing / Refunds.
6. **Content and Taxonomy:** Taxonomy management · Versioned Legal/T&C/FAQ · Announcements.
7. **Insights and Reporting:** platform analytics (reuse Insights foundation as reference).
8. **Platform:** Admin Users and Roles · Global Audit / Activity Explorer · Operational Status · Feature flags / config · Notifications / bell.

The current console's two nav items (Approval queue, Merchants) relocate into Operations and Relationships; the queue-first homepage is superseded by a role-aware Ops Home. The mockup's hollow "Branches / Audit log / Settings" nav-with-no-screen is the anti-pattern to avoid.

### 4.2 Global shell behavior

Role-aware landing (Ops Home) instead of a redirect; capability-filtered navigation (a persona sees only what it holds); a global top bar with search, notifications/bell (built; reuse), actor identity and role, logout; a consistent detail/workspace pattern for 360 surfaces; denial states for every gated route; responsive behavior (the current tables are desktop-only, a DoD gap).

### 4.3 Maturity annotations vs live status (correction, binding)

The tags `ENGINEERED / PARTIAL / GATED / FUTURE / EXTERNAL` are **blueprint and prototype-review annotations**. Do not assume they appear as badges throughout the final Admin UI. Distinguish three orthogonal axes:

- **Implementation maturity** (a design/review annotation): ENGINEERED / PARTIAL / GATED / FUTURE / EXTERNAL.
- **Feature availability / configuration** (operator-facing where useful): whether a feature is enabled/configured (e.g. email dark, storage off).
- **Live operational status** (operator-facing, first-class UI): healthy / degraded / failed / pending / approved, for real entities and jobs.

Show user-facing availability or gating copy only where it helps an operator understand why something is unavailable or needs configuration (for example a disabled action with "requires a signed contract", or a panel reading "email delivery is not enabled in this environment"). Maturity annotations otherwise stay in this document and the review process, not the shipped chrome.

Status-state definitions used by this blueprint: **ENGINEERED** (built and merged), **PARTIAL** (some parts built), **GATED** (will be an admin surface, blocked; sub-typed gated-by-decision vs gated-by-dependency), **FUTURE** (designed, not started, no blocker beyond sequencing), **EXTERNAL** (deliberately not an in-app admin surface: the panel links out or defers to code/owner).

---

## 5.0 The five boundary contracts

Each contract is a bright line with an IN list and an OUT list; every relevant module (Section 5) and every relocation row (Section 12, including 12.2, 12.3 and 12.4) names its governing contract. Row tags: REUSE (existing substrate), NET-NEW (build), GATED (owner/security/legal/provider), EXTERNAL (out of the admin app by design). Two clarifications used throughout: BC-3 also governs single-actor high-risk mutations (its safeguards envelope of dry-run + step-up + maker-checker + per-row audit + reversibility applies wherever a destructive mutation needs guarding, not only bulk); and BC-5 is the default governing contract for platform-governance and relationship surfaces that have no external-CRM alternative (for example Admin Users and Global Audit).

### BC-1: Bounded Admin operational status vs external APM/provider telemetry

| IN (bounded in-app status, existing signals) | OUT (external only, link out, never fake) |
|---|---|
| Outbox delivery health: `CommunicationLog GROUP BY status` (QUEUED backlog / FAILED / BOUNCED) [REUSE, read-side NET-NEW] | Server CPU/memory/disk, p99/p50 latency, uptime %, error-rate histograms [EXTERNAL] |
| Queue depth / failed-job counts via BullMQ `getJobCounts()` (never called today) [read-side NET-NEW] | Container restarts, Neon pool internals, Redis/Postgres server metrics, distributed traces [EXTERNAL] |
| Config/feature-flag health (`EMAIL/STORAGE/MODERATION/CAPTCHA_ENABLED`, `RESEND_WEBHOOK_SECRET` presence) [REUSE] | Railway/Vercel deploy status and host dashboards [EXTERNAL: deep-link] |
| SMS/email spend vs cap (Redis global-daily counter vs `globalDailyCap()`) [REUSE] | |
| Key-rotation parity + per-service last-seen (`KeyringFingerprint`) [REUSE] | |
| Stale-claim count (indexed `AdminApproval` predicate); webhook recency (`StripeWebhookEvent`, `CommunicationLog.externalId`) [REUSE] | |

The IN column is an explicit allow-list of bounded, redacted, capability-gated status projections (the rows above), NOT "anything a DB/Redis/env read can answer". Hard rules: never expose secret values, credentials, or connection strings, and no unrestricted environment reads; no arbitrary or unbounded DB/Redis queries; configuration status may surface only approved booleans or status labels (for example `EMAIL_ENABLED` on/off), never the underlying secret. The existing config/env, Redis counters, and `KeyringFingerprint` rows are substrate; the Admin status read API and UI are NET-NEW (bounded projections over that substrate). Provider/APM telemetry remains external. GATED (needs new persistence): an Incident/StatusEvent model, historical time-series, ack/mute, and the three reserved alert emitters (`ADMIN_DELIVERY_FAILED`, `ADMIN_OWNER_EMAIL_BOUNCED`, `ADMIN_REVIEW_ASSIGNED`). Evidence: `src/api/app.ts:117` (`/health` returns a literal, no dependency roll-up); `outboxReconciler.ts`, `claimStaleSweep.ts` (compute counts, discard them); `smsLimiter.ts`; `KeyringFingerprint`.

Five-layer classification (apply to every provider and status signal; keep the layers separate: source wiring is not runtime activation). For each, distinguish: (1) source capability (ABSENT / SCAFFOLDED / WIRED / ENGINEERED in the codebase); (2) configured capability (BOOT-REQUIRED config, FEATURE-GATED / dark-by-default, OWNER-CLI-only, or SCAFFOLDED / deferred; a required secret is configuration, not proof a provider is active); (3) deployed runtime state (VERIFIED or UNVERIFIED; not inspected under the active provider / no-use holds, never inferred from source or from a historical probe); (4) provider / account state (VERIFIED, OWNER-REPORTED, or UNVERIFIED; label owner-reported where applicable); (5) Admin observability maturity (REUSABLE SIGNAL, READ-SIDE NET-NEW, or EXTERNAL). Infrastructure state stays separate from application-consumer state: an instance (for example Redis) can be up while its consumer (the worker) is down; Neon project / control-plane, branch / compute, and application binding are distinct axes. Google Places is OWNER-CLI-only (consumed by `prisma/suggest-branch-pin.ts`, not by the deployed API); its local `.cache` usage file is not directly reusable by a deployed Admin surface, so any central Admin visibility is EXTERNAL or READ-SIDE NET-NEW until a safe ingestion source is designed. M22 must render dynamic states (healthy / degraded / down / unverified / external / gated / unavailable-not-built), never a hardcoded snapshot of any one day; transient deployment facts belong in the evidence / freshness appendix (Section 17), not the operating model. Preserve, explicitly: `/health` proves process liveness only; DB / Redis dependency health is NOT established by `/health` (net-new); APM / error monitoring is absent (external when adopted); deployed-SHA / version reporting is absent (net-new); the queue / outbox / keyring / notification substrates exist but several Admin read APIs are net-new; raw logs, unrestricted queries, environment values, secrets and provider telemetry remain outside Admin; Admin may show bounded status, freshness, responsible role, runbook and safe provider deep links, and configuration status may expose only approved booleans or bounded labels, never values, secrets or connection strings.

### BC-2: Specific versioned content/taxonomy controls vs generic CMS

| IN (specific Redeemo controls) | OUT / EXTERNAL (generic CMS, out of scope) |
|---|---|
| Taxonomy management: Category/Tag/SubcategoryTag/Amenity/CategoryAmenity/MerchantHighlight/RmvTemplate/Interest CRUD + activation [NET-NEW UI over existing seed models] | Blog / page-builder / marketing CMS [OUT] |
| Suggested-tag moderation (`MerchantSuggestedTag`) [NET-NEW on BOTH intake and outlet: no create-path, no approve/reject path today] | Email template editing (templates are code) [EXTERNAL] |
| Announcements / notices [NET-NEW schema; no model today] | Merchant agreement legal text (external `redeemo.co.uk/merchant-terms`) [EXTERNAL] |
| Versioned legal/T&C/FAQ + effective-date [GATED: static customer-web JSX is the launch source of truth; owner/legal sign-off is the hard launch gate] | |

Critical flags: `CmsContent` is UNWIRED by runbook §12 decision (sole writer is the seed) and is not the legal source of truth; `RmvTemplate` has `isActive` but **no `version` field** (add version where versioning is required); `TermsClause`/`VoucherTermsClause` (curated voucher-terms library) are DESIGN-ONLY.

### BC-3: Safeguarded bulk workflows vs unsafe mass operations

| IN (future safeguarded bulk) | OUT (unsafe mass operations) |
|---|---|
| Scoped selection (built on the single-winner conditional-claim idiom) [REUSE pattern] | Client-supplied id list or CSV import with no scoped selection [OUT] |
| Server-computed preview / dry-run diff (before/after) [NET-NEW] | No preview / no dry-run [OUT] |
| Step-up re-auth [NET-NEW, security-gated] | No re-auth [OUT] |
| Maker-checker countersign by a DIFFERENT admin [NET-NEW; the existing submit/approve split is separate capabilities/stages but NOT role/actor separation: both caps are OPERATIONS-held with no guard, so one admin can submit + claim + approve] | Single-actor irreversible mass mutate [OUT] |
| Per-row transactional audit (`writeAuditLogTx`) [REUSE] + rate/quota bound (`atomicLimiter`) [REUSE] + reversibility where the before-snapshot allows [data REUSE; revert engine NET-NEW] | No per-row audit, no bound, no reversibility [OUT] |

Verified: zero bulk-mutate routes today (every `updateMany` targets a single guarded entity); step-up and maker-checker absent; before/after audit exists but no revert engine.

### BC-4: Merchant/branch coverage vs prohibited customer-home mapping (three states)

| ALLOWED (business locations, anonymized supply) | GATED (regional customer aggregate) | PROHIBITED (customer home) |
|---|---|---|
| Branch/merchant pins via `Branch.latitude/longitude/localityId` [REUSE] | Members-per-locality or any customer-derived regional aggregate: inherits the DPIA fail-closed posture (`insights/gate.ts`); needs a DPIA + minimum-cohort suppression [GATED] | Plotting individual customers by home: `User.addressLine1/2`, `postcode`, `latitude/longitude`, `localityId` [PROHIBITED] |
| Anonymized regional supply: branch-counts-per-Locality, coverage-per-Market, category-coverage-per-region, supply-vs-`Market.targetMerchantCount` [NET-NEW view over existing substrate] | | The legacy `admin-panel-spec.docx` "map all registered customers by home address" pattern is explicitly struck [PROHIBITED] |

The raw customer geo fields exist in schema, which is exactly why the prohibition must be explicit and named in Section 1.3 and enforced in Section 6.2. Any customer address/coordinate view must be reveal-on-demand and audited, never plotted.

### BC-5: Native Redeemo relationship operations vs external general-purpose CRM

| IN (Redeemo must own: needs live platform state or in-product side-effects) | OUT / INTEGRATE [EXTERNAL] (candidate for Zoho/HubSpot/Salesforce) |
|---|---|
| Platform-linked merchant/customer onboarding and lifecycle operations [REUSE + NET-NEW] | Broad generic sales automation, deal-stage forecasting before a Merchant row exists [EXTERNAL] |
| Support and cases that must read/write platform state [NET-NEW] | Generic enterprise CRM customization [EXTERNAL] |
| Tasks/follow-ups triggered by platform state (the `lastStaleAlertAt` pattern) [NET-NEW; reference pattern REUSE] | Unrestricted mass marketing automation / nurture sequences [EXTERNAL] |
| Relationship context, account health derived from platform metrics (redemptions, subscription status, review/supply) [NET-NEW] | Pre-platform prospect contact management; conversational helpdesk/ticketing [EXTERNAL] |
| Audited platform actions; consent-aware communications; interaction history composed on `AuditLog + CommunicationLog + Notification` [REUSE] | |

The line: if a CRM concept must read live redemption/subscription/approval state or write an in-product action, Redeemo owns it; if it is pre-platform prospecting, nurture, or conversational support, it is a build-vs-integrate decision. CLAUDE.md Open Decisions records the "Zoho One for CRM + contracts + helpdesk alongside the custom platform (not instead of it)" direction, so support-ticketing and general CRM are an explicit build-vs-integrate gate, not an assumed in-house build.

---

## 5. Module / domain catalogue

Each module: purpose, key sub-modules/screens, primary personas, status, governing boundary contract(s), dependencies. States are inventoried in Section 11.

| # | Module (group) | Purpose | Status | Boundary | Dependencies / notes |
|---|---|---|---|---|---|
| M1 | **Ops Home** (Operations) | Role-aware landing: work summary, launch-readiness/supply signal, alerts. | FUTURE (net-new); replaces `redirect('/queue')` | BC-1 (status), BC-4 (supply) | Supply signal reuses coverage substrate; behavioural KPIs are GATED. |
| M2 | **Approvals / Work Queues** (Operations) | Unified queue over onboarding/voucher/edit/branch-lifecycle plus new intakes (reviews, suggested tags). | ENGINEERED (relocate + redesign) | BC-3 (if bulk added) | Claim-to-act, urgency, freshness all built. |
| M3 | **Merchant Directory** (Operations) | Find/triage merchants; entry to Merchant 360. | ENGINEERED (relocate + redesign) | BC-5 | `branchCount` counts soft-deleted (known follow-up). |
| M4 | **Leads and Onboarding** (Operations) | Both onboarding channels; lead qualify to draft to handoff. | PARTIAL (self-serve + create-draft built; lead pipeline net-new) | BC-5 | `MerchantLead`/`MerchantSource` design-only. |
| M5 | **Merchant 360** (Relationships) | Full merchant workspace (Section 6.1). | PARTIAL (rich read substrate; many admin actions net-new) | BC-5, BC-2, BC-4 | Cross-check table Section 6.3. |
| M6 | **Customer 360** (Relationships) | Full customer workspace (Section 6.2). | FUTURE (read substrate rich; zero admin surface today) | BC-4, BC-5 | PII/DPIA-heavy; Tier 3. |
| M7 | **Communications** (Relationships) | Per-entity comms/interaction timeline; delivery monitoring. | PARTIAL (per-merchant timeline built; broadcast net-new) | BC-1, BC-5 | Reuse timeline pattern (payload never selected). |
| M8 | **Tasks and Follow-ups** (Relationships) | Assignable tasks, reminders, next actions. | FUTURE (net-new schema) | BC-5 | Reference patterns: claim, `lastStaleAlertAt`. |
| M9 | **Account Health** (Relationships) | Merchant/customer health and risk signals. | FUTURE (net-new; Redeemo-owned) | BC-5 | Source signals Redeemo-only; build in-house. |
| M10 | **Reviews Moderation** (Trust and Safety) | Action reported reviews; hide/resolve. | FUTURE (data exists, no consumer) | BC-2 | `ReviewReport`/`isReported` dead-ended today. |
| M11 | **Fraud and Redemption Reversals** (Trust and Safety) | Fraud telemetry review; reverse/void a redemption. | FUTURE (reversal is schema-gated) | BC-3 (reversal); telemetry review is a T&S read surface | `RedemptionScreenshotEvent` unseen; `Review.redemptionId` coupling. |
| M12 | **Media/Photo Review** (Trust and Safety) | Review and apply branch media changes. | ENGINEERED apply lane (relocate); scanner + count-cap net-new | BC-2 | Photo apply built (PR #313); scanner is a stub, bypassed by design. |
| M13 | **Suggested-tag Moderation** (Trust and Safety) | Approve/reject merchant-suggested tags. | FUTURE (net-new BOTH intake and outlet) | BC-2 | Live discovery consumer of `status=APPROVED` with NO producer; net-new both ends. |
| M14 | **Support and Cases** (Support and Cases) | Case queue and lifecycle. | FUTURE / build-vs-integrate | BC-5 | `SupportTicket`/`MerchantRequest` frontend-stub-only; Zoho direction. |
| M15 | **DSAR / Data Requests** (Support and Cases) | Data-subject request intake, export, erasure, SLA. | FUTURE / GATED (legal) | BC-4 | Self-serve anonymise exists; admin DSAR net-new. |
| M16 | **View-as (read-only)** (Support and Cases) | Audited read-only lens on a merchant/customer account. | GATED (security) | BC-5 | Never write-impersonation. |
| M17 | **Campaigns / Featured / Trending / Promo / Subscriptions-Billing-Refunds** (Growth and Commercial) | Commercial operations and monetisation control. | FUTURE / GATED (provider/billing) | BC-1 (payment health) | Models exist, no admin surface; `FeaturedMerchant` discovery does not gate on `paymentStatus` (integrity fix). |
| M18 | **Content and Taxonomy** (Content and Taxonomy) | Taxonomy CRUD; versioned legal/FAQ; announcements. | PARTIAL / GATED / EXTERNAL (see BC-2) | BC-2 | `CmsContent` unwired; legal external. |
| M19 | **Insights and Reporting** (Insights and Reporting) | Platform analytics reusing Insights foundation as reference. | FUTURE (NOT BUILT; foundation is a reference) | BC-1, BC-4 | Operational aggregates un-gated; behavioural DPIA-gated; separate authz/privacy/architecture review. |
| M20 | **Admin Users and Roles** (Platform) | Create/invite/deactivate admins; role assign; bootstrap; grant outcomes. | FUTURE (enforcement built; CRUD/grant/bootstrap net-new) | BC-5 | `AdminCapabilityGrant` design-only. |
| M21 | **Global Audit / Activity Explorer** (Platform) | Query audit by actor/entity/event across the platform. | FUTURE (net-new; only per-merchant timeline exists) | BC-3 | Sequence EARLY (oversight backstop). |
| M22 | **Operational Status** (Platform) | Bounded in-app status (BC-1); five-layer source / config / runtime / account / observability classification; dynamic states (healthy / degraded / down / unverified / external / gated / unavailable). | PARTIAL (substrates + REUSABLE signals exist; the Admin read APIs and panels are net-new) | BC-1 | v1 bounded read panels + per-panel responsible-role + runbook / provider deep-link; Incident model, history, ack/mute, worker-heartbeat, dependency-health, deployed-SHA/version are net-new; today's Web-down state is an evidence snapshot (Section 17), not the design. |
| M23 | **Feature flags / config** (Platform) | Read/observe config and gate state (approved booleans / labels only, never values or secrets). | FUTURE (minimal); config is env-only today (no config table), read-side net-new | BC-1 | Toggle-in-UI is a later decision. |
| M24 | **Notifications / bell** (Platform) | Personal admin alert feed; preferences. | ENGINEERED bell (relocate); preferences net-new | BC-1 | Three reserved alert enums unemitted (`ADMIN_DELIVERY_FAILED`/`_OWNER_EMAIL_BOUNCED`/`ADMIN_REVIEW_ASSIGNED`). |

---

## 6. Merchant 360 and Customer 360

### 6.1 Merchant 360 workspace

A full workspace, not a directory row or an approval record. Panes and their substrate:

| Pane | Substrate today | Status |
|---|---|---|
| Business / account profile + legal/commercial identity | `Merchant` (SENSITIVE vs DIRECT field split, `profile/service.ts:8/16`) | ENGINEERED read; edit per authority matrix |
| Owner, accountable signatory, contacts | `MerchantMembership` (OWNER), `MerchantAdmin` | ENGINEERED read (owner/contacts); accountable-signatory identity/authority-to-bind fields are net-new (see 8.4); ownership transfer net-new |
| Branches, locations, verification, hours, amenities, media | `Branch` (+`LocationConfidence`), `BranchOpeningHours`, `BranchAmenity`, `BranchPhoto` | ENGINEERED read; many admin edits NOT-YET-SUPPORTED (Section 6.3) |
| Vouchers/offers, terms, status, approval history, performance | `Voucher` (+RMV), approval lane | ENGINEERED read/approve; custom-voucher admin edit not supported |
| Redemptions and operational exceptions | `VoucherRedemption` (join via `branch.merchantId`) | Read; no admin per-merchant redemption viewer today |
| Staff, Branch Managers, invitations, roles, branch scope | `MerchantMembership`, `BranchUser` | Merchant-managed (OWNER-only); no admin management today |
| Documents, agreements, versioned acceptance/signature evidence | `MerchantDocument`, `MerchantContract` (method/version/timestamp/IP) | Docs admin-managed (SUPER_ADMIN); signature read-only; evidence thin (Section 8.4) |
| Notifications, communications, relationship timeline | `AuditLog + CommunicationLog + Notification` (timeline pattern) | ENGINEERED read (per-merchant) |
| Support cases, internal notes, tasks, follow-ups | net-new (CRM, Section 7) | FUTURE |
| Subscription, billing, commercial context | absent both sides | FUTURE / GATED |
| Insights / reporting, account health | `merchant/insights/*` (merchant-view only) | NOT-BUILT for admin; reference-reusable |
| Lifecycle status, audit history, outstanding work | `MerchantStatus`/`OnboardingStep`/`AuditLog`/`AdminApproval` | ENGINEERED |

### 6.2 Customer 360 workspace

Read substrate is rich and needs no schema change; every admin surface, capability and mutation is net-new; the module is PII/DPIA-heavy (Tier 3).

| Pane | Substrate | Status |
|---|---|---|
| Profile, identity, contact | `User` (email, phone, DOB, gender, address, geo, status) | Read substrate ENGINEERED; no admin route |
| Subscription, plan, cycle, promo | `Subscription`/`SubscriptionPlan`/`PromoCode` | Read; mutation (grant/cancel/refund) net-new; admin-grant is Phase-5 plan-only |
| Redemption history, savings | `VoucherRedemption`, `UserVoucherCycleState` | Read (reuse savings aggregation) |
| Reviews and reports | `Review`/`ReviewReport`/`ReviewHelpful` | Read; moderation net-new (data-only) |
| Favourites, interests | `FavouriteBranch/Voucher/Merchant`, `Interest/UserInterest` | Read |
| Devices, sessions, SSO | `UserSession`, `UserSsoProvider` | Read; admin session-revoke net-new |
| Comms, in-app messages | `CommunicationLog`, `Notification` (recipientType USER) | Read (payload NEVER selected) |
| Consent | `User.newsletterConsent`, `tcConsentVersion/At`, `marketingConsentAt` (coarse: one marketing boolean plus terms version) | Read; granular preference centre + consent-change history net-new |
| Lifecycle, DSAR | `UserStatus` (ACTIVE/INACTIVE/SUSPENDED/DELETED); self-serve anonymise-in-place | Admin lifecycle + DSAR net-new, GATED |

**DPIA facts, binding:** deletion is anonymise-in-place (`auth/customer/routes.ts:211-217`): scrubs email/phone/name/passwordHash, sets `deletedAt`+`status=DELETED`, but retains DOB, gender, address, postcode, precise lat/lng and consent. A Customer 360 will show retained fields on DELETED rows (intentional retention); any admin-initiated erasure must mirror or exceed the same scrub set, never silently widen retention. **Precise-geo prohibition (BC-4):** never plot `User.latitude/longitude`; `addressLine1/2` and full postcode are reveal-on-demand and audited, not default-shown. Any PII view/action writes an ADMIN audit row and is gated by a dedicated new capability (proposed `customer:read` / higher `customer:read-pii` / `customer:action`).

### 6.3 Merchant Portal capability cross-check (per capability: merchant vs admin-today)

Source-cited; drives the authority matrix (Section 9). Note column values: DIRECT, DIRECT+notify, PROPOSE, FOUR-EYES, PROHIBITED, NOT-YET-SUPPORTED.

| Capability | Merchant can do | Admin can do today | Disposition |
|---|---|---|---|
| Profile `websiteUrl` (DIRECT field) | Edit directly | DIRECT edit (`merchant:edit`, OPERATIONS) | DIRECT+notify |
| Profile `businessName/tradingName/description` (SENSITIVE) | Draft-window direct; else edit-request | PROPOSE via `merchant:propose-edit` to B1 lane | PROPOSE then FOUR-EYES |
| Profile `logoUrl/bannerUrl` (SENSITIVE media) | Upload (OWNER) | Rejected by B2.5 body; no route | NOT-YET-SUPPORTED |
| Identity `vatNumber/companyNumber` | Edit directly | DIRECT (`merchant:edit-identity`, SUPER_ADMIN, confirm:true) | DIRECT+notify (high bar) |
| `primaryCategoryId` | Set in onboarding; blocked once RMVs live | DIRECT (`merchant:edit-category`, SUPER_ADMIN; RMV re-provision) | DIRECT+notify (side-effecting) |
| Branch contact `phone/email/websiteUrl/isActive` | Edit directly | DIRECT (`merchant:edit`) | DIRECT+notify |
| Branch `address/name/city/postcode` (SENSITIVE) | Edit-request | No text route; only lat/lng pin-drop | NOT-YET-SUPPORTED |
| Branch create | OWNER; non-first stages BRANCH_CREATE approval | DIRECT create (`merchant:manage-branches`, SUPER_ADMIN) | DIRECT for admin; merchant path is FOUR-EYES |
| Branch close/soft-delete | close-request stages BRANCH_CLOSE approval | DIRECT soft-delete (guards) | DIRECT for admin; merchant path FOUR-EYES |
| Branch location (lat/lng) | Submit candidate token | DIRECT confirm (`branch:confirm-location`, OPERATIONS) | DIRECT (admin-owned) |
| Branch hours / amenities / photos / redemption-alerts | Manage directly (staged for hours/photos) | No admin route (photos reviewable via approval only) | NOT-YET-SUPPORTED |
| Branch redemption PIN | GET/PUT/send | Never returned to admin (redacted everywhere) | PROHIBITED |
| Custom (RCV) vouchers CRUD | OWNER / canManageVouchers | Admin covers RMV only; reviews go-live | NOT-YET-SUPPORTED (B5.2 future) |
| RMV flagship (edit allowedFields / submit) | create/edit/submit | Co-build: edit + submit (`merchant:manage-vouchers`) | DIRECT+notify; go-live stays FOUR-EYES |
| Voucher go-live | submit only | approve/reject/request-changes (`approval:action`) | FOUR-EYES |
| Onboarding submit / go-live | submit only | submit-on-behalf (B3) + approve via lane | submit DIRECT+notify; go-live FOUR-EYES |
| 12-month contract acceptance | click-to-agree (OWNER session) | No admin sign path | PROHIBITED (legal) |
| Verification documents | not merchant-facing (admin-only) | list/upload/delete (`merchant:manage-documents`, SUPER_ADMIN) | DIRECT+notify (admin-managed) |
| Staff and Access (invite/role/scope/deactivate) | OWNER-only | No admin route | NOT-YET-SUPPORTED (high-risk access) |
| Insights / reports | read-only role-gated | No admin route | NOT-YET-SUPPORTED |
| Redemptions log + validation | read + validate | No per-merchant admin viewer | NOT-YET-SUPPORTED |
| Merchant lifecycle suspend/reactivate | not self | DIRECT (`merchant:suspend`, OPERATIONS) | DIRECT+notify (high-risk) |
| Create draft merchant | self-register instead | DIRECT (`merchant:create-draft`) | DIRECT+notify |
| Billing / featured-payment | absent | absent | NOT-YET-SUPPORTED (both sides) |
| Ownership transfer / multi-owner | multi-owner exists; no self transfer | No route | NOT-YET-SUPPORTED (high-risk) |

Note on "FOUR-EYES" in this table: it denotes routing through the independent approval lane (a separate approval step: `approval:action` / `approval:apply-edit`), which today is single-actor claim-and-approve. Countersign by a DIFFERENT admin (true four-eyes / maker-checker) is NET-NEW (see Section 14 and BC-3); the term here does not assert dual-control exists.

---

## 7. CRM and relationship operations

Redeemo needs native relationship operations but is not a complete CRM today. Design separate but connected domains: Merchant Relationships (Merchant 360), Customer Relationships (Customer 360), Leads and Onboarding, Support and Cases, Tasks and Follow-ups, Communications, Account Health, Interaction and Audit History.

**Compose-on-existing (reference implementations exist):** interaction history and activity feeds compose on `AuditLog` (actor to entity to event, before/after, reason) plus `CommunicationLog` (delivery) plus `Notification` (in-app). The admin merchant timeline (`src/api/admin/timeline/service.ts`) is the working read-only reference (payload never selected). Reference patterns (do not over-claim reuse; both are hardcoded to the approval queue): assignment via `AdminApproval.claimedById` (atomic claim, release guard); follow-up via `AdminApproval.lastStaleAlertAt` (stale sweep). The eighth CRM domain, Interaction and Audit History, is deliberately realised as this composed timeline (M7) plus the Global Audit / Activity Explorer (M21), not a standalone module.

**Net-new schema (every stateful CRM primitive):** internal Notes (author-attributed, multi-entry, timestamped); Tasks/Reminders/Follow-ups (assignee, due, status, completion); entity-level Assignment/ownership on Merchant/Customer; Cases/Tickets; Segments/saved audiences; admin-internal Tags/flags (VIP, at-risk, do-not-contact); Account Health/risk scoring. None exist (verified grep). `SupportTicket`/`MerchantRequest` are customer-app frontend stubs only, backend deferred to the un-started Sub-PR 2.

**Build-vs-integrate gate (BC-5):** account health and segmentation are Redeemo-owned (source signals are platform-only) and should be built in-house. Support-ticketing and general prospect CRM are an explicit build-vs-integrate decision given the CLAUDE.md Zoho One direction. Do not lock a schema merely because these concepts appear in the prototype.

---

## 8. Onboarding channels and in-person agreement

### 8.1 Two shipped channels (build-on-code)

1. **Self-serve:** register to email-verify to auto-login (`auth/merchant/service.ts:548/654`), non-enumerating; creates Merchant(REGISTERED) plus first OWNER membership; terms consent recorded in audit metadata (not a column).
2. **Admin create-draft plus secure handoff:** `createMerchantDraft` NEVER sets a password (`passwordSetupRequired:true`, no token returned); owner claims via a single-use 7-day claim token (`issueMerchantClaim`; token never returned/logged). This is the secure owner handoff.

Both land on the same OWNER membership and the same uniform go-live checklist (`computeOnboardingChecklist`: >=1 branch, contract SIGNED, >=2 RMV). There is no expedited/fast-track bypass today.

### 8.2 Representative-assisted channel (DESIGN-ONLY; net-new)

A full representative-assisted channel should let an authorized operator: create and qualify a lead; record acquisition/referral source; create a merchant draft; record an in-person visit; capture business-verification evidence; capture business/owner/branch/contact info; configure branches; co-create vouchers with the merchant; prepare documents and agreements; initiate or complete permitted verification and approval steps; hand the account securely to the owner; continue managed/assisted service where agreed.

Net-new substrate required (all design-only or absent): `MerchantLead`, `MerchantSource` (+campaign/UTM), `Merchant.source`/`leadId`, an in-person visit record, field-verification provenance on `MerchantDocument` (capturedBy/at/geo), a risk-tier/expedite field, and `AdminCapabilityGrant` for per-actor verify/fast-track. Onboarding provenance taxonomy (self-serve / rep-assisted / admin-created / partner-imported) is recoverable today only from AuditLog event strings, not a queryable column.

### 8.3 Field verification and fast-track (POLICY decision)

A representative visit is EVIDENCE, not authorization. Today `verificationStatus=VERIFIED` is stamped only inside `approveApproval` (`approval:action`), which re-runs the go-live checklist and main-branch-location gate in-transaction; no rep-side write can flip it; FHRS/Companies-House/verification pre-score are absent (Google Places exists but only for branch geocoding). Present for owner decision: rep verifies and a separate Operations Admin approves; a specifically authorized senior representative verifies and approves lower-risk items; sensitive/legal/financial/high-risk always require independent approval; emergency/platform-risk actions follow a separate override policy. Do not mislabel the current claim/approve process as true four-eyes.

### 8.4 Agreement and signature (compare channels; do not approve one legally)

The owner or authorized signatory must personally accept/sign. Redeemo staff must never accept terms, sign as the merchant, set the merchant password, or become the accountable owner merely by creating the draft. (Verified hard rule: the only writer of `MerchantContract` + `contractStatus=SIGNED` is the merchant onboarding path, merchant-session-bound; admin code only reads it.)

Evidence captured today (`MerchantContract`, `signedAt` + `ipAddress` + `tcVersion` + `signatureMethod`; `@unique(merchantId)` = one acceptance): method (`SignatureMethod` = CLICK_TO_AGREE live; ZOHO_SIGN enum-only), version (client-supplied, not re-validated server-side), timestamp, IP. Absent (net-new): signatory name/title, authority-to-bind attestation, `userAgent` on the row, in-person/controlled-device context provenance (device, capture geo, in-person flag; cross-ref 8.2 field-verification `capturedBy/at/geo` so an in-person accept is distinguishable from a remote one), `contractEndDate` value never populated (the column exists on `Merchant` but the 12-month end is never materialised), versioned re-signature history (drop `@unique`), OTP-verified binding.

Acceptance channels to compare without legal approval: online checkbox/versioned acceptance; in-person e-sign on a controlled device; secure sign-link or OTP on the merchant's own device; external e-sign provider; paper/offline with verified upload. Every channel must route the actual accept through the merchant's own authenticated session (or a device sign-link/OTP proving merchant possession); the in-person section is "admin facilitates, merchant signatory personally attests", a net-new flow, not a reuse. Legal validity, identity assurance level and retention are separately gated legal/security decisions; the binding merchant legal text is external (`redeemo.co.uk/merchant-terms`).

---

## 9. Authority / action matrix

Model the matrix on the existing capability tiers and the `fnCore`/approval seams; do not invent a parallel scheme. Two locked invariants on every level: mandatory non-empty reason on the audit row; no weaker path (admin routes call the same shared core). Routine authorized support changes must not be forced through unnecessary merchant-approval delays; sensitive/legal/financial/ownership/high-risk-access/material-customer-impacting actions require explicit policy.

**Six authority levels (mapped to shipped capabilities):**

| Level | Meaning | Capability substrate (verified) |
|---|---|---|
| L0 READ | View entity/context | `merchant:read` (OPERATIONS + SUPER_ADMIN) |
| L1 DIRECT-LOW | Direct write, operational fields | `merchant:edit` (websiteUrl; branch contact/isActive), OPERATIONS |
| L2 DIRECT-HIGH | Direct write, higher bar | `merchant:edit-identity`, `merchant:edit-category`, `merchant:manage-branches` (SUPER_ADMIN; confirm where side-effecting) |
| L3 PROPOSE | Propose sensitive change into the pending-edit lane | `merchant:propose-edit` (SUPER_ADMIN proposes; never applies its own) |
| L4 INDEPENDENT-APPROVAL (target: four-eyes; today: single-actor claim-and-approve) | Approve/apply customer-impacting/lifecycle changes through the approval lane; today one admin can both claim and approve, so true countersign-by-a-different-admin is NET-NEW (see BC-3 and Section 14) | `approval:apply-edit`, `approval:action` |
| L5 LIFECYCLE/TAKEDOWN | Operational lifecycle, immediate effect | `merchant:create-draft`, `merchant:submit`, `merchant:suspend`, `branch:confirm-location` |

**Two policy-gated columns the matrix must surface as not-yet-buildable-without-decision:**

- **(A) LEGAL/FINANCIAL:** contract-sign-on-behalf and billing are PROHIBITED/ABSENT today; keep policy-gated or explicitly out of scope.
- **(B) ACCESS/OWNERSHIP:** admin staff-management and ownership-transfer are genuinely absent; each needs its own high-risk tier with step-up plus audit before any build. Never expose/set merchant passwords; owner transfer and role elevation require stronger controls; high-risk access changes require step-up. No decision is locked by the prototype.

Apply the matrix across: merchant profile and legal identity; branches and locations; vouchers and terms; staff/users, invitations and roles; documents; agreements; lifecycle; redemptions/reversals; billing/commercial; customer-impacting changes; and the representative-assisted onboarding actions (lead creation, in-person visit record, field-verification evidence capture) which default to outcome 4 (independent Redeemo approval), with any senior-rep fast-track as the D17-gated exception. The six-outcome authority classes to use per action: (1) Direct Admin action; (2) Direct plus merchant notification; (3) Admin proposal requiring merchant review/acceptance; (4) Independent Redeemo approval (four-eyes countersign by a DIFFERENT actor is NET-NEW; the approval lane is single-actor today); (5) Emergency/platform-safety override; (6) Prohibited. Do not let any level collapse a four-eyes/approval action into a direct edit; treat every NOT-YET-SUPPORTED row (logo/banner, branch address, hours/amenities/alerts, custom vouchers, staff management, insights, redemptions viewer, billing, ownership) as an explicit build-plus-policy decision, not an implicit tier extension.

---

## 10. Workflow and lifecycle maps

State machines the Admin Panel drives or reads (enums verified in schema):

- **Merchant:** REGISTERED to PENDING_APPROVAL to ACTIVE, ACTIVE to/from SUSPENDED/INACTIVE, to DELETED; cross-cut by `OnboardingStep` (REGISTERED, BRANCH_ADDED, CONTRACT_SIGNED, RMV_CONFIGURED, SUBMITTED, UNDER_REVIEW, APPROVED, LIVE, NEEDS_CHANGES, REJECTED, SUSPENDED) and `VerificationStatus`, `ContractStatus`. Registration, submission and lifecycle services also write Merchant state; the actioner owns the atomic approval/go-live transition, not the entire state machine.
- **Approval:** PENDING to (CHANGES_REQUESTED loop) to APPROVED/REJECTED, over ApprovalTypes MERCHANT_ONBOARDING / VOUCHER / MERCHANT_IDENTITY_EDIT / BRANCH_IDENTITY_EDIT / BRANCH_CREATE / BRANCH_CLOSE (plus MERCHANT_PROFILE_EDIT, a dead lane: listable but no applier; decision D12).
- **Branch:** triple-axis: `isActive` (reversible) vs `deletedAt` (soft-delete) vs `lifecycleStatus` (PENDING_CREATE, LIVE, PENDING_CLOSE, CLOSED), plus `LocationConfidence`.
- **Voucher:** DRAFT to PENDING_APPROVAL to ACTIVE, ACTIVE to/from INACTIVE, to EXPIRED; times `ApprovalStatus`; Model-1 approved-waiting nuance.
- **Subscription:** TRIALLING/ACTIVE/CANCELLED/EXPIRED/PAST_DUE (read today; admin mutation net-new).
- **Redemption:** create to validated; no reversal transition exists (net-new schema; mind `Review.redemptionId @unique ON DELETE SET NULL` coupling).
- **Lead (proposed):** NEW to CONTACTED to AGREED to INVITED to CONVERTED, or DEAD (design-only `MerchantLead`).
- **DSAR (proposed):** received to identity-verified to in-progress to export-produced/erasure-confirmed to closed, with SLA clock and audit (no model today).
- **Case (proposed):** open to in-progress to waiting to resolved to closed (net-new; or Zoho-integrated).

---

## 11. Screen and complete state inventory

Every screen handles the DoD state set: loading, empty, error, permission-denied, stale/conflict, success, destructive-confirmation, partial-data, responsive. The built spine handles most (error-vs-empty distinguished, invalidate-on-success-and-error, mandatory-reason plus confirm on destructive) but is desktop-only (responsive is the weakest area) and lacks Next `error/loading/not-found` boundaries.

| Module | Key screens | Built? | Critical states |
|---|---|---|---|
| Ops Home (M1) | landing, launch-readiness | net-new | loading skeleton; GATED-analytics empty; partial-data |
| Approvals (M2) | queue, review (5 dispatched panels), action bar/dialogs | built (evolve) | claimed-by-other read-only, orphan, gate-fail banner, destructive-confirm, signed-link-unavailable |
| Merchant Directory (M3) | list, filters | built (evolve) | empty, permission-denied, stale, responsive |
| Leads/Onboarding (M4) | lead board, lead detail, create-draft, assisted flow | partial | empty, SLA-aging, assignment conflict, handoff |
| Merchant 360 (M5) | workspace tabs (Section 6.1) | partial | partial-data ("not set"), cap-gated affordances, denial |
| Customer 360 (M6) | workspace tabs (Section 6.2) | net-new | permission-denied, PII reveal-on-demand, DELETED-row disclosure, DPIA notices |
| Communications (M7) | timeline, delivery monitor, broadcast | partial | delivery-failure list, dark-email notice |
| Tasks (M8) | task list, task detail | net-new | empty, overdue, reassignment |
| Trust and Safety (M10-M13) | moderation queues, media review, reversal | mixed | empty (no reports), destructive-confirm, schema-gated notice, review-coupling warning |
| Support/DSAR/View-as (M14-M16) | case queue, DSAR queue, view-as | net-new/gated | legal-gated notice, SLA clock, audited-read banner |
| Commercial (M17) | campaigns/featured/promo/subscriptions | net-new/gated | gated notice, paymentStatus integrity, date-bounded |
| Content/Taxonomy (M18) | taxonomy CRUD, legal, announcements | mixed | unwired notice, external-source-of-truth caveat |
| Insights (M19) | dashboards, reports | net-new/gated | default-off/fail-closed notice, suppression, "not available" |
| Platform (M20-M24) | admin users, global audit, ops status, flags, notifications | mixed | last-owner guard, empty-role default views, step-up, EXTERNAL link-out |

---

## 12. Existing-capability relocation contract ("nothing silently discarded")

**Mechanism (operationalized, verifiable):**

- **Reproducible inventory (source of truth):** every `requireAdminCapability('X')` literal in `src/api/admin/**` (15 capabilities); every `src/api/admin/**` route file (capability-gated files are subsumed by their capability rows in 12.1; the capability-free recipient-scoped notification route file, and the admin-auth backend that backs the login frontend, are dispositioned explicitly in 12.4); and every `apps/admin-web` page/module (the `lib/` data-access clients/hooks and shared `components/ui` primitives + `providers.tsx` relocate WITH the page/feature-module they serve, not silently dropped). Countable and grep-anchored.
- **Two-way set-equality invariant:** every source capability has at least one disposition, and every disposition names its source; the completeness check is set-equality (no source unmapped, no disposition orphaned). Split/merge is allowed.
- **Disposition values:** RETAIN-IN-PLACE, RETAIN-BUT-REDESIGN, MOVE, SPLIT, COMBINE, SUPERSEDE (requires reason plus replacement), DEAD-ENDED (substrate-only: forces a build-both-sides or scope-out decision).

### 12.1 Backend capability inventory (15) to module

| Capability | Purpose | Target module | Disposition | Boundary |
|---|---|---|---|---|
| `merchant:read` | read merchant/directory/detail/docs-view/RMV-view | M3, M5 | RETAIN-BUT-REDESIGN | BC-5 |
| `merchant:create-draft` | create draft merchant | M4 | MOVE (into Leads/Onboarding) | BC-5 |
| `merchant:submit` | submit-on-behalf | M4, M5 | RETAIN-BUT-REDESIGN | BC-5 |
| `merchant:suspend` | suspend/reactivate | M5 | RETAIN-BUT-REDESIGN | BC-5 |
| `merchant:edit` | direct-low edits | M5 | RETAIN-BUT-REDESIGN | BC-5 |
| `merchant:edit-identity` | vat/company (SUPER_ADMIN) | M5 | RETAIN-BUT-REDESIGN | BC-5 |
| `merchant:edit-category` | category (SUPER_ADMIN) | M5, M18 | SPLIT (edit vs taxonomy admin) | BC-2, BC-5 |
| `merchant:manage-branches` | branch create/soft-delete | M5 | RETAIN-BUT-REDESIGN | BC-5 |
| `merchant:propose-edit` | propose sensitive edit | M5 | RETAIN-BUT-REDESIGN | BC-5 |
| `merchant:manage-documents` | doc upload/delete | M5 | RETAIN-BUT-REDESIGN | BC-5 |
| `merchant:manage-vouchers` | RMV co-build | M5 | RETAIN-BUT-REDESIGN | BC-5 |
| `branch:confirm-location` | lat/lng pin-drop | M5 (+ coverage read informs M22/BC-4) | SPLIT | BC-4, BC-5 |
| `approval:read` | queue/review read; per-merchant timeline | M2, M7 | SPLIT (queue vs timeline) | BC-5 |
| `approval:action` | claim/approve/reject/request-changes; voucher | M2 | RETAIN-BUT-REDESIGN | BC-3 |
| `approval:apply-edit` | apply pending/branch-lifecycle edits (incl. photos) | M2, M12 | SPLIT (edit vs media review) | BC-2 |

### 12.2 Admin-web surfaces to module

| Surface | Target | Disposition | Boundary |
|---|---|---|---|
| `(auth)/login` (email OTP) | Platform/Auth shell | RETAIN-BUT-REDESIGN (session model = separate decision) | BC-5 |
| `(app)/page` (redirect to /queue) | M1 Ops Home | SUPERSEDE (reason: a redirect is not an approved homepage; replaced by role-aware Ops Home) | BC-1 |
| `queue` list | M2 | RETAIN-BUT-REDESIGN | BC-3 |
| `queue/[id]` (5 type-dispatched panels) | M2 (+ M12 media) | SPLIT/RETAIN-BUT-REDESIGN | BC-3, BC-2 |
| `merchants` list | M3 | RETAIN-BUT-REDESIGN | BC-5 |
| `merchants/[id]` detail + edit-on-behalf | M5 | SPLIT (tabs) / RETAIN-BUT-REDESIGN | BC-5 |
| `merchants/new` | M4 | MOVE | BC-5 |
| `features/queue`, `features/review`, `features/merchants`, `features/timeline`, `features/shared` | M2/M5/M7 | RETAIN-BUT-REDESIGN | BC-3, BC-5 |
| `notification-bell`, `admin-shell` | Platform shell (M24) | RETAIN-BUT-REDESIGN | BC-1 |

### 12.4 Capability-free / foundational backend route files to module

Backend route files that carry no `requireAdminCapability` gate (so they are not subsumed by a 12.1 capability row) but back a mapped frontend:

| Backend route file | Purpose | Target module | Disposition | Boundary |
|---|---|---|---|---|
| `src/api/admin/notifications/routes.ts` (4 recipient-scoped endpoints, no `requireAdminCapability`) | admin notification read API (list / unread-count / read / read-all) | M24 | RETAIN-BUT-REDESIGN | BC-1 |
| `src/api/auth/admin/routes.ts` (login / otp-verify / refresh / logout / forgot / reset) | admin auth backend behind the `(auth)/login` frontend | Platform / Auth shell (M20 + shell) | RETAIN-BUT-REDESIGN (session model = separate decision, D4) | BC-5 |

### 12.3 DEAD-ENDED substrate (must be dispositioned, not discarded)

| Artifact | State | Disposition | Boundary |
|---|---|---|---|
| `MerchantSuggestedTag` (status enum) | live discovery consumer of `status=APPROVED`, but NO intake writer AND no admin outlet | DEAD-ENDED: M13 (build both ends) or scope-out | BC-2 |
| `ADMIN_DELIVERY_FAILED`, `ADMIN_OWNER_EMAIL_BOUNCED`, `ADMIN_REVIEW_ASSIGNED` (NotificationType) | reserved, no emitter (REVIEW_ASSIGNED also needs an assign-flow) | DEAD-ENDED: M22/M24 (delivery/bounce) + M8/M21 (review-assigned) or scope-out | BC-1 |
| `RedemptionScreenshotEvent` (fraud telemetry) | written, no admin consumer | DEAD-ENDED: M11 (build review) or scope-out | BC-3 |
| Reversibility (`AuditLog` before/after) | data exists, no revert engine | DEAD-ENDED: M11 (build revert) or scope-out | BC-3 |
| `MERCHANT_PROFILE_EDIT` (ApprovalType) | listable, no applier | DEAD-ENDED: M2 (remove or add applier; D12) | BC-3 |
| `CmsContent` (unwired), `RmvTemplate` (no version) | substrate present, gated/incomplete | GATED/NET-NEW field, per BC-2 | BC-2 |

The blueprint's implementation stage must render 12.1 and 12.2 as a full table proving set-equality (each source appears with at least one disposition; each disposition names a source). 12.3 forces the dangling artifacts into an explicit decision.

---

## 13. Gated and future register

Sub-typed: gated-by-decision (owner/legal) vs gated-by-dependency (net-new primitive). None is prototype-lockable.

| Item | Type | Shown vs withheld | Decision awaited / owner |
|---|---|---|---|
| Admin session/auth redesign (httpOnly/BFF) | by-decision | show secure-session OUTCOME; not implementation | security architecture |
| Step-up re-auth | by-dependency | show the re-auth gate outcome | security |
| Impersonation / view-as | by-decision | read-only audited view-as only | security |
| Redemption reversal schema | by-dependency | show reversal flow, label schema-gated | eng + owner |
| Customer/DSAR processing | by-decision + dependency | show DSAR queue; gate real PII/erasure | legal + owner |
| Analytics / privacy (behavioural/demographic) | by-decision | operational aggregates OK; behavioural DPIA-gated ("not available") | owner + legal |
| Payment/provider operations (billing/refunds/featured payment; Resend/FCM) | by-dependency + provider | show flows; label provider/billing-gated; fix `FeaturedMerchant.paymentStatus` | owner + provider |
| Deployment / `admin.redeemo.co.uk` + CORS + strict posture | by-decision | note as pre-launch gate | platform |
| `AdminCapabilityGrant` / per-person delegation | by-dependency | show grant OUTCOMES; note fixed-role cannot express per-person grants | authz |
| `MerchantLead`/`MerchantSource` / rep-assisted channel / fast-track / provenance | by-dependency (design-only-in-specs) | design as build-on-spec | owner + eng |
| CMS content / `CmsContent` wiring; legal content | by-decision | leave `CmsContent` unwired; legal external, owner/legal sign-off (hard launch gate) | owner + legal |
| Incident/StatusEvent model, ops-status history, alert emitters | by-dependency | v1 read panels only; Incident model gated | eng |
| Deployed-SHA / version endpoint (source-vs-deploy drift) | by-dependency | show version/drift when built; until then show external/unavailable, never fabricate | eng (platform/backend) |
| Dependency health (DB/Redis) beyond `/health` liveness; worker heartbeat | by-dependency | show liveness + external for real dependency health; heartbeat net-new | eng (platform/backend) |
| APM / error-monitoring / log aggregation | by-decision + provider | ABSENT today; deep-link out when adopted; never fake in-app | owner + provider |
| Support/case system | by-decision | build-vs-integrate (Zoho) | owner |
| Reserved alert emitters (`ADMIN_DELIVERY_FAILED`/`_OWNER_EMAIL_BOUNCED`/`ADMIN_REVIEW_ASSIGNED`) | by-dependency | smallest gated increment (delivery/bounce on email-enable; review-assigned needs an assign-flow) | eng |
| Membership / partnership / referral schemes (university/student D19; NHS/key-worker/community D20; referral/ambassador/creator D21; consumer waitlist D22) | by-decision | preserve as FUTURE ideas; NO prototype module/screen/eligibility-workflow/schema without owner approval; NHS/key-worker/community is owner-DEFERRED (D20); IA placement (dedicated module vs Growth-and-Commercial submodule vs Relationship-Operations submodule vs cross-module workspace) is undecided; every eligibility scheme carries the standard gate set (lawful basis, purpose limitation, minimisation, verification method, retention/deletion, access control + audit, fraud/abuse controls, DPIA screening) and needs Article 9 / legal-specialist review only if its chosen evidence collects or reveals special-category data | owner (+ privacy) |

---

## 14. Cross-cutting concerns

- **Observability of admin actions (Global Audit / Activity Explorer, M21):** genuinely absent (only per-merchant timeline). Sequence EARLY as the oversight backstop for bulk and delegated grants. `AuditLog` has actor/entity/event/before/after/reason; a global query endpoint is net-new.
- **Platform / infrastructure Control Room (BC-1 bounded status):** M22 presents safe summaries, status, freshness, responsible role, runbook and safe provider deep links; it is NOT an embedded replacement for Railway, Neon, Vercel, GitHub, Stripe, Resend or a future APM. Apply the five-layer classification (source / configured / deployed-runtime / provider-account / observability), keep infrastructure state separate from application-consumer state, and treat provider / runtime bindings as UNVERIFIED (owner-reported where applicable), never inferred. `/health` is liveness-only; DB / Redis dependency health, worker heartbeat, deployed-SHA / version and APM are net-new or external; the queue / outbox / keyring / notification substrates exist but their Admin read APIs are net-new. Provider credential / rollout operations (for example applying rotated Resend or Google keys to their verified consumer) are an incident / provider-operations workstream, not an Admin product surface.
- **Data-export safety (purpose-scoped, NOT one universal filter):** a cross-cutting minimum applies to every export (`CommunicationLog.payload` never selected; branch `redemptionPin` never exposed; PII minimised to the authorized purpose; every export audited). Beyond that, policy splits by purpose, each with purpose-specific authorization, minimisation, redaction and retention:
  - **Analytics / report exports** apply the Insights eligibility cleanliness (exclude `isTestData` on redemption+branch+merchant, QA emails, `User.status=DELETED`) plus cohort/privacy controls and suppression. These are analytics-cleanliness rules, NOT universal operational or legal rules.
  - **Operational / support exports** are scoped to the support purpose and may legitimately include test-owned or edge records that the analytics rule excludes.
  - **DSAR / legal / retention exports** MUST include the data subject's records even when `DELETED`/anonymised (that record is the point), governed by legal basis + retention schedule.
  - **Audit / incident exports** are audit-trail evidence, governed by incident/audit authorization.
  DELETED or test-owned records must not be universally hidden where the authorized purpose requires them. Two Merchant-side CSV exports exist, with different privacy and gating semantics: an operational redemption export (`/api/v1/merchant/redemptions/export.csv`, `src/api/merchant/redemptions/routes.ts`) and a DPIA-gated event-level Insights export (`/api/v1/merchant/insights/export.csv`, `src/api/merchant/insights/routes.ts`). Neither is an Admin export, and neither belongs to blueprint module M3 (Merchant Directory); a cross-cutting Admin export contract remains NET-NEW.
- **Notification preferences:** the admin bell exists; a per-admin mute/preference model is net-new; the three reserved alert enums (`ADMIN_DELIVERY_FAILED`/`_OWNER_EMAIL_BOUNCED`/`ADMIN_REVIEW_ASSIGNED`) have no emitter.
- **Segregation of duties as policy (not per-module):** the shipped approval submit/approve split is separate capabilities and workflow stages but NOT role/actor separation, maker-checker or four-eyes (both `merchant:submit` and `approval:action` are OPERATIONS-held with no submitter-vs-approver guard, so one OPERATIONS admin can submit, claim and approve the same item); different-actor countersign is net-new; money-sensitive actions follow the target SALES-initiates / FINANCE-processes split.
- **PII and DPIA:** dedicated customer capabilities, audited PII access, precise-geo prohibition, retention-on-deletion parity, behavioural/demographic fail-closed.
- **Security hardening outcomes (design the outcome, not an approved mechanism):** the outcomes are to reduce unattended-session risk, to require renewed assurance before destructive / lifecycle actions, and to restrict Admin access according to an approved contextual / network-access policy. Candidate controls may include idle-session timeout, step-up re-auth and IP allow-listing, but NO mechanism is selected by this blueprint; selection remains gated by D4 / D5 and the security architecture review.
- **Richer merchant identity, evidence and locality signals (net-new, proposed):** a fuller business / legal identity (company / VAT number, registered / head-office address distinct from branches, accountable-signatory record), sector-specific evidence document types with a required-document gate, post-live merchant monitoring (for example FHRS drop, Google closed / stale, voucher-floor breach), and per-locality supply-coverage / launch-readiness signals are net-new substrate and are proposed, not approved implementation.
- **Accessibility and i18n:** a11y basics are a DoD requirement (roles/labels/focus/keyboard); i18n is deferred (UK-only launch) but stated, not omitted.
- **Brand:** admin-web is neutral-brand today; brand alignment (borrow merchant-web tokens/fonts as a reference, keep admin density) is a separate design decision, not locked here.

---

## 15. Prototype scope and wave plan

Oversight and governance concepts visible early, without pretending their implementations are approved.

- **Wave 1 (foundation + spine):** global shell + role-aware Ops Home; Approvals/Review (relocated, redesigned, all lanes incl. media/photo); Merchant Directory; Merchant 360 (read + existing edit-on-behalf per the authority matrix); Global Audit / Activity Explorer + Admin Users and Roles (oversight-first, backend net-new but design-early); Operational Status (v1 read panels); Notifications.
- **Wave 2 (relationships + trust and safety + leads):** Customer 360; Leads and Onboarding (both channels, assisted flow design); Communications + Tasks + Account Health; Reviews Moderation, Suggested-tag Moderation, Fraud/Reversals (schema-gated); Support and Cases (build-vs-integrate framing); DSAR and read-only View-as.
- **Wave 3 (commercial + content + insights, mostly gated/future):** Campaigns/Featured/Trending/Promo/Subscriptions-Billing-Refunds; Content and Taxonomy (versioned legal/FAQ as EXTERNAL/GATED, taxonomy CRUD, announcements); Insights and Reporting (reuse foundation as reference; operational vs behavioural split); Feature flags/config.

Claude Design packaging (D14): one shared master blueprint/context, plus separate reviewable wave-specific prompt packs (not written yet). Oversight/governance concepts appear in Wave 1.

---

## 16. Decision register (status recorded per row)

Approved process decisions: D1, D2, D14. D20 is owner-DECIDED (FUTURE / DEFERRED, see below). All other rows are PROPOSED and separately gated. Provider credential / rollout actions (for example applying rotated Resend or Google keys) are deliberately NOT in this register: they are an incident / provider-operations workstream, not an Admin Panel product decision.

| # | Decision | Recommended default (proposed) | Gating |
|---|---|---|---|
| D3 | Impersonation vs read-only view-as | read-only audited view-as only | security |
| D4 | Admin session model (localStorage to httpOnly/BFF) | normalize up at build time; show outcome only | security architecture |
| D5 | Step-up auth before destructive actions | design the gate in | security |
| D6 | Admin analytics reuse + gating | reuse Insights foundation as reference; operational un-gated, behavioural DPIA-gated; separate architecture/authz/privacy review; denorm not a prerequisite | analytics/privacy |
| D7 | Redemption reversal | design; label schema-gated (mind review coupling) | eng + owner |
| D8 | Admin-user management + bootstrap + grants | design Settings/Admin-Users; env-gated bootstrap; grant OUTCOMES without locking `AdminCapabilityGrant` | authz |
| D9 | Lead pipeline scope | minimal lead-to-qualify-to-assign-to-convert; rep-assisted channel design | product |
| D10 | Commercial cluster + `FeaturedMerchant.paymentStatus` integrity | design future-labeled; fix the payment-status gate | provider/billing |
| D11 | Personas for prototype lenses | SUPER_ADMIN, OPERATIONS, SALES/LEAD in Wave 1; FINANCE/SUPPORT/CONTENT modeled, future | product |
| D12 | `MERCHANT_PROFILE_EDIT` dead lane | remove or add an applier | eng |
| D13 | Platform: `admin.redeemo.co.uk` + CORS + strict posture; DPIA-Q1 to DPIA-Q6 (the Insights DPIA questionnaire series, distinct from this D-register); staging admin-OTP inbox | owner/platform track | platform/legal |
| D15 | Support/case: build in-house vs Zoho integrate | decide via BC-5 | owner |
| D16 | Signature channels + evidence strengthening | owner/legal choose valid channels; add evidence fields; never an admin-signs path | legal + eng |
| D17 | Fast-track / rep-verify authority | owner policy (rep verifies, Ops approves; senior-rep lower-risk; sensitive always independent) | owner |
| D18 | Platform Manager persona / `AdminRole` extension | keep PROPOSED; do not imply an enum exists | authz |
| D19 | University / student membership + eligibility scheme | PROPOSED; default OUT of launch-v1; labelled FUTURE concept; eligibility is PII (standard eligibility-gate set applies); no prototype module/screen without approval | owner + privacy |
| D20 | NHS / key-worker / community partnership schemes | DECIDED: FUTURE / DEFERRED (owner); outside the current prototype; NO module, screen, eligibility workflow, schema or implementation now; preserved as a separate future idea; revisit only via a separate owner-approved partnership workstream | owner (decided) |
| D21 | Referral / ambassador / creator programme | PROPOSED; default OUT of launch-v1; net-new attribution + anti-abuse; reward is financial (FINANCE + provider) | owner |
| D22 | Consumer waitlist + acquisition attribution (customer-web + an Admin outlet) | PROPOSED; scope only if a waitlist launch is planned; consent + bot-mitigation on the public form | owner |
| D23 | Control Room v1 signal set for M22 | PROPOSED; ship REUSABLE read-side signals; show external / gated / unverified for the rest | owner + eng |
| D24 | Deployed-SHA / version endpoint | PROPOSED platform / backend outcome (low-cost, no PII); until built the prototype shows external / unavailable | eng |
| D25 | APM / error-monitoring adoption | PROPOSED provider / platform outcome; deep-link from M22; until then show absent / external | owner + eng |
| D26 | Email-send atomic limiter before enabling production Resend (cross-ref the SEC.1 pre-Resend item) | PROPOSED security / backend outcome; SMS already has an atomic limiter | eng |

---

## 17. Source and evidence appendix

**Source hierarchy (authority order):** (1) merged source (`origin/main` by SHA, base `37cc0f69`) = build-on-code; (2) approved owner decisions (D1/D2/D14 approved; D20 owner-decided FUTURE/DEFERRED; the rest proposed/gated); (3) approved specs/plans (strategy §4.2; onboarding design; actioner spec; Option B) = intended behaviour (note: `2026-06-07-merchant-admin-platform-strategy.md` is an uncommitted working-tree artifact, NOT part of the git baseline at `37cc0f69`; its content is accurate but treat it as working evidence, not a reproducible baseline source), with design-only-in-specs models (`MerchantLead`/`MerchantSource`/`AdminCapabilityGrant`/`TermsClause`) treated as build-on-spec, strictly weaker than build-on-code; (4) `docs/PROJECT-STATE.md` = current status (with its `[UNVERIFIED]`/NOT-ACCEPTED caveats); (5) roadmap Definition of Complete = the bar; (6) DPIA + runbooks = legal/provider gates, and runbook decisions can veto otherwise-buildable surfaces (`CmsContent` unwired per §12); (7) Codex checklists = read-only corroboration; (8) corrected audit + delta = working evidence base; (9) legacy `admin-panel-spec.docx` = discarded old-developer artifact, idea-input only (its "map all customers by home address" is a struck prohibited pattern).

**Key verified citations (base SHA `37cc0f69`):**

- Enabling-slice framing: `2026-06-14-admin-panel-actioner-design.md` §18.3, §1; strategy §2/§3/§4.2.
- Capability model: `src/api/admin/capability.ts:21-115`. Admin route groups: `src/api/admin/{approvals,merchants,branches,timeline,notifications}`. Admin-web: `apps/admin-web/app/**`, `features/**`.
- Photo apply ENGINEERED: `src/api/admin/approvals/editApplier.ts:96-104,217-245,501-517`; commits `45ac3773`, `2442f214` (PR #313).
- Insights foundation: `src/api/merchant/insights/{service.ts,eligibility.ts,routes.ts,gate.ts,london.ts,scope.ts}`; PR #331 `00582a6e`; behavioural gate `gate.ts:46-50`; branch join `eligibility.ts:180-184`.
- Merchant billing absent; admin contract-signing absent; staff-management-on-behalf absent; ownership-transfer absent: `src/api/merchant/**` (zero billing hits), `src/api/admin/merchants/routes.ts`, `onboarding/service.ts:168-191`.
- Signature evidence: `MerchantContract` (`schema.prisma:747-757`), `SignatureMethod` (`:409-412`), `acceptContract` (`onboarding/service.ts:168-196`).
- Onboarding channels: `auth/merchant/service.ts:548/654` (self-serve), `admin/merchants/service.ts:311` + `auth/merchant/service.ts:420/463` (create-draft + claim); `computeOnboardingChecklist` (`onboarding/service.ts:23`); VERIFIED stamp `approvals/service.ts:617`.
- Customer 360 substrate: `User` (`schema.prisma:102-164`), `Subscription`/`SubscriptionPlan`/`PromoCode`, `VoucherRedemption`, `Review`/`ReviewReport`/`ReviewHelpful`, `Favourite*`, `Interest`/`UserInterest`, `UserSession`, `UserSsoProvider`, `Notification`/`CommunicationLog`; self-serve anonymise `auth/customer/routes.ts:201-226`; consent fields `User.newsletterConsent/tcConsentVersion/tcConsentAt/marketingConsentAt`.
- CRM absence: no Note/Task/Assignment/Case/Segment/internal-Tag/health models; `SupportTicket`/`MerchantRequest` frontend-stub-only; reference patterns `AdminApproval.claimedById`, `lastStaleAlertAt`; timeline `src/api/admin/timeline/service.ts`.
- Ops-status signals: `src/api/app.ts:117`, BullMQ `getJobCounts` (never called), `CommunicationLog` status, `KeyringFingerprint`, `smsLimiter.ts`, `outboxReconciler.ts`, `claimStaleSweep.ts`.
- Coverage/geo: `Branch` geo + `Locality`/`Market`; prohibited `User.addressLine1/2/postcode/latitude/longitude/localityId`.

**Provider / configuration / runtime classification (reconciliation; evidence-dated).** Source wiring does not mean operationally live; a boot-required secret does not mean provider activation; a historical `/health` = 200 does not prove current variables or bindings. On current `main` the `/health` handler is `src/api/app.ts` and still returns a literal `{status:'ok'}` (liveness-only; the Section 5.0 `:117` citation is at base `37cc0f69`). Boot-required + placeholder-rejected secrets (`src/api/shared/env.ts` `REQUIRED_SECRETS`): `DATABASE_URL`, `ENCRYPTION_KEY`, `REDIS_URL`, the four JWT secrets, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the four `TWILIO_*` vars. Feature-gated / dark-by-default (`FEATURE_GATED_SECRETS`): `RESEND_API_KEY` (`EMAIL_ENABLED`), `R2_*` (`STORAGE_ENABLED`), `TURNSTILE_SECRET_KEY` (`CAPTCHA_ENABLED`). `GOOGLE_PLACES_API_KEY` is owner-CLI-only (not in the API required / gated set; consumed by `prisma/suggest-branch-pin.ts`). Owner-reported account state (not provider-inspected): Stripe and Twilio have no real production account (placeholders); R2 not activated; Turnstile a public / test placeholder. Among the external-provider values assessed during Phase 2A, Google Places and Resend were the only owner-confirmed real provider credentials, and both were rotated with replacements not yet applied to a verified consuming environment. That scope does NOT include internal / runtime credentials (Neon / database, `REDIS_URL`, the JWT secrets, the encryption key): those remain separate security-rotation workstreams, are NOT declared resolved by this blueprint, and are NOT implied to have been placeholders. Current stored secret values and runtime feature-variable states were not inspected during this reconciliation; they remain UNVERIFIED under the active provider / no-use holds; no inference is made from source wiring or historical deployment state.

**Deployment evidence snapshot (transient; dated 2026-07-01, owner-confirmed).** Railway Web = Failed / non-serving; worker = Offline; Web `/health` = HTTP 404; both GitHub auto-deploy controls disabled. An earlier `/health` = 200 is historical (a prior deployment), not current; Redis was owner-confirmed Online and untouched while its worker consumer is Offline (infrastructure state is separate from application-consumer state); no fresh Neon verification is permitted under the no-use hold. This is a point-in-time evidence snapshot for freshness only; it is NOT part of the permanent operating model and must be re-verified before reliance.

**Freshness caveat:** merged is the floor, not the bar. Only the engineered Admin enabling slice (the actioner / review / lifecycle / edit-on-behalf console) is merged-not-staging-accepted; most target blueprint modules are FUTURE, PARTIAL or GATED (not built). Deployed SHA, admin-web deploy state, staging admin-OTP delivery, `STORAGE_ENABLED`/`EMAIL_ENABLED` state, and the DPIA gate state were not inspected under the active provider / no-use holds and must be re-verified before reliance.

---

*End of blueprint. Status: design intent, pending owner and Codex review. No implementation authorized by this document.*
