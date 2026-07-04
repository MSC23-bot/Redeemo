# Redeemo - Project State (canonical, living)

> **Read this first when resuming any Redeemo work.** This is the compact, claim-verified
> current-state index. It summarizes material facts and **links** to the detailed evidence
> (specs, plans, audits, governance, runbooks, the Merchant Portal roadmap). It deliberately
> does **not** copy per-PR histories or the large deferred archive. This document and the Merchant
> Portal roadmap are a **coordinated, cross-linked pair**: kept as separate PRs only for reviewability,
> but reviewed, approved, and merged together.
>
> **Freshness:** Merchant-programme lines re-verified against `origin/main` @ `8c4258ba` on **2026-07-04** (other programmes last verified @ `434ca4eb`, 2026-06-28). Lines without
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

- **Merged:** `origin/main` @ `8c4258ba` (latest merge: Merchant global-shell consolidation #364). Verify any "merged" claim with `git log`/the PR.
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
**In review (open PRs, NOT merged):** PR #365 (PR-G1b deterministic local Playwright smoke lane, advisory CI job; head `3f9bf74e`) and PR #366 (Vouchers V1 builder parity: terms checklist, photo upload, custom cooldown, window presets; head `f829ed46`) - both all-green + CodeRabbit-clean, awaiting SHA-bound owner/Codex merge approval.
**Gated / not-done:** Insights behavioural + event CSV = **LEGAL-GATED** (default-off, fail-closed); Insights demographics = **LEGAL-GATED + NOT-STARTED**; Home Live dashboard = **PLACEHOLDER/OWNER-GATED**; Home Staff view = **NOT-STARTED/OWNER-GATED**; Business-profile settings, My Account, Help & Support = **NOT-STARTED**; Promote, Payments & Billing = **NOT-STARTED/PROVIDER-GATED**; global-shell gaps CLOSED by #364 (logout-confirm, active-route highlight, notification deep-links, Quick-Actions launcher placement, responsive collapse/tab bar, favicon); View-as lens NOT built - the prototype itself labels it "Prototype control only. Not part of the live portal." (owner to record the drop; same for the Demo switcher).
**Corrections that must be preserved:** Staff/BM **can** authenticate into the portal (only the lean Staff Home is unbuilt); Branch PIN reveal has a guarded backend route + on-demand `PinCard` (only Quick-Actions placement is undecided); the three Vercel apps are already deployed (do not propose new blank-slate Vercel projects).
**Detail/links:** **`docs/superpowers/roadmaps/merchant-portal-programme-roadmap.md`** (the full module/screen/role/lifecycle/shell/conflict/gap/gate map + Option-C sequencing + Definition of Complete); merged specs/plans under `docs/superpowers/specs|plans` (M0-M4, Day-2 vouchers, staff-access, branches PR1-8, Insights); `docs/superpowers/governance/2026-06-27-insights-dpia/`; Admin/Merchant Codex checklists (§2).

### 4.3 Admin Panel
**Status (per CLAUDE.md + the admin closure memories + the Admin/Merchant Codex checklists + merged PRs):** `apps/admin-web` actioner console M0-M8 MERGED (challenge-bound OTP, two-step login, notification foundation + emitters, approval queue, review-context, action UI, lifecycle/confirm-location, comms/activity timeline); admin follow-ups WP1-WP5 + Option B B1 (pending-edit applier) MERGED.
**Verification status:** summarized from the records above; **not exhaustively re-claim-verified this pass** - **[UNVERIFIED at line level]**; re-reconcile at the next Admin programme switch.
**Detail/links:** the admin memories; Admin/Merchant Codex checklists (§2); merged admin PRs.

### 4.4 Cross-product / platform
Backend (Node 24), Prisma 7 + Neon, Stripe/Twilio/FCM; **Resend is WIRED in code** (`src/api/shared/email.ts` imports + wraps the SDK) but **dark by default** (EMAIL_ENABLED off = no client construction, no send; EMAIL_SANDBOX rewrites recipients to an allowlist; production sender/domain/channel NOT enabled per runbook §6 - live production email UNVERIFIED); Redis; **storage (R2) is a feature-flagged capability** (`src/api/shared/storage.ts`; STORAGE_ENABLED off by default so presigning throws STORAGE_NOT_ENABLED; R2 secrets only required when enabled - configured/enabled state UNVERIFIED, not inferable from source). Pre-launch SECURITY/LEGAL/DOMAIN gate code-complete (`2a221522`, PR #170). See §5 for invariants, §6 for open decisions.

---

## 5. Cross-product decisions & invariants (visible regardless of programme)

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
| Add `@playwright/test` | platform/G1 | enables deterministic browser smoke | G1b |
| Seed strategy for the 53 seed-dependent integration suites | platform/G1 | seed disposable DB vs refactor to self-seed | G1a expansion |
| Insights gate-open (D1/D5) + demographics (D2-D4) | Merchant/legal | unblocks behavioural/CSV/demographics | parallel legal track |
| Promote / Payments provider + billing/PCI | Merchant | unblocks commercial modules | before commercial wave |
| Custom-domain provisioning (merchant/api/admin) | platform | trust/launch | pre-launch |

## 7. Verified warnings

- **89 of 108 backend integration suites would mutate shared Neon if run locally without a `DATABASE_URL` override** (only the 11 insights harness + 8 mocked are guarded). Evidence: `vitest.config.ts` + grep; `.env DATABASE_URL` = Neon; `tests/setup.ts` does not guard it.
- **Backend integration project (incl. all Insights legal-gate, tenant-isolation, SEC-M2 suspend proofs) is NOT run in CI** (`ci.yml` backend job runs `test:unit` only). **No e2e/browser tests exist repo-wide** - the class behind #324 (ToastProvider crash) and #327 (Decimal-as-string).
- **Stale legacy docs:** root `CLAUDE.md` (145 KB, Jun 20) still marks Merchant "Phase 4 queued" / Admin "Phase 5 queued"; `MEMORY.md` (~100 KB) exceeds its ~24.4 KB load cap (partially loaded); `project_deferred_followups_index.md` is 705 KB; `project_current_state.md` (Jun 20) trails reality. **For CURRENT programme status, prefer this document over those** (they are not authoritative for current status). They may still be valid HISTORICAL evidence, or governing CONTRACT evidence, when a specific claim is claim-verified; and the detailed approved specs/plans may still govern INTENDED behaviour (per the §1 authority model).
- **Insights gates are closed and must stay closed** until owner/legal records D1/D5 (behavioural/CSV) and D2-D4 (demographics).
- **Staging admin-login OTP delivery is UNVERIFIED (from Codex Vol-2, read-only):** an earlier record describes the staging-admin mailbox as not owner-receivable (OTP read from the staging DB as a workaround); a later record describes sandbox email delivery to an owner-controlled inbox. The current flow cannot be established without a live/provider check (not performed) - do not treat the DB-read workaround as current. If the workaround is current it must be replaced with a receivable/admin-controlled inbox. Deployed `favicon.ico` 404 is a known cosmetic item. (PR #327 is MERGED at `9a687393` and is closed. The **Karaara staging cleanup is NOT recorded completed**: Vol-2 §"Karaara Voucher Cleanup" recommends deleting only the inactive-leftover flagship `RMV-886F935E` and keeping the draft flagship `RMV-71C5B59E` + branch + owner data, but records the outcome as not yet recorded - Karaara's current retained/deleted staging state is **UNVERIFIED**; see §8/§10.)
- **Merged ≠ deployed ≠ staging-accepted:** every Merchant module is merged but **not authenticated-staging-accepted**.

## 8. Open deferrals register (compact; history NOT copied here)

The full historical detail lives in `project_deferred_followups_index.md` (705 KB, an oversized/stale historical reference; **proposed for later freeze/reconciliation but currently UNTOUCHED** - no private-memory change has occurred; do not copy it here). Open, currently-relevant deferrals with owner + trigger:

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
- **Constitution (stable):** root `CLAUDE.md` (tech stack, business rules, workflow tiers, hooks, run/test) - note its forward/phase markers are **stale**; this document supersedes them for status.
- **Codex checklists (read-only, §2).**

---

## Change log

- **2026-07-04** - Merchant shell wave MERGED (#364, squash `8c4258ba`): §4.2 status flipped (shell gaps closed; View-as/Demo prototype-only, drop recommended); §6 Quick-Actions decision resolved by prototype authority; §8 shell-wave deferrals closed. Open in-review PRs recorded: #365 (G1b Playwright smoke lane, `3f9bf74e`), #366 (Vouchers V1 builder parity, `f829ed46`). Merchant freshness re-stamped @ `8c4258ba`.
- **2026-06-28** - Document created (docs-only PR, foundation of the A+C documentation architecture). Establishes the fact-type authority model, the read-only Codex reconciliation protocol, the programme-partitioned status index, cross-product invariants, open owner decisions, verified warnings, the compact deferrals register, and the change/update protocol. Verified against `origin/main` @ `434ca4eb`. Customer App + Admin sections summarized from existing records and marked for line-level re-reconciliation at their next programme switch.
