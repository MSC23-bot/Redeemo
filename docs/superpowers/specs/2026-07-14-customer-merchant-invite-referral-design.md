# Customer-Sourced Merchant Invites + Referral Reward · Design Spec

**Status:** Approved design, pending implementation plan
**Date:** 2026-07-14
**Owner decisions locked:** 2026-07-14 (this session; see §2)
**Tier:** 3 (new backend contract, schema change, three surfaces)
**Surfaces:** customer-web (pre-launch site), backend API, admin-web (recruitment console), email

## 1. Summary

Customers invite their favourite businesses onto Redeemo. Invites are
customer-authored but platform-delivered: Redeemo sends the invitation
email in the customer's voice ("Sarah, one of your regulars, asked us
to invite you"), aggregates repeat requests into a demand tally ("3 of
your customers asked for you"), and stores every invite as a lead in
the admin recruitment console. When an invited business reaches
approved/live status, eligible inviters earn one free subscription
month, delivered as a single-use Stripe coupon.

The feature is simultaneously: supply-side lead generation with
built-in social proof, pre-launch waitlist capture (every anonymous
invite hands us a verified email plus that person's favourite place),
and a referral loop with a bounded, admin-gated payout.

## 2. Owner decisions (locked 2026-07-14)

| # | Decision | Ruling |
|---|---|---|
| D1 | Delivery model | Customer-authored, platform-delivered, aggregated. One pipeline: automated email when a contact exists, admin manual outreach when not. |
| D2 | Registration wall | None for inviting. Anonymous invites require one-click email verification before they count. Rewards pay out only to registered accounts (email-matched). |
| D3 | Business identity | Google Places autocomplete in the form; canonical key is googlePlaceId with name+postcode fuzzy fallback. |
| D4 | Reward | One free subscription month per successful onboarding, to EVERY eligible inviter (not first-only). |
| D5 | Success definition | Merchant reaches approved/live status (existing admin-gated approval), not registration. |
| D6 | Stacking | Referral month STACKS with the founding offer (founding member with one referral = 3 free months). |
| D7 | Caps | First 5 eligible inviters per business are paid; max 3 earned referral months per customer per rolling year. |
| D8 | Eligibility window | Invites are reward-eligible only if submitted before the merchant began onboarding (before the merchant draft/account existed). All invites count as demand evidence regardless. |
| D9 | Staff exclusion | Redeemo staff and field reps are ineligible for customer rewards (terms clause + staff-email/account check at grant time). |
| D10 | Phase 1 scope | Ship form + storage + dedupe + admin lead queue now; invitation emails fulfilled MANUALLY via the recruitment console until EMAIL_ENABLED/Resend DNS is live. Automated send is Phase 2. |
| D11 | Pipeline privacy | Only LIVE merchants are revealed in the form ("already here"). Pipeline/draft businesses return the same generic success as unknown ones; the invite silently attaches to the lead. Prevents lead-list enumeration. |
| D12 | Rep collision | Customer reward is outcome-defined (merchant live), never causality-defined; rep attribution and customer rewards are separate ledgers. If a lead is owned/being worked, the automated email is SUPPRESSED and the invite routes to the rep as demand evidence. One business, one voice. |

## 3. Customer experience

### 3.1 Entry points
1. **Landing section (low placement)**: compact section between the app
   closer and the footer. Working headline direction: "Wish your
   favourite place was on here? Invite them." Links to /invite; may
   inline the first field. Placement is deliberately below the primary
   conversion flow so it never competes with Get early access.
2. **/invite page**: standalone, shareable URL carrying the full form.
3. **Post-register thank-you screen**: "Who do you wish was on
   Redeemo?" Highest-yield placement; user is registered so the flow is
   one field + note.
4. **Share card (secondary)**: a "send it yourself" asset the customer
   can WhatsApp/DM to the business directly. Never touches our email
   pipeline.

### 3.2 The form
- Business (Google Places autocomplete; town shown from the pin).
- Optional personal note, placeholder-assisted ("I'd use this every
  week..."), max 240 chars, no URLs.
- Email (only when not signed in) with the promise "we'll tell you the
  moment they're on".
- Consent tick: share my first name (and note) with the business.
- Anonymous submissions: Turnstile/CAPTCHA + confirmation email
  (one-click "confirm your invitation"); the invite counts only after
  confirmation. Signed-in users skip both.

### 3.3 Form responses (D11)
- Business is LIVE: "Good news: they're already on Redeemo" + link to
  their page. No invite row.
- Anything else (unknown OR in pipeline): identical generic success:
  "Done. We'll invite them, and we'll tell you the moment they're
  live." Internally: new invite row, or tally increment, or attach to
  existing lead.

### 3.4 Reward moment
When the merchant goes live: email + account banner: "[Business] just
joined Redeemo. Your next month is on us." For a verified email with no
account: same email doubles as the registration nudge ("register with
this email to claim your free month"): the PENDING grant waits.

## 4. Business-facing invitation email (Phase 2 automation; Phase 1 manual)

- Styled as a Redeemo invitation ticket (die-cut voucher motif).
- Contents: inviter first name(s) + quoted note(s) (plain text, escaped,
  clearly attributed), tally when >1 ("3 of your customers asked us to
  invite you"), one line of facts (free listing, no commission,
  Huddersfield launch), merchant-portal register link with signed
  invite token (pre-fills business name; attributes the registration).
- Send rules: max one email per business per 14 days; later invites
  batch into a digest. Mandatory unsubscribe; two ignored invitations
  or an opt-out puts the business on the suppression list (automation
  stops; lead remains visible to admins). Global daily send cap with
  alerting. Suppress entirely when the lead is rep-owned (D12).

## 5. Data model (shape; exact schema in the implementation plan)

- **MerchantInvite**: id, googlePlaceId (nullable for fuzzy-only),
  businessNameRaw, town/postcode, note, inviterUserId (nullable),
  inviterEmail, emailVerifiedAt, consentShareName, status
  (PENDING_CONFIRM, NEW, ATTACHED_TO_LEAD, CONTACTED, REGISTERED,
  LIVE), rewardEligible (computed at merchant-onboarding-start, D8),
  createdAt, ip/device fingerprint fields for clustering. Unique
  (inviter identity, business identity).
- **RewardGrant**: id, inviteId, userId, status (PENDING, ISSUED,
  CONSUMED, VOIDED), stripeCouponId, issuedAt, consumedAt, voidReason.
- **BusinessSuppression**: business identity, reason (OPT_OUT,
  IGNORED_2X), createdAt. Retained as legal-basis record.
- Invite token on merchant register: signed (HMAC), single-use, maps
  registration → invite chain. Reconciliation fallback: on merchant
  approval, match branch googlePlaceId against open invites so
  inviters are paid even when the token path was not used.

## 6. Admin (recruitment console integration)

- Invites appear as a lead SOURCE ("customer-requested") with tally,
  notes, and freshness; sortable by request count.
- Lead states NEW → CONTACTED → REGISTERED → LIVE mirror the invite
  status lane.
- Phase 1: a "send invitation" action surfaces the composed email for
  manual sending at Huddersfield scale.
- Review queue: held notes (term-filter hits), velocity flags
  (late-pipeline invite bursts, inviter/merchant IP-device clustering),
  PENDING grants awaiting void/approve. Follows existing audit-trail
  patterns.
- Grant management: void with reason; per-customer and per-business cap
  status visible.

## 7. Reward mechanics

1. Merchant reaches approved/live (existing admin-gated transition).
2. System selects eligible invites: rewardEligible = true (D8), first 5
   per business (D7), inviter is a registered account (D2) not staff
   (D9), inviter under the 3-per-year cap (D7).
3. RewardGrant PENDING → ISSUED (auto unless flagged to review): create
   single-use 100 percent-off-one-month Stripe coupon on the account.
   Consistent with the standing "free trials via promo codes only"
   rule; stripeSubscriptionId is already nullable for grant paths.
4. Delivery: not-yet-subscribed → auto-applies at first checkout when
   subscriptions open at launch; subscribed → credit on next invoice.
   Stacks with founding offer (D6).
5. Account page shows earned months with the business name attached.

## 8. Security and abuse

- **Spam-cannon prevention**: per-business 14-day send throttle +
  digest batching; suppression list; global daily cap + alerting;
  INVITES_ENABLED kill switch (same pattern as EMAIL_ENABLED).
- **Email-bomb prevention**: per-IP and per-target-email rate limits on
  submit (rate-limit tier registry from PR #432); CAPTCHA on anonymous
  submissions; confirmation email contains zero user-controlled text.
- **Tally integrity**: verified identities only; disposable-domain
  blocklist; unique (identity, business); ~10 open invites per
  identity; quoted tally may be more conservative than stored count
  (registered users always count; anonymous verified counted when
  clustering is clean).
- **Reward fraud**: admin-gated approval before any payout; PENDING
  grants voidable; eligibility window (D8) kills insider farming;
  staff exclusion (D9); caps (D7); flags on inviter/merchant domain,
  device, or IP clustering; late-pipeline burst grants auto-hold for
  review.
- **Note as attack surface**: plain-text render, 240-char cap, no URLs,
  term-filter hold queue, quoted and attributed inside our template.
- **Enumeration**: D11; only public (live) status is ever revealed.
- **Tokens**: signed, single-use, expiring (confirmation links and
  merchant invite tokens); attribution cannot be forged.
- **GDPR/PECR**: inviter name shared only with consent tick; erasure
  honoured; suppression list retained; solicitor to review the B2B
  outreach template and the referral-scheme terms blurb before Phase 2
  automation. Corporate-subscriber PECR position is lenient but the
  contact-sourcing method needs the check.

## 9. Phasing

- **Phase 1 (shippable now)**: /invite page + landing section +
  post-register prompt; MerchantInvite storage, verification,
  Places dedupe, live-merchant detection; admin lead-source view with
  manual send action. No automated business email; no RewardGrant
  issuance yet (grants accrue only from Phase 2 or are backfilled;
  simplest: record invites now, compute eligibility when rewards
  activate).
- **Phase 2 (EMAIL_ENABLED + Resend DNS done; solicitor blurb in)**:
  automated invitation email with throttles/suppression; confirmation
  emails switch from manual-free flow to full double-opt-in.
- **Phase 3 (launch)**: reward activation: grants issue on
  merchant-live; coupons redeemable once subscriptions exist. Marketing
  copy may then carry "If they join, your next month is on us"
  (substantiated by the live scheme + terms page).

## 10. Non-goals (v1)

- No customer-to-customer referrals (separate scheme, separate spec).
- No cash or multi-month rewards; one month per successful business.
- No public "requested businesses" leaderboard (enumeration risk).
- No in-app (mobile) surface yet; website first, app follows the same
  API post-launch.

## 11. Open items

- Solicitor: referral-scheme terms blurb + B2B outreach template review
  (gates Phase 2, not Phase 1).
- Copy pass on all surfaces (landing section, /invite, emails) under
  the audience-profile rules when Phase 1 builds.
- Exact schema, endpoints, and admin UI in the implementation plan
  (docs/superpowers/plans/), including the rate-limit tier entries.
- PROJECT-STATE registration of this workstream and its sequencing
  against the Portal/Admin programme is an owner/programme call; this
  spec does not claim a slot.

---

# Amendment A1 · 2026-07-14 · Platform-verified corrections (authoritative)

Same-day amendment after inspection of origin/main (e6b9db27) by the lead
plus three read-only inspection agents (billing, infra/security,
recruitment domain). Where this amendment conflicts with the body above,
THE AMENDMENT WINS. Product outcomes D1-D12 are unchanged; the technical
proposals are corrected to the real platform.

## A1.1 Anchor adjudications

1. **Anonymous Phase 1 honesty.** EMAIL_ENABLED is off and the platform
   (correctly) never logs secret links, so anonymous email verification
   cannot ship honestly in Phase 1. RULING: Phase 1 requires sign-in to
   submit an invite (register is free, no card; /invite routes through
   login/register with next=/invite). The anonymous + email-double-opt-in
   lane ships in Phase 2 with real sending. D2's no-registration-wall
   remains the PERMANENT design; the Phase 1 wall is a temporary,
   documented scoping choice, not a product change. All "we'll tell you"
   copy is account-based ("we'll let you know when they're live"), never
   a promise of an email that cannot send. NOTE for owner: the existing
   register success screen says "We've sent a verification link"
   unconditionally: same honesty class of bug, pre-existing, flagged.
2. **D8 cutoff, precise.** "Onboarding starts" =
   `convertLead()` creating the draft Merchant
   (src/api/admin/leads/service.ts:362, one transaction with
   convertedMerchantId stamping), or a self-serve merchant registration
   matching the business. A PROSPECT LEAD AT ANY STAGE
   (LEAD/CONTACTED/VISIT_BOOKED) does NOT disqualify eligibility: demand
   during recruitment is genuine and rewarded. Eligibility is stamped at
   the moment the invite becomes countable: eligible iff no Merchant
   record (draft or live) exists for the matched business at that
   moment. Late-pipeline fraud is handled by the velocity-hold review,
   not by widening the cutoff.
3. **Place vs merchant identity.** Invites aggregate by PLACE via
   `placeKey`; recruitment attaches by LEAD (leadId); rewards resolve by
   MERCHANT. placeKey = `gp:<googlePlaceId>` when Places-resolved, else
   `fz:<name-slug>:<locality-slug>`. At reward time the live merchant's
   branches' googlePlaceIds (plus the lead chain's
   convertedMerchantId) select the invite set; rewards dedupe by
   inviter identity so one person inviting one business = one month
   regardless of branch count. Deterministic first-5 ordering:
   ORDER BY countableAt ASC, id ASC. googlePlaceId is NEVER exposed to
   clients (existing platform contract): the invite form uses the
   candidate-token pattern from merchant location search (opaque token,
   15-min Redis TTL, server resolves to placeKey).
4. **Executable identity invariants.** Inviter identity =
   `inviterEmailNorm` (lowercased/trimmed account email in Phase 1;
   verified email in Phase 2), always non-null. Business identity =
   `placeKey`, always non-null (computed fuzzy key when no Places
   match). Invariant: `@@unique([inviterEmailNorm, placeKey])` with the
   house cross-transaction P2002-retry pattern; concurrent duplicate
   submissions converge on the existing row (idempotent success).
5. **MerchantLead integration (workflow ownership).**
   `MerchantSource.CUSTOMER_REQUEST` already exists and was reserved for
   this intake (schema.prisma:2050); admin-web already renders its
   pipeline chip. RULING: MerchantLead OWNS all recruitment state
   (stages, assignment, conversion, LOST). MerchantInvite holds ONLY
   invitation facts: identity, verification, note, consent, demand
   membership, eligibility, reward linkage: and carries a bare `leadId`
   (house FK-free pattern, integrity in the service layer). Invite
   statuses describe the invite alone (PENDING_CONFIRM/ACTIVE/
   HELD_REVIEW); nothing on the invite mirrors lead stages. The invite
   service creates the MerchantLead (source CUSTOMER_REQUEST, stage
   LEAD, unassigned) when no active lead matches; otherwise attaches.
   The abandoned 2026-04-22 `MerchantRequest` design stays abandoned.
6. **Privacy and retention.** Persistent invite rows store NO raw IP and
   NO device fingerprint: a keyed SHA-256-truncated `ipHash` only
   (mirroring the mandatory hashEmail() convention), used solely for
   clustering flags. Transient Redis limiter keys keep the existing
   raw-IP convention (ephemeral TTLs, platform-wide precedent).
   Retention: an invite anonymise sweep mirroring
   leadAnonymiseSweep.ts nulls note + inviterEmailNorm displayable PII +
   ipHash and stamps anonymisedAt for terminal, non-rewarded invites
   after 6 months. Erasure: the existing delete-account flow gains an
   invite-scrub step (soft PII-null in place, aggregate demand counts
   survive anonymously). Audit rows follow the PII-free convention.
7. **Manual Phase 1 outreach honesty.** The console action produces a
   PREPARED record (composed, suppression-checked, throttle-checked);
   the lead moves to CONTACTED and the 14-day clock starts ONLY when the
   operator explicitly confirms "I sent this" (SENT_CONFIRMED, audited
   with operator id). Prepared-but-unconfirmed messages expire without
   status effect. The platform never claims delivery it cannot prove.
8. **Reward mechanics, corrected.** Verified contracts: ONE Subscription
   row per user forever (userId unique, no archival); `promoCodeId`
   single-valued, written once at creation, never updated; exactly one
   Stripe coupon can enter `subscriptions.create`; `currentPeriodEnd`
   is written only from Stripe-derived values; NO credit/balance
   mechanism exists; NO referral/reward code exists; the founding offer
   (FOUND.1) itself has no billing implementation yet (register entry
   lives on the unmerged site branch). RULING: rewards are recorded in a
   provider-agnostic ENTITLEMENT LEDGER (`InviteRewardGrant`:
   PENDING/ISSUED/CONSUMED/VOIDED, entitlementMonths). HOW an issued
   grant becomes cheaper months is a deferred BILLING SEAM DESIGN,
   co-designed with the founding-offer implementation (they are the
   same class of entitlement and must compose: D6 stacking is a
   requirement on that design, not on today's promo path). No Stripe
   object names are promised by this spec. M5 gains a design-first gate.
9. **Legal outreach classification.** Automated (Phase 2) sends require
   a non-null contact provenance (`contactSource`) and recipient-type
   classification on the target; unknown provenance or type routes to
   the manual lane. Fail-closed remains: no automated send without the
   solicitor gate satisfied.
10. **Migration packaging.** Reality check: the "recruitment window" is
    THREE built create-only packets on main (capability-grants+FIELD,
    merchant_lead_packet, merchant_note_packet), all verified UNAPPLIED
    on Neon; the fourth (MerchantAgreementRecord) exists only in frozen
    PR #514. The invite/referral migration is a SEPARATE additive
    create-only packet that must apply AFTER merchant_lead_packet
    (runtime dependency: the invite service writes MerchantLead).
    It does not join or alter the owner-approved window; scheduling is
    the owner's. FINDING flagged to owner: PROJECT-STATE does not
    record the lead/note packets' unapplied state (evidence lives in
    commit messages + schema comments).

## A1.2 Data model (final, supersedes §5)

- **MerchantInvite**: id · inviterUserId? · inviterEmailNorm ·
  placeKey · googlePlaceId? · businessNameRaw · localityRaw? · note?
  (240, no URLs) · consentShareName · status (PENDING_CONFIRM | ACTIVE |
  HELD_REVIEW) · rewardEligible · countableAt? · leadId? (bare) ·
  ipHash? · anonymisedAt? · createdAt · updatedAt ·
  UNIQUE(inviterEmailNorm, placeKey) · indexes: placeKey, leadId,
  status, inviterUserId, (anonymisedAt, createdAt).
- **InviteRewardGrant**: id · inviteId (bare, UNIQUE) · userId ·
  merchantId · entitlementMonths (default 1) · status (PENDING | ISSUED
  | CONSUMED | VOIDED) · voidReason? · issuedAt? · consumedAt? ·
  createdAt · indexes: userId, merchantId, status. Provider-agnostic:
  no Stripe fields until the billing seam design.
- **BusinessSuppression**: id · placeKey UNIQUE · reason (OPT_OUT |
  IGNORED | MANUAL) · createdByAdminId? · createdAt.
- No MerchantLead schema changes. No attribution-token table in M0:
  merchant-live reconciliation by placeKey (plus lead chain) is the
  attribution mechanism; an explicit register-link token is a Phase 2
  (M4) addition if analytics demand it.
- Tokens follow the HOUSE pattern (random hex in Redis with TTL,
  GET-then-DEL single-use), not HMAC as previously written: Phase 2
  confirmation tokens and the place-search candidate tokens both.
- Flags: `isInvitesEnabled()` / `isInviteRewardsEnabled()` following the
  EMAIL_ENABLED predicate + FEATURE_GATED_SECRETS conventions (no new
  secrets in Phase 1; Turnstile ALREADY EXISTS platform-side,
  CAPTCHA_ENABLED + TURNSTILE_SECRET_KEY, used by merchant register:
  reused, not built, when the anonymous lane arrives).

## A1.3 Corrections to earlier sections

- §4/§8 "HMAC" token references → house Redis token pattern (above).
- §7 reward mechanics → superseded by A1.1(8).
- §9 Phase 1 → sign-in required (A1.1(1)); Turnstile not needed in
  Phase 1; anonymous+captcha lane moves wholly to Phase 2.
- Open item added: billing seam design doc (with founding offer) gates
  M5; solicitor blurb unchanged.
- Admin scope: admin-web is under active frozen ownership (#514/#516/
  #521); Phase 1 admin exposure = extending the existing
  GET /api/v1/admin/leads list payload (LEAD_SELECT) with demand
  evidence (invite counts, latest notes) as a BACKEND contract; console
  UI changes ride the admin session later.
