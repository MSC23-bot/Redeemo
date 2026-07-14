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
