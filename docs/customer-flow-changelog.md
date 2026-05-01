# Customer Flow — Change Log

Tracks **logic, behaviour, routing, and subscription decisions** for the customer entry-flow surfaces (auth, onboarding, subscription). Visual styling iterations (typography, gradients, spacing, copy polish that doesn't change behaviour) are NOT tracked here — they live in commit history. Read [`docs/customer-flow-current.md`](customer-flow-current.md) for the always-current state of `main`.

## Format

```
### YYYY-MM-DD — AREA
**Change:** ...
**Reason:** ...
```

Entries are listed newest first. Each entry must reference the affected file(s) or section(s) of `customer-flow-current.md` so a future reader can navigate from change → current state.

---

## Entries

### 2026-05-01 — Auth/Welcome/Onboarding/Subscription rebaselined onto main
**Change:** Tier 2 rebaseline brought the v7 polish for Welcome, Login, Register, ForgotPassword, ResetPassword, VerifyEmail, VerifyPhone, PC1–PC4, OnboardingSuccess, and SubscribePrompt from `feature/customer-app` (cefaf45) onto `main`. Includes salvaged design-system support files (`scale.ts`, `InlineError.tsx`, updated `StepIndicator`), auth utilities (`countries`, `maskPhone`, `RedeemoLogo`), routing.ts richer user object, auth store with +4 `MinimalUser` fields (lastName, dateOfBirth, gender, postcode) + `refreshUser()` method, `lib/api/profile.ts` with separate firstName/lastName patch fields, `lib/api/auth.ts` with optional `sendPhoneOtp({ phoneNumber })`, `lib/errors.ts` with richer error mapping table (EMAIL_ALREADY_EXISTS, PHONE_ALREADY_EXISTS, PASSWORD_POLICY_VIOLATION, etc.), and `lib/location.ts` with country/isoCountryCode fields on `ResolvedAddress`. Also: this changelog file framing converted from "locked v1.0" to "living spec" per locked operating Rule 4. Plan executed via `docs/superpowers/plans/2026-05-01-auth-onboarding-rebaseline.md` with two in-flight amendments (M1 auth-store coherence, M2 PC contract files); both owner-approved. **Behavioural changes (vs main pre-rebaseline):** (1) Apple/Google SSO buttons now render with `Alert.alert("Coming soon", …)` non-network handlers across LoginScreen / RegisterScreen / WelcomeScreen — no `/sso/google` or `/sso/apple` requests; (2) password-validation client schema now requires a special character, matching backend `passwordSchema` (closes a real client-vs-backend mismatch bug that 400'd registration with `Password123` and similar); (3) `resolveRedirect` now reads richer user object (lastName, dateOfBirth, gender, postcode in addition to the v1.0 fields) for finer-grained step routing. **Locked CTA contract on SubscribePromptScreen preserved exactly** — premium = alert-only (no stamp, no nav); free = stamp + nav with in-flight guard. **Locked web/app asymmetry preserved** — DOB/gender/postcode mandatory on app PC1+PC2, optional on web; phone required at web register but verified only in app; email verification hard-blocks in app, soft banner on web.
**Reason:** Pre-rebaseline `main` shipped placeholder-quality auth screens (~836 LOC across 13 screens) while `customer-flow-current.md` and the v7 spec described the polished version (~7,400 LOC). On-device QA repeatedly returned "this looks like the very old one" — main was correct relative to PR #5 but did not match user mental models or the doc. The rebaseline closes that gap by lifting feat's polished implementation onto main against the current Plan-1.5 backend (no backend changes needed; auth contracts were stable). Files: §1, §2, §3, §4, §5, §6, §7, §8 of `customer-flow-current.md` all now describe the rebaselined behaviour on main; companion plan doc in `docs/superpowers/plans/2026-05-01-auth-onboarding-rebaseline.md`.

### 2026-05-01 — Living-doc framing
**Change:** `customer-flow-current.md` retired its "Locked v1.0" status and is now an always-current living spec representing what `main` actually does. Every PR that changes covered-surface behaviour MUST update the doc in the same PR. Versioning section replaced with a "Living-doc maintenance" section listing the trigger conditions for an update.
**Reason:** The locked-v1.0 framing created drift between doc (which described feature/customer-app's polish) and main (which only had the placeholder PR #5 baseline). Owner explicitly redefined the doc's role as part of locked operating Rule 4 ("customer-flow-current.md is now a living document representing main, not an aspirational or locked version"). Removes ambiguity for future readers about whether a section describes intended or actual behaviour. Files: header + §7.1 wording + §11 column header + §12 ("Versioning" → "Living-doc maintenance") of `customer-flow-current.md`.

### 2026-04-25 — Subscription Prompt: locked baseline (v1.0)
**Change:** Locked `customer-flow-current.md` at v1.0. Subscription prompt placeholder behaviour finalised: "Explore full access" shows a coming-soon `Alert` and does **not** mark `subscriptionPromptSeenAt`; "Start with free access" is the only path that stamps the flag and navigates to `/(app)/`.
**Reason:** Real purchase flow (Apple IAP / Google Play / Stripe) is deferred. Without a real decision we cannot stamp the prompt-seen flag, otherwise `resolveRedirect` would treat the user as past the gate. Files: [`SubscribePromptScreen.tsx`](../apps/customer-app/src/features/subscribe/screens/SubscribePromptScreen.tsx), §7 of current spec.

### 2026-04-25 — Subscription Prompt: CTA copy
**Change:** "Unlock all vouchers" → "Explore full access". "Continue with free account" → "Start with free access". Updated accessibility labels and tests to match.
**Reason:** Original copy implied premium was functional. New copy honestly reflects the placeholder state (D7 in current spec).

### 2026-04-25 — Subscription Prompt: voucher-chip motion
**Change:** Removed auto-scrolling marquee from voucher-type chips. Replaced with a plain horizontal `ScrollView` driven entirely by user swipe. Removed `PanResponder`, `withRepeat`, `withTiming`, `Easing`, `cancelAnimation`, `runOnJS` from this screen.
**Reason:** Touch-to-pause was unreliable (Pressable consumed by ScrollView; PanResponder claimed too aggressively). User decision: no auto-motion at all. (D9 in current spec).

### 2026-04-25 — Subscription Prompt: plan cards include cross-merchant line
**Change:** Both Annual and Monthly plan cards now show "Every voucher, from every merchant on Redeemo" with an accent-colour check icon (amber for Annual, green for Monthly), positioned above the SAVE pill on the Annual card.
**Reason:** Plan-value proposition was unclear from layout alone — users couldn't tell if a single subscription unlocked all merchants. (D10 in current spec).

### 2026-04-24 — Reconciliation Phase 4: step auto-skipping + canonical gender + web subscription nudge
**Change:**
- `firstIncompleteRequiredStep()` now drives forward navigation through profile completion via `useProfileCompletion.nextRouteAfter()`. Optional steps (interests, avatar) are reachable but never forced.
- Gender values normalised to `female | male | non_binary | prefer_not_to_say` across app + web.
- Web profile persistence: retry-once + partial-save banner.
- New `SubscriptionNudge` component on web for non-subscribed users (replaces app-style hard wall on web).

**Reason:** Users completing fields out of order were being bounced back; gender values diverged between platforms; web hard-blocks killed conversion. (D4, D5, D6 in current spec.) Plan: [`docs/superpowers/plans/2026-04-24-reconciliation-phases-1-4.md`](superpowers/plans/2026-04-24-reconciliation-phases-1-4.md).

### 2026-04-24 — Reconciliation Phase 3 (web): soft verification banners
**Change:** New `VerificationBanners` component on web — soft amber banner (email, with Resend) + blue banner (phone). `sessionStorage` dismissal scoped per pathname. No hard-block screens on web for unverified email/phone.
**Reason:** Web is for browsing + purchase, not onboarding. Hard blocks were killing sign-up flow; soft banners preserve conversion while still surfacing the action. (D3 in current spec.)

### 2026-04-24 — Reconciliation Phase 2 (web): split register, login no longer blocks unverified
**Change:**
- Web register split into 3 steps: auth (email + password + phone + name) → profile (DOB, gender, postcode — optional) → interests (optional).
- Web login no longer blocks on unverified flags; routing handled by soft banners post-login.
- New `/verify` token flow added.
- `hydrateFromProfile` exposed on `AuthContext`.

**Reason:** Web flow needed a lighter-touch sign-up than mobile. Mandatory profile fields belong on the mobile surface; web users want to browse fast. (D2 in current spec.)

### 2026-04-24 — Reconciliation Phase 1 (app): server-driven routing
**Change:** `resolveRedirect` now consumes the server `/profile` payload exclusively; local onboarding flags removed from the routing decision. Both `(auth)/_layout` and `(app)/_layout` re-evaluate `resolveRedirect` on every render. `subscribe-prompt` stamps `subscriptionPromptSeenAt` (later overridden 2026-04-25 — see top of log).
**Reason:** Local flags drifted from server state on multi-device login; users got stuck or skipped onboarding incorrectly. (D1 in current spec.)

### 2026-04-23 — App baseline: subscription recognition + voucher detail keyboard
**Change:**
- `priceGbp` Zod schema switched to `z.coerce.number()` so Prisma Decimal strings parse correctly.
- Tab bar hidden on `voucher/[id]` and `merchant/[id]` so the sticky Redeem CTA is reachable.
- `BottomSheet` now keyboard-aware (raised z-index, listens to `keyboardWillShow`/`keyboardDidShow`).
- `PinEntrySheet` auto-submits on the 4th digit with a `submittedRef` dedup guard.
**Reason:** Subscription state was failing safeParse silently (free/premium misclassified); sticky CTA hidden behind tab bar; keyboard occluding sheet content. Documented in detail in CLAUDE.md "Customer app post-completion fixes (2026-04-23)".

### 2026-04-23 — App baseline: auth screen rebuild to v7 brainstorm
**Change:** `LoginScreen` and `RegisterScreen` rebuilt to align with the v7 brainstorm: cream background, small Redeemo logo, Apple/Google stubs, password strength bar (register), forgot-password link.
**Reason:** Shipped build had drifted visually + structurally from the approved spec. This is logged here because the password-strength bar and the explicit unverified-flow handling change behaviour beyond styling.

### 2026-04-22 — QR Code Rendering (Phase 3C.1i)
**Change:** Customer self-lookup endpoint `GET /api/v1/redemption/me/:code` + screenshot-flag endpoint added; `useRedemptionPolling` (5s, 15min cap), `useBrightnessBoost`, `useScreenshotGuard`, `useAutoHideTimer` hooks introduced; `ShowToStaff` and `RedemptionDetailsCard` rewritten around live polling.
**Reason:** Original spec had a placeholder QR; live validated state needed for in-store flow.

### 2026-04-19 — Favourites Screen (Phase 3C.1g)
**Change:** Favourites backend enriched (pagination, isOpen, avgRating, voucherCount, isRedeemedInCurrentCycle); favourites screen with optimistic remove + undo; tab persistence between merchants and vouchers.
**Reason:** Spec called for richer favourites context than v1 backend exposed.

### 2026-04-18 — Savings Tab (Phase 3C.1f)
**Change:** Backend exposes `validatedAt` + new monthly-detail endpoint; savings screen with hero count-up, 6-month trend chart, ROI callout, redemption history with infinite scroll. 5 user states: loading/error/free/subscriber-empty/populated.
**Reason:** Initial spec lacked the data shape needed for the populated dashboard.

### Earlier — Phase 3C.1a–3C.1e foundations (referenced, not duplicated)
**Change:** Auth scaffolding, profile completion wizard, subscribe wall stub, home/discovery/map, voucher detail + redemption, merchant profile, subscription status integration. See [`CLAUDE.md`](../CLAUDE.md) "Build Progress" for the per-phase summary.
**Reason:** These phases predate the locking exercise and are documented in their own per-phase plans under [`docs/superpowers/plans/`](superpowers/plans/).

---

## Adding a new entry

When you change behaviour:
1. Add a dated entry above (newest first).
2. Update [`docs/customer-flow-current.md`](customer-flow-current.md) — bump version and edit the relevant section.
3. If the change closes or opens a deviation in §11 of the current spec, update the table there too.
4. Reference file paths, not commit SHAs (commits are findable via `git log -- <path>`).
