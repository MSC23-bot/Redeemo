# Merchant Portal · authenticated staging acceptance walk (plan + evidence log)

**Status: PLAN APPROVED-TO-PREPARE (owner instruction 2026-07-09). The walk itself runs with
the owner in the loop; module statuses in PROJECT-STATE flip only from evidence recorded
here.** This document is both the checklist and the evidence log: fill the Evidence column
as each item runs; append findings to §7.

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

(empty: walk not yet run)
