# Open Deferrals Register (live)

**This is the live, tracked register of open deferred follow-ups.** It replaces the old
root-CLAUDE.md deferred lists as the current view; `docs/PROJECT-STATE.md` §8 is the compact
executive summary of this file. When a deferral opens or closes, update this file (and §8 if
the item is summarized there) in the same PR, citing the PR/SHA.

**Provenance and honesty:** extracted 2026-07-06 from the archived root CLAUDE.md
(`docs/history/claude-md-2026-06-20-archive.md`), PROJECT-STATE §8, and the private-memory
index. The 704 KB private-memory deferred archive (`project_deferred_followups_index.md`,
~200 items, last updated 2026-06-20) has NOT been line-by-line reconciled into this register;
treat this register as the live front-door and the memory archive as searchable history.
Reconcile each programme's tail from the archive at that programme's next switch, then record
it here. Section IDs (§Q, §DF-v2, §SEC…) keep their historical names for traceability.

Statuses: **OPEN** · **GATED** (needs owner/legal/provider decision) · **VERIFY** (believed
closed by a later PR; confirm and then remove with a citation).

## 1. Customer App

| ID | Item | Status / trigger |
|---|---|---|
| §Q1-Q3, §Q5 | Redeemed-state visual redesign residuals (washed-out coupon hero, coupon-body stamp, dimmed merchant card, Profile → Redemption History past-cycle surface). §Q4 closed by PR #60 | OPEN, Tier 2 design pass (pairs with §S residuals) |
| §S2 + §S residuals | Show-to-Staff animated gradient border; SuccessPopup polish (confetti, saving amount, Rate & Review visual + routing). T8m/T8n/T8p closed parts of §S1-S3 | OPEN, Tier 2 |
| §AE (v2) | iOS anti-fraud hardening v2: QR hidden by default, tap/hold reveal, rotating QR payload, merchant validation policy, telemetry dashboards | GATED: production fraud telemetry OR pre-launch threat-model escalation |
| §AF | Polished SVG circular stamp + full redeemed visual treatment + backend `presentationExpiresAt` mirror | OPEN, Tier 2 (with §Q pass) |
| §U1 | Customer name on Show-to-Staff (suppressed while empty) | OPEN; trigger was "after merchant-portal validation surfaces lock"; merchant M3 Validate-a-code is merged, so this is now actionable |
| §N10 / §N8 | Native iOS edge-swipe-back for `voucher/[id]` + `merchant/[id]` (requires moving both into a Stack flow together) | OPEN, Tier 2/3 navigation workstream |
| §N11 | Branch-switch perceived-lag UX (`keepPreviousData` shows old branch until refetch) | OPEN, Tier 1/2 owner-direction |
| §O3 | `Change ▾` glyph → chevron icon polish | OPEN, Tier 1 |
| §O5 | VoucherDetailScreen decomposition | OPEN, only if it grows past ~600 lines |
| §O6 | Already-Redeemed full surface | VERIFY: largely subsumed by M3 (PR #49 persisted return-visit card closed §P2); residual past-cycle browsing = §Q5. Confirm and close with a citation |
| §HSH | Home sticky brand header residuals (header shipped PR #142; memory topic `project_home_sticky_brand_header.md` tracks the tail) | VERIFY: enumerate what remains open from the memory topic, then record here |
| §P4 | Non-PIN redemption error action-button routing | OPEN, Tier 1 polish batch |
| §R1 (redemption) | Redemption-code collision-retry hardening (NOT the security key-rotation R1) | OPEN, Tier 1 |
| §R2 | Dead nanoid mock cleanup | OPEN, Tier 1 |
| §O4 | Voucher favourite toggle wiring | VERIFY: believed closed by Favourites branch-level (PR #137, `FavouriteHeart` on Voucher Detail) |
| §T1 | REUSABLE multi-redemption | VERIFY: believed closed by M5 REUSABLE (PR #72) |
| §AI | Review-system v2 (multi-review per branch, spam/foul-language/rate-limit/moderation, avgRating re-architecture) | GATED: customer/review volume warrants it; Tier 3 brainstorm-first |
| PR-C carry-overs | Prompt-card "Update your review" copy (needs `myReview` on getCustomerVoucher); upfront verified banner on cold-open (needs `id` in `lastRedemption` schema); Path A TOCTOU on hard-delete (minor) | OPEN, Tier 1 |
| §FAV.1 | Legacy `FavouriteMerchant` model + routes removal | OPEN; trigger (2-4 weeks soak after PR #137, merged 2026-05-31) has PASSED |
| Favourites Polish Batch | Hierarchy/spacing/illustrations/motion/card visuals/remove-confirmation UX | GATED: owner direction; Tier 2 brainstorm-first |
| §DF-v2-k/l/m/n | Your Location: town/city/place search (k, Tier 2 brainstorm-first); identity-card residual polish (l); save-success toast (m); Search place-intent copy (n) | OPEN |
| §DF-v2-a..h | Multi-saved-locations; no-postcode Home prompt; first-open GPS prompt; GPS-vs-postcode reconciliation UI; periodic postcode check; honesty hint on other surfaces; Home "use current location" pill; locality re-resolution job | OPEN, spec §11 batch (postcode-profile-fallback spec) |
| §DF-v2-o | Voucher Detail location-context awareness (plumb lat/lng on `/vouchers/:id`, emit envelope, LocationStatusLabel decision) | OPEN, Tier 1-2; trigger: a Voucher Detail consumer needs location |
| §DF-web | Customer-website location-fallback parallel work | GATED on §BW customer-web test infra; Tier 2 |
| §RM | Reduce-motion DETECTION (cancellation is fixed; detection open) | OPEN |
| §HC tail | Home visual system non-blocking follow-ups: Family & Kids real glyphs; AllCategories token pass; `category-illustrations/` ~16 MB LFS/CDN; NearbyByCategory pool watch (raise `NEARBY_MERCHANT_POOL_TAKE` 60 → ~120 if dense markets under-fill); low-end Android / iPhone SE QA watch; shared `<SavingBlock>` + `useScrollPausedLoop` extraction | OPEN, Tier 1 batch |
| Profile Sub-PR 2 | Backend for GetHelpModal + RequestMerchantSheet stubs (SupportTicket + MerchantRequest models, routes, hooks; flip the 3 stub pins) | GATED: user/QA traction; Tier 3 brainstorm-first |
| Profile Polish Batch | Subscription card redesign, skeletons, bottom-sheet refresh, Delete Account placement, Redemption History surface | GATED: owner direction; Tier 2 brainstorm-first |
| Profile Sub-PR 1 minors | Import `Interest` type; hoist `formatDate` Intl instance; GetHelpModal test comment; dead `dob` mock; loading skeleton | OPEN, Tier 1 |
| Merchant-profile opens | Tap-target a11y; seed enrichment; `closesAt` device-local removal; discovery card ratings via `contextBranchId` | OPEN, Tier 1 |
| Plan 3 | PC3 interests → real `Category` migration | GATED: owner ("leave until more stable"); sequence after Plan 4 M5 |
| Plan 4 M5 | Location-model cleanup | GATED on §CU.1 (converges into one cleanup PR) |
| EAS config | `eas.json` / `app.config.ts` / expo-build-properties port | OPEN (deliberately not ported in Profile Sub-PR 1) |
| Node upgrade | Customer-app toolchain Node 20.19.4 → newer LTS | GATED on re-verifying jest-expo |
| Seed-email hygiene | `admin@`/`customer@`/`staff@` seed addresses use unowned `redeemo.com` | OPEN, platform-wide follow-up |
| Checklist-only customer-app tail | Additional open follow-ups tracked ONLY in the Customer App Codex checklist (read-only; reconciled 2026-07-06): §CE-§CK Search follow-ups (filters, sorting, recent searches, empty-state illustrations, heart migration, pagination, tactile polish); §BY/§CA/§CC/§DJ/§DK cross-surface copy + pill + ranking-audit items; §DB/§DC/§DD/§DE/§DI Home follow-ups; Map polish bucket + §CZ category/filter correctness (owner-deferred to the Map rebase pass); Category FilterSheet redesign + copy-mismatch bug; Savings redemption-history pagination end-state bug + sticky-header redesign; QA-seed Stage 3 coordinate verification; pg SSL-semantics warning; stale-generated-Prisma-client dev note; Profile-scope navigation-architecture concern | OPEN in the checklist; promote rows here as they become active |
| Savings ROI copy semantics | "You've saved £X, Y× your subscription": calendar-month vs billing-cycle comparison + annual-plan denomination | OPEN: needs owner product decision |
| Lifecycle nudges | Post-redemption "rate this merchant" delayed notification (timing/scheduler/dedup) + subscription-renewal notification (copy/event-source/destination) | OPEN: needs owner product decisions; Phase-6-adjacent |

## 2. Customer Website

| ID | Item | Status / trigger |
|---|---|---|
| §CU.1 | Branch-first migration (still consumes legacy `merchants` field); blocks Plan 4 M5 + Discovery Phase 3b backend cleanup | GATED: Tier 3 brainstorm-first |
| §BW | Customer-web test infrastructure | OPEN (blocks §DF-web) |
| Redesign | Pre-launch website redesign | GATED: owner sequencing 2026-06-09 (after Merchant Portal + Admin) |

## 3. Platform / Security / Ops

| ID | Item | Status / trigger |
|---|---|---|
| §SEC.1 | Atomic email rate-limiter | OPEN; required BEFORE enabling Resend sending |
| §SEC.6 | SEO follow-up: `metadataBase`/canonical/OG, `robots.txt`, `sitemap.xml` on apex | OPEN, pre-launch |
| SEC-H6, SEC-M1..M5 | Remaining security-gate items | OPEN (see security runbooks / memory security thread) |
| D-D | Universal links / DNS: `app.config.ts` + AASA/assetlinks + app rebuild | GATED: domain provisioning |
| Legal sign-off | Real company number / registered office / ICO ref / solicitor review of static legal pages | GATED: owner/legal; the TRUE hard launch gate |
| Email enable (D-F) | Sender-domain verify + SPF/DKIM/DMARC + monitored inboxes + bounce webhooks → CommunicationLog + §SEC.1, per runbook §6 | GATED: provider/owner |
| PECR | Cookie-consent banner becomes required if analytics are ever added (none today) | GATED on adding analytics |
| Phase 6 | Comms layer: email PIN delivery (Resend), FCM push, marketing comms | GATED: Phase 6 |
| Subscription purchase | In-app subscribe flow (Apple IAP on iOS; Stripe or Play Billing on Android) | GATED: PROJECT-STATE §6 Apple IAP decision |
| G1 items | CI integration gate, security lane, browser-smoke promotion to required, staging acceptance, seed strategy for 53 seed-dependent suites | See PROJECT-STATE §6/§8 (authoritative for these) |
| Google Places quota hardening | Move Google API cost/abuse protection from the file-based daily-cap comment to a Redis `atomicLimiter` before merchant-facing production use (locked pre-production requirement, Codex Vol-1 ~L4789; `src/api/lib/googlePlaces.ts` has NO limiter today and the key is live on staging) | OPEN, pre-launch |

## 4. Workspace / repo hygiene (was CLAUDE.md "Pending local-only artefacts"; live owner-gated)

| Item | Standing instruction |
|---|---|
| Untracked `prisma/*.ts` probe scripts (12 as of 2026-07-06, incl. `check-user.ts`, `test-login.ts`, `test-session.ts`, `_get-admin-otp.ts`, `_check-merchant-login.ts`, `_reset-merchant-pw.ts`, `qa-m4c-mixed-states.ts`, …) | Do NOT commit without refactor/review; do NOT delete without owner approval. Refactor-or-delete decision pending per script |
| `prisma/reset-user-password.ts` | Hardcodes a personal email + plaintext password; functionality covered by `issue-reset-token.ts` + `set-auth-state.ts`; most likely action is DELETE WITH APPROVAL |
| Git stash "discovery: drop merchant phone/email from customer-facing select — pending privacy review" | Pending merchant/API privacy review; identify by LABEL not index; do NOT auto-classify; ask the owner before acting. Older unrelated stashes from prior sessions exist too: leave them alone |
| `docs/branding/` (556 MB, gitignored) | Decision pending: S3/R2 vs Git LFS |
| Untracked plan/spec docs for already-merged work (admin actioner slice-A, WP1-WP5, Option B B1, platform strategy, security-stabilisation gate, edit-on-behalf design) | Commit-or-archive decision pending (owner); do not delete |
| Root Railway a11y-snapshot artifacts (`settings-after-both-edits.md`, `web-settings-snapshot.md`, `worker-snapshot.md`, `proto-setting-up.png`) | Evidence captures from the security/R1 track; file or discard only with the security thread's agreement |
| `.worktrees/admin-members-revenue/CLAUDE.md` + `.worktrees/reencrypt-branch-pins/CLAUDE.md` | Real files violating the symlink rule (first has drifted +470 B). Repair = diff, surface any intentional delta, replace with symlink; needs owner approval (cross-session risk) |
| `.claude/worktrees/{competent-goodall-23dc45,vigorous-matsumoto-0cb03d}` | Agent worktrees frozen with an April-era 19.9 KB CLAUDE.md; removal needs approval (worktrees preserved by default) |

## 5. Merchant Portal and Admin Panel

Merchant/Admin deferrals are owned by `docs/PROJECT-STATE.md` §8 + the Merchant Portal
roadmap + the (read-only) Codex checklists, with detail in the private-memory topic files.
Headline open items for orientation (authoritative list = those sources): merchant flagship
"Always live" semantics fix (owner-gated); flagship read-only voucher detail; redemption
reversal / merchantId denorm / redemption emails; structured concierge corrections
(windows/cooldown/imageUrl); Staff & Access v1 deferrals (claim-supersession atomicity,
cross-tenant existence, cap enforcement, a11y); merchant M1 a11y focus-on-error +
OTP-lockout message; admin M2-M8 deferred lists; Option B B2+/B3/B4/B5 + photo-apply;
`canManageVouchers` migration applied to LOCAL dev DB only (staging/prod need
`prisma migrate deploy`); staging admin-OTP delivery UNVERIFIED; Karaara staging cleanup
UNVERIFIED; automated monthly merchant statements (from the old §R4 architecture note) not
yet tracked in any roadmap row: confirm placement; `GET /branches` payload still returns the
encrypted `redemptionPin` field (UI never renders it; harden the payload before treating it
as a curated contract); optional #389 defence-in-depth follow-up (re-gate non-401/JSON-parse
throw paths; assessed non-security); cuisine-aware specialty filtering open product question
(cuisine selection does not narrow the specialty pool; Codex Vol-1 ~L11137); AdminRole enum
drift vs locked Q6b (shipped SUPER_ADMIN/OPERATIONS/FINANCE/CONTENT/SUPPORT; locked plan was
SUPER_ADMIN/ADMIN/OPERATIONS/SALES-later): confirm-or-correct.

**Business Profile v1 follow-ups (OPENED 2026-07-06 on the M1-M4 merge; do not forget):**
- **§BP-ADJ1** (Low, defence-in-depth): `getMerchantProfile`'s `...merchant` spread still returns base registered/compliance fields (`companyNumber`, `vatNumber`, `contractStatus`, contract dates, `verificationStatus`, `websiteUrl`) to a STAFF *API* caller, though the `/profile` page UI now hides them. Pre-existing member-read; low-sensitivity (public-record numbers). Fix = role-gate those fields for non-privileged members after a consumer-impact audit of every `getMerchantProfile` caller (narrowing a shared endpoint = regression risk). Opus-surfaced.
- **§BP-ADJ2** (Very Low): `createMerchantEditRequestCore` lacks a server-side non-null guard on `businessName` (the modal never sends null; a raw-API `{businessName:null}` stores a row that later fails admin `approveEdit` at the NOT NULL constraint - no corruption/breach). Fix = validate `SENSITIVE_FIELDS` types before store; fold into the §BP-ADJ1 slice or a backend-hardening pass. Opus-surfaced.
- **§BP-DOC** - Compliance Documents: merchant self-serve document upload + view-own AND the admin "Redeemo needs a document" request mechanism (cross-surface, undesigned - spans the admin panel). Own owner-gated brainstorm-first slice; sooner if pre-launch verification-document collection is needed.
- **§BP-ACC** - My Account (personal): **v1 SHIPPED 2026-07-07** (#401 `3c01a1f0` + #403 `1c70080e` backend: logged-in `changePassword`, `logoutAll`, curated `GET/PATCH account`, `GET account/sessions`; #405 `38201d4c` page: your-details edit, change-password modal, full sign-out-everywhere incl. current device, sessions list, login email/phone VIEW). The remaining sub-items were never in scope for v1 and are now tracked as their own rows below (§BP-ACC-EMAIL, §BP-ACC-PREFS) - do not read this closure as "My Account is fully done".
- **Business-generic-contact** (future): additive `Merchant` field so a BRANCH_MANAGER need not see the account owner's PERSONAL contact. Owner APPROVED personal-contact for v1 (matches the mockup + the data model's single owner-contact); narrowing is a tracked future option, not a defect.
- Detail: `docs/superpowers/plans/2026-07-06-merchant-web-business-profile.md` §4 + the private `project-business-profile-approach-a` memory. Business Profile v1 (M1-M4) is COMPLETE; these items are what remains - none of them makes Documents "done", and My Account's own residual sub-items are tracked below.

**Merchant Portal fidelity wave follow-ups (OPENED 2026-07-07 on the #401-#409 merge; do not forget):**
- **§BP-ACC-EMAIL** (My Account): change-email + change-phone need a real verification flow (schema/security slice - likely a pending-change + OTP/confirm pattern mirroring the existing email-OTP auth primitives). Currently honestly STAGED as contact-us in #405 `38201d4c`. GATED: needs its own Tier-2/3 design (security-sensitive identity fields).
- **§BP-ACC-PREFS** (My Account): notification-prefs + report-recipients need real models (a `NotificationPreference`-style table + a report-recipients list) and a live send path. Currently inert toggles in #405 `38201d4c` with an honest staged-note shown. GATED on `EMAIL_ENABLED` + the underlying schema decision.
- **§HOME-NVR** (Home dashboard): "New customers this cycle" tile is LEGAL-GATED behind the Insights behavioural gate (same D1/D5 track as Insights) - do not surface real counts until that gate opens (#406 `8f8877a4`).
- **§HOME-THRESH** (Home dashboard): the live-just-started state uses a zero-all-time-redemptions threshold flagged for owner confirmation in #406 `8f8877a4` - confirm or adjust the threshold.
- **§HOME-DOCS** (Home dashboard): surfacing expiring documents in needs-your-attention needs `MerchantDocument.expiryDate` (schema addition) before it can be added.
- **§VA-GRAN** (Voucher analytics): per-voucher analytics (#408 `cc7549b4`) granularity decision - whether to add small-count suppression (Opus-reviewed lean/no-suppression is acceptable as shipped) - and reconfirm the STAFF-deny default stays correct as the surface matures.
- **§RDM-COUNT** (Redemptions): a true awaiting-count and tabs-with-counts need a backend status aggregate; #409 `73175c8b` shipped a page-scoped count only as an interim.
- **Voucher governed flows D1-D5**: decision packet at `docs/superpowers/plans/2026-07-07-voucher-governed-flows.md` (request-change / request-to-end / run-again / withdraw). The reversal half may already be covered by the existing "redemption reversal" row above; reconcile the two when the packet is actioned.
- Detail: this section's PRs #401-#409; `docs/PROJECT-STATE.md` §4.2 fidelity-wave paragraph (2026-07-07).

## Change log

- **2026-07-07** · Merchant Portal fidelity wave (#401-#409) reconciled: §BP-ACC annotated **v1 SHIPPED** (backend #401 `3c01a1f0` + #403 `1c70080e`, page #405 `38201d4c`) - its change-email/phone-verification and notification-prefs/reports sub-items split out as new tracked rows §BP-ACC-EMAIL and §BP-ACC-PREFS (neither implies §BP-ACC v1 is incomplete; they were never in scope for v1). New rows opened for the Home dashboard (#406 `8f8877a4`): §HOME-NVR (legal-gated new-customers tile), §HOME-THRESH (live-just-started threshold owner-confirm), §HOME-DOCS (expiring-docs needs `MerchantDocument.expiryDate`). New row §VA-GRAN for per-voucher analytics (#408 `cc7549b4`) granularity/STAFF-deny confirm. New row §RDM-COUNT for Redemptions (#409 `73175c8b`) true awaiting-count/tabs. Voucher governed-flows decision packet (`docs/superpowers/plans/2026-07-07-voucher-governed-flows.md`) cross-referenced against the existing redemption-reversal row. PROJECT-STATE §4.2/§8 updated in the same PR.
- **2026-07-06** · Register created (documentation-architecture migration). Extracted from
  the archived CLAUDE.md deferred lists + PROJECT-STATE §8 + memory index. Memory deferred
  archive intentionally NOT yet reconciled line-by-line (see provenance note).
- **2026-07-06b** · graphify row CLOSED: owner retired graphify from the active workflow
  (recorded in PROJECT-STATE §6 resolved-decisions note); artifacts preserved, nothing to
  regenerate.
- **2026-07-06c** · Codex-checklist reconciliation round: "Home card locality" row REMOVED
  (already shipped via PR #139 `8b352cba`, 2026-05-31; the old CLAUDE.md deferred list this
  register was extracted from predated that closure). Added the checklist-only customer-app
  tail pointer row + two decision-needed rows (Savings ROI semantics; lifecycle nudges).
  §SE.1 split-session opening hours confirmed CLOSED by PR #320 (`fe10fb16`); it was never a
  register row; recorded here for traceability.
- **2026-07-06d** · Business Profile day-2 v1 SHIPPED (M1-M4 merged: #393 `b9d110a6` / #394
  `5ab3997c` / #395 `6e6e5ec4` / #396 `ade3efe5`; owner-approved Approach A; Codex PII/role +
  nullable-clear findings corrected + Opus-cleared before merge). Opened five §5 follow-ups
  (§BP-ADJ1, §BP-ADJ2, §BP-DOC, §BP-ACC, business-generic-contact). Recorded COMPLETE in
  PROJECT-STATE §4.2 + the Merchant roadmap WITHOUT implying Documents or My Account are done.
