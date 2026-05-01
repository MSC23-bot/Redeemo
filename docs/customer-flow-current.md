# Customer Flow — Current System Spec

- **Status:** Living document — represents what `main` actually does, not what was once locked.
- **Last verified against main:** 2026-05-01 (post auth/welcome/onboarding/subscription rebaseline)
- **Scope:** Customer app (React Native / Expo) + customer website (Next.js)
- **Entry-flow surfaces represented:** Welcome, Login, Registration, Email verification, Phone verification, Forgot/Reset password, Profile completion (PC1–PC4), Onboarding success, Subscription prompt, routing logic, free vs premium placeholder behaviour. **All on `main` post-rebaseline.**
- **Discovery surfaces represented:** Home, Search, Category, Map (on main via PR B / PR C / PR #20).
- **Not yet on main (rebaseline pending — implemented on `feature/customer-app` reference branch only):** Merchant profile, Voucher detail, Redemption flow / Show-to-Staff, Savings, Favourites, Profile tab. Behavioural changes to those surfaces do NOT require an update to this document until they land on main.

> **Living-doc rule (locked operating Rule 4):** Any PR that changes the behaviour of a surface represented above MUST update the relevant section of this document IN THE SAME PR — no doc drift allowed post-merge. Add a dated entry to [`docs/customer-flow-changelog.md`](customer-flow-changelog.md) describing the change. The changelog is the auditable history; this doc is always-current state.

This document is the single source of truth for the **as-built** behaviour of `main` for the listed surfaces. It is not a design proposal and not a redesign. The previous "Locked v1.0" framing was retired on 2026-05-01 because it created drift between the doc (which described feature/customer-app's polish) and main (which only had the placeholder PR #5 baseline). Now the doc and main are aligned.

---

## 1. Authentication

### 1.1 Login — App
- Route: `(auth)/login`. Component: [`src/features/auth/screens/LoginScreen.tsx`](../apps/customer-app/src/features/auth/screens/LoginScreen.tsx).
- Inputs: email + password (with eye toggle for password). Apple/Google buttons are present but stubbed.
- Forgot-password link routes to `(auth)/forgot-password`.
- On success: server returns access/refresh tokens; tokens stored via `useAuthStore.setTokens()`; `useAuthStore.refreshUser()` populates the profile; routing then evaluated via `resolveRedirect`.
- Login does NOT block on unverified email/phone — those flags are enforced by `resolveRedirect` after the user is authenticated (see §8).

### 1.2 Login — Web
- Route: `/login`. Component: [`apps/customer-web/app/login/page.tsx`](../apps/customer-web/app/login/page.tsx).
- Tokens stored in `localStorage`; a flag cookie is set so middleware can recognise authenticated state.
- Login does NOT block on unverified email/phone (Phase 2 reconciliation). Soft banners handle unverified state on subsequent screens.

### 1.3 Logout
- App + Web: clears tokens from local store, calls server logout, redirects to `/(auth)/welcome` (app) or `/login` (web).

---

## 2. Registration

### 2.1 Registration — App
- Single screen: `(auth)/register`. Component: [`src/features/auth/screens/RegisterScreen.tsx`](../apps/customer-app/src/features/auth/screens/RegisterScreen.tsx).
- Fields: name (first/last), email, password (with 4-segment strength bar), phone, marketing consent, terms.
- After register: user is signed in and routed forward via `resolveRedirect`. Email verification is the next hard block.

### 2.2 Registration — Web (split flow, Phase 2 reconciliation)
- Step 1 — auth: email + password + phone + name.
- Step 2 — profile (optional fields on web): DOB, gender, postcode.
- Step 3 — interests (optional).
- After register: `/verify` token flow handles email verification link; `hydrateFromProfile` (in `AuthContext`) refreshes server-side state.

---

## 3. Email Verification

### 3.1 App — hard block
- Route: `(auth)/verify-email`. `resolveRedirect` forces this screen if `!user.emailVerified`.
- Mechanism: user receives email; app polls `/profile` and unblocks once `emailVerified === true`.

### 3.2 Web — soft banner (Phase 3 reconciliation)
- Component: [`apps/customer-web/components/layout/VerificationBanners.tsx`](../apps/customer-web/components/layout/VerificationBanners.tsx).
- Soft amber banner with Resend action; not a hard block. Dismissible per-pathname via `sessionStorage`.

---

## 4. Phone Verification

### 4.1 App — hard block (includes phone-entry)
- Route: `(auth)/verify-phone`. Triggered by `!nonEmpty(user.phone) || !user.phoneVerified`.
- If phone is not yet set, the screen captures it; OTP is sent via Twilio; user enters OTP to verify.

### 4.2 Web — soft banner only
- Same `VerificationBanners` component (blue variant) flags unverified phone. Verification itself is not performed on web in v1.0 — user must verify in the app.

---

## 5. Profile Completion (PC1–PC4)

Stack: `(auth)/profile-completion/_layout.tsx` with four step screens. Step gating uses [`firstIncompleteRequiredStep()`](../apps/customer-app/src/lib/routing.ts) for hard-block steps, and [`useProfileCompletion`](../apps/customer-app/src/features/profile-completion/hooks/useProfileCompletion.ts) for forward navigation between steps.

### 5.1 PC1 — About (REQUIRED)
- Route: `(auth)/profile-completion/about`.
- Required fields: `firstName`, `lastName`, `dateOfBirth`, `gender`.
- Gender canonical values (Phase 4 reconciliation): `female | male | non_binary | prefer_not_to_say`.

### 5.2 PC2 — Location (REQUIRED on app, OPTIONAL on web)
- Route: `(auth)/profile-completion/address`.
- Required field on app: `postcode`.

### 5.3 PC3 — Interests (OPTIONAL)
- Route: `(auth)/profile-completion/interests`.
- Not part of `firstIncompleteRequiredStep` — user may skip.

### 5.4 PC4 — Avatar (OPTIONAL)
- Route: `(auth)/profile-completion/avatar`. Component: [`src/features/profile-completion/screens/PC4AvatarScreen.tsx`](../apps/customer-app/src/features/profile-completion/screens/PC4AvatarScreen.tsx).
- User can upload photo or skip. Newsletter consent toggle lives here.
- Marking PC4 complete sets `onboardingCompletedAt` server-side.

### 5.5 Step auto-skipping (Phase 4 reconciliation)
- `useProfileCompletion.nextRouteAfter()` consults `firstIncompleteRequiredStep` and routes the user to the first incomplete required step rather than blindly advancing one step at a time. Optional steps (interests, avatar) are reachable but not forced.

---

## 6. Onboarding Success
- Route: `(auth)/onboarding-success`. One-shot screen shown when all required fields are complete and `onboardingCompletedAt` has been stamped.
- After this screen, the next forward step is the Subscription Prompt.

---

## 7. Subscription Prompt (Locked Placeholder Behaviour)

- Route: `(auth)/subscription-prompt`. Component: [`src/features/subscribe/screens/SubscribePromptScreen.tsx`](../apps/customer-app/src/features/subscribe/screens/SubscribePromptScreen.tsx).
- Layout (locked): hero, two plan cards (Annual selected by default + Monthly), user-controlled horizontal voucher-type chip strip, "What's included" feature card, fixed footer with two CTAs and trust signal.
- Plan cards include the line *"Every voucher, from every merchant on Redeemo"* with a check-bullet matching the card's accent colour (amber Annual, green Monthly).

### 7.1 CTA behaviour — locked contract

| CTA | Function | Calls `markSubscriptionPromptSeen` | Navigates to `/(app)/` |
|---|---|---|---|
| **Explore full access** (primary, gradient) | `handlePremiumChoice` | NO | NO — shows `Alert.alert("Coming soon", …)`, user dismisses, stays on screen |
| **Start with free access** (secondary) | `handleFreeChoice` | YES | YES |

Rationale: real subscription flow (Apple IAP / Google Play / Stripe) is deferred. The premium CTA must NOT mark the prompt as seen because `resolveRedirect` (§8) would otherwise consider the user "past" the prompt without a real purchase. The prompt therefore acts as a real decision point: either pay later (returns to this screen on next session via the routing guard) or pick free now.

### 7.2 Subscription tracking field
- `subscriptionPromptSeenAt` is stamped only by `handleFreeChoice` (or by a future successful purchase). It is the **only** condition `resolveRedirect` checks at step 5 (§8).

---

## 8. Routing Logic — `resolveRedirect`

Source of truth: [`apps/customer-app/src/lib/routing.ts`](../apps/customer-app/src/lib/routing.ts). Evaluated by both `(auth)/_layout.tsx` and `(app)/_layout.tsx` on every render.

Rule order (first match wins):
1. **Public reset routes** — `reset-password`, `forgot-password`: no redirect, even unauthed.
2. **Unauthenticated:**
   - In `app` group → `/(auth)/welcome`.
   - On a non-public auth screen → `/(auth)/welcome`.
   - On a public auth screen (`welcome`, `login`, `register`, `forgot-password`, `reset-password`) → no redirect.
3. **Email not verified** → `/(auth)/verify-email` (unless already there).
4. **Phone not set or not verified** → `/(auth)/verify-phone` (unless already there).
5. **Required profile fields missing** (PC1 about / PC2 address) → `/(auth)/profile-completion/<step>` (unless already inside the wizard).
6. **`onboardingCompletedAt` null** → `/(auth)/onboarding-success` (unless already there or inside profile-completion).
7. **`subscriptionPromptSeenAt` null** → `/(auth)/subscription-prompt` (unless already there).
8. **Fully onboarded but still inside `(auth)` group** → `/(app)`.

Helper: `firstIncompleteRequiredStep(user)` — returns `'about' | 'address' | null`. Only PC1 and PC2 are considered required; PC3/PC4 do not influence routing.

---

## 9. Free vs Premium Behaviour (current placeholder)

**Free user (no active subscription):**
- Can browse all customer surfaces (home, discover, map, merchant profiles, voucher details, search, savings, favourites, profile).
- Cannot redeem. Tapping "Redeem" on a voucher routes to subscribe-prompt OR a free-user gate modal depending on context.
- On web: `SubscriptionNudge` component ([`apps/customer-web/components/layout/SubscriptionNudge.tsx`](../apps/customer-web/components/layout/SubscriptionNudge.tsx)) prompts non-subscribed users.

**Premium user (active or trialling):**
- All free capabilities plus redemption (mobile only).
- App resolves subscription state via `useSubscription()` (React Query, `GET /api/v1/subscription/me`); `ACTIVE` and `TRIALLING` are treated as subscribed.

**Placeholder gap (v1.0):** there is no in-app way to actually become premium. "Explore full access" shows an alert and does nothing else. Premium accounts in dev are created via [`prisma/grant-dev-subscription.ts`](../prisma/grant-dev-subscription.ts).

---

## 10. Locked Web ↔ App Asymmetry (do not collapse without new design review)

| Concern | App | Web |
|---|---|---|
| DOB / gender / postcode | Mandatory (PC1 + PC2) | Optional (split register) |
| Phone collected | At verify-phone, hard block | At register, soft banner only |
| Phone verified | Required in app | Not performed on web in v1.0 |
| Email verification | Hard block screen | Soft amber banner |
| `onboardingCompletedAt` | Stamped on PC4 complete | App-driven only — never set from web |
| `subscriptionPromptSeenAt` | Stamped on free-CTA tap | App-driven only — web shows `SubscriptionNudge` instead |

This asymmetry is intentional. The app is the canonical onboarding surface; the web exists to let users browse and (in the case of subscribe-on-web in Phase 3D) purchase, without duplicating the full hard-block ladder.

---

## 11. Deviations from Initial Spec

The original UX spec is at [`docs/superpowers/specs/2026-04-10-customer-ux-foundations-design.md`](superpowers/specs/2026-04-10-customer-ux-foundations-design.md). Deviations below are tracked in chronological order; reasons are summarised here and reflected in detail in the change log.

| # | Area | Originally planned | Now (on `main`) | Reason |
|---|---|---|---|---|
| D1 | Routing | Local onboarding flags consulted in addition to server profile | `resolveRedirect` consumes server profile only; re-evaluated in both layouts on every render | Local flags drifted from server state on multi-device login. Phase 1 reconciliation. |
| D2 | Web register | Single-page register identical to app | Split into auth + profile + interests; profile fields optional on web | Reduce drop-off on web sign-up where mobile-only fields aren't useful yet. Phase 2 reconciliation. |
| D3 | Web verification | Same hard-block screens as app | Soft amber email + blue phone banners (`VerificationBanners`), dismissible per-path | Web is browsing/purchase, not onboarding; hard blocks killed conversion. Phase 3 reconciliation. |
| D4 | Profile completion stepping | Strict step-by-step navigation | `firstIncompleteRequiredStep` allows skipping completed steps and editing optional steps without forced re-traversal | Users completing fields out of order were being bounced back. Phase 4 reconciliation. |
| D5 | Gender values | Free-form / inconsistent across platforms | Canonical enum: `female \| male \| non_binary \| prefer_not_to_say` | Cross-platform consistency for analytics + filters. Phase 4 reconciliation. |
| D6 | Web non-subscriber prompts | Same hard-block subscribe wall as app | `SubscriptionNudge` soft component | Mirrors web verification approach — soft, non-blocking. Phase 4 reconciliation. |
| D7 | Subscribe wall CTA copy | "Unlock all vouchers" / "Continue with free account" | "Explore full access" / "Start with free access" | Original copy implied premium worked; placeholder needs honest framing. 2026-04-25. |
| D8 | Subscribe wall premium CTA | Same as free path: marks prompt seen + navigates | Shows `Alert.alert("Coming soon", …)`, no mark-seen, no navigation | Real purchase deferred; cannot stamp `subscriptionPromptSeenAt` without a real decision. 2026-04-25. |
| D9 | Subscribe wall voucher chips | Auto-scrolling marquee | User-controlled horizontal `ScrollView` (no animation) | Auto-motion proved un-pausable in practice; user pivoted to manual swipe. 2026-04-25. |
| D10 | Plan cards | No cross-merchant access line | Both cards include "Every voucher, from every merchant on Redeemo" with accent check | Premium value prop was unclear from layout alone. 2026-04-25. |

---

## 12. Code References (no large blocks — see file links)

**Routing & profile completion**
- [`apps/customer-app/src/lib/routing.ts`](../apps/customer-app/src/lib/routing.ts) — `resolveRedirect`, `firstIncompleteRequiredStep`
- [`apps/customer-app/src/features/profile-completion/hooks/useProfileCompletion.ts`](../apps/customer-app/src/features/profile-completion/hooks/useProfileCompletion.ts) — `nextRouteAfter`, `markStepComplete`
- [`apps/customer-app/app/(auth)/_layout.tsx`](../apps/customer-app/app/(auth)/_layout.tsx) and [`apps/customer-app/app/(app)/_layout.tsx`](../apps/customer-app/app/(app)/_layout.tsx) — call sites for `resolveRedirect`

**Auth state**
- [`apps/customer-app/src/stores/auth.ts`](../apps/customer-app/src/stores/auth.ts) — `useAuthStore`, `setTokens`, `refreshUser`

**Subscription prompt + status**
- [`apps/customer-app/src/features/subscribe/screens/SubscribePromptScreen.tsx`](../apps/customer-app/src/features/subscribe/screens/SubscribePromptScreen.tsx) — `handlePremiumChoice`, `handleFreeChoice`, locked CTA copy
- [`apps/customer-app/src/lib/api/subscription.ts`](../apps/customer-app/src/lib/api/subscription.ts) — `useSubscription`
- [`apps/customer-app/src/lib/api/profile.ts`](../apps/customer-app/src/lib/api/profile.ts) — `markSubscriptionPromptSeen`

**Web parallels**
- [`apps/customer-web/components/layout/VerificationBanners.tsx`](../apps/customer-web/components/layout/VerificationBanners.tsx)
- [`apps/customer-web/components/layout/SubscriptionNudge.tsx`](../apps/customer-web/components/layout/SubscriptionNudge.tsx)

**Backend**
- [`src/api/subscription/cycle.ts`](../src/api/subscription/cycle.ts) — `getCurrentCycleWindow`, `resetVoucherCycleForUser`
- [`src/api/redemption/service.ts`](../src/api/redemption/service.ts) — guards (subscription, voucher, cycle, PIN, rate limit)

---

## Living-doc maintenance

This document represents the **current state of `main`** for the listed surfaces. It must be kept in sync with code, not version-stamped.

**Update this document in the same PR that changes any of:**
- A routing rule in `resolveRedirect` is added, removed, or reordered.
- A field becomes required vs optional (or vice-versa) in PC1–PC4.
- The subscription prompt CTA contract changes.
- A web/app asymmetry rule from §10 is collapsed or extended.
- A new surface lands on `main` (add it to the "represented" list at the top + a new section for its behaviour).
- An existing surface's user-visible behaviour changes (re-write the section + add a changelog entry).

The companion [`customer-flow-changelog.md`](customer-flow-changelog.md) is the auditable history. Every code change that touches the surfaces above must add a dated entry.

Each version bump must add a corresponding dated entry in [`docs/customer-flow-changelog.md`](customer-flow-changelog.md) referencing the section(s) touched.
