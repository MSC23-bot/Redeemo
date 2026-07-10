# Merchant Portal · authenticated staging acceptance walk (plan + evidence log)

**Status: WALK COMPLETE (all four lanes run 2026-07-09) + FIX PACKET EXECUTED AND
RE-PROBED (2026-07-10). This document is the walk's evidence log of record; the status
flips it justifies land in PROJECT-STATE via the reconciliation PR that carries this
version. §7 holds the lane evidence + findings WF0-WF19; §10 holds the post-walk
execution record (merges, migration, deploy, WF8 re-probe PASS, WF0 sweep, email
window outcome, ratifications).**

## 1. Goal and definition

Convert every Merchant Portal module from MERGED / NOT-ACCEPTED to ACCEPTED (or to a recorded
finding) by exercising it on staging with real authenticated sessions in all three roles.
Acceptance here = the staging-acceptance clause of the roadmap's Definition of Complete; it
does NOT waive the other clauses (legal gates, provider gates, deferred sub-surfaces stay as
recorded).

## 2. Preconditions (all met as of 2026-07-09 except A4)

- A1. Staging backend = accepted deployment `c6d04078` @ main `f9cc9652` (D67 included);
  `/health` 200; new-route probes passed. DONE.
- A2. Staging DB current: 56/56 migrations; storage LIVE (two-bucket, privacy-probed);
  Google address search working. DONE.
- A3. Vercel merchant-web + admin-web deployed at the same main tip (no skew). DONE.
- A4. **§ADM-LOGIN resolved** (owner supplies the staging admin password or approves a
  one-time reset). BLOCKS the D lane only; B/C/S lanes can start without it.
- A5. Worker stays OFFLINE (owner decision): every OTP / invite / claim email is retrieved
  from `CommunicationLog` via read-only SQL (recipe in the storage-enablement memory +
  toolkit skill). This is the accepted method for the whole walk.

## 3. Accounts

| Role | Account | State | Notes |
|---|---|---|---|
| OWNER (merchant) | `merchant@redeemo.com` (The Coffee House) | WORKING (verified 2026-07-09: login + OTP-from-DB + uploads) | primary walk account |
| BRANCH_MANAGER | invite a fresh BM to The Coffee House during the walk (Staff & Access lane) | to create | the invite/claim flow IS a test item; claim link from `CommunicationLog` |
| STAFF | invite fresh STAFF the same way | to create | exercises D1/D7/D9 role boundaries from a clean slate |
| Admin (D lane) | `admin@redeemo.com` (SUPER_ADMIN) | BLOCKED on §ADM-LOGIN | needed for D67 verification + approval-queue items |
| Customer (redemption generator) | `customer@redeemo.com` | check on entry: needs ACTIVE subscription on staging to redeem | if not subscribed: owner-approved single-row grant on the staging DB (mirrors the dev toolkit grant; owner sign-off first), else reuse existing staging redemption rows |
| Existing BM (alternative) | `s@hotmail.com` (Karaara BM, emailVerified=false) | fallback only | prefer the fresh-invite path above |

## 4. Walk structure: four lanes, in order

**Lane B (OWNER, core business):** login/OTP + session persistence + logout · Home dashboard
(live-business variant: KPI tiles, needs-attention, charts) · Business Profile (read, direct
edit registered details, public-identity edit-request incl. pending banner + withdraw) ·
Branches (list, detail, edit lanes incl. address search + Google-pin trust outcome, opening
hours, amenities modal, PIN reveal via Quick Actions) · Vouchers (flagship read-only detail +
request-change; custom voucher create/edit/submit, request-end, withdraw; photo upload now
storage-backed) · Redemptions (list filters/sort/search, detail drawer, CSV export,
Validate-a-code happy + format-error paths) · Documents (upload/list/view via private bucket)
· My Account (details edit, change password, sessions list, sign-out-everywhere) · Insights
(all tabs incl. busy-times bands, reports card; behavioural/CSV stays legal-gated =
expect the calm Not-available state, that IS the pass) · notifications bell + deep-links.

**Lane C (BRANCH_MANAGER, scope boundaries):** claim invite → first login · nav = full
(FULL_NAV_ROLES) but data scoped to assigned branches · branch writes allowed where D-BM
rules grant · Insights visible (canViewInsights) · Business Profile view incl. owner
contact (locked v1 decision) · no owner-only affordances (staff management, submit lanes,
document upload is OWNER-only: BM sees view) · per-branch PIN quick-action only if the
capability extension shipped (expected NOT: record as known gap, not a failure).

**Lane S (STAFF, fail-closed):** claim invite → login · lean Home baseline (Redemptions +
Help only; NO Vouchers affordance, NO Insights nav) · redemptions scoped read + validate ·
`/profile`, documents, insights, staff-management all fail closed (404/403/redirect per
surface contract) · session-lost redirect (#431) sanity.

**Lane D (ADMIN, verification + D67):** gated on §ADM-LOGIN. Admin OTP login (challenge
+ code from `CommunicationLog`) · **D67: /redemptions nav item visible (SUPER_ADMIN), list
renders staging rows incl. the walk's own fresh redemption; Test badge + include-test toggle;
status/code filters; capability fail-closed check** · approval queue: claim → review → apply
one of the walk's pending edits (public-identity or voucher change) end to end · admin
merchants directory + documents view (presigned) · timeline/comms read.

Cross-lane sequencing note: B generates the pending-edit + redemption artifacts that C/S/D
then observe; run B first, then C, then S, then D (D last also gives §ADM-LOGIN resolution
the longest runway).

## 5. Evidence to collect (per item)

- HTTP evidence for API-level items (status code + curated response shape; never tokens,
  never secrets) and screenshots for UI items; findings referenced by lane+number.
- Every PASS/FAIL lands in the checklist table (working copy of this doc); FAILs become
  numbered findings in §7 with severity (blocker / must-fix / polish) and NO ad-hoc fixes
  during the walk (reconciliation-mode rule: cross-check spec → baseline → device, record,
  fix in follow-up PRs).
- On completion: PROJECT-STATE §4.2 statuses flip in ONE reconciliation PR citing this log.

## 6. Explicitly out of scope for the walk

Production anything · worker/email enablement · legal-gated Insights surfaces (their gated
states are asserted, not bypassed) · Merchant Mobile App · customer-app device QA (only the
single redemption-generator flow is used) · performance benchmarking.

## 7. Findings log (append during the walk)

**Pre-walk actions (2026-07-09, before Lane B):**
- **§ADM-LOGIN RESOLVED (owner-approved one-time reset, ~17:25Z):** the staging
  `admin@redeemo.com` password was reset via the forgot-password flow (reset link extracted
  from the QUEUED `CommunicationLog` row; worker offline; token never displayed and deleted
  after use). **Staging-only; set BACK to the documented seed value; production untouched;
  no other account modified.** Verified: admin login + OTP-from-DB + session established.
- **Lane D pre-verification (authenticated D67, API level):** `GET /api/v1/admin/redemptions`
  200 with 33 staging rows; customer names masked ("First L."); leak-check found no
  pin/email/phone fields; filters correct (awaiting 29 + validated 4 = 33; `includeTest=false`
  excludes the 1 test row; code-prefix and merchantId narrowing work; unknown merchantId
  returns 0). Owner accepted this evidence 2026-07-09. Lane D's residual scope = the admin-web
  UI walk (nav item, page states, approval-queue apply).
- **Lane B prerequisite met without mutation:** staging has subscribed customers
  (`staging-customer@redeemo.co.uk` ACTIVE to 2027-05; `customer@redeemo.co.uk` ACTIVE to
  2026-07-27); no subscription grant needed.

### Lane B (OWNER) evidence

**Run 2026-07-09 ~19:00-19:22Z, merchant@redeemo.com (The Coffee House), portal
`redeemo-merchant-web.vercel.app` @ f9cc9652. 32 screenshots archived locally
(`.playwright-mcp/walk-evidence/laneB-*.png`, gitignored). Result: 9 PASS, 1 PARTIAL
(Vouchers, WF1), 1 module finding (Insights, WF2).**

| # | Module | Result |
|---|---|---|
| 1 | Auth (login → OTP-from-DB → session) | PASS |
| 2 | Home dashboard (live, sparse-data presentation) | PASS (see WF7) |
| 3 | Business Profile (read, direct edit persisted, edit-request + pending banner + one-pending guard) | PASS (see WF3/WF4/WF6) |
| 4 | Branches (list/detail/hours/amenities modal/address-search candidates/PIN reveal) | PASS |
| 5 | Vouchers (flagship read-only detail; custom draft create + photo upload) | PARTIAL: flagship request-change NOT exercisable on this merchant (WF1) |
| 6 | Redemptions (list w/ fresh code XAZNLVD8, filters, drawer, validate happy + error paths, row flips to Validated) | PASS |
| 7 | Documents (PRICE_LIST listed; presigned Open link 200 application/pdf) | PASS |
| 8 | My Account (details edit, change-password modal open/cancel, sessions list, sign-out-everywhere affordance) | PASS |
| 9 | Insights | FINDING WF2 (warming-up state only) |
| 10 | Notifications (bell, panel, /notifications; no notification existed to deep-link) | PASS |
| 11 | Logout (confirm dialog → signed out) | PASS |

**Findings (WF = walk finding):**
- **WF0 (must-fix, staging data + possible code defence):** seeded branch PINs are
  UNREADABLE under the staging `ENCRYPTION_KEY` (customer redeem returned
  `REDEMPTION_PIN_UNREADABLE` 500 on dev-branch-001). In-product fix applied during
  prep: OWNER set a fresh PIN (re-encrypts under the current key). Any other seeded
  branch will hit the same until its PIN is re-set. Consider a sweep/backfill.
- **WF1 (must-fix, staging data; ADJUDICATED not a code regression):** the walk agent
  found "Request to end" offered and NO request-change on Coffee House flagships.
  Direct SQL shows those rows are `isMandatory=true` but `isRmv=false`,
  `rmvTemplateId=null` - legacy seeds predating the RMV model. The governed-flows
  code keys (correctly) off `isRmv`, so the UI treated them as custom. Karaara has 2
  proper `isRmv=true` rows; Coffee House / Covelum / My Kerala carry 2 legacy
  mandatory-but-not-RMV rows each. Remedy: staging data backfill (link RmvTemplate +
  set `isRmv`) and consider a defence-in-depth END guard on `isMandatory`. The
  flagship request-change lane remains exercisable on Karaara (owner account).
- **WF2 (must-fix for module acceptance):** Insights renders only the global
  "warming up" empty state (no tabs, no reports card, no gated blocks) even with a
  validated redemption. Consistent with the known analytics-aggregation gap; needs
  eligibility-threshold confirmation before calling it a bug vs designed early-life.
- **WF3 (must-fix, copy/logic):** Profile compliance card shows "You have not signed
  the merchant agreement yet." AND a "View signed agreement" button on a LIVE
  business simultaneously.
- **WF4 (polish, seed/CSP):** seed profile images (unsplash/placehold.co hosts)
  violate the img-src CSP allowlist → broken images on /profile; real R2 uploads
  unaffected.
- **WF5 (polish):** undersized voucher-photo upload returns generic "Upload failed.
  Please try again." instead of naming the dimension requirement.
- **WF6 (polish):** sidebar flashes a reduced "Setting up" nav for ~1s while /profile
  loads before the real Live state.
- **WF7 (polish/observation):** Home showed "Your first redemption: On its way" while
  1 awaiting-validation redemption existed (validated-only counting?).

**Artifacts left on staging (deliberate, for Lane D / cleanup):** pending
public-identity edit-request (description incl. "Acceptance walk test description");
draft custom voucher "15% off" `aff901b7-…` (marked "do not approve"); validated
redemption XAZNLVD8; Company number set to 12345678; My Account jobTitle
"Acceptance walk"; branch PIN re-set (WF0). No flagship change-request artifact
(blocked by WF1). Password unchanged; nothing deleted; branch location unchanged.

### Lane C (BRANCH_MANAGER) evidence

**Run 2026-07-09 ~20:09-20:31Z. Invite → claim → first login ALL PASS; 8 of 11 scope
checks PASS; 1 blocker-severity finding (WF8), 2 further findings (WF9 adjudicated,
WF10). Screenshots `.playwright-mcp/laneC-*.png` (gitignored).**

Invite/claim highlights: Staff & Access invite dialog offers name/email/job-title,
role radios (Owner/Branch manager/Staff), a Manage-vouchers toggle on BM (left OFF),
and per-branch scoping (Specific = Main Branch used); People list showed the pending
invite with an honest "email delivery is not live yet" banner; the claim link (from
the QUEUED `merchant_claim` email) asked only for a new password with a live strength
checklist → "Account ready"; first BM login prompted OTP as expected. DB cross-check:
membership role=BRANCH_MANAGER, allBranches=false, canManageVouchers=false, ACTIVE.

| # | Item | Result |
|---|---|---|
| Invite / pending state / claim / BM login | PASS (4/4) |
| 8 | Nav: full BM nav (omits owner-only Grow/Promote/Billing section) | PASS |
| 9 | Home | **BLOCKED: WF8** |
| 10 | Redemptions scoped to Main Branch; XAZN LVD8 visible; drawer opens | PASS |
| 11 | Business Profile: renders incl. owner-contact (locked v1 decision); NO edit affordances for BM (owner-only direct-edit + edit-request correctly absent) | PASS |
| 12 | Documents: view via presigned link works; NO upload affordance | PASS |
| 13 | Staff & Access: invite/remove correctly denied (403 on staff GETs) but see WF10 | PASS boundary / WF10 |
| 14 | Vouchers: no create; Actions offers only "View redemptions" (delegation OFF) | PASS |
| 15 | Branches: scoped list; full edit affordances + PIN reveal for the ASSIGNED branch | PASS per D-BM design; see WF9 copy bug |
| 16 | Insights: renders for BM (200 overview; same WF2 warming-up state) | PASS |
| 17 | My Account: BM identity, sessions list ("This device") | PASS |
| 18 | Logout | PASS |

**Findings:**
- **WF8 (BLOCKER for the BM Home surface; functional, not security):** after OTP the
  BM landing on `/` is force-redirected to `/sign-in`. Cause captured on the network:
  the shell calls `/api/v1/merchant/onboarding/status` + `/onboarding/checklist`,
  which return **401** (not 403) for a valid BRANCH_MANAGER token; the #431
  session-lost interceptor reads the 401 as session expiry, enters a refresh/re-login
  storm (spawning "API or script access" session rows), then tears down to /sign-in.
  Every other endpoint (profile, vouchers, insights, notifications) returns 200 for
  the same token, and direct-URL navigation to all other pages is stable (used as the
  lane workaround). Fix candidates: onboarding routes return 403 for non-owner (or
  the shell skips them for non-owners); interceptor should not global-teardown on
  onboarding 401s. ALSO affects Lane S expectation (STAFF lean Home may bounce the
  same way: verify on entry).
- **WF9 (must-fix, COPY: adjudicated NOT an authz hole):** the invite dialog tells
  the owner a Branch manager "Cannot edit business details, branches, or branch
  PINs", but the shipped design (Staff & Access PR-2 D3 + D-BM rules; verified in
  `getBranchPin`: boundary = OWNER or ASSIGNED BRANCH_MANAGER, STAFF denied) grants
  an assigned BM branch edits + PIN reveal/change/send, and the BM had exactly those
  on the assigned branch. The dialog copy misstates the granted capability
  ("business details" is accurate; "branches, or branch PINs" is not). Fix = copy.
- **WF10 (must-fix or copy decision):** BM Staff & Access reads "You can see your
  team, but only an owner can invite or change members" yet the roster renders empty
  because `GET /merchant/staff` returns 403 for BM. Either grant BM a read-only
  roster or change the copy. (Positive: proper 403 here, unlike WF8's 401.)
- **WF11 (observation, likely by design):** owner re-login at Lane C start prompted
  NO OTP (same browser/deviceId as Lane B = trusted device); BM's FIRST login did
  prompt OTP. Consistent with device-trust; confirm intended.

**Artifacts:** walk-bm@redeemo.test (BRANCH_MANAGER, Main Branch, delegation OFF,
recorded acceptance-test credential Walkbm1234!). No mutations beyond the invite;
PIN revealed but NOT changed; nothing deleted.

### Lane S (STAFF) evidence

**Run 2026-07-09 ~21:16-21:32Z. Invite → claim → first login ALL PASS; WF8 CONFIRMED
for STAFF (same mechanism, network-evidenced); fail-closed probes: insights 403 +
profile role-denied + no PIN anywhere = PASS; 3 findings (WF12-WF14). No authz or
mutation hole found. Screenshots `.playwright-mcp/laneS-*.png` (gitignored).**

Invite highlights: STAFF invite dialog copy captured VERBATIM (staff Can "View
vouchers" / "Validate redemption codes at their branches"; Cannot "Manage vouchers,
the team, branches, or business details"; voucher-management delegation explicitly
BM-only and disabled). Claim = password-only with strength checklist; first login
prompted OTP. DB cross-check: role=STAFF, Main Branch scope, canManageVouchers=false.

| # | Item | Result |
|---|---|---|
| Invite / pending / claim / staff login | PASS (4/4) |
| 6 | WF8 on `/` | **CONFIRMED for STAFF**: onboarding checklist+status 401 for a valid staff token → interceptor refresh storm → teardown to /sign-in; same token 200s on profile/notifications/vouchers-rmv; all other pages stable via direct URL |
| 7 | Lean nav baseline (Home, Redemptions, My account, Help ONLY) | PASS |
| 8 | Home | Not observable (WF8) |
| 9 | Redemptions scoped read + drawer; Validate-a-code reachable, garbage input → calm error, nothing consumed | PASS |
| 10 | /insights 403 calm denial · /profile role-denied · /staff 403 (see WF14) · /account allowed (per-user) | PASS |
| 10b | /vouchers, /branches reachable read-only | WF12/WF13 (see adjudication) |
| 11 | NO PIN reveal anywhere for STAFF (list badge only, no detail section, no quick action) | PASS (D3 held) |
| 12 | My Account renders staff identity + sessions | PASS |
| 13 | Logout w/ confirm | PASS |

**Findings:**
- **WF8 (BLOCKER, now confirmed BM + STAFF):** identical 401-on-onboarding →
  session-teardown mechanism for both non-owner roles. One fix covers both
  (onboarding routes 403 for non-owner or shell skips them; interceptor hardening
  optional). Network evidence archived in both lanes.
- **WF12 + WF13 (ADJUDICATED: spec-reconciliation, owner ratification needed; NOT
  code defects, NOT authz holes):** `/vouchers` and `/branches` are URL-reachable
  for STAFF as strictly READ-ONLY pages (no writes, no PIN, no edit affordances;
  APIs return 200 for reads, 403 for writes). The walk plan's Lane S contract
  expected hard fail-closed, but the SHIPPED invite-dialog copy explicitly grants
  staff "View vouchers", and branch READ visibility is coherent with the validate
  job. Adjudication: the plan overstated the contract; shipped behaviour is
  internally consistent (nav-hidden + read-only). Owner to ratify intended staff
  read scope; if ratified, these close with no code change (optionally add the
  nav-parity route guard for tidiness).
- **WF14 (must-fix copy; STAFF instance of WF10):** `/staff` shows "You can see
  your team..." with an empty roster (API 403). Same copy-vs-capability decision
  as WF10, one fix for both roles.

**Artifacts:** walk-staff@redeemo.test (STAFF, Main Branch, Portal access, recorded
acceptance-test credential Walkstaff1234!). No mutations beyond the invite; nothing
validated or deleted.

### Lane D (ADMIN) evidence

**Run 2026-07-09 ~21:36-21:48Z, admin@redeemo.com (SUPER_ADMIN),
`redeemo-admin-web.vercel.app`. Result: 8 PASS + 1 pass-with-finding + 1 surface
absent (timeline, WF17); exactly ONE mutation (the scripted apply); findings
WF15-WF19. Screenshots `.playwright-mcp/walk-evidence/laneD-*.png` (gitignored).
Lane D acceptance criteria MET.**

| # | Check | Result |
|---|---|---|
| 1 | Two-step admin login (password → OTP-from-DB) | PASS |
| 2 | Nav shows Approval queue + Merchants + Redemptions (D67) | PASS |
| 3 | D67 /redemptions: XAZNLVD8 visible (masked "Jane S.", Validated); chips work; code search finds it; include-test default ON, toggling OFF removes exactly the 1 Test-badged row; NO pin/email/phone anywhere | PASS (WF15 polish) |
| 4 | Approval queue: Lane B identity edit found, diff old→new rendered, APPROVED/applied | PASS (WF16, WF18) |
| 5 | Apply verified 3 ways: SQL description updated; admin detail shows new text + hasPendingIdentityEdit:false; merchant_edit_applied email QUEUED at click time | PASS |
| 6 | Draft "15% off" absent from queue (never submitted; zero AdminApproval rows) | PASS |
| 7 | Merchants directory + Coffee House detail + PRICE_LIST presigned (300s expiry, no raw-key field, no redemptionPin in any payload) | PASS |
| 8 | Timeline/activity surface | absent (WF17: gap, not failure) |
| 9 | Notifications bell + deep-link (tested on existing item) | PASS (WF19) |
| 10 | Logout | PASS |

**Findings:**
- **WF15 (polish):** /redemptions search filters only on Enter, with no button or hint;
  clearing also needs Enter.
- **WF16 (must-fix):** approval-queue rows for ALL non-voucher types render
  "Unknown merchant" (identity edits, branch add/edit); only voucher rows resolve
  the merchant name. Made the Lane B item findable only by timing/URL.
- **WF17 (gap, recorded):** no activity/comms timeline section on the admin merchant
  detail page (plan check assumed one; M7 timeline may live elsewhere or be absent
  from this surface).
- **WF18 (observation, ratify):** identity-edit review offers Approve/Reject directly
  with no claim step (applied while labelled "Unclaimed"); claim-to-act appears to be
  onboarding-queue-only. Confirm intended vs the claim-to-act rule.
- **WF19 (observation, ratify):** the Lane B edit-request emitted NO admin bell
  notification (queue-only discovery). Confirm intended emitter scope.
- Minor note: presigned URLs necessarily embed the object path for their 300s life;
  the "raw storage paths are never exposed" copy is technically imprecise but there
  is no raw-key field or long-lived exposure.

## 8. Walk completion summary (2026-07-09, all four lanes run)

- **Lane B (OWNER): 9/11 PASS**, Vouchers PARTIAL (WF1 seed-data), Insights WF2.
- **Lane C (BM): invite/claim/login + 8/11 PASS**, Home blocked (WF8).
- **Lane S (STAFF): all fail-closed boundaries held**, Home blocked (WF8 confirmed
  same mechanism), WF12/WF13 adjudicated spec-reconciliation, no authz hole.
- **Lane D (ADMIN): acceptance criteria MET** incl. D67 end-to-end and the
  review→apply path triple-verified.
- **Cross-lane security posture: NO authorization hole found in any lane.** Every
  boundary that mattered (PIN, PII masking, staff denial, tenancy, capability
  gating) held; all blockers/findings are functional, copy, data-shape, or
  spec-reconciliation items.
- Findings ledger: WF0-WF19 (10 actionable: WF0 WF1 WF2 WF3 WF8 WF9 WF10/WF14 WF16;
  4 ratifications: WF11 WF12/13 WF18 WF19; rest polish).
- Status flips + register closures go in the reconciliation PR after owner review
  of the consolidated fix packet.

## 9. Reconciliation-PR skeleton (DRAFT, prepared 2026-07-10; NOT status: nothing below is in effect until the reconciliation PR merges after the owner-gated steps land)

Preconditions before the reconciliation PR is honest: (P1) #455/#456/#457 merged at their
approved SHAs; (P2) one staging redeploy at the post-merge tip; (P3) WF8 re-probe on
staging (BM + STAFF login → Home renders, no teardown; onboarding reads 403 not 401);
(P4) owner ratifications recorded (WF11, WF12/13, WF18, WF19, WF10/14 direction).

Planned status flips (PROJECT-STATE §4.2, one dated change-log entry citing this doc):
- Auth/session, Redemptions + Validate-a-code, Branches, Business Profile v1, My Account v1,
  Staff & Access (incl. invite/claim), Documents (merchant self-serve MVP), Notifications
  shell, global shell/logout: MERGED → **ACCEPTED (staging, 2026-07-09 walk)** with the
  per-lane evidence rows.
- Home dashboard: ACCEPTED for OWNER; BM/STAFF Home acceptance recorded as ACCEPTED-AFTER-WF8
  citing the P3 re-probe evidence.
- Vouchers: ACCEPTED for the custom lanes exercised; flagship request-change lane recorded
  as NOT-EXERCISED on the walk merchant (WF1 seed shape) with the Karaara path noted.
- Insights: remains MERGED / NOT-ACCEPTED-for-display with the WF2 design classification
  recorded (eligibility spec excludes test merchants; real-merchant data exists) and the
  legal gates unchanged.
- Admin actioner: D67 + review→apply ACCEPTED per Lane D; timeline surface absence (WF17)
  recorded as a gap row.
Register updates in the same PR: §ADM-LOGIN row REMOVED (resolution recorded in §7 above);
new rows for WF15 (search affordance), WF16 residual (MERCHANT_PROFILE_EDIT unresolved by
design), WF17 (admin timeline surface), WF0 sweep (until run), WF1 optional backfill,
Opus nits from #457 (multi-membership 400 path, denied-path extra read), WF4 (seed-image
CSP), WF6 (nav flash), WF7 (Home awaiting-count), WF11/12/13/18/19 ratification outcomes.
Also: walk-doc Status header flips to WALK COMPLETE; the email/worker runbook is referenced
from PROJECT-STATE §4.4 as preparation-only.

## 10. Post-walk execution record (2026-07-10, owner-approved sequence, as-executed)

- **Fix-packet merges (SHA-bound, live-gated):** #455 WF16 → squash `54ba50df` · #456
  copy/logic + WF1 guard → `aff601e8` · #457 WF8 (Opus SHIP-WITH-NITS) → `d890bdb4`.
- **Migration:** `20260709190638_branch_merchant_confirmed_confidence` (one additive enum
  value, Slice 3 / #452 from the parallel Admin workstream) found PENDING on staging at
  redeploy preflight: STOPPED per gate, owner approved, applied via direct-endpoint
  `prisma migrate deploy` (gates: tip checkout, exact SQL, host identity, pending list =
  exactly this one). Verified: 57/57 up to date; enum value present. **Cross-workstream
  docs correction:** #453's record described this migration as production-pending only;
  staging was ALSO missing it until this apply.
- **Staging Web deploy:** deployment `5aa6499f` @ main `b641fa0f` (dashboard Deploy-latest-
  commit; the one commit beyond the merges, #466, verified docs-only before proceeding).
  `/health` 200.
- **WF8 live re-probe: PASS.** API: valid BM token → 403 `INSUFFICIENT_PERMISSIONS` on both
  onboarding reads, 200 on permitted reads. UI (real browser, both roles): BM lands on the
  FULL dashboard, STAFF on the lean Home; both stable through an 8s wait AND a reload; the
  two console 403s are the designed tolerance. Screenshots wf8-reprobe-bm/staff.png.
- **WF0 PIN sweep: EXECUTED.** Dry-run gates G1-G3 passed (exactly the 13 expected
  `tax-branch-*` rows, all test merchants, all 13 unreadable). Apply re-encrypted 13/13 to
  the seed PIN under the staging key; before-state ciphertexts preserved locally for
  rollback; verify re-run: 13/13 readable. No live/non-test row touched.
- **Email/worker window (windowed posture): INFRA PASS, DELIVERY BLOCKED on provider key.**
  Backlog pre-expired per D-EM2 safe default (23 QUEUED rows → FAILED, payloads nulled).
  Worker sandbox posture re-verified, then deployed. Two fail-closed env guards surfaced
  and were satisfied with documented values (`WORKER_DATABASE_POOL_MAX=5` per .env.example;
  `MAINTENANCE_MODE=disabled` for the window: the explicitly supported maintenance-off
  path). Worker booted healthy (email processor up, pool max 5). Fresh OTP test: sandbox
  rewrite WORKED (redirects to the allowlist logged, no real recipient, no SMS), but the
  Resend send failed: probe showed **staging `RESEND_API_KEY` is INVALID** (HTTP 400 from
  the Resend API; same failure class as June's expired Google key). Worker STOPPED
  (deployment removed) per the windowed posture. **OWNER ACTION queued: rotate/renew the
  Resend API key, update the Railway worker variable, then re-run the ~15-minute window
  (OTP + invite/claim + reset verifications).**
- **Ratification outcomes (owner, 2026-07-10):** WF11 device-trust = intended (no contrary
  code/spec evidence found) · WF12/WF13 staff read-only voucher/branch views = intended,
  read-only only · WF18 no-claim identity edits = ratified for current staging acceptance,
  kept as a policy note · WF19 queue-only discovery = ratified · WF10/WF14 = honest-copy
  direction accepted (the copy change itself remains an OPEN follow-up row).

(§9's skeleton below was the pre-execution DRAFT; §10 is the as-executed record.)
