# Customer Flow — Current System Spec

- **Status:** Living document — represents what `main` actually does, not what was once locked.
- **Last verified against main:** 2026-05-01 (post auth/welcome/onboarding/subscription rebaseline). §13 saved-area fallback is currently AWAITING MERGE on `feature/df-postcode-profile-fallback` — entry intentionally landed in this doc per the living-doc rule so the merge PR closes the doc gap atomically.
- **Scope:** Customer app (React Native / Expo) + customer website (Next.js)
- **Entry-flow surfaces represented:** Welcome, Login, Registration, Email verification, Phone verification, Forgot/Reset password, Profile completion (PC1–PC4), Onboarding success, Subscription prompt, routing logic, free vs premium placeholder behaviour. **All on `main` post-rebaseline.**
- **Discovery surfaces represented:** Home, Search, Category, Map (on main via PR B / PR C / PR #20). Saved-area location fallback (§13) AWAITING MERGE on `feature/df-postcode-profile-fallback`.
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
- Marking PC4 complete (or tapping "Skip for now") routes to `(auth)/onboarding-success`. **PC4 does NOT stamp `onboardingCompletedAt`** — that flag is stamped one screen later, by the success screen. See §6.

### 5.5 Step routing — entry side vs forward side
Two distinct mechanisms; do not conflate them:

- **Entry side (auto-skip past completed required steps):** `resolveRedirect` calls `firstIncompleteRequiredStep(user)` and routes the user directly to the first incomplete required step (`pc1` if firstName/lastName/dob/gender missing, otherwise `pc2` if address/postcode missing). Implementation: [`apps/customer-app/src/lib/routing.ts`](../apps/customer-app/src/lib/routing.ts) §8 rule 5.
- **Forward side (advance through the wizard step-by-step):** `useProfileCompletion.nextRouteAfter(step)` is a strict map (pc1→address, pc2→interests, pc3→avatar, pc4→onboarding-success). It does NOT consult `firstIncompleteRequiredStep` — earlier iterations did, but caused PC2 to be skipped on second-pass when postcode was already saved. Comment at [`useProfileCompletion.ts:6-9`](../apps/customer-app/src/features/profile-completion/hooks/useProfileCompletion.ts) records this.

The two together: a returning user lands directly on whichever required step is incomplete (entry-side skip), then proceeds linearly through every subsequent step including optional ones (forward-side strict). PC3 + PC4 are reachable but not forced — user can tap "Skip for now" on either to advance.

---

## 6. Onboarding Success
- Route: `(auth)/onboarding-success`. Component: [`src/features/onboarding/screens/OnboardingSuccessScreen.tsx`](../apps/customer-app/src/features/onboarding/screens/OnboardingSuccessScreen.tsx).
- Shown when all required profile fields are complete and the user has reached the end of the PC wizard (or skipped optional PC3/PC4).
- **`onboardingCompletedAt` is stamped HERE, not at PC4.** The screen's "Explore deals" CTA (`onExplore`, ~line 160) calls `profileApi.markOnboardingComplete()`, then awaits `refreshUser()` so `resolveRedirect` sees the new state on the next render, then navigates forward to the Subscription Prompt.
- One-shot in the routing sense — once stamped, `resolveRedirect` rule 6 no longer routes here, and the user advances to rule 7 (Subscription Prompt).

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
| `onboardingCompletedAt` | Stamped from `OnboardingSuccessScreen.onExplore` (NOT from PC4) | App-driven only — never set from web |
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

## 13. Saved-area location fallback (§DF v1) — AWAITING MERGE

When live GPS is denied or unavailable, customer-app Discovery falls back to the user's saved profile postcode so Home, Search, NBC, Map, voucher detail, and merchant profile all render against a real anchor instead of collapsing to UK-wide. A single honesty hint on Home discloses the fallback source. A dedicated Saved Area sub-screen lets the user update the postcode or grant GPS. A branded pre-permission explainer + denied/off recovery sheet wrap every explicit "Use current location" action.

Status: implemented end-to-end on `feature/df-postcode-profile-fallback`; PR not yet open. This section describes the behaviour that merges with the §DF v1 PR — once that PR lands on `main`, drop the "AWAITING MERGE" callout in §13's heading and bump the doc's `Last verified` date.

Authority: spec `docs/superpowers/specs/2026-05-24-postcode-profile-fallback-design.md` v1.1, plan `docs/superpowers/plans/2026-05-24-postcode-profile-fallback.md` v1.0, audit `docs/superpowers/audits/2026-05-24-location-hook-audit.md` (Tasks 0a / 0b / 0c locked decisions).

### 13.1 Server-side resolver precedence — preserved from Plan 4 M2.4

`resolveEffectiveLocation` at [`src/api/lib/effectiveLocation.ts`](../src/api/lib/effectiveLocation.ts) implements (first match wins):

1. **PLACE_QUERY** — request carries `placeLocality` (explicit user "show me {place}" action; Search/Category only).
2. **GPS** — request carries `lat` + `lng` (live coords sent by the client).
3. **SAVED_PROFILE** — authenticated user has all three of `User.latitude`, `User.longitude`, `User.localityId` populated.
4. **none** — falls through.

§DF v1 does NOT modify the resolver. Home callers never set `placeLocality`, so Home effectively behaves as GPS > SAVED_PROFILE > none. The SAVED_PROFILE branch requires all three fields; seed (Task 1) + backfill (Task 2) close the data gap so the branch can actually fire for the existing user base.

### 13.2 `locationContext` wire envelope — already on Home

Home response carries (preserved from PR #126 §BB; no new emit in §DF v1):

```ts
locationContext: {
  city: string | null              // e.g. "Huddersfield"
  source: 'coordinates' | 'profile' | 'none'
  locality: { id: string; name: string } | null
}
```

Mapping: GPS coords present → `'coordinates'`; no coords + User has localityId OR city → `'profile'`; otherwise `'none'`. PLACE_QUERY collapses to `'coordinates'` because the user explicitly chose where to look. Search / Map / NBC / voucher detail / merchant profile do NOT yet emit `locationContext` — deferred to §DF-v2-j.

### 13.3 Client never sends profile postcode (D1)

Customer-app sends live GPS coords when available; otherwise omits `lat`/`lng`. The server resolves SAVED_PROFILE from the authenticated `User` row. Profile postcode never rides the wire from client — keeps profile state trusted server-side and removes the client-cache-vs-server-truth staleness class.

### 13.4 Seed + backfill (Tasks 1 + 2)

- `prisma/seed.ts` resolves `HD1 1AA` via `findOrCreateLocality` and writes `postcode`, `latitude`, `longitude`, `localityId` on `customer@redeemo.com`. Run `npx prisma db seed` to apply.
- `prisma/backfill-user-locality.ts` — idempotent script for legacy + incomplete users. Targets `postcode IS NOT NULL AND (localityId IS NULL OR latitude IS NULL OR longitude IS NULL)`. Run once on deploy.
- Caveat (R3): locality-centroid coords (~1–5km imprecise). Acceptable for Discovery ranking; not for navigation. Aligned with the `POSTCODE_CENTROID` redaction contract.

### 13.5 Home saved-area honesty hint (Task 6)

[`apps/customer-app/src/features/home/components/SavedAreaHonestyHint.tsx`](../apps/customer-app/src/features/home/components/SavedAreaHonestyHint.tsx) — single thin row mounted above Featured on Home, visible ONLY when `locationContext.source === 'profile'`:

> 📍 Showing offers near Huddersfield · based on your saved postcode    [Update ›]

- Cream-tinted background (`color.surface.tint`), 1px brand-rose hairline border, body.sm copy, brand-rose pin icon. No card shadow.
- Hidden when `source === 'coordinates'` or `'none'`.
- No mount animation. Slide-up exit (300ms ease-out) on `source` transition `'profile' → 'coordinates'`. Reduced-motion: instant.
- Tap target = whole row + chevron. Routes to `/(app)/saved-area`.
- testID `saved-area-honesty-hint`.

### 13.6 Saved Area sub-screen (Task 7)

Route: `app/(app)/saved-area.tsx` — flat sub-route registered in `_layout.tsx` as a `Tabs.Screen` with `href: null` + hidden tab bar (mirrors `merchant/[id]`, `voucher/[id]` pattern; Task 0b Option A).

Component: [`apps/customer-app/src/features/saved-area/screens/SavedAreaScreen.tsx`](../apps/customer-app/src/features/saved-area/screens/SavedAreaScreen.tsx).

Layout:

- Header: "Saved Area"
- Current postcode + locality (read from `useMe()` profile)
- **Update postcode** CTA — opens PC2-style postcode lookup; on confirm `PATCH /api/v1/customer/profile { postcode }`; invalidates Discovery + me queries; navigates back. Locked error copy: invalid postcode / network error / save error.
- **Use current location** CTA — routes through the consolidated location hook (§13.8):
  1. `permission === 'undetermined'` → shows §13.9 pre-permission explainer; on Continue triggers native OS prompt
  2. `permission === 'granted'` → skips explainer (no native prompt to wrap)
  3. On grant → coords flow into Discovery requests; honesty hint disappears on Home rerender; `source` switches to `'coordinates'`
  4. On deny / off → shows §13.10 recovery sheet
- Caveat copy: *"Your saved postcode helps us show relevant offers when location is off."*

**GPS coords are NOT written to `User.postcode`.** They live in the client's location-state singleton and ride future Discovery requests as `lat`/`lng` query params. Profile postcode is untouched. To change the saved postcode, the user must use the explicit "Update postcode" path.

### 13.7 Profile tab cross-link (Task 7)

[`apps/customer-app/app/(app)/profile.tsx`](../apps/customer-app/app/(app)/profile.tsx) gains a single row directly below the identity card (insertion-point per audit Task 0b):

> Saved Area · {locality.name OR postcode OR "Set location"} ›

Tap routes to `/saved-area`. Low collision risk with the queued Phase 3C.1h Profile rebaseline — the row uses already-imported design-system tokens and can be ported into the rebaselined Profile trivially.

### 13.8 Consolidated location hook — `useUserLocation` extended (Task 4)

Per audit Task 0a Option A, [`apps/customer-app/src/hooks/useLocation.ts::useUserLocation`](../apps/customer-app/src/hooks/useLocation.ts) is the SINGLE GPS-permission lifecycle abstraction. Extended to expose:

```ts
{
  permission: 'granted' | 'denied' | 'undetermined' | 'unavailable'
  coords: { lat: number; lng: number } | null     // alias of legacy `location` for §DF callers
  location: { lat, lng, area, city } | null       // legacy back-compat
  status: 'idle' | 'loading' | 'granted' | 'denied'  // legacy back-compat
  request(): Promise<void>                        // mounts §13.9 explainer when undetermined → native prompt
  requestPermission(): Promise<void>              // legacy back-compat
  openSettings(): Promise<void>                   // recovery action — Linking.openSettings() cross-platform
}
```

- All 7 pre-existing call sites (Home / HomeNoLocationBanner / CategoryResults / Map / Search / VoucherDetail / MerchantProfile) read only legacy fields and stay backward-compatible.
- Single-flight guard (ref-based) prevents double-tapping "Use current location" from firing two parallel native prompts.
- `useLocationAssist` ([`src/lib/location.ts`](../apps/customer-app/src/lib/location.ts)) is untouched — its purpose (street-address reverse-geocode for PC2 form prefill) is orthogonal to GPS-permission lifecycle. §DF v1 ships with exactly TWO location abstractions, not three.
- Dev location override (§AU `__DEV__` only) preserved — short-circuits the permission probe + request, sets `permission='granted'` + override coords, never fires the native prompt, never mounts the explainer or recovery sheets.

### 13.9 Pre-permission explainer (Task 5)

[`apps/customer-app/src/lib/location/PrePermissionExplainer.tsx`](../apps/customer-app/src/lib/location/PrePermissionExplainer.tsx) — branded bottom-sheet shown BEFORE the native OS prompt when permission state is `'undetermined'`.

> 📍 (brand-rose pin)
> **Show offers near you**
> Redeemo uses your location to surface nearby merchants, vouchers, and offers. We never share your location with merchants — only distance is shown.
> [ Continue ]  ← triggers the native OS prompt
> [ Not now ]   ← dismiss; rely on saved postcode

Mounted via [`apps/customer-app/src/lib/location/LocationPermissionProvider.tsx`](../apps/customer-app/src/lib/location/LocationPermissionProvider.tsx) wrapping the `(app)` layout. Provider owns mount state for both the explainer and the recovery sheet; the hook exposes `show*` actions via context.

Skipped when `permission === 'granted'` (no native prompt to wrap). Not auto-triggered on cold app open if profile postcode exists (D5 locked decision).

### 13.10 Denied / off recovery sheet (Task 5)

[`apps/customer-app/src/lib/location/LocationRecoverySheet.tsx`](../apps/customer-app/src/lib/location/LocationRecoverySheet.tsx) — branded bottom-sheet shown when the OS returns "denied" / "permanently denied" / "location services off device-wide" AFTER an explicit GPS request.

> 📍 (brand-rose pin with subtle slash)
> **Location is off**
> Turn on location in your phone settings to see offers near you right now. We'll keep using your saved area until then.
> [ Open settings ]  ← `Linking.openSettings()`
> [ Use saved area ] ← dismisses; source stays `'profile'`

Non-blocking. The user can always continue with the saved-area Home experience.

### 13.11 Surfaces inheriting the new `effLoc` silently (D3 / Q2 lock)

- **Search** — NEARBY/CITY scopes start working when profile-anchored.
- **NBC rails** — fire from saved postcode coords; tiles render distance chips against profile locality.
- **Map** — initial bbox centres on profile `Locality` coords. User-location dot SUPPRESSED (not real GPS — showing a dot would lie).
- **Voucher Detail / Merchant Profile** — distance lines render from profile coords. Same chip semantics as GPS path.

No honesty hint on any of these in v1. §DF-v2-f deferred to Tier 1 expansion if device-QA flags confusion.

### 13.12 Free-user / unauthenticated state

Unauthenticated requests have no `User` row → server can't resolve SAVED_PROFILE → falls through to `effLoc = null`. Existing no-location behaviour preserved. Honesty hint never renders. §13.10 recovery sheet still fires if an unauthenticated user explicitly taps "Use current location" anywhere and gets denied.

Legacy authenticated users with no postcode at all stay on no-location until they update profile. The existing `<HomeNoLocationBanner>` fires for them (not the §DF honesty hint). §DF-v2-b Home banner prompting postcode-set is deferred until device-QA shows no-postcode users get stuck.

### 13.13 Skipped from v1 (deferred to §DF-v2)

Plan Tasks 3 + 8 were SKIPPED per audit Task 0c — both depend on emitting `locationContext` on Search / Map / Voucher Detail / Merchant Profile, which carries cross-endpoint signature changes (Voucher Detail + Merchant Profile don't currently accept or propagate `lat`/`lng`). Per spec §6.4.5 scope guard, ≥3 endpoints needing additive emit → defer.

Skipped Tasks 3 + 8 are tracked as **§DF-v2-j** in `project_deferred_followups_index.md`:
- Backend additive `locationContext` emit on Search / Map / Voucher Detail / Merchant Profile.
- Voucher Detail + Merchant Profile `lat`/`lng` propagation plumbing.
- 4 customer-app Zod schema extensions.
- §6.4.3 top-of-app `LocationStatusLabel` component + mount on every Discovery surface.

Other §DF-v2-* follow-ups (multi-saved-locations §DF-v2-a, no-postcode Home prompt §DF-v2-b, aggressive GPS prompt §DF-v2-c, reconciliation UI §DF-v2-d, periodic "is your postcode right?" §DF-v2-e, honesty hint on other surfaces §DF-v2-f, standalone Home-top "Use current location" pill §DF-v2-g, locality re-resolution job §DF-v2-h, resolver+wire-helper alignment §DF-v2-i) are listed in spec §11 + deferred-followups index.

### 13.14 Test pinning (focused gates green at branch tip)

- Backend integration pins: 7 in `tests/api/customer/discovery/home-feed-rail-states.test.ts` covering §DF-1..§DF-7 (GPS-wins / SAVED_PROFILE-resolves / PLACE_QUERY-beats-both / identical-ranking / unauth-no-location / no-postcode-no-location / incomplete-profile-fallthrough-with-latent-wire-inconsistency).
- Customer-app unit pins: 78 across `tests/hooks/`, `tests/lib/location/`, `tests/features/home/SavedAreaHonestyHint.test.tsx`, `tests/features/saved-area/SavedAreaScreen.test.tsx` covering hook permission states, single-flight guard, dev-override preservation, explainer / recovery sheet copy + actions, provider context, honesty hint render gates, Saved Area screen flows.
- Backfill script tests: `tests/scripts/backfill-user-locality.test.ts` covering no-op / populate / no-postcode-skip / idempotency.

---

## 14. §DF v1 Device-QA Checklist

Owner-locked QA scenarios for `feature/df-postcode-profile-fallback`. Run iOS + Android dev clients. Tick boxes inline at the PR; carry residual findings into the §DF-v2-* deferred list.

### 14.1 Locked scenarios (must verify)

- [ ] **Huddersfield saved-profile fallback with GPS denied.** Customer with `HD1 1AA` postcode, GPS denied. Home renders fully anchored on Huddersfield Locality; honesty hint *"Showing offers near Huddersfield · based on your saved postcode"* visible; rails carry non-rose chips where appropriate.
- [ ] **London saved-profile fallback with GPS denied.** Same as above but with a London postcode. Setup: use the backfill script against an existing test user with a London postcode, OR run `prisma/set-auth-state.ts <email> verified` then manually set `User.postcode` to a London postcode (e.g. `EC1A 1BB`) and run `npx tsx prisma/backfill-user-locality.ts` to populate lat/lng/localityId. Verify Home renders anchored on London Locality with London-area rails.
- [ ] **GPS grant mid-session.** Start on Saved Area screen with `source='profile'`. Tap **Use current location**. Verify: branded pre-permission explainer fires; tap **Continue**; native OS prompt fires; tap **Allow**. Result: honesty hint disappears (slide-up exit, 300ms ease-out); Home reranks from live GPS coords; `locationContext.source` switches to `'coordinates'`.
- [ ] **GPS denied/off from Saved Area.** Same flow but tap **Don't Allow** at the native prompt (OR turn iOS-level location services off device-wide). Verify: branded recovery sheet appears with *"Location is off"* copy; **Open settings** CTA calls `Linking.openSettings()` and opens the OS Settings app at app-details level; **Use saved area** CTA dismisses; app continues using saved area; honesty hint stays visible.
- [ ] **Legacy / no-postcode user.** Customer with `postcode=null` (e.g. pre-PC2 legacy account). Existing no-location behaviour preserved: existing `<HomeNoLocationBanner>` fires (NOT the §DF honesty hint); Discovery rails behave as no-location; no `source='profile'` hint shown.
- [ ] **Dev location override still wins.** `__DEV__` build with `devLocationOverride()` returning non-null coords. Verify: hook returns `permission='granted'` + override coords immediately; native OS prompt does NOT fire; explainer + recovery sheets do NOT mount; `openSettings()` no-ops.

### 14.2 §DF-UX paths (verify alongside §14.1)

- [ ] **First "Use current location" tap on a fresh device install** with `permission='undetermined'` — explainer fires first, then on **Continue** the native OS prompt fires.
- [ ] **Subsequent "Use current location" tap with `permission='granted'`** — explainer is skipped (no native prompt to wrap).
- [ ] **Double-tap on "Use current location"** — single-flight guard (ref-based) prevents two parallel native prompts.
- [ ] **Saved Area screen render with `User.locality` populated but `User.city=null`** (or vice versa) — current postcode + locality block renders gracefully; falls back appropriately.
- [ ] **Postcode update via Saved Area — happy path.** Enter a valid UK postcode → postcodes.io lookup populates the area card → tap **Save** → Discovery + me query caches invalidate → navigates back to Home → Home rerenders against the new locality.
- [ ] **Postcode update — invalid postcode.** Enter a malformed postcode (e.g. `ZZZ 999`) — postcodes.io returns 404 — locked error copy renders.
- [ ] **Postcode update — network error.** Disconnect from network during the lookup — postcodes.io rejection — locked error copy renders.
- [ ] **Postcode update — save error.** Mock `PATCH /api/v1/customer/profile` to fail — locked error copy renders.
- [ ] **Profile tab cross-link.** `Saved Area · {locality.name}` row renders the saved area under the identity card. Tap routes to Saved Area screen.
- [ ] **Honesty-hint route push.** From Home, tap the honesty hint (whole-row tap target or chevron) — Saved Area screen mounts cleanly. Verify Task 6 → Task 7 integration.
- [ ] **App backgrounded → permission granted in OS Settings → returns.** When the §DF-v2-j top-of-app label ships, this scenario will verify label updates from `No GPS · Set location` to `Using current location` on next focus. v1 scope: confirm Home reranks on next Discovery request when GPS becomes granted while backgrounded.

### 14.3 Pre-merge gate (re-run before opening PR)

Capture command + outcome inline at the PR. Tick alongside the device-QA boxes.

- [ ] `cd apps/customer-app && npx jest --forceExit tests/hooks/ tests/lib/location/ tests/features/home/SavedAreaHonestyHint.test.tsx tests/features/saved-area/SavedAreaScreen.test.tsx` — expect all PASS (focused §DF + adjacent hook coverage).
- [ ] `npx vitest run tests/api/customer/discovery/home-feed-rail-states.test.ts -t "§DF"` — expect 7/7 §DF pins PASS.
- [ ] `cd apps/customer-app && npx tsc --noEmit` — expect clean (zero errors).
- [ ] `npx tsc --noEmit` (backend) — expect 4 pre-existing baseline errors in `tests/api/customer/savings.service.test.ts` (lines 84 / 353 / 433 / 473 — `Expected 1 arguments, but got 0`). Verify zero NEW errors introduced by §DF.

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
- §13 saved-area fallback resolver precedence changes, the honesty hint render gate changes, the Saved Area sub-screen flows change, the consolidated location hook contract changes, or any §DF-v2-* item ships (§DF-v2-j shipping in particular will move the top-of-app status label + non-Home locationContext emit out of "deferred").

The companion [`customer-flow-changelog.md`](customer-flow-changelog.md) is the auditable history. Every code change that touches the surfaces above must add a dated entry.

Each version bump must add a corresponding dated entry in [`docs/customer-flow-changelog.md`](customer-flow-changelog.md) referencing the section(s) touched.
