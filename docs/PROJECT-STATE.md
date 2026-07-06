# Redeemo - Project State (canonical, living)

> **Read this first when resuming any Redeemo work.** This is the compact, claim-verified
> current-state index. It summarizes material facts and **links** to the detailed evidence
> (specs, plans, audits, governance, runbooks, the Merchant Portal roadmap). It deliberately
> does **not** copy per-PR histories or the large deferred archive. This document and the Merchant
> Portal roadmap are a **coordinated, cross-linked pair**: kept as separate PRs only for reviewability,
> but reviewed, approved, and merged together.
>
> **Freshness:** Merchant-programme lines re-verified against `origin/main` @ `a58db583` on **2026-07-05** (other programmes last verified @ `434ca4eb`, 2026-06-28). Lines without
> a fresh citation this pass are marked **[UNVERIFIED]** and must be re-checked before reliance.
> A modification date is **never** evidence of completeness - every claim is verified against
> the evidence appropriate to its type (below).

---

## 0. How to use this document

1. Read §1 (authority model) and §2 (Codex reconciliation) so you know which source wins for your question.
2. Read the programme section in §4 for the area you are working on; follow its links for depth. Do **not** load the entire deferred archive or every topic memory.
3. Before starting work, check §5 (cross-product invariants), §6 (open owner decisions), and §7 (warnings) for anything that blocks or constrains your task.
4. **"Built / merged v1" is not "complete."** Completion requires the Definition of Complete in the relevant roadmap (implementation + prototype fidelity or approved divergence + authz + privacy + tests + **staging acceptance** + responsive/a11y + docs + recorded deferrals).
5. After a PR merges, an owner decision lands, a warning is raised/cleared, a staging check runs, or a deferral opens/closes, **update this document** per §9 and add a change-log line.

---

## 1. Fact-type authority model (authority depends on the question)

| Question | Authoritative evidence (in order) | Conflict rule |
|---|---|---|
| **What is actually MERGED** | `origin/main` → Git history → merged PRs (by SHA) | the merged truth. A **local working tree is never authoritative.** |
| **What is actually DEPLOYED** | provider deployment SHA/config + live probes (Vercel/Railway dashboards, `/health`) - **verified separately from merged state** | deployed may lag merged; record both. A local working tree is never authoritative. |
| **What behaviour was approved / intended** | explicit owner decisions → the latest approved governing spec/plan | **if merged source ≠ approved spec → record an implementation/contract conflict.** Do **not** treat shipped source as the intended truth merely because it ships. |
| **What should happen next** | this document (§4/§6/§8) → the approved programme roadmap(s) | latest approved supersedes earlier |
| **Warnings / incidents / tests / provider state** | verified logs, runbooks, CI config, live probes → the Codex checklists (§2) | verify against the live artefact; the checklist corroborates |
| **What Claude remembers (private memory)** | private memory (`MEMORY.md` + `project_*.md`) | **discovery/index aid only** - never overrides merged source, deployed state, or owner decisions |

## 2. Read-only Codex reconciliation protocol

Codex maintains three external workflow checklists. Claude (and any agent) may **read** them to discover missing decisions, warnings, deferrals, PR history, and owner instructions, and to cross-check this document. Claude must **never** edit, append to, rename, reorganize, delete, or assume maintenance of them - **Codex alone owns them.**

| Checklist | Path | Scope |
|---|---|---|
| Customer App | `/Users/shebinchaliyath/Documents/Playground/redeemo-notes/2026-05-20-customer-app-workflow-checklist.md` | Customer app/website history, deferrals, PR history |
| Admin/Merchant Vol-1 | `/Users/shebinchaliyath/Documents/Playground/redeemo-notes/2026-05-23-admin-merchant-portal-workflow-checklist.md` | Admin + Merchant portal, decisions, PR history |
| Admin/Merchant Vol-2 (continuation) | `/Users/shebinchaliyath/Documents/Playground/redeemo-notes/2026-06-27-admin-merchant-portal-workflow-checklist-continuation.md` | Insights, G1, PR #328, recent decisions/warnings |

They are **cross-check evidence, not authority over merged source** - each checklist itself trails its programme, so a checklist line is verified against `origin/main`/specs before reliance. Reconciliation is **one-way (read-only)**: record the reconciliation date + any unresolved deltas in §10; never write back.

**Last Codex reconciliation:** 2026-06-28 (all three read; no deltas that change the merged-state claims below; the checklists were not modified by Claude).

---

## 3. Repository pointers (merged & deployed truth)

- **Merged:** `origin/main` @ `a58db583` (latest merge: voucher nullable-clear #373). Verify any "merged" claim with `git log`/the PR.
- **Deployed (staging, provider URLs used as staging):** customer/admin/merchant apps on `*.vercel.app` (all HTTP 200 on the 2026-06-28 probe; re-probe before reliance); backend + worker on Railway env `redeemo/staging` (`web-staging-bf7c.up.railway.app/health` → 200). **Custom domains `merchant.redeemo.co.uk` / `api.redeemo.co.uk` are NOT provisioned.** Exact deployed SHA = verify in the Vercel/Railway dashboards (not readable read-only). **Merged ≠ deployed:** the deployed SHA may lag `origin/main`.

---

## 4. Programme status index

Status keys: **MERGED** (on `origin/main`) · **NOT-ACCEPTED** (merged, no authenticated staging acceptance) · **PARTIAL** · **PLACEHOLDER** · **NOT-STARTED** · **DEFERRED** · **OWNER-GATED** · **LEGAL-GATED** · **PROVIDER-GATED**.

### 4.1 Customer App + Customer Website
**Status (per CLAUDE.md build-progress, the customer-app closure memories, the Customer App Codex checklist, and merged PRs):** extensive surfaces MERGED - auth/onboarding, Home/Discovery/Search/Categories/Map, Voucher Detail M1-M5, Merchant Profile, Savings, Favourites (branch-level), Profile tab, QR rendering, §DF location fallback, locationContext parity, Home visual system + sticky header + bottom nav. Redemption is mobile-only by design; website has no redemption.
**Verification status:** summarized from the existing records above; **not exhaustively re-claim-verified this pass** (this pass was Merchant-focused) - **[UNVERIFIED at line level]**; run claim-level re-reconciliation at the next Customer App programme switch.
**Detail/links:** root `CLAUDE.md` Phase 3 sections; `docs/customer-flow-current.md` + `docs/customer-flow-changelog.md`; customer-app closure memories; Customer App Codex checklist (§2 - note it itself trails, last Codex update 2026-06-13, so verify its lines against `origin/main` too). Deferrals: §8 + the deferred archive.

### 4.2 Merchant Portal - **active programme**
**Merged (verified 2026-07-04 against `origin/main` + specs):** M0 scaffold, M1 auth/session, M2 onboarding (+ flagship bridge), M3 redemptions + Validate-a-code, M4 notifications, Day-2 Vouchers, Staff & Access, Branches PR1-PR8, **Insights operational** (#329-#333), **global-shell consolidation** (#364, squash `8c4258ba`: active-route highlight, role fail-closed nav incl. least-privilege baseline, 72px collapse + narrow bottom tab bar, account menu + logout confirm, Quick Actions launcher with guarded PIN routing, notification deep-links voucher/redemption, honest placeholder routes for the 5 former dead links, favicon + middleware static-asset exemption, additive viewerCapabilities {canManageVouchers, role, displayName}). All **NOT-ACCEPTED** (no authenticated staging acceptance yet).
**Also MERGED 2026-07-04:** #365 (squash `cda007f7`) - the PR-G1b deterministic local Playwright browser-smoke lane (enforced dead-port + route-mock safety boundary); its CI job is ADVISORY - promotion to a required check is a separate owner decision. Smoke-count metrics restated honestly 2026-07-05: the lane shipped with 17 RUNTIME tests from 15 STATIC test() call sites (roles.spec.ts parametrizes one site over three role fixtures); the earlier "corrected 17 to 15" note conflated the two metrics - the original 17 was the honest runtime count. After #372 the lane runs 26 runtime tests from 24 static call sites. #366 (squash `1eb2b382`) - Vouchers V1 builder parity (terms clause checklist wired to the tested engine, voucher photo upload with storage-dark degrade, custom cooldown, window presets + end date, honestly-constrained saved photo/end-date removal with the nullable-clear contract recorded as a gated follow-up). #368 (squash `8621c9a1`) - Redemptions fidelity slice: Voucher select filter (flagship + custom sources merged with partial-source resilience via allSettled), sort control (Newest first / Biggest saving) with a deterministic total order shared verbatim by list AND CSV export (every orderBy branch ends in the unique PK tie-breaker), and code-or-voucher-title search (normalized-code prefix OR case-insensitive title, inside the untouched tenant/branch-scope where). No Merchant module is claimed COMPLETE: authenticated staging acceptance remains OUTSTANDING portfolio-wide.
**Also MERGED 2026-07-04/05 (wave 3):** #371 (squash `2945bf78`) - staff remove-member confirm-flow page-level integration coverage (test-only; 9 pins incl. scrim/Escape dismissal of the shared Dialog primitive; Opus fault-injection verified 8/8 mutations caught). #370 (squash `29f1801e`) - the nullable-clear design spec + implementation plan pair (docs-only; D1-D3 subsequently owner-APPROVED). #372 (squash `194654a5`) - smoke-lane journeys for redemptions filters (incl. a real-browser allSettled partial-source case), staff access, and notifications, plus a count-bounded expected-console-error guard contract (exact-count two-sided, waitForResponse 500 proof; strict zero-error default preserved for non-opt-in specs). #373 (squash `a58db583`) - the voucher nullable-clear implementation (explicit null clears saved imageUrl/expiryDate on the DRAFT-only merchant PATCH; independent per-field checks pinned both directions; end-date UI stays TIME_LIMITED-only; both obsolete constraint-copy strings deleted; RMV lane byte-identical; no migration).
**Gated / not-done:** Insights behavioural + event CSV = **LEGAL-GATED** (default-off, fail-closed); Insights demographics = **LEGAL-GATED + NOT-STARTED**; Home Live dashboard = **PLACEHOLDER/OWNER-GATED**; Home Staff view = **NOT-STARTED/OWNER-GATED**; Business-profile settings, My Account, Help & Support = **NOT-STARTED**; Promote, Payments & Billing = **NOT-STARTED/PROVIDER-GATED**; global-shell gaps CLOSED by #364 (logout-confirm, active-route highlight, notification deep-links, Quick-Actions launcher placement, responsive collapse/tab bar, favicon); View-as lens NOT built - the prototype itself labels it "Prototype control only. Not part of the live portal." (owner to record the drop; same for the Demo switcher).
**Corrections that must be preserved:** Staff/BM **can** authenticate into the portal (only the lean Staff Home is unbuilt); Branch PIN reveal has a guarded backend route + on-demand `PinCard` (Quick-Actions placement RESOLVED + merged in #364 - the launcher deep-links to the on-page PinCard; remaining gap = extend the quick action to eligible assigned Branch Managers once a per-branch capability signal exists); the three Vercel apps are already deployed (do not propose new blank-slate Vercel projects).
**Detail/links:** **`docs/superpowers/roadmaps/merchant-portal-programme-roadmap.md`** (the full module/screen/role/lifecycle/shell/conflict/gap/gate map + Option-C sequencing + Definition of Complete); merged specs/plans under `docs/superpowers/specs|plans` (M0-M4, Day-2 vouchers, staff-access, branches PR1-8, Insights); `docs/superpowers/governance/2026-06-27-insights-dpia/`; Admin/Merchant Codex checklists (§2).

### 4.3 Admin Panel
**Status (per CLAUDE.md + the admin closure memories + the Admin/Merchant Codex checklists + merged PRs):** `apps/admin-web` actioner console M0-M8 MERGED (challenge-bound OTP, two-step login, notification foundation + emitters, approval queue, review-context, action UI, lifecycle/confirm-location, comms/activity timeline); admin follow-ups WP1-WP5 + Option B B1 (pending-edit applier) MERGED.
**Verification status:** summarized from the records above; **not exhaustively re-claim-verified this pass** - **[UNVERIFIED at line level]**; re-reconcile at the next Admin programme switch.
**Detail/links:** the admin memories; Admin/Merchant Codex checklists (§2); merged admin PRs.

### 4.4 Cross-product / platform
Backend (Node 24), Prisma 7 + Neon, Stripe/Twilio/FCM; **Resend is WIRED in code** (`src/api/shared/email.ts` imports + wraps the SDK) but **dark by default** (EMAIL_ENABLED off = no client construction, no send; EMAIL_SANDBOX rewrites recipients to an allowlist; production sender/domain/channel NOT enabled per runbook §6 - live production email UNVERIFIED); Redis; **storage (R2) is a feature-flagged capability** (`src/api/shared/storage.ts`; STORAGE_ENABLED off by default so presigning throws STORAGE_NOT_ENABLED; R2 secrets only required when enabled - configured/enabled state UNVERIFIED, not inferable from source). Pre-launch SECURITY/LEGAL/DOMAIN gate code-complete (`2a221522`, PR #170). See §5 for invariants, §6 for open decisions.

---

## 5. Cross-product decisions & invariants (visible regardless of programme)

> One-home-per-fact: rows here are the **decision record**; the canonical operative wording
> of instruction-type invariants (style, Node policy, workflow tiers, git safety) lives in
> the root `CLAUDE.md` (and its `.claude/rules/`), which is the always-loaded instruction
> surface. If wording drifts, `CLAUDE.md` wins for "how to behave"; this doc wins for "what
> was decided".

- **Branch-first cardinality** (one tile per branch; favourites/heart = branch). Locked across discovery + favourites.
- **Domain (owner):** Redeemo does **NOT** own `redeemo.com`; canonical = `redeemo.co.uk` (apex web), `api.redeemo.co.uk` (API, D-B), `merchant.redeemo.co.uk` (portal, D-C), `admin.redeemo.co.uk` (admin). `www`→apex 308 (D-E). Phase-6 email sender policy D-F: the Resend client is **wired in code** (see §4.4) but **production email sending stays dark/not-enabled** until the sender-domain is verified + SPF/DKIM/DMARC + provider + monitored inboxes + the runbook §6 pre-send gates are met. Universal-link/DNS (D-D) still open.
- **Subscription gates redemption; monthly cycle is subscription-anchored** (`getCurrentCycleWindow`), not calendar-based.
- **Style:** no emojis, no em-dashes (use `:` `;` `()` `·`); real brand hexes via tokens (red `#E20C04`, coral `#E84A00`, navy `#010C35`, cream `#FFF9F5`).
- **Node policy:** backend/CI/Railway = Node 24; customer-app (jest-expo) = Node 20.19.4 (do not bump without re-verifying jest-expo).
- **Insights eligibility cleanliness:** exclude `isTestData` (redemption+branch+merchant), QA emails, `User.status='DELETED'`; `VoucherRedemption` has **no `merchantId`** (joins via `branch.merchantId`).
- **Workflow tiers** (0-3) + plan-first discipline for Tier 2/3; git-safety hooks (no broad-add, no push-to-main, SHA-bound `gh pr merge`).
- **Authority model (this doc §1) is itself a cross-product invariant.**

---

## 6. Genuine open owner decisions

| Decision | Programme | Consequence | When |
|---|---|---|---|
| Documentation architecture migration (A+C) next steps (slim CLAUDE.md; memory hygiene) | platform | continuity reliability | after this docs foundation |
| Home Live dashboard: on Home (prototype) vs in Insights (source) | Merchant | build a Home dashboard + analytics contract, or keep pointer | before "not-started surfaces" wave |
| Staff Home: build the lean staff home or formally drop | Merchant | build vs mark superseded | same |
| Quick-Actions launcher + PIN-reveal placement | Merchant | RESOLVED by prototype authority in #364 (launcher routes to the guarded on-page PinCard; no inline reveal) - close formally | done (record) |
| View-as role lens: build or drop | Merchant | prototype marks it "Prototype control only. Not part of the live portal." - recommend recording DROP | record |
| Redemption reversal: build (prototype) or keep deferred | Merchant | audit/data-integrity implications | Redemptions slice |
| CI Postgres service + strict-loopback guard | platform/G1 | enables the security test gate | G1a1 |
| Add `@playwright/test` | platform/G1 | CLOSED 2026-07-04: owner-authorized, merged in #365 (advisory lane); the REMAINING decision is promotion of the smoke lane to a required check | closed (promotion open) |
| Seed strategy for the 53 seed-dependent integration suites | platform/G1 | seed disposable DB vs refactor to self-seed | G1a expansion |
| Insights gate-open (D1/D5) + demographics (D2-D4) | Merchant/legal | unblocks behavioural/CSV/demographics | parallel legal track |
| Promote / Payments provider + billing/PCI | Merchant | unblocks commercial modules | before commercial wave |
| Custom-domain provisioning (merchant/api/admin) | platform | trust/launch | pre-launch |
| Apple IAP for iOS subscriptions (Stripe cannot be used in the iOS app; model is IAP-ready via nullable Stripe fields) | Customer/platform | gates the entire in-app subscribe-purchase surface | before mobile subscription launch |
| Subscription `source` enum (STRIPE/APPLE/GOOGLE/ADMIN) + admin-grant flow | Customer/Admin | complimentary/admin subscriptions | with the admin-grant build (was "Phase 5") |
| GDPR readiness: ICO registration + DSAR-flow confirmation (delete-account exists; DSAR export/process unconfirmed) | platform/legal | legal launch obligation | pre-launch (with legal sign-off) |
| Zoho One scope (CRM + contracts + helpdesk alongside the custom platform) | ops | tooling spend + contract-signing path (click-to-agree vs Zoho Sign) | owner to confirm |
| graphify knowledge graph: regenerate or retire (stale since 2026-04-18; usage rule demoted to a caveat in CLAUDE.md) | platform/docs | tooling accuracy | owner convenience |

Decisions migrated 2026-07-06 from the old root-CLAUDE.md "Open Decisions" list and RESOLVED
(recorded here so nothing is silently dropped): SMS/OTP gateway = Twilio (adopted; live in
redemption PIN SMS since Phase 2D). Website scope = fully defined (no redemption; subscription
purchase supported). White-label = out of scope for now (possible future expansion).

## 7. Verified warnings

- **89 of 108 backend integration suites would mutate shared Neon if run locally without a `DATABASE_URL` override** (only the 11 insights harness + 8 mocked are guarded). Evidence: `vitest.config.ts` + grep; `.env DATABASE_URL` = Neon; `tests/setup.ts` does not guard it.
- **Backend integration project (incl. all Insights legal-gate, tenant-isolation, SEC-M2 suspend proofs) is NOT run in CI** (`ci.yml` backend job runs `test:unit` only). **No e2e/browser tests exist repo-wide** - the class behind #324 (ToastProvider crash) and #327 (Decimal-as-string).
- **Stale legacy docs (updated 2026-07-06):** root `CLAUDE.md` was slimmed to durable instructions (its stale build/phase narrative is archived verbatim at `docs/history/claude-md-2026-06-20-archive.md`; treat that archive as 2026-06-20 evidence only). Private memory remains partially stale: `MEMORY.md` (~100 KB) exceeds its ~24.4 KB load cap (only the first ~14 lines load); `project_deferred_followups_index.md` is 705 KB; `project_current_state.md` (Jun 20) trails reality; a memory reconciliation is PREPARED but not applied (owner approval pending). **For CURRENT programme status, prefer this document** (they are not authoritative for current status). They may still be valid HISTORICAL evidence, or governing CONTRACT evidence, when a specific claim is claim-verified; and the detailed approved specs/plans may still govern INTENDED behaviour (per the §1 authority model).
- **Insights gates are closed and must stay closed** until owner/legal records D1/D5 (behavioural/CSV) and D2-D4 (demographics).
- **Staging admin-login OTP delivery is UNVERIFIED (from Codex Vol-2, read-only):** an earlier record describes the staging-admin mailbox as not owner-receivable (OTP read from the staging DB as a workaround); a later record describes sandbox email delivery to an owner-controlled inbox. The current flow cannot be established without a live/provider check (not performed) - do not treat the DB-read workaround as current. If the workaround is current it must be replaced with a receivable/admin-controlled inbox. Deployed `favicon.ico` 404 is a known cosmetic item. (PR #327 is MERGED at `9a687393` and is closed. The **Karaara staging cleanup is NOT recorded completed**: Vol-2 §"Karaara Voucher Cleanup" recommends deleting only the inactive-leftover flagship `RMV-886F935E` and keeping the draft flagship `RMV-71C5B59E` + branch + owner data, but records the outcome as not yet recorded - Karaara's current retained/deleted staging state is **UNVERIFIED**; see §8/§10.)
- **Merged ≠ deployed ≠ staging-accepted:** every Merchant module is merged but **not authenticated-staging-accepted**.

## 8. Open deferrals register (compact; history NOT copied here)

**The live detailed register is `docs/deferrals/open-register.md`** (created 2026-07-06 from the old CLAUDE.md deferred lists + this section; update it, and this summary when relevant, in the same PR as any deferral change). The full historical detail lives in `project_deferred_followups_index.md` (705 KB, an oversized/stale historical reference; **proposed for later freeze/reconciliation but currently UNTOUCHED** - no private-memory change has occurred; do not copy it here, and do not route live status into it). Open, currently-relevant deferrals with owner + trigger (summary of the register):

| ID / area | Owner | Trigger to pick up |
|---|---|---|
| Merchant: flagship "Always live" semantics fix | owner-gated | small data-semantics PR |
| Merchant: flagship read-only voucher detail | owner | M-vouchers slice |
| Merchant: redemption reversal, merchantId denorm, redemption emails | owner | Redemptions slice / decision |
| Merchant: notification deep-link resolver (`redemption`/`voucher`) | eng | CLOSED by #364 |
| Merchant: logout confirmation, active-route highlight, responsive collapse | eng | CLOSED by #364 |
| G1: CI integration gate, security lane, browser smoke, staging acceptance | owner/eng | G1a1→G1c |
| Platform: §SEC.1 atomic limiter (pre-Resend), §SEC.6 SEO, SEC-H6/M1-M5 | owner | pre-email / pre-launch |
| Staging admin-login OTP delivery (UNVERIFIED - needs a receivable/admin-controlled inbox if the DB-read workaround is current) + deployed favicon 404 (cosmetic) | owner/eng | Codex Vol-2 "Active State" (read-only); a live/provider check |
| Karaara staging cleanup (UNVERIFIED) - Vol-2 recommends deleting only the inactive-leftover flagship `RMV-886F935E` (keep draft `RMV-71C5B59E` + branch + owner data); outcome not yet recorded | owner/eng | Codex Vol-2 open item "Record the Karaara narrow voucher-cleanup outcome" (read-only) |
| Customer App / Admin deferrals | owner | per their checklists + the deferred archive |

## 9. Change / update protocol

- **Claim-level, not date-based.** Each status/decision/warning/deferral is verified against the evidence in §1 before it is written; cite the SHA/PR/spec/decision. A claim with no current evidence is **[UNVERIFIED]**, not assumed true.
- **Per-PR/decision update (mandatory step in the PR checklist):** on merge, flip the affected status + add a change-log line (date, PR/SHA, one line). On an owner decision, move it in §6 (open→closed, dated) and reflect it in §5 if cross-product. On a warning raised/cleared or staging check, update §7. On a deferral open/close, update §8.
- **Re-reconciliation cadence:** continuous per-PR updates **plus** a full claim-level re-reconciliation (and a re-read of the three Codex checklists) at each **programme switch** or milestone - re-stamp the freshness line with the verified `origin/main` SHA.
- **Programme switching:** read this doc, pick the programme section in §4, follow its links into that programme's roadmap/specs only - do not load every history.

## 10. Codex reconciliation log

| Date | Checklists read (read-only) | Deltas vs this doc |
|---|---|---|
| 2026-06-28 | all three (§2) | merged-state: no deltas (Insights/G1 corroborated). **PR #327 MERGED** (`9a687393`) - removed from open. **Karaara staging cleanup NOT recorded completed:** Vol-2 §"Karaara Voucher Cleanup" recommends deleting ONLY the inactive-leftover flagship `RMV-886F935E` (keep the draft flagship `RMV-71C5B59E` + branch + owner data) but records the outcome as "not yet recorded" (open item: "Record the Karaara narrow voucher-cleanup outcome"); earlier branch-cleanup reports changed over time - so the **current Karaara retained/deleted staging state is UNVERIFIED** (do NOT assert "2 submitted vouchers" or completed voucher cleanup). **Staging admin-login OTP flow UNVERIFIED** (earlier = DB-read workaround / not-receivable mailbox; later = sandbox email to owner inbox; current flow needs a live/provider check, not performed). Customer App checklist itself trails (Jun 13). Checklists not modified by Claude. |

## 11. Governing-document links

- **Merchant Portal roadmap:** `docs/superpowers/roadmaps/merchant-portal-programme-roadmap.md`
- **Specs/plans:** `docs/superpowers/specs/`, `docs/superpowers/plans/` (per-module; linked from the roadmap)
- **Audits:** `docs/superpowers/audits/`
- **Governance (Insights DPIA):** `docs/superpowers/governance/2026-06-27-insights-dpia/`
- **Runbooks:** `docs/runbooks/` (deploy-security, staging, insights-test-db, insights-demo-fixture, railway-hosting)
- **Customer flow:** `docs/customer-flow-current.md` + `docs/customer-flow-changelog.md`
- **Constitution (stable):** root `CLAUDE.md` (tech stack, business rules, workflow tiers, git safety, style locks, run/test) - slimmed 2026-07-06 to durable instructions only; it routes status questions here. Path-scoped guidance: `.claude/rules/`. Historical build narrative: `docs/history/claude-md-2026-06-20-archive.md`.
- **Open deferrals register (live):** `docs/deferrals/open-register.md` (§8 is its summary).
- **Codex checklists (read-only, §2).**

---

## Change log

- **2026-07-06** - Documentation-architecture migration (branch `docs/claude-code-architecture`; closes the §6 "Documentation architecture migration (A+C) next steps" repo-side scope). Root `CLAUDE.md` slimmed to durable instructions (1,065 → ~200 lines) with its full former content archived verbatim at `docs/history/claude-md-2026-06-20-archive.md`; six path-scoped `.claude/rules/` files added; `redeemo-dev-qa-toolkit` skill added; Codex-checklist write-guard hook added (project-level); `docs/deferrals/open-register.md` created as the live deferral register (§8 now summarizes it); the 7 old CLAUDE.md "Open Decisions" migrated into §6 (3 recorded resolved: Twilio, website scope, white-label); §5 one-home-per-fact note added; §7 stale-docs warning updated; `docs/product-decisions.md` marked superseded. Memory reconciliation PREPARED only (apply is owner-gated). Evidence: the reconciliation log in `~/Documents/Playground/redeemo-notes/claude-documentation-reconciliation-log.md`.
- **2026-07-05b** - Wave-3 merge records: #371 (`2945bf78`, staff remove confirm tests), #370 (`29f1801e`, nullable-clear spec+plan; D1-D3 owner-APPROVED after merge), #372 (`194654a5`, smoke journeys + count-bounded error-guard contract), #373 (`a58db583`, nullable-clear implementation - closes the #366 gated follow-up). Smoke-count metrics RESTATED: 26 runtime tests / 24 static call sites after #372 (was 17 runtime / 15 static; the 2026-07-05 "17 to 15" correction had conflated the two metrics - runtime exceeds static because roles.spec.ts parametrizes one site over three roles). Merged pointer + freshness re-stamped @ `a58db583`. Staging acceptance remains outstanding portfolio-wide; all owner/legal/provider gates preserved.
- **2026-07-05** - #368 MERGED (squash `8621c9a1`: Redemptions fidelity slice - voucher filter, deterministic shared list/CSV sort, code-or-title search); Redemptions completion-map row's residual fidelity gaps CLOSED, status stays MERGED / NOT-ACCEPTED (authenticated staging acceptance outstanding); smoke-lane test count corrected 17 → 15 (direct spec grep) here and in the roadmap; Merchant freshness re-stamped @ `8621c9a1`. All owner/legal/provider gates preserved unchanged.
- **2026-07-04c** - #365 + #366 MERGED (squash `cda007f7` / `1eb2b382`); pointers flipped from in-review to MERGED; Quick-Actions "placement undecided" correction line fixed (resolved in #364; residual = BM extension on a per-branch capability signal); @playwright/test decision closed (promotion-to-required stays open); staging acceptance explicitly outstanding portfolio-wide.
- **2026-07-04b** - Governance accuracy round (Codex): completion-map rows corrected against merged #364 (Validate-a-code compact + intentional suspended-enabled; the 5 former dead links = honest placeholder routes with modules still NOT-STARTED; Branch-PIN placement resolved); Branches row records PR-2 BM-writes as SHIPPED (design-doc language historical); Redemptions row clarifies NOT-ACCEPTED = staging gate; PR head pointers refreshed (#365 `410b0c67`, #366 `cf6d510c`, unmerged).
- **2026-07-04** - Merchant shell wave MERGED (#364, squash `8c4258ba`): §4.2 status flipped (shell gaps closed; View-as/Demo prototype-only, drop recommended); §6 Quick-Actions decision resolved by prototype authority; §8 shell-wave deferrals closed. Open in-review PRs recorded: #365 (G1b Playwright smoke lane, `3f9bf74e`), #366 (Vouchers V1 builder parity, `f829ed46`). Merchant freshness re-stamped @ `8c4258ba`.
- **2026-06-28** - Document created (docs-only PR, foundation of the A+C documentation architecture). Establishes the fact-type authority model, the read-only Codex reconciliation protocol, the programme-partitioned status index, cross-product invariants, open owner decisions, verified warnings, the compact deferrals register, and the change/update protocol. Verified against `origin/main` @ `434ca4eb`. Customer App + Admin sections summarized from existing records and marked for line-level re-reconciliation at their next programme switch.
