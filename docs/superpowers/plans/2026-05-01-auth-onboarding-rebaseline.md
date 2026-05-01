# Auth / Welcome / Onboarding / Subscription Rebaseline Plan

> **Status:** EXECUTED — M1 + M2 complete on `feature/customer-app-auth-onboarding-rebaseline`. M3 (this doc reconciliation + final verification) in progress. PR open pending owner sign-off after M3.
> **For agentic workers:** original execution used `superpowers:writing-plans` discipline → owner-approved → executed milestone-by-milestone with pause-for-review at each.
> **Tier (per locked operating rules):** Tier 2 — rebaseline → plan doc required, owner decisions surfaced before implementation.

---

## ⚠ AMENDMENTS DURING EXECUTION

The plan as originally written underestimated the foundational dependency footprint. **Both M1 and M2 hit contract gaps mid-execution that required pulling additional files from `cefaf45` to keep the salvage coherent.** Rather than ship stubs or hybrid types (both rejected per project rule "no half-finished implementations"), the dependent files were salvaged together. Owner-approved both amendments in real time; pattern documented here for traceability and future rebaselines.

### M1 amendment (auth store + dependents — owner-approved 2026-05-01)

**What it added beyond the originally-planned 28 files:**
- `apps/customer-app/src/stores/auth.ts` — foundational. `MinimalUser` type +4 fields (lastName, dateOfBirth, gender, postcode), new `refreshUser()` method, `setTokens.user` made optional, removed `markOnboardingCompleteNow` + `markSubscriptionPromptSeenNow`.
- `apps/customer-app/src/features/profile-completion/hooks/useProfileCompletion.ts` (M2 file pulled forward) — caller of the now-removed `markOnboardingCompleteNow` action; salvaged alongside the store to maintain contract coherence. PC1-PC4 screen consumers preserved their existing imports because feat's hook returns the same `{ totalSteps, markStepComplete, dismiss }` shape.
- `apps/customer-app/src/features/subscribe/screens/SubscribePromptScreen.tsx` (M2 file pulled forward) — caller of the removed `markSubscriptionPromptSeenNow` action; salvaged to call `profileApi.markSubscriptionPromptSeen()` instead. **Locked v1.0 CTA contract preserved exactly:** premium = alert-only (no stamp, no nav), free = stamp + nav with in-flight guard.
- `apps/customer-app/src/lib/api/auth.ts` — `sendPhoneOtp({ phoneNumber })` optional-argument shape used by salvaged `usePhoneVerify`.
- `apps/customer-app/src/lib/errors.ts` — richer error code mapping (EMAIL_ALREADY_EXISTS, PHONE_ALREADY_EXISTS, PASSWORD_POLICY_VIOLATION, etc.) referenced by salvaged hooks.
- `apps/customer-app/src/design-system/icons.ts` — re-exports for Sparkles, ShoppingBag, and 14 other lucide icons used by salvaged screens.
- `apps/customer-app/app/(app)/_layout.tsx` + `apps/customer-app/app/index.tsx` — inline-edited (not salvaged) to pass the new richer `MinUser` shape to `resolveRedirect`. Couldn't salvage from cefaf45 without losing PR #20's Map-tab work.
- 4 contract test files updated: `tests/app/guards.test.ts`, `tests/stores/auth.test.ts`, `tests/lib/errors.test.ts`, `tests/features/subscribe.test.tsx`.
- `apps/customer-app/tests/setup.ts` — Reanimated `FadeInDown` mock chain made self-referential to support `.delay(80).duration(300).springify()` patterns.

**Owner decision pattern recorded for future rebaselines:** when a Tier 2 salvage hits a foundational contract gap mid-execution, **pause and surface 3 options** (stub / scope-expand / surgical-patch). Default recommendation: scope-expand for coherence. M1 chose Option B per `Proceed with Option B` owner approval.

### M2 amendment (PC contract files — owner-approved 2026-05-01)

**What it added beyond the originally-planned 7 files:**
- `apps/customer-app/src/design-system/components/StepIndicator.tsx` — all 4 PC screens pass `activeColor / segmentWidth / barHeight` props; main's StepIndicator only accepted `total / current`. Salvaged for prop-shape coherence.
- `apps/customer-app/src/lib/api/profile.ts` — PC1AboutScreen patches `firstName`/`lastName` separately; main's `PatchProfileInput` only had `name`. Salvaged for the separate-name-fields shape.
- `apps/customer-app/src/lib/location.ts` — PC2AddressScreen reads `country` and `isoCountryCode` on `ResolvedAddress`; main's type didn't expose those. Salvaged for the richer address shape.
- `apps/customer-app/tests/setup.ts` — Reanimated mock further extended: `createAnimatedComponent` (RNGH calls at module-load, was crashing any suite that imports react-native-gesture-handler), `useEvent` / `useHandler` / `useAnimatedReaction` / `useAnimatedScrollHandler` / `useAnimatedGestureHandler` / `runOnUI`, plus `FadeOutUp / FadeOutDown / SlideInUp / SlideInDown / SlideOutUp / SlideOutDown` entrance/exit animations.

### Final amended scope vs originally-planned

| | Originally planned | Actually shipped |
|---|---:|---:|
| M1 files | 28 | 39 (+11 amendment) |
| M2 files | 7 | 12 (+5 amendment) |
| **Total** | **35** | **51** |

The 16 amendment files were entirely contract-coherence salvage — no behavioural change beyond what the rebaselined screens require to compile and run.

**Goal:** Rebaseline the customer app's entry-flow surfaces (Welcome → Login/Register → Email/Phone verification → Profile completion PC1–PC4 → Onboarding success → Subscription prompt) onto `main` from `feature/customer-app`. Bring the v7 polish (~7,400 LOC of richer visuals + flows) to main, against existing backend contracts that already match.

**Why this surface next:** Per audit `2026-05-01-auth-rebaseline-audit` findings — three reasons:
1. Largest user-facing UX gap on `main` today (placeholder-quality auth screens vs polished v7 designs every user encounters first).
2. Lowest contract-drift risk of any pending rebaseline. Backend auth routes (`POST /auth/customer/...`) are stable on main and match what feature/customer-app calls.
3. Side-effect bug fix: `apps/customer-app/src/features/auth/schemas.ts` on main is missing the password special-character rule that the BACKEND requires. Currently a registration with `Password123` passes client validation and 400s at the API. The rebaseline transplants the corrected schema, fixing this real bug.

**Source branch (REFERENCE ONLY — DO NOT MERGE):** `origin/feature/customer-app` @ `cefaf45`.
**Target branch (new):** `feature/customer-app-auth-onboarding-rebaseline`, off `main` at the merge commit of PR #23.

---

## 1. What exists on `feature/customer-app` (source for salvage)

### 1.1 Auth screens (under `apps/customer-app/src/features/auth/screens/`)

| File | main LOC | feat LOC | Salvage verdict |
|---|---:|---:|---|
| `WelcomeScreen.tsx` | 38 | 438 | **SALVAGE** — full-screen brand intro with Reanimated entry, gradient, illustrations |
| `LoginScreen.tsx` | 56 | 459 | **SALVAGE** — Apple/Google buttons (show stub alert on tap), eye-toggle password, gradient sign-in pill |
| `RegisterScreen.tsx` | 84 | 1,077 | **SALVAGE** — first/last/email/password (4-segment strength bar)/phone (with country-code flag picker)/marketing-consent/terms |
| `ForgotPasswordScreen.tsx` | 57 | 368 | **SALVAGE** |
| `ResetPasswordScreen.tsx` | 91 | 91 | **IDENTICAL** — no changes needed |
| `VerifyEmailScreen.tsx` | 86 | 415 | **SALVAGE** |
| `VerifyPhoneScreen.tsx` | 72 | 1,108 | **SALVAGE** — OTP entry, resend timer, country/phone correction |

### 1.2 Auth hooks (under `apps/customer-app/src/features/auth/hooks/`)

| File | Salvage verdict |
|---|---|
| `useLoginFlow.ts` | **REWRITE/SALVAGE** — wraps existing `auth.login()` client method (same on both branches); diff is mostly error mapping/UX state |
| `useRegisterFlow.ts` | **REWRITE/SALVAGE** — same shape |
| `useVerifyEmail.ts` | **REWRITE/SALVAGE** — same shape |
| `usePhoneVerify.ts` | **REWRITE/SALVAGE** — same shape |
| `useVerifyPhone.ts` | **NEW** (only on feature/customer-app — additional hook beyond `usePhoneVerify`; clarify role during M1) |
| `usePasswordReset.ts` | **REWRITE/SALVAGE** — same shape |

### 1.3 Auth utilities + components (NEW on feature/customer-app — none exist on main)

| File | Salvage verdict |
|---|---|
| `apps/customer-app/src/features/auth/components/RedeemoLogo.tsx` | **SALVAGE** |
| `apps/customer-app/src/features/auth/utils/countries.ts` | **SALVAGE** — country list with flags + dial codes for phone country-code picker |
| `apps/customer-app/src/features/auth/utils/maskPhone.ts` | **SALVAGE** |
| `apps/customer-app/src/features/auth/utils/maskPhone.test.ts` | **SALVAGE** |

### 1.4 Schema

| File | Salvage verdict |
|---|---|
| `apps/customer-app/src/features/auth/schemas.ts` | **SALVAGE — fixes a real bug.** Adds the `[^A-Za-z0-9]` special-character rule that backend `passwordSchema` (`src/api/shared/schemas.ts`) already enforces |

### 1.5 Profile completion (under `apps/customer-app/src/features/profile-completion/`)

| File | main LOC | feat LOC | Salvage verdict |
|---|---:|---:|---|
| `screens/PC1AboutScreen.tsx` | 54 | 715 | **SALVAGE** |
| `screens/PC2AddressScreen.tsx` | 76 | 676 | **SALVAGE** — UK postcode lookup, address autocomplete |
| `screens/PC3InterestsScreen.tsx` | 70 | 418 | **SALVAGE** — interests grid with category icons |
| `screens/PC4AvatarScreen.tsx` | 77 | 409 | **SALVAGE** — avatar picker + upload |
| `hooks/useProfileCompletion.ts` | — | — | **REWRITE/AUDIT** — feature version reads richer user object; align with rebaselined `routing.ts` |
| `hooks/useAvatarPicker.ts` | — | — | **REWRITE/SALVAGE** |
| `steps.ts` | — | — | **IDENTICAL** — no changes needed |

### 1.6 Onboarding + Subscription

| File | main LOC | feat LOC | Salvage verdict |
|---|---:|---:|---|
| `features/onboarding/screens/OnboardingSuccessScreen.tsx` | 22 | 368 | **SALVAGE** — celebratory transition screen with animation |
| `features/subscribe/screens/SubscribePromptScreen.tsx` | 48 | 633 | **SALVAGE** |
| `features/subscribe/screens/SubscribeSoonScreen.tsx` | — | — | **IDENTICAL** — no changes needed |

### 1.7 Routing + (auth) layout

| File | Salvage verdict |
|---|---|
| `apps/customer-app/src/lib/routing.ts` | **REWRITE/AUDIT** — feature version passes richer user object to `resolveRedirect`; integration with rebaselined `useProfileCompletion.ts` |
| `apps/customer-app/app/(auth)/_layout.tsx` | **AUDIT + small rewrite** — picks up the richer user object; adds iOS swipe-from-left back gesture (additive) |

### 1.8 Design-system support files (NEW on feature/customer-app — none exist on main)

| File | Used by |
|---|---|
| `apps/customer-app/src/design-system/scale.ts` | Imported by every salvaged auth screen for `scale, ms` responsive units |
| `apps/customer-app/src/design-system/components/InlineError.tsx` | Imported by salvaged `LoginScreen` and likely all auth screens |

These are 2 missing design-system pieces that block the salvage. They must come along.

### 1.9 Existing tests (already on main, may need updates)

Both branches have these auth/onboarding tests — main's were written against placeholder screens, so test surface (text strings, queries) may need updates after rebaseline:

- `tests/features/welcome.test.tsx`
- `tests/features/login.test.tsx`
- `tests/features/register.test.tsx`
- `tests/features/verify-email.test.tsx`
- `tests/features/verify-phone.test.tsx`
- `tests/features/password-reset.test.tsx`
- `tests/features/subscribe.test.tsx`
- `tests/features/profile-completion/pc1–4.test.tsx`
- `tests/features/profile-completion/useProfileCompletion.test.ts`

Approach: salvage test files from feature/customer-app's `tests/features/` for the same screens. They're more aligned with the rebaselined screens.

---

## 2. What's on `main` already (foundations to build on — DO NOT touch)

### 2.1 Backend (already shipped, all routes confirmed live)

```
✅ POST /auth/customer/register
✅ GET  /auth/customer/verify-email
✅ POST /auth/customer/verify-phone/send
✅ POST /auth/customer/verify-phone/confirm
✅ POST /auth/customer/login
✅ POST /auth/customer/refresh
✅ POST /auth/customer/logout
✅ POST /auth/customer/forgot-password
✅ POST /auth/customer/reset-password
🟡 POST /auth/customer/sso/google                     → 501 NOT_IMPLEMENTED stub (intentional)
🟡 POST /auth/customer/sso/apple                      → 501 NOT_IMPLEMENTED stub (intentional)
✅ POST /auth/customer/resend-verification-email
✅ POST /auth/customer/otp/send                        (auth-gated)
✅ POST /auth/customer/otp/verify                      (auth-gated)
✅ POST /auth/customer/delete-account                  (action-token-gated)
✅ Backend `passwordSchema` requires special character (already enforced server-side)
```

### 2.2 Customer app (already shipped)

- ✅ `apps/customer-app/src/lib/api/auth.ts` — full client surface; methods identical between main and feature/customer-app (one delta: `sendPhoneOtp({ phoneNumber })` optional argument on feature — additive non-breaking)
- ✅ `apps/customer-app/src/lib/api/profile.ts` — for the profile fields PC2–PC4 write through
- ✅ `apps/customer-app/src/lib/api/subscription.ts` + `useSubscription` hook
- ✅ `apps/customer-app/src/stores/auth.ts` — token + user state store
- ✅ `apps/customer-app/src/lib/routing.ts` — basic v1.0 logic on main; this rebaseline upgrades it to the richer feature/customer-app version
- ✅ `apps/customer-app/src/features/profile-completion/steps.ts` — IDENTICAL on both branches
- ✅ `apps/customer-app/app/(auth)/login.tsx`, `forgot-password.tsx`, `onboarding-success.tsx`, etc. — re-export shims, IDENTICAL on both branches
- ✅ `apps/customer-app/src/design-system/useMotionScale.ts` — present on both
- ✅ `react-native-svg`, `react-native-reanimated`, `expo-linear-gradient` — all in `package.json`, used elsewhere on main

### 2.3 Recently merged context (already reflected in main)

- PR #21 — `react-native-worklets@0.5.1` peer dep (unblocks bundle for any auth screen using Reanimated)
- PR #22 — Map tab visible (independent; doesn't touch auth)
- PR #23 — Non-London seed merchants (independent; doesn't touch auth)

---

## 3. Required API contracts — what the client must consume

### 3.1 Register

`POST /auth/customer/register` body:
```ts
{ firstName: string, lastName: string, email: string, password: string, phone: string }
```
Returns `{ user, accessToken, refreshToken }` — same as today.

### 3.2 Login

`POST /auth/customer/login` body: `{ email, password }`. Returns same shape.

### 3.3 Phone verification

- `POST /auth/customer/verify-phone/send` — auth-gated (uses session token); optionally `{ phoneNumber }` to update before sending
- `POST /auth/customer/verify-phone/confirm` — auth-gated; body `{ code }`

### 3.4 Email verification

- `GET /auth/customer/verify-email?token=...` — token-link click handler
- `POST /auth/customer/resend-verification-email` — body `{ email }`

### 3.5 Password reset

- `POST /auth/customer/forgot-password` — body `{ email }`
- `POST /auth/customer/reset-password` — body `{ token, newPassword }`

### 3.6 SSO (UI-only)

`POST /auth/customer/sso/google` and `/sso/apple` return 501. Client surface should NOT trigger these endpoints in production. UI buttons either:
- (Recommended) Show `Alert.alert('Coming soon', 'Apple Sign-In is coming soon. Please use email + password for now.')` on press without hitting the network. **No 501 reaches the user.**
- (Alternative) Hide buttons until SSO ships in Phase 3.

Owner decision in §10.

### 3.7 Profile completion

PC2–PC4 write via `PATCH /api/v1/profile` with the consolidated user fields. Already working on main via existing `useProfileCompletion`; the feature/customer-app version refines retry/error UX.

### 3.8 Subscription prompt

Reads `useSubscription()` (already on main). Subscription prompt placeholder behaviour is locked per `customer-flow-current.md` §7:
- "Explore full access" → `Alert.alert('Coming soon', …)`, NO `markSubscriptionPromptSeen`, NO navigation
- "Start with free access" → stamps `subscriptionPromptSeenAt`, routes to `/(app)/`

Salvaged `SubscribePromptScreen.tsx` MUST preserve this contract. Audit during M3.

---

## 4. File structure (target on `main` after this PR)

```
apps/customer-app/
├── app/(auth)/
│   ├── _layout.tsx                                           UPDATE (richer user object passthrough; iOS swipe gesture)
│   ├── login.tsx                                             UNCHANGED (re-export shim)
│   ├── forgot-password.tsx                                   UNCHANGED (re-export shim)
│   ├── onboarding-success.tsx                                UNCHANGED (re-export shim)
│   ├── register.tsx, reset-password.tsx, …                  UNCHANGED (existing re-export shims)
│   └── profile-completion/                                  UNCHANGED (re-export shims)
│
├── src/
│   ├── design-system/
│   │   ├── scale.ts                                          NEW (salvaged from feature/customer-app)
│   │   └── components/InlineError.tsx                       NEW (salvaged from feature/customer-app)
│   │
│   ├── features/auth/
│   │   ├── components/
│   │   │   └── RedeemoLogo.tsx                              NEW (salvaged)
│   │   ├── hooks/
│   │   │   ├── useLoginFlow.ts                              REWRITE
│   │   │   ├── useRegisterFlow.ts                           REWRITE
│   │   │   ├── useVerifyEmail.ts                            REWRITE
│   │   │   ├── usePhoneVerify.ts                            REWRITE
│   │   │   ├── useVerifyPhone.ts                            NEW (salvaged) — clarify role vs usePhoneVerify
│   │   │   └── usePasswordReset.ts                          REWRITE
│   │   ├── screens/
│   │   │   ├── WelcomeScreen.tsx                            REWRITE (38 → ~440 LOC)
│   │   │   ├── LoginScreen.tsx                              REWRITE (56 → ~460 LOC)
│   │   │   ├── RegisterScreen.tsx                           REWRITE (84 → ~1080 LOC)
│   │   │   ├── ForgotPasswordScreen.tsx                     REWRITE (57 → ~370 LOC)
│   │   │   ├── ResetPasswordScreen.tsx                      UNCHANGED (already identical)
│   │   │   ├── VerifyEmailScreen.tsx                        REWRITE (86 → ~420 LOC)
│   │   │   └── VerifyPhoneScreen.tsx                        REWRITE (72 → ~1110 LOC)
│   │   ├── utils/
│   │   │   ├── countries.ts                                 NEW (salvaged)
│   │   │   ├── maskPhone.ts                                 NEW (salvaged)
│   │   │   └── maskPhone.test.ts                            NEW (salvaged)
│   │   └── schemas.ts                                       REWRITE — fixes password rule mismatch bug
│   │
│   ├── features/profile-completion/
│   │   ├── hooks/
│   │   │   ├── useProfileCompletion.ts                      REWRITE
│   │   │   └── useAvatarPicker.ts                           REWRITE
│   │   ├── screens/
│   │   │   ├── PC1AboutScreen.tsx                           REWRITE (54 → ~720 LOC)
│   │   │   ├── PC2AddressScreen.tsx                         REWRITE (76 → ~680 LOC)
│   │   │   ├── PC3InterestsScreen.tsx                       REWRITE (70 → ~420 LOC)
│   │   │   └── PC4AvatarScreen.tsx                          REWRITE (77 → ~410 LOC)
│   │   └── steps.ts                                          UNCHANGED (already identical)
│   │
│   ├── features/onboarding/
│   │   └── screens/OnboardingSuccessScreen.tsx              REWRITE (22 → ~370 LOC)
│   │
│   ├── features/subscribe/
│   │   ├── screens/SubscribePromptScreen.tsx                REWRITE (48 → ~635 LOC) — preserve locked CTA contract
│   │   └── screens/SubscribeSoonScreen.tsx                   UNCHANGED (already identical)
│   │
│   └── lib/routing.ts                                        REWRITE (richer user object; align with useProfileCompletion)
│
├── tests/features/
│   ├── welcome.test.tsx                                      REPLACE (salvage feat version OR rewrite for new screen surface)
│   ├── login.test.tsx                                        REPLACE
│   ├── register.test.tsx                                     REPLACE
│   ├── verify-email.test.tsx                                 REPLACE
│   ├── verify-phone.test.tsx                                 REPLACE
│   ├── password-reset.test.tsx                               REPLACE
│   ├── subscribe.test.tsx                                    REPLACE
│   └── profile-completion/
│       ├── pc1.test.tsx, pc2.test.tsx, pc3.test.tsx, pc4.test.tsx   REPLACE
│       └── useProfileCompletion.test.ts                      REPLACE
│
└── docs/
    ├── customer-flow-current.md                              UPDATE — re-frame as living doc; align with rebaselined behaviour
    └── customer-flow-changelog.md                            UPDATE — dated entry for this rebaseline
```

**Net file count:** ~33 files modified (28 src + 5 test families) + 2 docs.
**Estimated LOC delta:** +6,500 to +7,000 lines (placeholder → polish growth) net of ~700 lines deleted from placeholder versions.

---

## 5. State partitioning (per screen)

For the big screens, follow the same bucket discipline as PR C's MapScreen:

### 5.1 RegisterScreen (largest screen — 1,077 LOC on feat)
- **Form state:** firstName, lastName, email, password, phone, marketingConsent, termsAccepted, country
- **Validation state:** field errors (Zod-validated via the corrected `schemas.ts`)
- **Submit state:** `useRegisterFlow.submit()` mutation — submitting / errors
- **UI state:** show/hide password, country picker visibility, password strength visualization

### 5.2 LoginScreen
- **Form state:** email, password
- **Validation state:** field errors
- **Submit state:** `useLoginFlow.submit()` mutation
- **UI state:** show/hide password, Apple/Google button press → alert handlers

### 5.3 PC1–PC4
- **Form state:** per-step fields (PC1: firstName/lastName/dob/gender; PC2: address+postcode; PC3: interests[]; PC4: avatarUri)
- **Step state:** current step index, can-go-next, completion status (driven by `useProfileCompletion`)
- **Submit state:** `useProfileCompletion.saveStep(n)` mutation
- **UI state:** picker visibility (DOB picker, gender bottom sheet), avatar picker modal, retry banner on save failure

### 5.4 Subscription prompt
- **Subscription state:** `useSubscription()` (already on main)
- **CTA handlers:** "Explore full access" → alert (locked); "Start with free access" → mark seen + nav (locked)
- No form state — pure presentation + navigation

---

## 6. Milestone breakdown (3 milestones, mirrors PR C)

### M1 — Foundation + Auth surfaces (the perceived improvement) — ✅ COMPLETE (commit `5faff28`)
- [x] Salvage 2 design-system support files (`scale.ts`, `InlineError.tsx`) via `git checkout cefaf45 -- <path>`
- [x] Salvage 4 auth utility files (`RedeemoLogo.tsx`, `countries.ts`, `maskPhone.ts`, `maskPhone.test.ts`)
- [x] Salvage `schemas.ts` — special-character rule now present (audit note: client uses `[^A-Za-z0-9]` broad regex, backend uses curated punctuation list — strict superset, fixes the original bug; minor edge cases noted in commit message)
- [x] Salvage `useVerifyPhone.ts` (NEW hook) — kept as separate hook from `usePhoneVerify.ts`; roles distinct (active OTP confirm vs passive external-verification poll)
- [x] Rewrite 5 auth hooks against current `auth.ts` client (lift from cefaf45)
- [x] Salvage 6 auth screens (`ResetPasswordScreen` confirmed byte-identical, no change needed)
- [x] Update `(auth)/_layout.tsx` for richer user object passthrough
- [x] Update `lib/routing.ts` — richer user object support
- [x] Apple/Google buttons: `Alert.alert('Coming soon', …)` non-network handler — verified across LoginScreen, RegisterScreen, WelcomeScreen
- [x] Replace 6 auth tests with feat-branch salvage (welcome, login, register, verify-email, verify-phone, password-reset)
- [x] **AMENDED IN-FLIGHT** — also salvaged: `stores/auth.ts`, `useProfileCompletion.ts`, `SubscribePromptScreen.tsx`, `lib/api/auth.ts`, `lib/errors.ts`, `design-system/icons.ts`, 4 contract tests, Reanimated mock chain. See top-of-doc amendment section.
- [x] `tsc` clean across customer-app — 0 errors
- [x] Targeted auth tests passing (10 suites total including amendment-pulled-in tests; 46/46 passing)

### M2 — Onboarding + Subscription surfaces (entry path completes) — ✅ COMPLETE (commit `50b3ae0`)
- [x] Salvage 4 PC screens (`PC1AboutScreen`, `PC2AddressScreen`, `PC3InterestsScreen`, `PC4AvatarScreen`)
- [x] Rewrite `useProfileCompletion` against the rebaselined routing — **landed in M1 amendment** to keep auth-store contract coherent
- [x] Rewrite `useAvatarPicker` (lift from cefaf45)
- [x] Salvage `OnboardingSuccessScreen`
- [x] Salvage `SubscribePromptScreen` — locked CTA contract preserved exactly — **landed in M1 amendment**
- [x] Replace existing 5 PC tests on main — pc1.test, pc2.test were byte-identical (no salvage needed); pc3.test, pc4.test salvaged; useProfileCompletion.test landed in M1 amendment
- [x] Replace existing `tests/features/subscribe.test.tsx` with feat-branch salvage — **landed in M1 amendment**
- [x] Targeted PC + subscribe tests passing (5 PC suites + subscribe; all green)
- [x] **AMENDED IN-FLIGHT** — also salvaged: `design-system/components/StepIndicator.tsx`, `lib/api/profile.ts`, `lib/location.ts`, Reanimated mock extended for `createAnimatedComponent` + RNGH internal hooks + slide animations. See top-of-doc amendment section.

### M3 — Doc reconciliation + final verification — IN PROGRESS
- [x] Update plan doc with M1 + M2 amendment annotations (this section)
- [ ] Update `docs/customer-flow-current.md` to describe what `main` now actually does (re-frame as living doc per locked operating Rule 4 — drop "Locked v1.0" framing)
- [ ] Add dated entry to `docs/customer-flow-changelog.md` describing the rebaseline
- [ ] Update `CLAUDE.md` "Phase 3C.1a — Customer App Foundations + Auth (COMPLETE)" section to reflect rebaselined polish on main
- [ ] Full customer-app test suite passing (no new failures vs pre-rebaseline baseline; expect single pre-existing `profile.test.ts` Zod failure unchanged)
- [ ] On-device dev build smoke test — log in with seed credentials, walk Welcome → Register → Verify Email → Verify Phone → PC1–PC4 → Onboarding Success → Subscription Prompt → land on Home/Map. **Owner-approved as optional / post-merge** — not blocking

---

## 7. Dependencies on prior PRs / pending work

- **PR #21 (merged):** `react-native-worklets` peer dep — required for any salvaged screen using Reanimated. **Auth/Onboarding rebaseline depends on this.** Already in.
- **PR #22 (merged):** Map tab visibility — independent.
- **PR #23 (merged):** Non-London seed merchants — independent. Helps device QA for *post-onboarding* surfaces but doesn't gate this PR.
- **No backend changes pending** — every auth route is live and stable.

---

## 8. Risks / known mismatches / things to watch

### 8.1 🟧 `customer-flow-current.md` is currently aspirational, not as-built

This rebaseline is partly the *fix* for that drift. However, it must be updated (re-framed) in the same PR per Rule 4. Cannot land code without doc update.

### 8.2 🟧 Apple/Google SSO 501 surface

Backend stubs return 501. Salvaged `LoginScreen` triggers Apple/Google buttons. Default: show `Alert.alert('Coming soon', …)` and DO NOT call `/sso/google` or `/sso/apple`. Verify the salvaged code does this correctly (it likely does given backend hasn't changed since the v7 work).

### 8.3 🟨 Two phone-verify hooks

feature/customer-app has BOTH `usePhoneVerify.ts` and `useVerifyPhone.ts`. main has only `usePhoneVerify.ts`. During M1, audit both files, keep one, deprecate the other if they overlap.

### 8.4 🟨 Test surface drift

Main's existing 7 auth tests + 5 PC tests were written against placeholder screens. Replacing screens with v7 polish will likely break test-text queries (`getByText('Sign in')` vs `getByText('Continue')`, etc.). Salvaging tests from feature/customer-app gives us tests written against the v7 surface — preferred over rewriting from scratch.

### 8.5 🟨 Routing.ts behaviour change

feature/customer-app's `resolveRedirect` reads phone/firstName/lastName/dateOfBirth/gender/postcode from the user object to make finer-grained routing decisions (e.g., route a user halfway through PC2 back to PC2 specifically). main's version reads only verification flags. The richer routing is a behavioural change — may affect users in already-locked v1.0 flows. Verify each `resolveRedirect` test path still produces correct outcomes.

### 8.6 🟨 useProfileCompletion contract

feature version may emit different navigation actions than main version (e.g., per Phase 4 reconciliation memory: "Step auto-skipping via `firstIncompleteRequiredStep`"). Audit during M2 to confirm the locked behaviour from `customer-flow-current.md` §6 is preserved.

### 8.7 🟨 Marketing-consent + terms acceptance

feature/customer-app's RegisterScreen has marketing-consent checkbox + terms-acceptance link. Need to verify backend endpoint accepts `marketingConsent` field (or is silent about it). Check `auth/customer/routes.ts:17` register handler.

### 8.8 🟦 Country picker performance

`countries.ts` likely contains the full ISO 3166 list (~250 entries). Picker rendering 250 rows with flag emoji should be fine but verify on lower-end devices.

### 8.9 🟦 Asset bundling

Salvaged `WelcomeScreen` may reference image/svg assets. Check imports — anything from `@/assets/...` needs the asset file to come along too. Audit at M1 step "salvage WelcomeScreen".

### 8.10 🟦 Animation perf on cold start

The 7,400-line LOC delta is partly Reanimated `useSharedValue` + `useAnimatedStyle` work. Cold-mount of the Welcome screen may have a perceptible delay vs the placeholder. Acceptable for v7 polish but worth a 1-second smoke check on device.

### 8.11 🟦 No breaking change to backend contract

Pure client rebaseline. No backend changes. If a missing field surfaces during implementation, that's a separate backend PR — DO NOT bundle.

---

## 9. Owner decisions required BEFORE implementation (per Rule 2 + Rule 3)

These need to be answered up-front. Do NOT start M1 until each is settled.

### 9.1 Apple / Google SSO buttons

**Question:** Should the salvaged auth screens render the Apple + Google sign-in buttons in their stubbed state (visible, tappable, "Coming soon" alert), or hide them entirely until backend SSO ships?

**Recommendation:** Render them with "Coming soon" alert. Reasons: (a) `customer-flow-current.md` §1.1 says "Apple/Google buttons are present but stubbed" — the locked spec already accepts this state; (b) hiding them and re-adding later is double work; (c) they signal product roadmap to early users.

### 9.2 Welcome screen content

**Question:** Is feature/customer-app's 438-line WelcomeScreen still the locked design, or has the design changed since it was built?

**Recommendation:** Transplant as-is. Reasons: (a) Welcome screen design hasn't been re-discussed in any session memory; (b) the design dates to the v7 brainstorm cycle which was approved; (c) any redesign should be its own brainstorming spec, not bundled into a rebaseline.

### 9.3 schemas.ts password fix sequencing

**Question:** Extract the schemas.ts 1-line bug fix as a standalone quick PR before this rebaseline, OR bundle into M1?

**Recommendation:** Bundle into M1. Reasons: (a) clean attribution — the change is part of the rebaseline narrative; (b) avoids a separate PR cycle for one line; (c) the file gets meaningfully restructured by feature/customer-app's salvaged version anyway.

---

## 10. Constraints (locked — DO NOT expand)

- ❌ No backend changes (all routes already live, contracts stable).
- ❌ No `feature/customer-app` merge (per locked Branch Policy memory).
- ❌ No new auth methods (no Apple SSO real impl, no Google SSO real impl, no biometrics, no passkeys — those are Phase 3 separate work).
- ❌ No SubscribePromptScreen behaviour change — locked CTA contract preserved.
- ❌ No Onboarding flow restructure — same step count, same fields, same locked rules.
- ❌ No tab bar changes (Home + Map remains the visible-tab set; remaining tabs land with their own rebaselines).
- ❌ Salvage via `git checkout cefaf45 -- <path>` only — never cherry-pick commits.
- ❌ No Plan 4 (location model) work — bundle separately later.

---

## 11. Open scope question — single PR or split?

**Recommendation: single PR.**

Estimated scale:
- 33 src + test files modified
- ~6,500–7,000 net LOC delta
- 3 milestones executed in sequence

Splitting would create a "main has new auth screens but old PC screens" intermediate state — confusing for any device QA in between. Single PR keeps the entry flow internally consistent at every commit.

If diff exceeds 8,000 LOC OR M1's auth screens introduce unexpected complexity, consider extracting M3 (doc reconciliation only) as a follow-up PR. Default: single PR with all three milestones.

---

## 12. Self-review checklist (run before opening PR)

- [ ] Every salvaged file's imports point to current paths on main (no stale `@/lib/...` references)
- [ ] `schemas.ts` special-character rule matches backend `passwordSchema` exactly
- [ ] Apple/Google buttons do NOT trigger the 501 endpoints — handlers call `Alert.alert` only
- [ ] `useSubscription()` is consumed exactly once in the SubscribePrompt path; no duplicate hooks
- [ ] `resolveRedirect` is called from `(auth)/_layout` and `(app)/_layout` consistently with the same user-object shape
- [ ] No `any` types leak through to screen bodies
- [ ] All 7 auth tests + 5 PC tests + subscribe test pass against rebaselined screens
- [ ] `customer-flow-current.md` describes what main now does (post-rebaseline) — re-framed as living doc
- [ ] `customer-flow-changelog.md` has a dated entry for this rebaseline
- [ ] No unrelated lockfile drift — only worklets-required deps change, if any
- [ ] No `feature/customer-app` commit hashes in git log of new branch (pure path-checkout salvage)
- [ ] PR description structured per PR C precedent: scope / tests / explicit non-scope / known follow-ups / locked-baseline impact (now: living-doc impact)
