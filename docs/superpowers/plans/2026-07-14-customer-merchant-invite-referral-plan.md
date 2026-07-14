# Customer Merchant Invites + Referral Reward · Implementation Plan (Tier 3)

Date: 2026-07-14 · Spec (authoritative, decisions D1-D12 locked):
`docs/superpowers/specs/2026-07-14-customer-merchant-invite-referral-design.md`
Lead: Fable 5 (design, adjudication, review). Execution: Opus 4.8 / Sonnet 5
to precise briefs per the owner routing directive. Owner approval to plan:
2026-07-14 ("please proceed").

Status: PLANNED · build scheduling is an owner call (Portal/Admin programme
holds priority; this plan claims no slot). Milestones pause for owner review
per Tier 3 flow.

## 0. Ground rules

- Spec decisions D1-D12 are locked; deviations require an owner ruling and a
  spec amendment, never a workaround (Tier 2/3 rule).
- Schema changes ride the existing bundled-migration practice: the migration
  is BUILT in its milestone but APPLIED to shared Neon only in an
  owner-scheduled window (same policy as the admin-recruitment packets).
- All new endpoints register rate-limit tiers in the tier registry
  (pattern from PR #432); no endpoint ships on the global default.
- Feature flags: `INVITES_ENABLED` (whole lane, default off in prod until
  M3 verification), reuse `EMAIL_ENABLED` for anything that sends.
- Copy on all customer surfaces follows the audience profile + locked copy
  rules (per-voucher renewal language, no deal-site voice, no em-dashes).

## M0 · Schema + core service (backend, no HTTP surface)

1. Prisma models per spec §5: `MerchantInvite`, `RewardGrant`,
   `BusinessSuppression`; enums for the two status lanes; unique
   `(inviterIdentity, businessIdentity)` (composite over
   `inviterUserId|inviterEmail` + `googlePlaceId|nameFuzzyKey`).
   `rewardEligible` stamped FALSE automatically when the matched business
   already has a merchant draft/lead at submit time (D8) so eligibility is
   decided at write time, not payout time.
2. `src/api/invites/` service module: identity resolution (Places result →
   canonical key), dedupe/tally, live-merchant detection
   (`Branch.googlePlaceId` exact + name+postcode fuzzy), lead attach.
3. Signed single-use tokens (HMAC, expiring): invite-confirmation token,
   merchant-register invite token. Same signing util pattern as existing
   claim tokens (draft-owner claim, 7-day).
4. Unit tests (vitest unit lane, CI-gated): identity resolution, dedupe,
   eligibility stamping, token round-trip, cap arithmetic.

Deliverable: PR (migration BUILT, unapplied). PAUSE for owner review.

## M1 · Public API (backend)

1. `POST /api/invites` submit: Turnstile check when anonymous, per-IP +
   per-target-email tiers, disposable-domain blocklist, note constraints
   (240 chars, no URLs, term-filter → HELD status), responses per D11
   (live → `already_live` + merchant slug; everything else → generic ok).
2. `POST /api/invites/confirm` (token from confirmation email): flips
   PENDING_CONFIRM → NEW, idempotent, single-use.
3. `GET /api/places/suggest` proxy: server-side Places autocomplete
   (key never client-side), tight tier, UK-biased, returns name/locality/
   placeId only. Reuses the existing Places client from the location-trust
   work.
4. Confirmation-email content: fixed template, zero user-controlled text.
   Until EMAIL_ENABLED: dev-logs the link (same convention as existing
   flag-off email paths); anonymous invites in prod-without-email hold at
   PENDING_CONFIRM and the admin queue can mark-verified manually at
   Huddersfield scale.
5. Contract tests for every abuse rule in spec §8 that has an M1 surface.

Deliverable: PR. PAUSE for owner review.

## M2 · Admin console integration (admin-web + backend admin routes)

1. Lead source "customer-requested" in the recruitment console list views:
   tally badge, freshness, sort-by-demand; invite detail drawer (notes,
   verification state, eligibility flags).
2. Manual-send action (Phase 1 fulfilment): renders the composed invitation
   email (ticket motif, tally, notes, register link with invite token) for
   copy/send outside the system; records CONTACTED + timestamp; enforces
   the 14-day per-business rule even for manual sends.
3. Review queue: HELD notes, velocity flags, PENDING grants; approve/void
   with reason; audit-trail entries follow the existing audit.ts pattern.
4. Suppression list management (view, add manual opt-out).
5. jest + `next build` verification (admin-web standing rule).

Deliverable: PR. PAUSE for owner review + walkthrough.

## M3 · Customer surfaces (customer-web)

1. `/invite` page: Places autocomplete field, note, email-when-anonymous,
   consent tick, Turnstile; the three response states; share-card block
   ("send it yourself") with a pre-written message + link.
2. Landing section (compact, between app closer and footer): headline
   direction "Wish your favourite place was on here?"; links to `/invite`.
   Placement must not compete with the primary register CTA (spec §3.1).
3. Post-register prompt on the register success state: single-field
   fast path (user already authenticated: no email, no captcha).
4. SEO plumbing for `/invite` (seoRoutes.ts, sitemap), reduced-motion safe
   entrances, mobile parity, orphan/Brand-Stop typography rules.
5. Browser verification at 1440/390 + simulator pass; copy pass under
   /copywriting + audience profile before ship.

Deliverable: PR. PAUSE: owner reviews the section visually (screenshots +
simulator) before merge. `INVITES_ENABLED` flips only after this review.

## M4 · Automated invitation email (Phase 2; gated)

Gates: EMAIL_ENABLED + Resend DNS live (owner action, already on the list)
AND solicitor sign-off on the outreach template + referral terms blurb.

1. Send worker: per-business 14-day throttle, digest batching, suppression
   enforcement, global daily cap + alert metric, rep-owned-lead suppression
   (D12), unsubscribe handling writing BusinessSuppression.
2. Full double-opt-in confirmation flow replaces manual verification.
3. Send/deliverability metrics panel in admin.

Deliverable: PR. PAUSE for owner review.

## M5 · Reward activation (Phase 3; launch-adjacent)

Gates: subscriptions live at launch; referral terms page published.

1. Merchant-live hook: eligibility selection (D7 caps, D8 window, D9 staff
   exclusion, registered-account check), grant issuance, flagged-grant
   auto-hold.
2. Stripe single-use coupon creation + attach; consumption paths for
   first-checkout and existing-subscriber credit; founding-offer stacking
   (D6) verified against the checkout flow.
3. Reconciliation job: on merchant approval, match branch googlePlaceId
   against open invites lacking token attribution.
4. Customer notification email + account banner + earned-months account
   surface; "register to claim" variant for verified-email non-accounts.
5. End-to-end test on a disposable DB (never the shared Neon; integration
   lane rules apply).

Deliverable: PR. PAUSE for owner review. Only after M5 may marketing copy
carry "If they join, your next month is on us" (CAP substantiation).

## Testing summary

- Backend: unit lane (CI gate) for all service logic; integration suite
  additions run only against a disposable DATABASE_URL.
- admin-web: jest + `next build`. customer-web: browser verification both
  viewports + simulator; tsc.
- Abuse rules each get an explicit test naming the spec §8 bullet they
  enforce, so the security section stays executable, not aspirational.

## Rollout + kill switches

`INVITES_ENABLED` off → the landing section, /invite, and post-register
prompt all hide (same isMarketplaceLive() conditional pattern); API returns
404. Send worker additionally behind EMAIL_ENABLED. Reward issuance behind
its own `INVITE_REWARDS_ENABLED` so Phase 1/2 can run indefinitely without
accruing payout obligations.

## Owner actions this plan depends on

1. Schedule the M0 migration into the next bundled Neon window.
2. Resend/DNS + EMAIL_ENABLED (already on the standing list) before M4.
3. Solicitor: outreach template + referral terms blurb (gates M4/M5).
4. Turnstile site key provisioning (new env var, M1/M3).
5. Decide WHEN this builds relative to the Portal/Admin programme.

---

# Amendment P1 · 2026-07-14 · Post-inspection revision (authoritative)

Follows spec Amendment A1 (same date). Where this conflicts with the
milestones above, THE AMENDMENT WINS.

## Revised milestone scopes

**M0 · Schema + core service.** Models per A1.2 (MerchantInvite,
InviteRewardGrant, BusinessSuppression; NO MerchantLead changes; NO
attribution-token table). Migration built OFFLINE via
`prisma migrate diff --from-schema <old> --to-schema <new> --script`
(verified working, no DB contact), create-only, packaged as a SEPARATE
packet that must apply AFTER merchant_lead_packet. Flags
isInvitesEnabled()/isInviteRewardsEnabled() per env.ts conventions.
Service: identity normalisation, placeKey construction, live-merchant
detection (Branch.googlePlaceId exact + name/postcode fuzzy: note there
is NO existing place-lookup service; this builds the first one),
lead attach-or-create (source CUSTOMER_REQUEST, stage LEAD, unassigned;
audit LEAD_CREATED with CUSTOMER actor + INVITE_CREATED), eligibility
stamping per A1.1(2), caps arithmetic, P2002-idempotent submit.
Unit tests in the CI unit lane.

**M1 · Customer API (Phase 1 = signed-in only).**
- POST /api/v1/customer/invites (authenticateCustomer; rate tier
  `inviteSubmit` per-user + per-IP; no Turnstile in Phase 1).
- POST /api/v1/customer/invites/place-search (authenticated; wraps
  searchPlaces() behind a NEW Redis-backed inviteLocationLimiter
  modelled on merchantLocationLimiter: the file-based Places cap is
  single-process and unsafe for this route; candidate-token response,
  placeId never leaves the server).
- Responses per D11 (already_live | ok), generic ok for pipeline and
  unknown alike.
- All sends absent in Phase 1; nothing calls notify().
- Contract tests for abuse rules with an M1 surface.

**M2 · Admin exposure = BACKEND CONTRACT ONLY this programme phase.**
admin-web is actively owned/frozen (#514/#516/#521). Deliverable: a
short interface note + (when scheduled) LEAD_SELECT list-payload
extension carrying inviteCount/latestInviteAt/demand notes and the
PREPARED vs SENT_CONFIRMED manual-outreach endpoints per A1.1(7).
No admin-web UI in this programme until the admin session's stack
lands.

**M4 · Phase 2 additions (unchanged gates)** now also includes: the
anonymous lane (Turnstile via EXISTING CAPTCHA_ENABLED/verifyTurnstile;
double-opt-in via house Redis tokens through notify()/emailLimiter with
new inviteConfirm + inviteBusiness contexts), contact provenance +
recipient-type classification (A1.1(9)), and the optional register-link
attribution token if analytics justify it.

**M5 · Reward activation** gains a DESIGN-FIRST GATE: a billing seam
design doc co-designed with the founding-offer implementation (verified
constraints: one Subscription row per user forever; promoCodeId
single-valued write-once; one coupon per subscriptions.create;
currentPeriodEnd Stripe-derived only; no credit primitive). Until that
doc is owner-approved, grants exist only as ledger rows.

## Corrected owner-action list

1. Schedule the invite packet AFTER merchant_lead_packet in a migration
   window (separate from, or sequenced within, the recruitment window:
   owner's call).
2. Resend/DNS + EMAIL_ENABLED before M4 (unchanged).
3. Solicitor: outreach template + referral terms blurb (unchanged).
4. Turnstile: NOT a new integration (already platform-wired); only
   TURNSTILE_SECRET_KEY provisioning when CAPTCHA_ENABLED flips for the
   anonymous lane.
5. Build scheduling vs Portal/Admin (unchanged).
6. NEW: PROJECT-STATE should record the unapplied state of
   merchant_lead_packet + merchant_note_packet (currently only in
   commit messages/schema comments) and that MerchantAgreementRecord
   (packet 4) exists only in frozen PR #514.

## Autonomous-run execution note (2026-07-14)

M0+M1 are being implemented in this owner-approved autonomous window on
fresh worktrees from origin/main, as unmerged PRs, flags default-off,
no migration applied, no sends, no provider calls, per the safety
boundaries in the owner brief.

## Adversarial review record (Opus, 2026-07-14 autonomous run)

Combined M0+M1 diff attacked (pipeline privacy, D8 bypasses, races,
limiter bypasses, injection/PII, resource abuse, migration risks).
Verdict: safe as unmerged PRs; no blocker. Findings and dispositions:

- F1 HIGH (FIXED, 0f691bc3): Places-lane eligibility missed
  freshly-converted branchless drafts (branch-miss now falls through to
  the name lane in both lanes; also fixes live manual-pin merchants not
  being revealed). RESIDUAL HARD GATE: rewardEligible is a point-in-time
  heuristic; Phase-3 issuance MUST re-verify eligibility at issuance
  (recorded on the schema field); durable fix candidate: persist
  placeKey on the lead at creation.
- F2 MEDIUM (SCOPE CORRECTED, 0f691bc3): invite-row anonymisation does
  not sever inviter-IP linkage (LEAD_CREATED/INVITE_CREATED audit rows
  keep raw IP under audit governance; ipHash is clustering-only, not a
  privacy control). The future invite anonymise sweep must either extend
  redaction to those audit rows or keep this documented limit.
- F3 MEDIUM (ACCEPTED, follow-up): concurrent different-inviter submits
  can create duplicate open leads for one business (no lead unique;
  bounded by per-user limits; self-heals via admin merge). Phase-3
  fairness note: an invite attached to the losing duplicate lead must
  still be matched by placeKey at payout. Candidate fix: placeKey
  advisory lock or dedup at lead creation.
- F4 LOW (ACCEPTED): OPEN_INVITE_CAP counted pre-transaction (TOCTOU
  overshoot bounded by the 10/hour tier).
- F5 (FIXED, 0f691bc3): stale flags/googlePlaces comments corrected.
- F6 LOW (FOLLOW-UP): case-insensitive businessName scans on
  Merchant/MerchantLead have no functional index; add
  lower(businessName) indexes (or normalized slug columns) before these
  tables grow.
- F7 NOTE (DOCUMENTED IN TEST): flag-off 404 parity holds for
  authenticated callers; unauthenticated probes get the authed scope's
  401 like every other authed route.
- F8 (FIXED, 0f691bc3): P2002 idempotence narrowed to the
  (inviterEmailNorm, placeKey) constraint.

## Autonomous-run incident record (2026-07-14)

During the run the lead's persistent shell reset its working directory
to the session default (the prelaunch-website worktree) and a
`git checkout feat/invite-referral-m0` executed there, switching the
SITE worktree off its branch. Detected within minutes via the harness
file-change notes; verified with git status (site branch was fully
committed AND pushed beforehand: zero loss); restored with a clean
`git checkout worktree-prelaunch-website`. Standing correction adopted:
every git command in multi-worktree sessions carries an explicit `cd`.
This is the same failure class as the 2026-07-09 agent incidents; it
can hit the lead's own shell, not only agents.

## Codex correction round record (2026-07-14, second autonomous window)

Owner-directed Fable-led correction round over #525/#526/#527. Spec
Amendment A2 carries the rulings; renewed heads: docs @ this commit,
M0 feat/invite-referral-m0 @ 1b039f48, M1 feat/invite-referral-m1 @
8789c451 (stacked, force-with-lease after rebases). Round-2 adversarial
review (Opus, concurrency/privacy): NO blocker, NO high; its one
headline-touching MEDIUM (erasure durability: scrub not atomic with the
user anonymisation, consumed action token left no re-run path) was
FIXED in 1b039f48 (single transaction). Recorded ticket items from
round 2, none gating the unmerged stack:
- Sybil note: delete + re-register mints a new userId/inviterKey and
  could re-earn in Phase 3; bounded by registration friction and the
  Phase-3 re-verify hard gate; acknowledge in the reward design.
- Phase-2 claim rewrite (e:hash -> u:userId) must MERGE with any
  existing u-row for the same placeKey, never blind-update (unique
  collision).
- Production sizing item: consider SET LOCAL lock_timeout inside the
  submit transaction mapped to a retryable 429 (same-business pile-up
  currently surfaces as P2028 500s at Prisma's ~5s default; bounded,
  ugly).
- inviteSubmitLimiter runs after zod parse (malformed bodies do not
  burn the global counter); intentional, documented.
- hashtext 32-bit lock collisions: false-serialisation only; a true
  cross-namespace deadlock cycle is pathological and self-resolved by
  Postgres; no action.

Enablement gates restated (blocking INVITES_ENABLED in production):
owner threshold/cost-cap sizing (A2.4), audit-row retention/redaction
decision (A2.6), plus the standing migration-window scheduling.

## Round 3 CI-execution owner action (2026-07-14)

Codex required the concurrency suite to EXECUTE in CI. The
test:integration:invites script ships in M0 @ 7b359cdf, but the
matching advisory pilot step edits .github/workflows/ci.yml and BOTH
available tokens lack the GitHub `workflow` scope (push rejected). The
ready-to-apply patch is committed alongside this plan:
docs/superpowers/plans/2026-07-14-invite-ci-pilot-step.patch
(adds the "Run invite-concurrency integration pilot (advisory)" step +
explicit PASS/FAIL job-summary lines, mirroring the Insights and
maintenance pilots exactly). OWNER ACTION: `git apply` the patch on a
workflow-scoped credential and push; the next CI run on #526/#527 then
executes the suite against the disposable loopback service and surfaces
PASS/FAIL in the job summary. No local execution was possible on the
build machine (no container runtime, no local Postgres): recorded
honestly rather than claimed.

## Codex round-3 record (2026-07-14, third pass)

Renewed heads: docs @ this commit, M0 @ 31f44656, M1 @ 56255236
(stacked, layer re-verified 1 commit / 10 files). All five anchors
resolved: erasure SEVERANCE implemented (spec A3.1; solicitor question
on ISSUED/CONSUMED grants recorded), duplicate idempotency AT the cap
(in-lock pre-check), namespaced bounded advisory locks with retryable
contention 429, concurrency suite wired for CI execution
(test:integration:invites shipped; the workflow step is an
owner-applied patch: session tokens lack the GitHub workflow scope:
docs/superpowers/plans/2026-07-14-invite-ci-pilot-step.patch), and the
migration EOF whitespace fixed with the COMMITTED-RANGE git diff
--check added to the gate list (working-tree --check cannot see
committed defects: process lesson recorded).

Round-3 adversarial verification (Opus): all anchors confirmed
implemented; one must-fix, F-C1 (the 55P03 classifier hard-gated on the
P2010 envelope, risking a 500 where the retryable 429 was intended)
FIXED @ 31f44656 by duck-typing meta.code like the proven house
isTimeout classifier, plus envelope-agnostic/non-mapping unit cases and
a REAL-ADAPTER lock-timeout contention integration test (held ns1 lock
-> INVITE_SUBMIT_CONTENTION, zero writes). Cosmetic note recorded: the
contention copy mentions invites though a timeout could arise on a
held lead row; acceptable. Executed evidence so far: CI on #526 is
green and its integration-pilot job's `prisma migrate deploy` applied
the invite packet cleanly to a real disposable Postgres AFTER
merchant_lead_packet; the concurrency suite itself executes once the
owner applies the workflow patch.

## Codex round-4 record (2026-07-14)

Renewed heads: M0 @ 0fdd3d61, docs @ this commit (M1/#527 restacked
after — head in the round-4 report). Corrections:
- ERASURE (spec A4.1): PENDING reward grants are now DELETED on account
  deletion, not voided-in-place (void retained grant.userId → still
  person-linked under the anonymised-in-place User). Genuine severance;
  ISSUED/CONSUMED financial records retained (owner/solicitor gate).
  Overclaim comments corrected. New real-DB erasure.integration.test.ts
  proves the linkage is actually gone (no invite links back; PENDING
  grant deleted; ISSUED grant survives; aggregate demand preserved).
- CI PILOT PATCH (spec A4.2): regenerated ZERO-CONTEXT so committed-range
  git diff --check passes (a full-context diff's blank YAML context line
  is inherently " \n"). Verified: plain `git apply --check` OK against
  current main.

### OWNER ACTION (exact, minimal) — enable the CI concurrency+erasure pilot
Session tokens lack the GitHub `workflow` scope, so the workflow file
cannot be pushed from here. On a workflow-scoped credential, from repo
root on the branch under review (feat/invite-referral-m0):

    git apply docs/superpowers/plans/2026-07-14-invite-ci-pilot-step.patch
    git add .github/workflows/ci.yml
    git commit -m "ci(invites): advisory invite-concurrency+erasure integration pilot"
    git push

The next CI run then executes `npm run test:integration:invites` (both
concurrency + erasure suites) against the disposable loopback Postgres
service and writes PASS/FAIL to the job summary, exactly like the
Insights and maintenance pilots. Until then, executed evidence remains:
the integration-pilot job's `prisma migrate deploy` already applies the
invite packet to a real disposable Postgres after merchant_lead_packet
(green on #526), proving migration validity; the concurrency/erasure
assertions execute once the patch is applied.

### Round-4 adversarial review (Opus) + honesty fix

Distinct Opus review of the erasure-severance change: verdict SAFE, no
blocker/high. The deleteMany is correctly scoped (userId + PENDING only;
never ISSUED/CONSUMED, never other users' grants), atomic with the
delete-account transaction, FK-free (no cascade surprises), and no
tally/query reads grants so nothing breaks. One MEDIUM (honesty): the
new integration-test comments claimed the suites "execute in the CI
invites pilot" — but test:integration:invites is not wired into ci.yml
yet (it is the owner-applied workflow patch; session lacks the workflow
scope). Fixed @ M0 69af5d88: comments corrected to say the suites run
manually/locally until the owner applies the patch; also retitled a
buildInviterKey test that still said "non-PII" (round-3 reclassification
missed line) to "pseudonymous". Renewed heads after this fix: M0 @
69af5d88, M1 @ 5aebad4a.

FORWARD-LOOKING (Phase-3 build ticket, not fixable now): grant DELETE
is not coordinated with any concurrent grant-ISSUANCE path because none
exists yet (INVITE_REWARDS_ENABLED dark). When Phase 3 lands, a grant
issued for a just-deleted account, or a PENDING->ISSUED flip racing the
delete, could leave an ISSUED financial record for an anonymised user.
Guarded in design by the re-verify-at-issuance HARD GATE
(schema.prisma rewardEligible: issuance re-checks eligibility and finds
rewardEligible:false + inviterUserId:null on the scrubbed invite).
Revisit when building the reward hook.
