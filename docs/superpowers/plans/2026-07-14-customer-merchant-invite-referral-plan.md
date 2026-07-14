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
