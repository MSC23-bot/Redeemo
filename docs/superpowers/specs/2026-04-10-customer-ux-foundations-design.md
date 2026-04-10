# Customer UX Foundations — Design Spec (Phase 3A)

---

## Overview

This spec defines the shared customer experience across the Redeemo customer app (mobile) and customer website. It covers user flows, screen inventory, state definitions, edge cases, backend dependencies, shared UX rules, and the distinction between web and mobile surfaces.

This spec does not include implementation approaches, frontend technology choices, or component-level design decisions. It is the authoritative reference for Phase 3 frontend work. Where this spec conflicts with the original SRS (provided as reference from a previous developer), this spec takes precedence.

---

## Section 1: User Roles & Auth States

### 1.1 Auth States

| State | Definition |
|-------|-----------|
| Guest | No session token. Can browse freely. |
| Authenticated | Valid session token. Access subject to subscription state. |

### 1.2 Subscription States

| State | Backend condition | Entitlement | UI label |
|-------|------------------|-------------|---------|
| No active subscription | No record, or status EXPIRED / CANCELLED | Browse only | — |
| Subscribed | status ACTIVE or TRIALLING | Full — can redeem | Active |
| Cancelling | status ACTIVE + `cancelAtPeriodEnd=true` | Full until `currentPeriodEnd` | "Cancels [date]" |
| Payment issue | status PAST_DUE | Browse only (treated conservatively) | "Payment issue" |

"No active subscription" covers all sub-cases — never subscribed, previously cancelled, lapsed — with no UI distinction between them.

### 1.3 Key Rules

- A redeemed voucher must remain visible in the UI for the entire active cycle. The redemption code is never hidden.
- Subscription state is evaluated at the point of the Redeem action, not at the point of browsing.
- PAST_DUE is treated conservatively as non-redeemable. The user is directed to resolve their payment via Manage Subscription.

---

## Section 2: User Flows

### Flow 1 — Registration (both surfaces)

1. User opens Register screen
2. Enters name, email, password
3. Email verification link sent — user clicks link to verify
4. Optional: add and verify phone number via SMS OTP
5. Lands in authenticated state with no active subscription

### Flow 2 — Login (both surfaces)

1. User enters email + password
2. On success: authenticated session established
3. On failure: inline error, retry available
4. Rate limited: 5 attempts / 1 minute

### Flow 3 — Discovery (both surfaces)

1. Any user (guest or authenticated) can browse Home, Search, Map, Merchant Profile, Voucher Detail freely
2. No paywall, no login wall during browsing
3. Paywall is triggered only when user taps Redeem

### Flow 4 — Subscription

**New subscription sub-flow:**
1. User reaches paywall (from Redeem tap) or navigates via Account or Home CTA
2. Plans Overview shown — Monthly and Annual options
3. User selects plan → Payment Entry (Stripe card capture)
4. On success → Subscription Confirmation
5. User is now in Subscribed state

**Already-subscribed sub-flow:**
1. User navigates to Account → Subscription
2. Manage Subscription shown — current plan, next billing date, cancel option
3. Cancel → Cancel Confirmation → Cancellation Confirmed (access-until date shown)
4. User transitions to Cancelling state; access continues until `currentPeriodEnd`

### Flow 5 — Redemption (mobile only)

1. Subscribed user taps Redeem on Voucher Detail
2. Branch Selector shown — list of active branches for that merchant
3. User selects branch → PIN Entry screen
4. User enters 4-digit branch PIN — submission IS the confirmation (no separate modal)
5. On success: Redemption Active screen shows alphanumeric code + QR for cycle duration
6. Code always re-accessible via Activity Detail

### Flow 6 — Favourites (mobile; API pending)

1. Authenticated user taps favourite icon on Merchant Profile or Voucher Detail
2. Item added to Favourites List
3. Tap again to remove

### Flow 7 — Savings & Activity (mobile primary; Activity on web)

1. User navigates to Savings tab
2. Savings Summary shown (total estimated savings — pending backend aggregation)
3. Activity list below — chronological redemption history
4. Tap any item → Activity Detail with full code + QR

### Flow 8 — Redemption History / Activity (both surfaces)

1. User navigates to Activity (via Savings tab on mobile, or Account on web)
2. Chronological list of all redemptions — merchant, voucher, date, validated status
3. Tap → Activity Detail — full redemption code + QR always present

### Flow 9 — Account & Profile (both surfaces)

1. User navigates to Account hub
2. Hub links to: Subscription, Activity, Favourites, Settings
3. Settings: Edit Profile, Change Password, Notification Preferences (mobile), Delete Account, Sign Out

### Navigation Structure

**Mobile bottom nav:** Home | Map | Savings | Favourites | Account

**Website nav:** Discover | Subscription | Account

---

## Section 3: Screen Inventory

### Auth Screens

| ID | Screen | Primary Surface | Web |
|----|--------|----------------|-----|
| A1 | Welcome / Onboarding Splash | Mobile | — |
| A2 | Register | Mobile | Yes |
| A3 | Login | Mobile | Yes |
| A4 | OTP Verification (phone) | Mobile | Yes |
| A5 | Forgot Password | Mobile | Yes |
| A6 | Reset Password | Mobile | Yes |

### Discovery Screens

| ID | Screen | Primary Surface | Web |
|----|--------|----------------|-----|
| D1 | Home / Feed | Mobile | Yes |
| D2 | Map View | Mobile | Not in current phase |
| D3 | Search Entry | Mobile | Yes |
| D4 | Search Results | Mobile | Yes |
| D5 | Category Browse | Mobile | Yes |
| D6 | Merchant Profile | Mobile | Yes |
| D7 | Voucher Detail | Mobile | Yes |

**D1 — Home / Feed:** Featured merchants, trending section, category shortcuts, subscription CTA banner (for non-subscribed users).

**D2 — Map View (mobile):**
- Full-screen map with branch-level pins
- Tap pin → inline quick preview card appears (merchant name, nearest voucher count, distance) — a UI state anchored to the map, not a separate screen
- Tap preview card → navigates to D6 Merchant Profile
- First-class discovery mode; accessible from bottom nav

**D3 — Search Entry:**
- Search input field (active/focused)
- Recent searches (if any)
- Category shortcuts
- Transitions to D4 on submit

**D7 — Voucher Detail — Redeem CTA:**
- Subscribed: active Redeem button
- Non-subscribed: button visible but visually subdued, labelled "Subscribe to Redeem"; tapping opens S1 — not a dead-end
- Web: no Redeem CTA — shows "Redeem in the app" (product rule, not phase limitation)

### Redemption Screens (mobile only — product rule)

| ID | Screen | Primary Surface | Web |
|----|--------|----------------|-----|
| R1 | Branch Selector | Mobile | — |
| R2 | PIN Entry | Mobile | — |
| R3 | Redemption Active (code display) | Mobile | — |

**R2 — PIN Entry:** Submission IS the confirmation step — no separate confirmation modal.

**R3 — Redemption Active:** Alphanumeric code + QR for the current cycle. Always re-accessible from SV3 (Activity Detail) — the code is never lost after leaving this screen.

### Savings & Activity Screens

| ID | Screen | Primary Surface | Web |
|----|--------|----------------|-----|
| SV1 | Savings Summary | Mobile | Not in current phase |
| SV2 | Activity | Mobile | Yes |
| SV3 | Activity Detail | Mobile | Yes |

**Navigation model:** Activity (SV2) is reached directly (bottom nav tab or Account hub). Savings Summary (SV1) sits above it as a summary panel — not a gate to the list. Labels ("Savings", "Activity") are UI-layer names only and must not be hardcoded into backend logic.

**SV2 — Activity:** Chronological redemption list — merchant name, voucher title, date, validated status. Empty state: "No activity yet."

**SV3 — Activity Detail:** Always shows the full redemption code + QR regardless of when in the cycle it was redeemed.

### Subscription Screens

| ID | Screen | Primary Surface | Web |
|----|--------|----------------|-----|
| S1 | Plans Overview | Mobile | Yes |
| S2 | Payment Entry | Mobile | Yes |
| S3 | Subscription Confirmation | Mobile | Yes |
| S4 | Manage Subscription | Mobile | Yes |
| S5 | Cancel Confirmation | Mobile | Yes |
| S6 | Cancellation Confirmed | Mobile | Yes |

**Subscription entry points to S1:**
- D7: "Subscribe to Redeem" CTA on Voucher Detail
- AC1: Account hub → Subscription (if not yet subscribed)
- D1: Home promotional banner / CTA

**Entry point to S4:** AC1: Account hub → Subscription (if already subscribed)

### Favourites Screens

| ID | Screen | Primary Surface | Web | Status |
|----|--------|----------------|-----|--------|
| F1 | Favourites List | Mobile | Not in current phase | UX included, API pending |

- Add/remove is an inline action on D6 and D7 — no separate screen
- Empty state: "No favourites saved yet."
- No core flow depends on Favourites being implemented

### Account Screens

| ID | Screen | Primary Surface | Web |
|----|--------|----------------|-----|
| AC1 | Account Home (hub) | Mobile | Yes |
| AC2 | Edit Profile | Mobile | Yes |
| AC3 | Change Password | Mobile | Yes |
| AC4 | Notification Preferences | Mobile | Not in current phase |
| AC5 | Delete Account | Mobile | Yes |
| AC6 | Sign Out | Mobile | Yes |

**AC1 — Account Home:** Hub with explicit navigation to: Subscription (manage or subscribe), Activity (redemption history), Favourites, Settings (Edit Profile, Change Password, Notification Preferences, Delete Account).

### Empty States (cross-screen)

No dedicated screens — handled inline. Must be defined for:

| Context | Empty state message |
|---------|-------------------|
| Search Results (D4) | "No results — try different terms" |
| Activity (SV2) | "No activity yet" |
| Favourites (F1) | "No favourites saved yet" |
| Savings (SV1) | Total figure hidden (not zero) |

---

## Section 4: State Definitions

### 4.1 Auth States

| State | Definition | UI behaviour |
|-------|-----------|-------------|
| Guest | No session token | Browse D1–D7 freely; gated actions prompt login |
| Authenticated | Valid session token | Full access subject to subscription state |

**Guest action gates:** Login/signup prompt appears only when the user attempts an identity-requiring action — Redeem, Favourite, Subscription purchase, Account access. After authentication, the user returns to the screen and action they came from.

### 4.2 Subscription States

| State | Backend condition | Entitlement | UI label |
|-------|------------------|-------------|---------|
| No active subscription | No record, or EXPIRED / CANCELLED | Browse only | — |
| Subscribed | ACTIVE or TRIALLING | Full — can redeem | Active |
| Cancelling | ACTIVE + `cancelAtPeriodEnd=true` | Full until `currentPeriodEnd` | "Cancels [date]" |
| Payment issue | PAST_DUE | Browse only (treated conservatively) | "Payment issue" |

### 4.3 Voucher States (per user)

| State | Condition | Shown in discovery | UI on D7 |
|-------|-----------|-------------------|---------|
| Available | `status=ACTIVE`, `approvalStatus=APPROVED`, not redeemed this cycle | Yes | Active Redeem CTA (subscribed) or "Subscribe to Redeem" |
| Redeemed this cycle | `UserVoucherCycleState.isRedeemedInCurrentCycle=true` | Yes | "Already redeemed — view code" → SV3 |
| Not available | Any other status or approvalStatus combination | No — excluded from discovery | — |

**Redeemed voucher rule:** A redeemed voucher remains visible in discovery and on the merchant profile for the duration of the cycle. Its detail screen surfaces the existing code — never a new redemption path.

### 4.4 Redemption Code States

| State | Condition | Display |
|-------|-----------|---------|
| Active | Redeemed, `isValidated=false` | Code + QR; "Awaiting validation" label |
| Validated | `isValidated=true` | Code + QR; "Validated" label + timestamp |

Both states always accessible via SV3 for the full cycle duration.

### 4.5 Branch States (R1 — Branch Selector)

| State | Effect |
|-------|--------|
| Branch active | Shown in list |
| Branch soft-deleted | Not shown |
| No available branches | "No available locations" message; redemption flow cannot proceed |

---

## Section 5: Edge Cases

### 5.1 Auth & Session

| Case | Handling |
|------|---------|
| Session expires mid-flow | Redirected to Login; returns to previous screen after re-auth |
| Guest attempts gated action | Login/signup prompt shown inline; after auth, returns to action that triggered it |
| User registers with no subscription | Lands in "No active subscription" — browsing available, redemption gated |
| OTP not received | Resend option available; no auto-retry |
| Password reset link expired | Error shown with option to re-request |

### 5.2 Subscription

| Case | Handling |
|------|---------|
| Subscription expires mid-cycle | Existing redeemed vouchers remain in Activity; no new redemptions |
| Subscription expires while on Redemption Active screen (R3) | No interruption — redemption already created, code valid; next gated action reflects expired state |
| User cancels then re-subscribes | New cycle from re-subscription date; previous Activity preserved |
| PAST_DUE | Non-redeemable; S4 surfaces payment issue prompt |
| User tries to subscribe when already subscribed | S4 shown instead of S1; no duplicate subscription created |
| Promo / trial expires | Transitions to "No active subscription"; prompted on next gated action |

### 5.3 Redemption

| Case | Handling |
|------|---------|
| User taps Redeem on already-redeemed voucher | "Already redeemed — view code"; navigates to SV3 |
| Incorrect PIN on R2 | Inline error on PIN field; attempt counted against rate limit; user stays on R2 — no backward navigation |
| Rate limit reached (5 attempts / 15 min per userId+branchId) | PIN entry disabled; "Too many attempts — try again in X minutes." Countdown shown. Resets automatically after 15 minutes |
| Redemption request fails after PIN accepted | Inline error on R2; user stays on R2 with retry option. No navigation to R3 unless redemption confirmed created |
| No branches available | R1 shows "No available locations"; flow cannot proceed |
| Voucher or merchant becomes inactive between discovery and redeem tap | Guard catches at API; error shown on R2 — "This voucher is no longer available." User stays on R2, navigates back manually |
| User leaves / closes app on R3 | Code persists on server; always re-accessible from SV3 |
| User leaves / closes app on R2 | No redemption created; returns to D7 — flow restarts |

### 5.4 Discovery & Search

| Case | Handling |
|------|---------|
| Search returns no results | D4: "No results — try different terms" |
| No merchants in current location | D1/D2 show appropriate empty state; no crash |
| Merchant has no active vouchers | D6 voucher section: "No vouchers currently available" |
| Image fails to load | Fallback placeholder; no broken image state |

### 5.5 Favourites

| Case | Handling |
|------|---------|
| Guest attempts to favourite | Login/signup prompt; after auth, action completes |
| Favourite action fails | Brief non-blocking toast: "Couldn't save — please try again." UI optimistically updates then reverts on failure. Does not block core flows |

### 5.6 Savings & Activity

| Case | Handling |
|------|---------|
| No redemptions yet | SV2: "No activity yet" |
| Savings aggregation unavailable | SV1 hides total figure entirely — no placeholder, no zero. Activity list loads independently |
| Redemption code viewed after cycle resets | Code remains in Activity as historical record; no longer actionable for validation |

---

## Section 6: Backend Dependencies

### 6.1 Auth

| Screen | Route | Status |
|--------|-------|--------|
| A2 Register | `POST /api/v1/customer/auth/register` | Implemented |
| A2 Email verification | `GET /api/v1/customer/auth/verify-email` | Implemented |
| A2 Resend verification | `POST /api/v1/customer/auth/resend-verification-email` | Implemented |
| A2 Phone OTP — send | `POST /api/v1/customer/auth/verify-phone/send` | Implemented |
| A4 Phone OTP — confirm | `POST /api/v1/customer/auth/verify-phone/confirm` | Implemented |
| A3 Login | `POST /api/v1/customer/auth/login` | Implemented |
| Session refresh | `POST /api/v1/customer/auth/refresh` | Implemented |
| Logout | `POST /api/v1/customer/auth/logout` | Implemented |
| A5 Forgot password | `POST /api/v1/customer/auth/forgot-password` | Implemented |
| A6 Reset password | `POST /api/v1/customer/auth/reset-password` | Implemented |
| Sensitive action OTP — send | `POST /api/v1/customer/auth/otp/send` | Implemented |
| Sensitive action OTP — verify | `POST /api/v1/customer/auth/otp/verify` | Implemented |
| AC5 Delete account | `POST /api/v1/customer/auth/delete-account` | Implemented (OTP-gated, anonymises record) |

**Note:** There is no single `/verify-otp` route. OTP is split into two distinct flows — phone verification during registration, and sensitive action OTP (used for account deletion). SSO routes (Google, Apple) exist but return 501 — excluded from Phase 3A.

### 6.2 Discovery

| Screen | Route / Data source | Status |
|--------|-------------------|--------|
| D1 Featured merchants | `FeaturedMerchant` + proximity radius | Data model exists; no customer list route |
| D1 Trending merchants | Merchants with recent redemptions within radius | Data model exists; no customer list route |
| D2 Map View | `Branch.latitude`, `Branch.longitude` | Data model exists; no customer map/branch route |
| D3 Search Entry | — | Not implemented |
| D4 Search Results | Merchant + voucher search with filters | Not implemented |
| D5 Category Browse | Merchant list by category | Not implemented |
| D6 Merchant Profile | Merchant record, branches, active+approved vouchers | No customer-facing merchant profile route |
| D7 Voucher Detail | Voucher record + `UserVoucherCycleState` for per-user redeemed state | No customer-facing voucher detail route |

### 6.3 Redemption

| Screen | Route | Status |
|--------|-------|--------|
| R1 Branch Selector | Branch list for a merchant (customer-facing) | Not implemented |
| R2 PIN Entry + redemption creation | `POST /api/v1/redemption` | Implemented |
| R3 Redemption Active | Retrieved via Activity routes | Implemented |
| Rate limiting | Redis per `(userId, branchId)`, 5 attempts / 15 min | Implemented |

### 6.4 Savings & Activity

| Screen | Route | Status |
|--------|-------|--------|
| SV2 Activity list | `GET /api/v1/redemption/my` (paginated: `limit`, `offset`) | Implemented |
| SV3 Activity Detail | `GET /api/v1/redemption/my/:id` | Implemented |
| SV1 Savings Summary | Aggregation across `VoucherRedemption` + voucher values | Not implemented |

### 6.5 Subscription

| Screen | Route | Status |
|--------|-------|--------|
| S1 Plans Overview | `GET /api/v1/subscription/plans` | Implemented |
| S2 Payment Entry | `POST /api/v1/subscription/setup-intent` | Implemented |
| S3 Confirmation | `POST /api/v1/subscription` | Implemented |
| S4 Manage Subscription | `GET /api/v1/subscription/me` | Implemented |
| S5/S6 Cancel | `DELETE /api/v1/subscription` | Implemented |

### 6.6 Favourites

| Screen | Route | Status |
|--------|-------|--------|
| F1 Favourites List | `FavouriteMerchant`, `FavouriteVoucher` | Data model exists; no API routes |
| Add / remove favourite | — | Not implemented |

### 6.7 Account

| Screen | Route | Status |
|--------|-------|--------|
| AC2 Edit Profile | — | Not implemented |
| AC3 Change Password | — | Not implemented (only reset-password via email token exists) |
| AC4 Notification Preferences | — | Not implemented |
| AC5 Delete Account | `POST /api/v1/customer/auth/delete-account` | Implemented (OTP action token required) |
| AC6 Sign Out | `POST /api/v1/customer/auth/logout` | Implemented |

**Note:** Customer profile management (edit name, email, phone; change password while authenticated) has no implemented routes. These must be built before AC2 and AC3 can be delivered.

---

## Section 7: Shared UX Rules

### 7.1 Auth & Access

- Discovery (D1–D7) is fully open to unauthenticated users — no login wall during browsing
- Login/signup is triggered only when the user attempts an identity-requiring action: Redeem, Favourite, Subscribe, Account access
- After authentication, the user returns to the screen and action that triggered the prompt
- Session expiry during a flow redirects to Login; on return the user resumes from the same screen

### 7.2 Subscription Gating

- The only hard paywall is the Redeem action
- Non-subscribed users see a visually subdued "Subscribe to Redeem" button — never a dead-end
- All other content (merchant profiles, voucher details, search, map) is freely accessible regardless of subscription state
- Subscription state is evaluated at the point of the Redeem action, not at the point of browsing

### 7.3 Voucher Display

- Only vouchers with `status=ACTIVE` and `approvalStatus=APPROVED` are shown in discovery
- A voucher already redeemed in the current cycle remains visible in discovery and on the merchant profile; its detail screen surfaces the existing code with "Already redeemed — view code"
- The redemption code is never hidden — always accessible via Activity Detail (SV3) for the full cycle
- Voucher cards in discovery must not expose raw status or approvalStatus field values

### 7.4 Merchant Display

- Only merchants with `status=ACTIVE` appear in discovery, search results, and map view — no exceptions
- Inactive merchants must not appear in any discovery surface
- If a merchant is accessed via deep link and is no longer `ACTIVE`, the user sees a clear "This merchant is no longer available" state — the full profile is not shown

### 7.5 Empty States

- Every list screen must have a defined empty state — no blank screens
- Empty states must be contextual: explain why the list is empty and offer a next action where possible

### 7.6 Error Handling

- Inline errors are preferred over full-page error screens wherever possible
- Errors caused by transient issues (network, timeout) must offer a retry action
- Errors caused by state changes (voucher inactive, merchant inactive) must explain the situation clearly and not leave the user stranded
- Form validation errors appear inline on the relevant field — not as a toast or modal

### 7.7 Navigation & Back Behaviour

- Tapping back from a flow triggered by a paywall (e.g. Subscribe to Redeem → Plans) returns to the screen that triggered it, not the app root
- Authentication prompts triggered mid-flow must return the user to their original position after completion

### 7.8 Labels & Copy

- UI labels ("Savings", "Activity") are presentation-layer names only — must not be hardcoded into backend logic, API field names, or database columns
- Status labels shown to users (e.g. "Cancels 14 May") are derived from backend data at render time — never stored as strings

---

## Section 8: Web vs Mobile Distinction

### 8.1 Mobile-only features

| Feature | Reason |
|---------|--------|
| Redemption (PIN entry, code display) | **Product rule — permanently mobile-only.** PIN-based in-store flow and fraud prevention are incompatible with web redemption. This is not a phase limitation |
| Map View (D2) | Location-based native map integration; web TBD |
| Push notification preferences (AC4) | Requires device token |
| Favourites (F1) | API not yet implemented; mobile-first when it ships |
| Savings Summary (SV1) | Mobile-first; backend aggregation pending |

### 8.2 Both surfaces (current phase)

| Feature | Notes |
|---------|-------|
| Registration, Login, OTP, Password reset | Full parity |
| Home / Feed (D1) | Both; web may have reduced personalisation initially |
| Search & Category Browse (D3–D5) | Both |
| Merchant Profile (D6) | Both |
| Voucher Detail (D7) | Both — web shows "Redeem in the app" in place of Redeem CTA |
| Activity list + detail (SV2, SV3) | Both |
| Subscription flow (S1–S6) | Both |
| Account hub, Edit Profile, Delete Account, Sign Out (AC1, AC2, AC5, AC6) | Both |

### 8.3 Framing rule

No feature is permanently excluded from the web — **except redemption**, which is a deliberate product restriction. All other features listed as "primary surface: mobile" reflect current phase scope only and may be extended to web in future.

### 8.4 Redemption on web

Web redemption is excluded by product design — not deferred to a future phase. The in-store PIN flow, fraud prevention requirements, and QR-based validation are fundamentally tied to mobile. The website directs users to the app for redemption ("Redeem in the app"). The backend redemption API is surface-agnostic — if this decision ever changes, no backend changes are required. But no web redemption UI should be built under this spec.
