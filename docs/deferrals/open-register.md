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
| Profile Sub-PR 1 minors | Import `Interest` type; hoist `formatDate` Intl instance; GetHelpModal test comment; dead `dob` mock. Loading-skeleton item CLOSED 2026-07-09 by PR #433 (`ccf9baa1`, `ProfileSkeleton`) | OPEN, Tier 1 |
| Merchant-profile opens | Tap-target a11y; seed enrichment; `closesAt` device-local removal; discovery card ratings via `contextBranchId` | OPEN, Tier 1 |
| Plan 3 | PC3 interests → real `Category` migration | GATED: owner ("leave until more stable"); sequence after Plan 4 M5 |
| Plan 4 M5 | Location-model cleanup | GATED on §CU.1 (converges into one cleanup PR) |
| EAS config | `eas.json` / `app.config.ts` / expo-build-properties port | OPEN (deliberately not ported in Profile Sub-PR 1) |
| Node upgrade | Customer-app toolchain Node 20.19.4 → newer LTS | GATED on re-verifying jest-expo |
| Seed-email hygiene | `admin@`/`customer@`/`staff@` seed addresses use unowned `redeemo.com` | OPEN, platform-wide follow-up |
| Checklist-only customer-app tail | Additional open follow-ups tracked ONLY in the Customer App Codex checklist (read-only; reconciled 2026-07-06): §CE-§CK Search follow-ups (filters, sorting, recent searches, empty-state illustrations, heart migration, pagination, tactile polish); §BY/§CA/§CC/§DJ/§DK cross-surface copy + pill + ranking-audit items; §DB/§DC/§DD/§DE/§DI Home follow-ups; Map polish bucket (a narrower Map in-area reliability slice - deterministic candidate pool, opt-in `branchesOnly` fast path, client bbox-quantized caching - SHIPPED 2026-07-09 via PR #434 `3e20bbeb`, plan `docs/superpowers/plans/2026-07-09-map-in-area-reliability-slice.md`; the bucket itself - clustering, category-differentiated pins, region accumulation, `AbortSignal` - stays OPEN) + §CZ category/filter correctness (owner-deferred to the Map rebase pass); Category FilterSheet redesign + copy-mismatch bug; Savings redemption-history pagination end-state bug + sticky-header redesign; QA-seed Stage 3 coordinate verification; pg SSL-semantics warning; stale-generated-Prisma-client dev note; Profile-scope navigation-architecture concern | OPEN in the checklist; promote rows here as they become active |
| Savings ROI copy semantics | "You've saved £X, Y× your subscription": calendar-month vs billing-cycle comparison + annual-plan denomination | OPEN: needs owner product decision |
| Lifecycle nudges | Post-redemption "rate this merchant" delayed notification (timing/scheduler/dedup) + subscription-renewal notification (copy/event-source/destination) | OPEN: needs owner product decisions; Phase-6-adjacent |

## 2. Customer Website

| ID | Item | Status / trigger |
|---|---|---|
| §CU.1 | Branch-first migration (still consumes legacy `merchants` field); blocks Plan 4 M5 + Discovery Phase 3b backend cleanup | GATED: Tier 3 brainstorm-first |
| §BW | Customer-web test infrastructure | OPEN (blocks §DF-web) |
| Redesign | Pre-launch website redesign | IN PROGRESS: owner re-sequenced 2026-07-06 (direct brief; supersedes the 2026-06-09 sequencing for this workstream). Plan: `docs/superpowers/plans/2026-07-06-prelaunch-website-conversion-rebaseline.md`. D1 (ConsumerWaitlist form persistence) SUPERSEDED 2026-07-08: owner directed that account registration IS the pre-launch waitlist; the site routes all early-access CTAs to `/register`. MerchantLead interest endpoint unchanged |
| §FOUND.1 | Founding-member launch incentive backend (owner-directed 2026-07-08; site copy already promises it): pre-launch registrants get 2 months full membership free at launch (owner revised 3 -> 2 months, 2026-07-13) + a founding-member badge. Needs: (a) cohort definition (User.createdAt < launch date, or explicit flag/marker set at register), (b) grant mechanism (admin-grant subscription path: `stripeSubscriptionId` nullable supports non-Stripe grants; or a 100%-off 2-month promo), (c) badge surface (profile flag + app/web UI), (d) admin panel tooling to view the cohort, apply/revoke the grant at launch, and report take-up, (e) locality capture for launch-area notifications (web register postcode is optional; decide whether founding flow nudges it). PICK UP with the Admin Panel programme | OPEN, Tier 2/3; trigger = Admin Panel work or launch-prep, whichever first |

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
| Google Places quota hardening | ~~Move Google API cost/abuse protection from the file-based daily-cap comment to a Redis `atomicLimiter` before merchant-facing production use~~ CLOSED by PR #318 (`49c132fe`, Branches PR-6): the merchant-facing search route (`POST /api/v1/merchant/location/search`) now routes through `consumeMerchantLocationSearch()` in `src/api/shared/merchantLocationLimiter.ts` — a multi-instance-safe atomic (`atomicLimiter`) Redis limiter with global/per-user/per-merchant/per-IP tiers — BEFORE the billable `searchPlaces()` call. `googlePlaces.ts`'s own file-based daily/monthly cap remains, unchanged, as the admin-CLI-shared ceiling (not the merchant-facing gate). | CLOSED 2026-06-25 (#318) |

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
"Always live" semantics fix (owner-gated); flagship read-only voucher detail CLOSED 2026-07-07
by #413 (`381452f2` - flagship cards resolve to the same read-only `/vouchers/[id]` detail);
redemption reversal / merchantId denorm / redemption emails (still OPEN, NOT shipped by the
voucher governed-flows package - see the new §5 follow-ups block below); structured concierge corrections
(windows/cooldown/imageUrl); Staff & Access v1 deferrals (claim-supersession atomicity,
cross-tenant existence, cap enforcement, a11y); merchant M1 a11y focus-on-error +
OTP-lockout message; admin M2-M8 deferred lists; Option B B2+/B3/B4/B5 + photo-apply;
`canManageVouchers` migration (`20260622223003`) verified APPLIED on dev + staging + production (direct-SQL check 2026-07-09; the older local-dev-only claim here was stale); staging admin-OTP delivery UNVERIFIED; Karaara staging cleanup
UNVERIFIED; automated monthly merchant statements (from the old §R4 architecture note) not
yet tracked in any roadmap row: confirm placement; `GET /branches` `redemptionPin`-in-payload
row **CLOSED 2026-07-09** (chore/admin-s3-hygiene): the merchant branch wire exits already strip
the AES ciphertext via the `toMerchantBranch` serializer (shipped 2026-07-05, PR #377 chain) and
emit only the derived `redemptionPinSet` boolean, so the ciphertext never leaves the API; this PR
re-verified no merchant-web/admin-web consumer reads `redemptionPin` from those payloads and added
a full-DB-row closure pin to `tests/api/merchant/branch/wire-hygiene.test.ts` alongside the
existing list/read/patch/create wire pins (the guarded `GET /branches/:id/pin` reveal route is the
only legitimate exit and is untouched); optional #389 defence-in-depth follow-up (re-gate non-401/JSON-parse
throw paths; assessed non-security); cuisine-aware specialty filtering open product question
(cuisine selection does not narrow the specialty pool; Codex Vol-1 ~L11137); AdminRole enum
drift vs locked Q6b (shipped SUPER_ADMIN/OPERATIONS/FINANCE/CONTENT/SUPPORT; locked plan was
SUPER_ADMIN/ADMIN/OPERATIONS/SALES-later): confirm-or-correct.

**Business Profile v1 follow-ups (OPENED 2026-07-06 on the M1-M4 merge; do not forget):**
- **§BP-ADJ1** - **CLOSED 2026-07-07** (shipped PR #399, squash `70961cd0`; Opus-reviewed CLOSED/SHIP + Codex content-approved before merge): `getMerchantProfile` now nulls the 7 registered/compliance fields (`companyNumber`, `vatNumber`, `websiteUrl`, `contractStatus`, `contractStartDate`, `contractEndDate`, `verificationStatus`) for non-OWNER|BRANCH_MANAGER viewers. (Original finding, kept for traceability: the `...merchant` spread returned those base fields to a STAFF *API* caller even though the `/profile` page UI hid them; pre-existing member-read, low-sensitivity public-record numbers; Opus-surfaced.)
- **§BP-ADJ2** - **CLOSED 2026-07-07** (shipped PR #399, squash `70961cd0`, same review record): `createMerchantEditRequestCore` now rejects null/empty/mistyped `businessName` with `MERCHANT_EDIT_REQUEST_INVALID_FIELD` 400, while preserving `tradingName:null` clears. (Original finding, kept for traceability: a raw-API `{businessName:null}` stored a row that later failed admin `approveEdit` at the NOT NULL constraint - no corruption/breach; Opus-surfaced.)
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
- **Voucher governed flows D1-D5** - **ACTIONED 2026-07-07** (shipped #411-#413): decision packet at `docs/superpowers/plans/2026-07-07-voucher-governed-flows.md` - request-change, request-to-end, and withdraw are now SHIPPED; "run-again" was NOT in scope (D5, tracked separately below as §VG-RUNAGAIN). Reconciled against the existing "redemption reversal" row above: they are DIFFERENT features (voucher-lifecycle governed edits vs a customer-redemption-event reversal) - the redemption-reversal row stays OPEN/NOT shipped by this package. Follow-ups from the #411-#413 merge are tracked in the new block immediately below.
- Detail: this section's PRs #401-#409; `docs/PROJECT-STATE.md` §4.2 fidelity-wave paragraph (2026-07-07).

**Voucher governed-flows package follow-ups (OPENED 2026-07-07 on the #411-#413 merge; do not forget):**
- **§VG-IDX** (Voucher governed flows): the one-PENDING-per-voucher guard in #411 `ca1c6991` is app-level (checked in the writer), not DB-enforced - a race could create a concurrent duplicate `VoucherPendingEdit` review row. No privilege gain; Opus-adjudicated TRACK-not-build. A partial-unique index (`voucherId` where `status='PENDING'`) is a later nicety, not a bug fix.
- **§VG-RACE** (Voucher governed flows): a withdraw-submission racing an in-flight admin approve/reject is last-writer-wins, with the ADMIN decision winning if it lands first (consistent with the approved-waiting withdraw refusal already built into #411). Opus-adjudicated as-designed, TRACK-not-build, not an open bug.
- **§VG-RUNAGAIN** (D5, Voucher governed flows): "Run this again" (re-activate/duplicate-to-draft a finished/expired voucher) was explicitly OUT OF SCOPE for the #411-#413 build (owner decision, `docs/superpowers/plans/2026-07-07-voucher-governed-flows.md` D5) - a separate later slice, not started.
- **§VG-MIGRATE** (platform/deploy): PRODUCTION-only as of 2026-07-09 - the `voucher_governed_flows` migration (`20260707135148`, adds `VoucherPendingEdit`/`ApprovalType.VOUCHER_EDIT`/`ApprovalStatus.WITHDRAWN`) plus `keyring_fingerprint` (`20260629000000`) and `maintenance_alert_types` (`20260702000000`) are verified APPLIED on dev + staging (direct-SQL cross-check 2026-07-09); only the `production` Neon branch lacks them. GATED: owner-approved production deploy window (see `docs/PROJECT-STATE.md` §3 cross-check table).
- Detail: PRs #411 `ca1c6991` / #412 `350f941a` / #413 `381452f2`; the plan doc's as-built §7; `docs/PROJECT-STATE.md` §4.2 voucher-governed-flows-package paragraph (2026-07-07).

**Branch Location Trust follow-ups (OPENED 2026-07-09 on the #435 merge; do not forget):**
- **§LOC-1B** (Slice 1b) - CLOSED 2026-07-09 by PR #439 (`cef158a9`): the auto-trust pipeline now runs on BOTH edit lanes (reviewed-edit APPLY via a defensive `applyLocationTrust` in `editApplier` + draft-window direct sensitive edit), gated on a fresh postcode re-anchor; suggestion metadata staged in both outcomes; plan `docs/superpowers/plans/2026-07-09-branch-location-trust-slice-1b.md`.
- **§LOC-2** (Slice 2) - MERGED 2026-07-09 (PR #444, squash `0d137eed`, approved head `697573e5`; MERGED / NOT-ACCEPTED pending the acceptance walk's ADMIN lane): admin approval provenance badges ("Google-verified (unreviewed)" / "Human-confirmed" / "Needs review" / "Approximate (postcode)"), a `LocationTrustPanel` (pin coords + resolved address + external "Open in Google Maps" link + the NEEDS_REVIEW staged-suggestion context) on the approval screen, a "Needs location review (N)" filter chip on the branch list for discoverability, and the existing `confirmBranchLocation` flow kept as the single correction path (deep-linked, not rebuilt). Additive ADMIN-scope backend read exposes branch `latitude`/`longitude`/`googlePlaceId` + the staged suggestion (no customer-scope serializer touched; invariants L1-L4 intact; no approval gate changed). Plan `docs/superpowers/plans/2026-07-09-branch-location-trust-slice-2.md`. Map approach = coord display + external link, NOT an embedded mini-map, because the admin CSP (`default-src 'self'`) blocks external map iframes/tiles; an embedded map would need a CSP-loosening decision (flagged for the lead). Lead adjudication RESOLVED (2026-07-09, recorded on PR #444): NO "review recommended" nudge on ADDRESS_GEOCODED: the owner-approved model removes mandatory human review for cross-checked pins and the "(unreviewed)" badge wording is the deliberate spot-check affordance. Review-round addenda 2026-07-09: the surfaced staged suggestion now covers all three Slice 1/1b lanes with a source discriminator: an OPEN `BranchPendingEdit.__locationSuggestion` (`pending_edit`, precedence-winning) plus the freshest parseable audit suggestion across `BRANCH_CREATED` (`branch_created_audit`) and `BRANCH_UPDATED` (`branch_updated_audit`, the draft-window direct edit lane that stamps NEEDS_REVIEW in place); event map test-pinned (`STAGED_SUGGESTION_AUDIT_EVENTS`). Post-apply live-merchant NEEDS_REVIEW discoverability (queue-level surfacing) stays out of Slice-2 scope per the plan Inventory note.
- **§LOC-2B** (Slice 2 fidelity follow-up, Codex residual on #444, lead-accepted): `LocationTrustPanel` surfaces in the merchant-onboarding review path only, not inside the separate branch identity edit-review panel; widen when that lane gets its next fidelity pass. (The companion em-dash style nit was swept by `562ceda0`, merged via PR #452.) GATED: admin-web build slot.
- **§LOC-3** (Slice 3) - BACKEND MERGED 2026-07-10 (PR #452 `ea1cf979`, after the locked-order tolerance PR #451 `9d056f73`): pin-drop endpoint + `MERCHANT_CONFIRMED` tier + proxied static-map preview; design addendum APPROVED in-branch with all four owner decisions. UI MERGED 2026-07-10 (PR #458 `32b714f1`, SHA-bound at `1f0db6ad` after the canDropPin owner-gate review correction: entry points are OWNER-only matching the backend; BM keeps the reviewed Update-location lane). §LOC-3 CLOSED: Slice 3 complete end-to-end. Programme remainder: §LOC-4 (owner-gated backfill) + §LOC-2B (fidelity follow-up).
- **§LOC-4** (Slice 4) - DEFERRED-WITH-TRIGGER (owner decision 2026-07-10, accepting the lead's data-sized recommendation): the backfill's addressable universe is currently ONE real non-confirmed branch on staging (direct-SQL count 2026-07-10: 1 real POSTCODE_CENTROID + 1 real MANUALLY_CONFIRMED; production pre-launch/empty), so neither the script build nor billable Google calls are justified; the single branch is handled manually via the shipped pin-drop UI or admin confirm. NOT built (no dark script). TRIGGER to re-open: a real backlog of legacy unconfirmed branches, e.g. a bulk merchant import or a meaningful number of existing real branches that cannot be handled manually. Any future run stays owner-gated (billable Google API calls). Production migrations remain separately owner-gated: no production migration or backfill run is approved.
- **§LOC-MIGRATE** (platform/deploy) - PRODUCTION-only as of 2026-07-09: the `branch_google_place_id` migration (`20260709095646`, adds `Branch.googlePlaceId`) and the three earlier migrations (`keyring_fingerprint`, `maintenance_alert_types`, `voucher_governed_flows` - §VG-MIGRATE above) are verified APPLIED on dev + staging (both 56/56, direct-SQL cross-check 2026-07-09; staging apply landed with the storage-enablement deploy `28f3d75f`, approved SHA `a5808113`). Only the `production` Neon branch still lacks all four. GATED: owner-approved production deploy window (see `docs/PROJECT-STATE.md` §3 cross-check table + §4.4/§6).
- Detail: PR #435 `92d0b2bd`; spec `docs/superpowers/specs/2026-07-09-branch-location-trust-model.md`; plan `docs/superpowers/plans/2026-07-09-branch-location-trust-slice-1.md`; `docs/PROJECT-STATE.md` §4.2 Branch Location Trust Slice 1 paragraph + §6 RESOLVED note (2026-07-09).

**§ADM-LOGIN: CLOSED 2026-07-09 (owner-approved one-time staging reset).** The staging
`admin@redeemo.com` password had drifted from the documented seed via a completed 2026-06-26
password-reset flow (owner-range IPs, sandbox-allowlisted inbox, not attack-shaped; full
read-only investigation preserved in the acceptance-walk doc §7 pre-walk actions). Resolution:
forgot-password flow → reset link extracted from the QUEUED `CommunicationLog` row (token never
displayed, deleted after use) → **password restored to the documented seed value; staging-only;
production untouched; no other account modified**. Verified end to end (login + OTP + session +
the authenticated D67 read). Residual noted item: `m5-actor-*@example.com` AdminUser rows =
June integration-test leakage into the staging DB (pre-dates the test-DB isolation split);
harmless, cleanup optional.

**Acceptance-walk WF ledger (walk 2026-07-09; fix packet merged + re-probed 2026-07-10;
evidence of record = `docs/superpowers/plans/2026-07-09-merchant-portal-staging-acceptance-walk.md`).
CLOSED by the packet:** WF8 (#457 `d890bdb4`, live re-probe PASS both roles) · WF16 core
(#455 `54ba50df`) · WF3/WF9/WF5 + WF1 END-guard (#456 `aff601e8`) · WF0 (13/13 seeded PINs
re-encrypted 2026-07-10, before-state preserved) · WF2 (classified DESIGN: the locked
Insights eligibility spec excludes test merchants; not a defect). **Ratified (owner
2026-07-10):** WF11 device-trust intended · WF12/WF13 staff read-only voucher/branch views
intended (read-only only) · WF18 no-claim identity edits (kept as a policy note: claim-to-act
remains the onboarding-queue rule) · WF19 queue-only edit-request discovery. **OPEN rows from
the walk:**
- **§WF10/14 (copy):** replace the BM/STAFF staff-page "You can see your team..." copy with
  honest owner-only wording (owner accepted the honest-copy direction over a roster grant).
- **§WF15 (polish):** admin /redemptions search filters only on Enter with no affordance/hint.
- **§WF17 (gap):** no activity/comms timeline section on the admin merchant detail page.
- **§WF16-residual:** `MERCHANT_PROFILE_EDIT` rows stay unresolved-by-design in the queue
  merchant-name enrichment (no code path creates that type; add an arm if one ever does).
- **§WF1-backfill (optional):** link legacy `isMandatory` seed vouchers to RmvTemplates
  (the END-guard already closes the hazard; backfill only if flagship-lane testing on seeded
  merchants is wanted).
- **§WF4 (polish, seed/CSP):** seed profile images on external hosts violate img-src CSP.
- **§WF6 (polish):** ~1s reduced-nav flash while /profile loads.
- **§WF7 (polish):** Home "first redemption on its way" ignores awaiting-validation rows.
- **§457-nits (Opus, TRACK):** multi-membership denial surfaces 400 `MULTI_MEMBERSHIP_UNSUPPORTED`
  (state not live); denied non-owner Home loads cost one extra DB read (shell could skip
  onboarding fetches for non-owners).
- **§RESEND-KEY: RESOLVED 2026-07-10 (second email window PASSED).** The owner rotated the
  key (first attempt landed on Web; the worker copy sat STAGED until a worker deploy applied
  it); live probe then HTTP 200 (value never printed), and merchant OTP + password reset +
  staff invite/claim ALL delivered SENT-with-externalId, rewritten to `admin@redeemo.co.uk`
  only, owner-confirmed in the inbox; 0 SMS; queue empty; worker stopped again (windowed).
  Full record: `docs/runbooks/2026-07-10-staging-email-worker-enablement.md` §2b. Optional
  owner tidy-up: revoke the old invalid `staging-new` key in Resend.
- **§EMAIL-OTP-RECIPE (standing operational note; PERMANENT since 2026-07-11):** the
  staging worker is ALWAYS-ON (owner decision 4), so delivered CommunicationLog rows have
  payloads NULLed on send at all times and the read-the-code-from-DB recipe is dead for
  good. Codes/claim links come from the allowlist inbox (`admin@redeemo.co.uk`) only.
- **§EMAIL-DARK-LABEL (small fix; priority raised 2026-07-12):** the invite API returns
  `inviteDelivery: "EMAIL_DARK"` (and the portal shows the "email delivery is not live yet"
  banner) based on the WEB service's `EMAIL_ENABLED=false`, while the WORKER actually sends.
  With the worker now ALWAYS-ON the label is wrong permanently, not just during windows.
  Align the flag posture or derive the label from delivery outcome.
- **§KRAFT-FU (Kraft-walkthrough follow-ups, opened 2026-07-12; the packet itself is
  CLOSED: PROJECT-STATE change log 2026-07-12):** (a) gallery-photo crop parity: #484 wired
  the crop modal into logo/banner via file-upload, but the BrandingPhotosCard gallery path
  uploads uncropped; (b) email lookup normalization follow-up: #491 normalizes email on
  REGISTER only (transitional); login/forgot lookups stay exact-match with TRANSITIONAL
  comments pinning the contract; decide backfill + lookup-side normalization once mixed-case
  rows matter (census 2026-07-11: zero mixed-case MerchantAdmin rows on staging/dev);
  (c) fold §EMAIL-DARK-LABEL into the next merchant-web slice.

**B2 address search - staging status: RESOLVED (2026-07-09).** The merchant-portal branch
address search (PR #318, `49c132fe`) is fully built and merged - server-side Places New Text
Search via `searchPlaces()` + the Redis atomic limiter above, candidate-token flow, UI. The
2026-07-08 staging failure was a Google-side EXPIRED KEY (HTTP 400, `API_KEY_INVALID`), not a
code defect. The owner renewed the key and updated the Railway staging variable; a live
staging probe on 2026-07-09 (after the `a5808113` enablement deploy, deployment `28f3d75f`)
returned 3 candidates for a real query with no latitude/longitude leak. Working end to end;
no open action. (Observability hardening from the 2026-07-08 note remains in place:
`src/api/lib/googlePlaces.ts` logs the Google error's HTTP status / `error.status` /
`error.details[].reason` server-side on any non-429 failure, so a future expired/invalid/
disabled key is visible in logs without needing a live probe.)

## Change log

- **2026-07-10** · Acceptance-walk reconciliation: §ADM-LOGIN flipped CLOSED (owner-approved
  staging-only reset back to the documented seed, production untouched; investigation preserved
  in the walk doc). New §5 WF-ledger block: packet-closed items (WF8/#457, WF16/#455,
  WF3+WF9+WF5+WF1-guard/#456, WF0 sweep, WF2 classified design), owner ratifications
  (WF11, WF12/13, WF18, WF19), and open rows §WF10/14 copy, §WF15, §WF17, §WF16-residual,
  §WF1-backfill, §WF4, §WF6, §WF7, §457-nits, plus **§RESEND-KEY owner action** (staging
  Resend API key INVALID; blocks the email window re-run). PROJECT-STATE §3/§4.2/§4.4/§6 +
  the Merchant roadmap banner updated in the same PR; the §3 migration table gains the
  Slice 3 enum column (staging 57/57 as of 2026-07-10, production still five behind).
- **2026-07-09e** · S3 hygiene (chore/admin-s3-hygiene): **§5 `GET /branches` `redemptionPin`
  row CLOSED** - the payload was already hardened by the `toMerchantBranch` serializer (PR #377
  chain, 2026-07-05); this pass re-verified no web consumer reads it and added a full-DB-row
  closure test-pin. Same PR also fixed the admin-web capability-mirror drift (added
  `merchant:manage-vouchers` to the OPERATIONS mirror to match backend `ALL_SLICE1_CAPS`, with a
  literal-list parity test) and two stale-copy/comment fixes (admin-shell nav doc comment; a
  storage-dark static-copy audit found none - the one `STORAGE_NOT_ENABLED` string is a
  runtime-driven degrade keyed on a backend error code, correct as-is).

- **2026-07-09d** · Admin S1 merges recorded: **§LOC-2 flipped to MERGED** (PR #444 squash
  `0d137eed`, owner-approved head `697573e5`; Codex-reviewed; the review round added the
  three-lane staged-suggestion read + the CI fixture fix already noted on the row). PR #443
  (admin-web H5 auth BFF, squash `5e8a6377`, owner-approved head `e455f5f2`) MERGED the same
  day: admin refresh token moves out of localStorage into an httpOnly cookie (BFF-lite),
  access token memory-only, new `middleware.ts` route gate; closes the admin-web half of
  security-audit H5 (customer-web H5 remains OPEN, tracked in the security memory thread).
  No row existed for H5 (security items route via the SEC pointer row above); recorded here
  for the register's audit trail.

- **2026-07-09c** · Acceptance-walk prep: new §5 row **§ADM-LOGIN** (staging admin credential
  drifted from seed via a 2026-06-26 completed password-reset; read-only investigation
  recorded; owner decision required; blocks the walk's ADMIN lane). D67 SHIPPED + DEPLOYED
  (PR #441 `09af1cfa`; staging deployment `c6d04078` @ `f9cc9652`); PROJECT-STATE §6 D67 row
  RESOLVED in the same PR. Deploy-verification rule (probe new routes, not just health) added
  to the staging runbook §14 after the `railway up` worktree stale-artifact anomaly
  (`6f540979`, superseded). Acceptance-walk plan:
  `docs/superpowers/plans/2026-07-09-merchant-portal-staging-acceptance-walk.md`.
- **2026-07-09b** · §5 B2 address-search live note flipped to RESOLVED: the owner renewed the
  expired Google key + Railway staging variable, and a live staging probe on 2026-07-09
  (post-`a5808113` enablement deploy, deployment `28f3d75f`) returned 3 candidates with no
  coordinate leak. Salvaged from superseded PR #440 per Codex review (the migration/storage
  corrections in #440 were dropped: #438's per-branch cross-check table is the source of truth).
- **2026-07-09** · Consolidated merge-bookkeeping pass (branch `docs/2026-07-09-merge-bookkeeping`)
  for the day's merged PRs (updated same day as #436/#439 landed): §1 "Profile Sub-PR 1 minors" row annotated - the
  loading-skeleton item CLOSED by PR #433 (`ccf9baa1`, `ProfileSkeleton`), the other four
  minors stay OPEN. §1 "Checklist-only customer-app tail" row annotated - the Map in-area
  reliability slice (deterministic candidate pool, `branchesOnly` fast path, bbox-quantized
  client caching) SHIPPED via PR #434 (`3e20bbeb`, plan
  `docs/superpowers/plans/2026-07-09-map-in-area-reliability-slice.md`); the broader Map
  polish bucket stays OPEN. New §5 follow-ups block opened for Branch Location Trust Slice 1
  (PR #435 `92d0b2bd`, spec `docs/superpowers/specs/2026-07-09-branch-location-trust-model.md`,
  owner-APPROVED 2026-07-09): §LOC-1B (reviewed-edit APPLY-lane trust pipeline, Slice 1b - CLOSED same day by PR #439 `cef158a9`, which covers BOTH edit lanes),
  §LOC-2 (admin mini-map + provenance badges, Slice 2), §LOC-3 (merchant pin-drop, Slice 3),
  §LOC-4 (owner-gated Google backfill, Slice 4), §LOC-MIGRATE (migration state verified by
  direct SQL 2026-07-09: dev + staging carry all four recent migrations, production-only
  gate remains). PR #432 (`6987e32d`, Savings 429 fix + customer-register `register` tier)
  recorded in `docs/PROJECT-STATE.md` §4.1 only - no register row change needed. PR #436
  (customer-app scroll-jank perf batch 1) MERGED same day (`75ef7d41`); PR #439 (Slice 1b,
  `cef158a9`) MERGED same day, closing §LOC-1B. `docs/PROJECT-STATE.md` §3/§4.1/§4.2/
  §4.4/§6 updated in the same PR.
- **2026-07-08** · B2 address-search follow-ups (decision-free hardening + doc reconcile,
  no owner action taken here): §3 "Google Places quota hardening" row CLOSED - stale, PR #318
  (`49c132fe`, merged 2026-06-25) already added the multi-instance-safe Redis atomic limiter
  (`consumeMerchantLocationSearch()` / `src/api/shared/merchantLocationLimiter.ts`) in front of
  the merchant-facing search route; the file-based cap in `googlePlaces.ts` remains, unchanged,
  as the separate admin-CLI-shared ceiling. New §5 live note: a Fable diagnostic probe (2026-07-08)
  found the staging address-search failure is a Google-side EXPIRED `GOOGLE_MAPS_API_KEY` (HTTP
  400, `API_KEY_INVALID`), not a code defect; owner action (renew key + Railway staging var
  update) is tracked separately and NOT done by this entry. Also landed: `googlePlaces.ts` now
  logs the Google error's HTTP status / `error.status` / `error.details[].reason` server-side on
  every non-429 failure (observability only; the `GOOGLE_UNAVAILABLE` client contract is
  unchanged); `.env.example` and `docs/operations/google-places-setup.md` corrected from stale
  "Phase 1 / admin-CLI-only / future merchant self-service" framing to reflect the shipped
  merchant-portal address search; the admin platform blueprint's `GOOGLE_PLACES_API_KEY` typo
  corrected to the real `GOOGLE_MAPS_API_KEY` var name.
- **2026-07-07b** · Voucher governed-flows package (#411-#413) reconciled: §5 headline list - "flagship read-only voucher detail" CLOSED (shipped #413 `381452f2`); the redemption-reversal item annotated still OPEN/NOT shipped by this package. The placeholder "Voucher governed flows D1-D5" bullet marked ACTIONED (request-change/request-to-end/withdraw SHIPPED; "run-again" was D5, out of scope). New follow-ups block opened: §VG-IDX (one-PENDING guard is app-level not DB-enforced, TRACK-not-build per Opus), §VG-RACE (withdraw-vs-approve last-writer-wins, admin wins, TRACK-not-build per Opus), §VG-RUNAGAIN (D5 "Run this again" owner-deferred, separate slice), §VG-MIGRATE (the new `voucher_governed_flows` migration plus the two earlier pending migrations `keyring_fingerprint` + `maintenance_alert_types` are all local-dev-only; staging/prod deploy is a separate owner-gated step). `docs/PROJECT-STATE.md` §4.2/§6/§8 and the Merchant Portal roadmap updated in the same PR.
- **2026-07-07** · Merchant Portal fidelity wave (#401-#409) reconciled: §BP-ACC annotated **v1 SHIPPED** (backend #401 `3c01a1f0` + #403 `1c70080e`, page #405 `38201d4c`) - its change-email/phone-verification and notification-prefs/reports sub-items split out as new tracked rows §BP-ACC-EMAIL and §BP-ACC-PREFS (neither implies §BP-ACC v1 is incomplete; they were never in scope for v1). New rows opened for the Home dashboard (#406 `8f8877a4`): §HOME-NVR (legal-gated new-customers tile), §HOME-THRESH (live-just-started threshold owner-confirm), §HOME-DOCS (expiring-docs needs `MerchantDocument.expiryDate`). New row §VA-GRAN for per-voucher analytics (#408 `cc7549b4`) granularity/STAFF-deny confirm. New row §RDM-COUNT for Redemptions (#409 `73175c8b`) true awaiting-count/tabs. Voucher governed-flows decision packet (`docs/superpowers/plans/2026-07-07-voucher-governed-flows.md`) cross-referenced against the existing redemption-reversal row. §BP-ADJ1 + §BP-ADJ2 CLOSED: shipped by PR #399 (squash `70961cd0`, merged 2026-07-07 immediately before the wave; Opus-reviewed CLOSED/SHIP + Codex content-approved) - §BP-ADJ1 = role-gate the 7 registered/compliance fields on `getMerchantProfile` for non-OWNER|BRANCH_MANAGER viewers, §BP-ADJ2 = server-side `businessName` validation (`MERCHANT_EDIT_REQUEST_INVALID_FIELD` 400) preserving `tradingName:null` clears; rows annotated in place per the register's traceability convention. PROJECT-STATE §4.2/§8 updated in the same PR.
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
- **2026-07-08** · Pre-launch conversion pivot (owner direct brief in the website session):
  D1 lead-capture form persistence SUPERSEDED (registration is the waitlist; all early-access
  CTAs route to `/register`); new §FOUND.1 row opened for the founding-member 3-months-free +
  badge backend/admin tooling that the live site copy now promises. Pick §FOUND.1 up with the
  Admin Panel programme or launch-prep.
