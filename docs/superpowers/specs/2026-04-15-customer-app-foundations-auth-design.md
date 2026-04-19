# Phase 3C.1a — Customer App Foundations + Email/Phone Auth (Design Spec)

**Status:** Approved
**Date:** 2026-04-15
**Scope slice:** 3C.1a of Phase 3C (Customer React Native / Expo app)
**Parent UX spec:** `docs/superpowers/specs/2026-04-10-customer-ux-foundations-design.md`

---

## 1. Overview

This document specifies the first shippable increment of the Redeemo customer mobile app: the Expo application scaffold, brand-faithful design system, motion primitives, and a complete email + phone verified registration path. A user completing 3C.1a can register, verify email, verify phone (mandatory), step through a lightweight profile-completion flow (skippable), see a strong subscription prompt (skippable), and land in an authenticated Home shell. Social auth, discovery, subscription purchase, and redemption are explicitly deferred to later increments.

This spec is the authoritative reference for 3C.1a. Where it differs from the parent UX foundations spec, this document takes precedence for 3C.1a-scoped work only.

---

## 2. Goals & Non-Goals

### 2.1 Goals

- Ship a production-grade Expo app scaffold at `apps/customer-app/` that the rest of Phase 3C builds on.
- Establish a brand-faithful design system (tokens, typography, motion primitives, component primitives) that later increments consume.
- Deliver a complete email + phone verified auth path with session persistence across cold starts.
- Deliver a lightweight, skippable profile-completion flow.
- Deliver a subscription prompt screen (placeholder CTA; real flow lands in 3C.3).
- Land every interactive surface with accessibility, reduce-motion, and haptic patterns codified as system primitives — never one-off.

### 2.2 Non-Goals for 3C.1a

- Social auth (Apple, Google) and social-completion flow — scheduled for **3C.1b** and depends on backend SSO endpoints being built (currently return 501).
- Real subscription purchase, plan selection, Stripe PaymentSheet — **3C.3**.
- Discovery surfaces (home feed, search, categories, merchant profile, voucher detail), map view — **3C.2**.
- Redemption (branch selector, PIN entry, active redemption) — **3C.3**.
- Activity, savings summary, favourites, account settings — **3C.4**.
- Push notifications, analytics, crash reporting — **Phase 6**.
- S3/R2 presigned avatar uploads — later backend increment; avatar uploads in 3C.1a use base64 data URIs.
- Dark mode, i18n/multi-locale.
- Server-enforced phone-verified gate — client-enforced in 3C.1a; server-side enforcement is a later backend increment.
- Email-OTP passwordless login.

---

## 3. Aesthetic Direction

**Direction A — Continuity** (locked).

The mobile app mirrors the website brand. Same fonts (Mustica Pro SemiBold for display, Lato for body/labels), same palette (navy `#010C35`, brand rose `#E20C04`, brand coral `#E84A00`, rose→coral gradient for primary CTAs), same warm-grey text hierarchy, same cream `#FEF6F5` tint surface. Native polish is layered on via motion, haptics, and gesture-driven micro-interactions — never via a different brand expression.

**Magic and motion** are built as reusable design-system primitives, not one-off animations. Motion supports clarity, feedback, and perceived quality — never decoration. Reduce Motion is respected globally.

---

## 4. Tech Stack (locked)

| Concern | Choice | Notes |
|---|---|---|
| Runtime | **Expo SDK 54.x** (current stable) | Pin latest 54.x at scaffold; New Architecture on by default |
| Language | **TypeScript strict** | Path alias `@/` → `./src` |
| Navigation | **expo-router v4** (file-based) | `(auth)` and `(app)` route groups with `<Redirect />` guards |
| Data fetching | **@tanstack/react-query** | With focus refetch; see §12 |
| Local state | **Zustand** | Auth store persisted via SecureStore (tokens) + AsyncStorage (prefs) |
| Forms | **react-hook-form + zod** | Shared zod schemas where aligned with backend contracts |
| Secure storage | **expo-secure-store** | Access + refresh tokens |
| Non-sensitive storage | **AsyncStorage** | UI prefs, completion flags |
| HTTP | **Fetch wrapper** with refresh-token interceptor | Mirrors website `lib/api.ts` shape |
| Motion | **react-native-reanimated v4** + **react-native-gesture-handler** | Moti only if its latest release declares Reanimated 4 support at scaffold; otherwise Reanimated directly |
| Haptics | **expo-haptics** | Named patterns in `design-system/haptics.ts` |
| Icons | **lucide-react-native** | Per-icon imports only; no barrel |
| Payments (later) | **@stripe/stripe-react-native** | Not used in 3C.1a |
| Testing | **Jest + @testing-library/react-native**, **Maestro** for e2e | See §14 |
| Lint/format | **ESLint + Prettier** | Rules per §8.8 |

Moti compatibility check is a scaffold-time decision — the plan will include a concrete gate: if Moti's `peerDependencies` on `react-native-reanimated` do not include a `^4.x` range, Moti is dropped and primitives are written directly against Reanimated 4. No motion feature in 3C.1a depends on Moti.

---

## 5. Scope

### 5.1 In scope

- Expo SDK 54 app at `apps/customer-app/`, TypeScript strict, expo-router v4, React Query, Zustand, Reanimated v4, react-hook-form + zod.
- Brand design system: tokens (color, spacing, radius, elevation, motion, layer, opacity, layout), typography, haptics.
- Motion primitives: `PressableScale`, `HapticButton`, `TransitionScreen`, `StaggerList`, `FadeIn`, `FadeInDown`, `SkeletonToContent`, `BottomSheet`, `Toast`, `Countdown`.
- Component primitives: `Button`, `TextField`, `OtpField`, `ScreenContainer`, `AppBar`, `Card`, `Divider`, `EmptyState`, `ErrorState`, `LoadingState`, `GradientBrand`, `Chip`, `StepIndicator`, `Text`, `Image`.
- Auth flows: Welcome → Register (first name, last name, email, password, phone) → Email verification pending → Mandatory Phone OTP → Profile Completion (4-step skippable) → Subscription prompt (skippable) → Home placeholder.
- Password login (password-only — no email-OTP login in 3C.1a).
- Forgot/reset password; reset is deep-linkable, works from cold start, handles expired tokens.
- Session layer: secure token storage, refresh-token interceptor, Zustand auth store, route-group guards, logout.
- Client-enforced phone-unverified gate: sessions with `user.phoneVerifiedAt == null` are force-routed to `/verify-phone` on every app open.
- Tab bar shell on `/(app)/` with Home functional; Map, Savings, Favourites, Account visible but disabled.
- Accessibility baseline: Dynamic Type, VoiceOver/TalkBack labels, reduce-motion, 4.5:1 contrast, focus-ring for hardware-keyboard focus only.

### 5.2 Out of scope — deferred destinations

| Item | Lands in |
|---|---|
| Social auth (Apple + Google) + completion flow | 3C.1b (blocked on backend SSO) |
| Real subscription purchase / manage | 3C.3 |
| Discovery, map, merchant/voucher detail | 3C.2 |
| Redemption | 3C.3 |
| Activity, savings, favourites, account settings | 3C.4 |
| Push notifications, analytics, crash reporting | Phase 6 |
| S3/R2 presigned avatar uploads | Future backend increment |
| Dark mode, i18n | Future |
| Server-enforced phone-verified gate | Future backend increment |
| Email-OTP passwordless login | If/when needed |
| Storybook, a11y CI gates beyond RNTL | Future |

---

## 6. User Flow

### 6.1 Happy-path flow (ordering is intentional, not accidental)

```
Welcome  →  Register (firstName, lastName, email, password, phone)
         →  Email verification pending  (polls /me on focus; resend available)
         →  Phone OTP verification  (MANDATORY; cannot be skipped)
         →  Profile Completion  (4 steps, each skippable, incremental save)
              PC1 About you (DOB, gender)
              PC2 Where you are (address + postcode; optional "Use my current location")
              PC3 What you like (interests multi-select)
              PC4 Make it yours (avatar + newsletter consent)
         →  Subscription prompt  (skippable; one-time in 3C.1a)
         →  Home placeholder
```

**Rationale for this ordering (locked):**

- **Phone verify before profile completion** — identity confirmation always precedes optional data collection. A user with an unverified phone number should never be asked for their date of birth or address.
- **Profile completion before subscription prompt** — personalisation data improves the subscription CTA context (e.g. "12 vouchers near you") in the future, even though 3C.1a's prompt is static. Placing completion first also means users who skip both land at Home already partially personalised.
- **Subscription prompt last before Home** — the conversion moment is the final step of onboarding, when the user is most committed. Placing it earlier risks blocking them behind an intent they haven't formed yet.
- **Nothing in this sequence is skippable except profile completion and subscription prompt.** Email verify and phone verify are hard gates.

### 6.2 Return flows

- **Returning logged-in user** → Home (unless phone-unverified → forced to `/verify-phone`).
- **Returning user who skipped profile completion mid-flow** → Home; completion can be resumed from Account in 3C.4.
- **Session expired** → Login; after re-auth, user returns to the screen/action they were attempting.
- **Reset-password deep-link** → Reset-password screen (standalone, bypasses auth gate); on success → Login.

---

## 7. Screens in Scope

### 7.1 Screen list (15 screens)

| ID | Screen | Route | Notes |
|---|---|---|---|
| A1 | Welcome / Onboarding | `/(auth)/welcome` | Brand hero, CTAs to Login / Register |
| A2 | Register | `/(auth)/register` | firstName, lastName, email, password, phone — all required |
| A2b | Email verification pending | `/(auth)/verify-email` | "Check your inbox" + resend; polls `/me` on focus |
| A4 | Phone OTP verification | `/(auth)/verify-phone` | Mandatory; also the gate for phone-unverified sessions |
| PC1 | Profile: About you | `/(auth)/profile-completion/about` | Date of birth, gender; skippable |
| PC2 | Profile: Where you are | `/(auth)/profile-completion/address` | Address + postcode; optional "Use my current location"; skippable |
| PC3 | Profile: What you like | `/(auth)/profile-completion/interests` | Multi-select chips; skippable |
| PC4 | Profile: Make it yours | `/(auth)/profile-completion/avatar` | Avatar picker + newsletter consent; skippable |
| A7 | Subscription prompt | `/(auth)/subscribe-prompt` | "Start membership" → A8; "Skip for now" → Home |
| A8 | Subscribe coming-soon | `/(auth)/subscribe-soon` | Production-safe copy; not dev-facing |
| A3 | Login | `/(auth)/login` | email + password only |
| A5 | Forgot password | `/(auth)/forgot-password` | Modal presentation |
| A6 | Reset password | `/(auth)/reset-password?token=…` | Standalone, deep-linkable, works from cold start |
| H0 | Home placeholder | `/(app)/` | "Welcome, [firstName]" + sign-out; tab bar visible, non-Home tabs disabled |

### 7.2 Screen-level notes

**A2 Register:** form fields: firstName, lastName (Lato input styling), email (iOS autofill via `textContentType="emailAddress"`), password (with show/hide toggle, strength indicator, `textContentType="newPassword"`), phone (with country code selector defaulting to GB). Submit → `POST /api/v1/customer/auth/register`. On 200 → redirect to A2b. On duplicate email → inline error on email field.

**A2b Email verification pending:** primary content is an illustration + "We sent a link to [email]". Resend button with 60s cooldown countdown. While on screen, polls `GET /api/v1/customer/profile` every 4 seconds (and on app focus) to detect `emailVerifiedAt !== null`; on detection → redirect to A4.

**A4 Phone OTP verification:** 6-cell OTP field, autofocus, paste-aware, iOS `textContentType="oneTimeCode"` for autofill. On incorrect OTP → cell error + warning haptic + shake (respects reduce-motion). On `OTP_MAX_ATTEMPTS` → field disabled, `<Countdown>` to next-attempt window, clear copy. On `OTP_EXPIRED` → resend available immediately.

**PC1–PC4:** each step has Continue (saves via `PATCH /api/v1/customer/profile` for PC1/PC2/PC4, `PUT /api/v1/customer/profile/interests` for PC3) and Skip (no save; advances). `<StepIndicator total={4} current={...} />` in the AppBar. Incremental save: closing the app mid-flow keeps what's saved; re-entry from Account resumes at the furthest-step. See §11 for state model.

**A7 Subscription prompt:** hero-style layout. "Unlock unlimited vouchers — save hundreds a year." CTAs: **"Start membership"** (routes to A8) and **"Skip for now"** (routes to H0). Full-screen modal slide-up presentation — "Skip" reads as dismiss, not back.

**A8 Subscribe coming-soon:** user-facing copy: *"Memberships are opening soon. Unlock unlimited vouchers from local merchants near you. We'll let you know the moment it's live."* CTAs: **"Notify me about membership and product updates"** (explicit opt-in wording — see §11) and **"Back to home"**.

**H0 Home placeholder:** "Welcome, [firstName]" + "Sign out" button. Tab bar rendered with Home functional, Map/Savings/Favourites/Account disabled (`accessibilityState={{ disabled: true }}`, `accessibilityLabel: "[label], coming soon"`). 3C.2 replaces the Home content.

---

## 8. Design System

### 8.1 File structure

```
apps/customer-app/src/design-system/
  tokens.ts           # color, spacing, radius, elevation, motion, layer, opacity, layout, typography
  Text.tsx            # <Text variant="body.md" color="text.primary">
  Image.tsx           # expo-image wrapper with reserved dimensions
  haptics.ts
  useMotionScale.ts
  useDynamicTypeScale.ts
  motion/
    PressableScale.tsx
    HapticButton.tsx
    TransitionScreen.tsx
    StaggerList.tsx
    FadeIn.tsx
    SkeletonToContent.tsx
    BottomSheet.tsx
    Toast.tsx
    Countdown.tsx
    README.md         # motion principle: no decorative loops
  components/
    Button.tsx        TextField.tsx       OtpField.tsx
    ScreenContainer.tsx  AppBar.tsx       Card.tsx
    Divider.tsx       EmptyState.tsx      ErrorState.tsx
    LoadingState.tsx  GradientBrand.tsx   Chip.tsx
    StepIndicator.tsx
  index.ts
```

Screens import **only** from `design-system/index.ts`.

### 8.2 Color tokens

Aligned to the website (warm greys, not cool slate).

```ts
color = {
  brandRose: '#E20C04',
  brandCoral: '#E84A00',
  brandGradient: ['#E20C04', '#E84A00'] as const,
  onBrand: '#FFFFFF',
  navy: '#010C35',
  text: {
    primary:   '#010C35',  // navy — body headings, primary reading text
    secondary: '#4B5563',  // warm gray-600 — 7.6:1 on white; secondary body copy
    tertiary:  '#9CA3AF',  // warm gray-400 — 2.9:1; metadata / decorative only (see §8.3)
    inverse:   '#FFFFFF',
    danger:    '#B91C1C',
  },
  surface: {
    page:    '#FFFFFF',
    tint:    '#FEF6F5',    // cream/rose mist
    neutral: '#F8F9FA',
    subtle:  '#F3F4F6',    // warm gray-100
    raised:  '#FFFFFF',
  },
  border: {
    subtle:  '#E5E7EB',
    default: '#D1D5DB',
    strong:  '#9CA3AF',
  },
  success: '#0F7A3E',
  warning: '#B45309',
  danger:  '#B91C1C',
  info:    '#0E7490',
  focus:   '#010C35',      // hardware-keyboard focus only (see §8.4)
}
```

### 8.3 Tertiary text rule (locked)

`text.tertiary` (`#9CA3AF`, contrast 2.9:1) is **metadata and decorative use only**. It must **never** be used for:

- Paragraph body copy
- Instructional text (onboarding hints, field helpers, empty-state descriptions)
- Important interactive text (button labels, menu item labels, links)
- Any text the user needs to read to make a decision

Permitted uses: metadata lines (e.g. "0.4 mi · Wellness"), timestamps, separator dots, disabled state labels, decorative eyebrows where context is already established, placeholder-style meta footers. Enforced via design-system component defaults — `<Text variant="body.*">` defaults to `color="text.primary"` and cannot accept `tertiary` without a `meta` prop being explicitly set.

### 8.4 Focus ring

The 2px navy focus outline (2px offset) appears **only for hardware-keyboard / assistive focus contexts** — external keyboard on iPad, Android hardware keyboard, switch-control, VoiceOver/TalkBack focus. It is **not** applied as a general touch-interaction treatment. Regular touches use `PressableScale` (scale + haptic). The ring is gated on `accessibilityState.focused === true` set by the system, never manually triggered.

### 8.5 Typography (see §8.11 for token table)

Usage rules (enforced in code review):

- `body.md` (16/24, Lato Regular) — **default for all paragraph and body copy.** Never use anything smaller for primary reading content.
- `body.sm` (14/21) — **secondary/supporting copy only**: metadata lines, helper text, timestamps, card footers. Never for primary content.
- `body.lg` (18/28) — hero/lead paragraphs (Welcome, Subscribe prompt).
- `label.md` (12/16), `label.lg` (14/18) — form labels, eyebrows, button labels.
- `heading.sm/md/lg` (Lato SemiBold) — in-content headings.
- `display.sm/md/lg/xl` (Mustica Pro SemiBold) — screen titles, hero headings.
- `mono.redemption` — redemption codes in 3C.3.

Fonts loaded via `expo-font` in root `_layout.tsx`, self-hosted from the branding package — no Google Fonts, no network dependency.

### 8.6 Motion primitives (see §8.11 for token table)

Each primitive respects reduce-motion via `useMotionScale()`. At scale 0, durations collapse to 0 and position-based animations degrade to opacity changes.

| Primitive | Purpose |
|---|---|
| `PressableScale` | Tactile feedback on primary tappable surfaces (see §8.7 for usage rule) |
| `HapticButton` | Primary CTA wrapper; emits success haptic on success, error haptic on catch |
| `TransitionScreen` | Screen-level fade-translate (240ms enter, 170ms exit) |
| `StaggerList` | 40ms staggered entrance (opacity + 8px translateY) |
| `FadeIn` / `FadeInDown` | Simple reveal on mount |
| `SkeletonToContent` | 180ms crossfade from skeleton to real content |
| `BottomSheet` | Spring-gentle sheet with swipe-to-dismiss and scrim |
| `Toast` | Non-blocking feedback with auto-dismiss |
| `Countdown` | OTP resend / rate-limit timer (no motion on reduce-motion) |

**Motion principle (locked, enforced by lint):**

> No decorative looping animation. Repeated motion exists only when it communicates one of: **loading** (skeleton shimmer, spinner), **countdown** (OTP resend timer, rate-limit cooldown), or **system feedback** (toast auto-dismiss progress if shown). Any motion primitive using `withRepeat` must import from `src/design-system/motion/`. Screen files cannot call `withRepeat` directly.

### 8.7 `PressableScale` usage rule (locked)

**Use on:** primary Buttons, Cards that act as navigation targets, voucher/merchant tiles (future), chips in a selected-deselected context, hero CTAs.

**Do not use on:** small toolbar icon buttons (haptic only), list-item disclosure chevrons, inline text links, text-only toggles in dense forms, tab bar items (native tab bar handles feedback), Switch/Checkbox/Radio (system controls), keyboard keys, back chevrons (too small — scale reads as jitter).

Default when in doubt: haptic only, no scale.

### 8.8 Lint rules (practical, not draconian)

Screens may use `StyleSheet.create({...})` freely. **Values must be token-driven.**

Forbidden in any file under `app/` or `src/screens/` or `src/features/*/screens/`:

- Raw hex/rgb colors (`/^#[0-9a-f]{3,8}$/i`, `/rgba?\(/`) — must come from `tokens.color.*`
- Raw numeric font sizes (e.g. `fontSize: 14`) — must use `<Text variant="...">`
- Raw numeric padding/margin values — must reference `tokens.spacing.*`
- Barrel imports from `lucide-react-native`
- Direct `withRepeat` import from `react-native-reanimated`

Allowed: `StyleSheet.create({ container: { padding: spacing[4], backgroundColor: color.surface.page } })`.

### 8.9 Button variants and sizing (TypeScript-enforced)

```ts
type ButtonProps =
  | { variant: 'primary' | 'danger';              size?: 'md' | 'lg' }  // no 'sm'
  | { variant: 'secondary' | 'ghost';             size?: 'sm' | 'md' | 'lg' }
```

- `lg` (56 min height): hero/primary CTAs — Welcome, Register, Subscribe prompt.
- `md` (48 min height): **default for all primary CTAs.**
- `sm` (36 min height): **secondary/ghost only** — inline "Resend", "Edit", compact sheet actions.
- Primary variant uses the rose→coral gradient via `expo-linear-gradient`. Secondary is navy outline. Ghost is text-only.
- Loading spinner replaces label; button width locked so it does not reflow.

### 8.10 Haptic patterns (locked)

```
touch.light       PressableScale default                  ImpactFeedbackStyle.Light
touch.medium      Primary CTA press                       ImpactFeedbackStyle.Medium
success           Registration done, phone verified, etc. NotificationFeedbackType.Success
warning           Form validation error                   NotificationFeedbackType.Warning
error             Failed request surfaced to user         NotificationFeedbackType.Error
selection         Radio/chip toggle                       selectionAsync()
```

Globally disable-able via Account Settings (lands in 3C.4). State stored in Zustand, not persisted until 3C.4 wires Settings UI.

### 8.11 Token tables

**Spacing (4pt base):** `0=0, 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 7=32, 8=40, 9=48, 10=64`.

**Radius:** `xs=4, sm=8, md=12, lg=16, xl=22, pill=9999`.

**Elevation (iOS shadow / Android elevation):** `none, sm, md, lg, glow`.

**Motion duration:** `instant=0, xfast=120, fast=180, base=240, slow=320, xslow=400`.

**Motion easing:** `standard=[0.4,0,0.2,1], enter=[0,0,0.2,1] (ease-out), exit=[0.4,0,1,1] (ease-in)`.

**Springs:** `gentle (damping 20, stiffness 180)`, `snappy (damping 18, stiffness 260)`, `rubber (damping 14, stiffness 140)`.

**Stagger:** `40ms`.

**Layout:** `screenPaddingH=20, tabBarHeight=64, appBarHeight=56, minTouchTarget=44`.

**Layer / z-index:** `base=0, raised=1, sticky=10, appBar=20, tabBar=20, sheet=40, overlay=50, toast=60, alert=70`.

**Opacity:** `disabled=0.4, pressed=0.85, overlay=0.55, subtle=0.72, full=1`.

**Typography:**

| Variant | Font | Size / line-height | Usage |
|---|---|---|---|
| `display.xl` | Mustica Pro SemiBold | 40 / 44 | Page hero titles |
| `display.lg` | Mustica Pro SemiBold | 32 / 36 | Screen titles |
| `display.md` | Mustica Pro SemiBold | 26 / 30 | Section heroes |
| `display.sm` | Mustica Pro SemiBold | 22 / 26 | Card heroes |
| `heading.lg` | Lato SemiBold | 20 / 26 | In-content H1 |
| `heading.md` | Lato SemiBold | 18 / 24 | In-content H2 |
| `heading.sm` | Lato SemiBold | 16 / 22 | In-content H3 |
| `body.lg` | Lato Regular | 18 / 28 | Lead paragraphs |
| `body.md` | Lato Regular | 16 / 24 | **Default body copy** |
| `body.sm` | Lato Regular | 14 / 21 | Secondary copy only |
| `label.lg` | Lato Medium | 14 / 18 (+0.2 tracking) | Button labels, strong labels |
| `label.md` | Lato Medium | 12 / 16 (+0.4 tracking) | Form labels, meta |
| `label.eyebrow` | Lato SemiBold | 11 / 14 (+1.8 tracking, uppercase) | Section eyebrows |
| `mono.redemption` | Lato Bold (fallback) | 28 / 34 (+4 tracking) | 3C.3 redemption codes |

---

## 9. Navigation

### 9.1 Structure

```
apps/customer-app/app/
  _layout.tsx           # ThemeProvider, QueryClient, auth bootstrap, deep-link listener, reduce-motion listener
  +not-found.tsx
  (auth)/
    _layout.tsx         # stack; <Redirect /> to /(app) if fully verified + prompt seen
    welcome.tsx
    register.tsx
    verify-email.tsx
    verify-phone.tsx
    profile-completion/
      _layout.tsx       # shared stack + StepIndicator header
      about.tsx         # PC1
      address.tsx       # PC2
      interests.tsx     # PC3
      avatar.tsx        # PC4
    subscribe-prompt.tsx
    subscribe-soon.tsx
    login.tsx
    forgot-password.tsx
    reset-password.tsx
  (app)/
    _layout.tsx         # tabs: Home (functional), Map/Savings/Favourites/Account (disabled)
    index.tsx           # Home placeholder
```

### 9.2 Guards

Route-group guards live in each group's `_layout.tsx` via `<Redirect />` reading the Zustand auth store. No effect-based imperative routing.

- `(auth)/_layout.tsx`: if `status === 'authenticated'` and subscribe-prompt-seen and profile-completion status is `complete` or `dismissed` → `<Redirect href="/(app)/" />`.
- `(app)/_layout.tsx`: if `status !== 'authenticated'` → `<Redirect href="/(auth)/welcome" />`.
- Root `_layout.tsx`: if `status === 'email-unverified'` → force `/(auth)/verify-email`; if `status === 'phone-unverified'` → force `/(auth)/verify-phone`.
- `/(auth)/reset-password` is **exempt from all auth gates** — it is deep-link-accessible from cold start without a session.

### 9.3 Presentation styles

- Stack transitions: native defaults (iOS slide, Android push).
- `forgot-password`: **modal** presentation.
- `reset-password`: **standalone full-screen** route; not a modal; no tab bar; no auth gate.
- `subscribe-prompt` and `subscribe-soon`: **full-screen modal slide-up** — "Skip" reads as dismiss.
- `profile-completion/*`: stack within the (auth) stack with a persistent StepIndicator in the AppBar.

### 9.4 Deep-link handling

Root `_layout.tsx` mounts a deep-link listener that handles:

- `redeemo://reset-password?token=…` → navigates to `/(auth)/reset-password?token=…`, bypassing all auth gates.
- `https://redeemo.com/reset-password?token=…` (universal link) → same target.

Cold-start handling: `Linking.getInitialURL()` checked during bootstrap; if matching the reset-password pattern, auth bootstrap defers redirect and routes directly to reset-password.

---

## 10. Auth State Model

### 10.1 Auth status enum

```ts
type AuthStatus =
  | 'unauthenticated'       // no session
  | 'email-unverified'      // session exists, emailVerifiedAt = null
  | 'phone-unverified'      // emailVerifiedAt != null, phoneVerifiedAt = null
  | 'authenticated'         // both verified
```

### 10.2 Auth state matrix

| State | Backend condition | Route behaviour |
|---|---|---|
| `unauthenticated` | no session token | Redirect to `/(auth)/welcome`; all (auth) routes accessible |
| `email-unverified` | session + `user.emailVerifiedAt == null` | Force `/(auth)/verify-email`; all other (auth) routes blocked except logout |
| `phone-unverified` | session + `emailVerifiedAt != null` + `phoneVerifiedAt == null` | Force `/(auth)/verify-phone` on every cold start / foreground |
| `authenticated`, profile-completion `pending` or `in-progress` (first session after phone-verify) | both verified + `hasSeenSubscribePrompt == false` | Route through profile-completion then subscribe-prompt, then `/(app)/` |
| `authenticated`, completion `complete` or `dismissed`, subscribe-prompt seen | both verified + both flags set | Direct to `/(app)/` |
| Reset-password deep-link (any state) | token in URL | Forced to `/(auth)/reset-password?token=…`; bypasses all gates |
| Invalid/expired reset token | `POST /auth/reset-password` returns `TOKEN_EXPIRED` or 400 | `<ErrorState title="This link has expired" description="..." actionLabel="Request a new reset link" onRetry={() => router.push('/(auth)/forgot-password')} />` |

### 10.3 Client-enforced phone-verified gate (3C.1a rule)

If `user.phoneVerifiedAt == null` on any session, the app force-routes to `/(auth)/verify-phone` on:
- cold start (after auth bootstrap)
- AppState transitions to `active` from `background`
- any deep-link target that is not `reset-password`

Rationale: phone verification is a product requirement, not a technical one. The threat model (clearing storage to bypass) is low because the user would lose their session in the process and re-register. Server-enforced gating is tracked as a future backend increment.

---

## 11. Onboarding Progression State

### 11.1 Single consolidated shape (replaces overlapping booleans)

```ts
type ProfileCompletionStatus = 'pending' | 'in-progress' | 'complete' | 'dismissed'

type OnboardingState = {
  profileCompletion: {
    status: ProfileCompletionStatus
    furthestStep: 0 | 1 | 2 | 3 | 4       // resume position
  }
  hasSeenSubscribePrompt: boolean
}
```

Stored in AsyncStorage under `onboarding-state` (namespaced per `userId`, wiped on logout).

### 11.2 Status transitions

- Initial (after phone-verify, first ever): `status: 'pending'`, `furthestStep: 0`.
- On entering PC1: `status: 'in-progress'`, `furthestStep: 1`.
- On advancing to PC2/PC3/PC4: `furthestStep` bumps to `max(current, stepEntered)`.
- On submitting PC4 Continue: `status: 'complete'`, `furthestStep: 4`.
- On tapping "Skip all" or "Skip" on PC4 specifically: `status: 'dismissed'`.
- On resume from Account in 3C.4: status transitions back to `'in-progress'` and resumes at `furthestStep`.

### 11.3 Routing derived from status

- `status === 'pending'` after phone-verify → show PC1.
- `status === 'in-progress'` on app return → resume at `furthestStep` (clamped to 1..4).
- `status === 'complete' || status === 'dismissed'` → skip profile-completion entirely; proceed to subscribe-prompt if `hasSeenSubscribePrompt === false`.

**No separate `hasSeenProfileCompletion` boolean.** "Has the user seen the flow?" is derivable as `status !== 'pending'`. "Is the flow finished?" is `status === 'complete' || status === 'dismissed'`.

### 11.4 Subscribe-prompt persistence (edge case confirmed)

`hasSeenSubscribePrompt` is set to `true` **only after** A7 renders and either CTA is tapped (or the modal is dismissed via swipe). If the app is killed after phone-verify but before A7 renders, the flag remains `false`. On next launch, after auth bootstrap, the router evaluates `hasSeenSubscribePrompt` and, if false (and profile completion is `complete` or `dismissed`), routes the user to A7. This guarantees the prompt is shown exactly once, regardless of cold-start timing.

### 11.5 "Notify me" copy (explicit opt-in)

On A8, the CTA reads: **"Notify me about membership and product updates"**. Beneath the button, a one-line disclosure: *"We'll email you when memberships launch and when we ship things you might care about. You can unsubscribe at any time."*

Tapping the button:
1. Sets `newsletterConsent: true` via `PATCH /api/v1/customer/profile`.
2. Shows a success toast: "Thanks — we'll keep you posted."
3. Routes to Home.

No automatic opt-in anywhere else in 3C.1a. `newsletterConsent` is never set implicitly.

---

## 12. Data Layer

### 12.1 Server state — React Query

- `useMe()` — `GET /api/v1/customer/profile`. Cached 5 minutes. **Refetched on app focus and immediately after every auth/profile mutation** (invalidation hooks in mutations).
- `useInterestsCatalogue()` — `GET /api/v1/customer/profile/available-interests`. Cached 1 hour.

**Invalidation contract (locked):** any mutation that can change verification or profile state **must** invalidate `['me']` synchronously. Affected mutations:

- `register`, `verifyEmail` (triggered by polling detection), `verifyPhone`, `login`, `refresh`, `signOut`
- `updateProfile`, `updateInterests`, `updateAvatar`, `setNewsletterConsent`
- `resetPassword`

This ensures verification state is never stale after critical transitions.

### 12.2 Client state — Zustand auth store

```ts
// src/stores/auth.ts
type AuthState = {
  status: AuthStatus
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  onboarding: OnboardingState
  hapticsEnabled: boolean
  motionScale: 0 | 1

  signIn(creds): Promise<void>
  register(data): Promise<void>
  refresh(): Promise<void>
  signOut(): Promise<void>
  verifyPhone(code): Promise<void>
  updateOnboarding(patch): void
}
```

Persisted partition:
- **SecureStore:** `accessToken`, `refreshToken`.
- **AsyncStorage:** `user.id`, `status`, `onboarding`, `hapticsEnabled`.

Never persisted: the full `user` object (re-fetched via `useMe()` on hydration).

### 12.3 HTTP client

`src/lib/api.ts` — fetch wrapper mirroring the website's shape:

- `baseUrl` from `EXPO_PUBLIC_API_URL` (injected via `app.config.ts`).
- JSON body/response.
- Auto-attaches `Authorization: Bearer <accessToken>` from Zustand.
- On 401: attempts one `refresh` → retries → on failure drops the session and redirects to `/(auth)/welcome`.
- Typed response contracts via zod schemas colocated with each endpoint helper in `src/lib/api/auth.ts` and `src/lib/api/profile.ts`.

### 12.4 Backend dependencies

All endpoints used in 3C.1a are already implemented:

| Purpose | Endpoint | Status |
|---|---|---|
| Register | `POST /api/v1/customer/auth/register` | ✅ |
| Email verify (link click) | `GET /api/v1/customer/auth/verify-email` | ✅ |
| Resend email verify | `POST /api/v1/customer/auth/resend-verification-email` | ✅ |
| Phone OTP send | `POST /api/v1/customer/auth/verify-phone/send` | ✅ |
| Phone OTP confirm | `POST /api/v1/customer/auth/verify-phone/confirm` | ✅ |
| Login (password) | `POST /api/v1/customer/auth/login` | ✅ |
| Refresh | `POST /api/v1/customer/auth/refresh` | ✅ |
| Logout | `POST /api/v1/customer/auth/logout` | ✅ |
| Forgot password | `POST /api/v1/customer/auth/forgot-password` | ✅ |
| Reset password | `POST /api/v1/customer/auth/reset-password` | ✅ |
| Profile read | `GET /api/v1/customer/profile` | ✅ |
| Profile update | `PATCH /api/v1/customer/profile` | ✅ |
| Interests catalogue | `GET /api/v1/customer/profile/available-interests` | ✅ |
| User's interests | `GET /api/v1/customer/profile/interests` | ✅ |
| Update interests | *(route check during plan)* | Verify |
| Change password (authenticated) | *(route check during plan)* | Not in 3C.1a scope |

### 12.5 Backend gap — avatar removal

**Current state of `PATCH /api/v1/customer/profile`** (`src/api/customer/profile/routes.ts:20`):

```ts
profileImageUrl: z.union([z.string().url(), z.string().startsWith('data:image/')]).optional()
```

This rejects `null`. The service at `service.ts:95` only writes when the field is defined. **Sending `{ profileImageUrl: null }` fails zod validation.**

**Implication:** "Remove avatar" in PC4 (§13.3) cannot be implemented as specified without a backend change. Two options — decision deferred to the implementation plan:

- **Option A (recommended):** small backend change — extend the zod union to `.nullable()` and the service to pass `null` through to Prisma (allowed because `profileImageUrl` is `String?`). Tracked as a discrete plan task before PC4 is built.
- **Option B:** drop "Remove" from PC4 in 3C.1a scope; user can only replace with another photo. Add to 3C.4 with the broader profile-editing surface.

**This spec marks it as an Implementation Plan Check, not a confirmed behaviour.**

### 12.6 Location assist helper (PC2)

`src/lib/location.ts` exports `useLocationAssist()`:

```ts
const { request, status, loading } = useLocationAssist()
// status: 'idle' | 'loading' | 'denied' | 'unavailable'
```

Contract:

- `request()` is a no-op if called without an explicit user tap.
- On tap: calls `requestForegroundPermissionsAsync()` → on grant, `getCurrentPositionAsync` with 3s timeout → reverse-geocode.
- **On any failure** (denied, timeout, geocode failure, unavailable): button returns to `idle` state. No error toast. No persistent loading state. No "error" state on the button itself. The manual address fields remain fully interactive and obviously usable throughout. The user is never in an ambiguous loading-or-failed limbo.
- If denied: the session-scoped flag prevents re-prompting within the same session. Manual entry is always the primary path.

Native permission rationale strings (iOS `Info.plist` `NSLocationWhenInUseUsageDescription`, Android runtime prompt explainer):

> *"Redeemo uses your location to show vouchers from merchants near you."*

---

## 13. Profile Completion — Detailed Behaviour

### 13.1 Step 1 (PC1) — About you

- Fields: `dateOfBirth` (native date picker, max = today, min = today - 120 years), `gender` (radio: Female / Male / Non-binary / Prefer not to say).
- Submit: `PATCH /api/v1/customer/profile { dateOfBirth, gender }` → advances to PC2; updates `furthestStep: max(1, prev)`.
- Skip: advances to PC2, no API call; `furthestStep: max(1, prev)`; `status: 'in-progress'`.

### 13.2 Step 2 (PC2) — Where you are

- Fields: `addressLine1`, `addressLine2`, `city`, `postcode` (UK format validation via zod).
- Optional: **"Use my current location"** button per §12.6.
- Submit: `PATCH /api/v1/customer/profile { addressLine1, addressLine2, city, postcode }` → advances to PC3.
- Skip: advances to PC3, no API call.

### 13.3 Step 3 (PC3) — What you like

- Multi-select chips populated from `useInterestsCatalogue()`.
- Submit: `PUT /api/v1/customer/profile/interests { interestIds: string[] }` → advances to PC4.
- Skip: advances to PC4, no API call.

### 13.4 Step 4 (PC4) — Make it yours

**Avatar flow:**

1. Tap avatar slot → `<BottomSheet>` with "Take photo" / "Choose from library" / "Remove" (only visible if an existing avatar is set).
2. `expo-image-picker.launchImageLibraryAsync({ mediaTypes: 'Images', allowsEditing: true, aspect: [1, 1] })` — **square crop enforced**.
3. `expo-image-manipulator.manipulateAsync(uri, [{ resize: { width: 512 } }], { compress: 0.8, format: 'jpeg', base64: true })` — resize to max 512×512, JPEG quality 0.8.
4. **Preview screen** (modal `<BottomSheet>`): user sees the cropped, compressed result with "Use this photo" / "Choose another" / "Cancel".
5. "Use this photo" → `PATCH /api/v1/customer/profile { profileImageUrl: "data:image/jpeg;base64,..." }`.
6. Client-side guard: if compressed base64 payload > 150kb, show inline error "Photo is too large — try a smaller image" and return to preview. (Target cap: ~80kb typical.)

**Newsletter consent:** toggle switch. Setting to true: `PATCH /api/v1/customer/profile { newsletterConsent: true }`.

**Continue / Skip:** submit → `status: 'complete'`, `furthestStep: 4`. Skip → `status: 'dismissed'`. Both routes advance to A7 subscribe-prompt.

### 13.5 Interim state handling

Closing the app mid-flow never loses persisted progress (each step's Continue saves before advancing). On return:

- If `status === 'in-progress'` → resume at `/(auth)/profile-completion/<step matching furthestStep>`.
- Top-right "Skip all" available on every step → sets `status: 'dismissed'` → advances to A7.

---

## 14. Testing

| Layer | Tool | Scope |
|---|---|---|
| Unit | Jest + @testing-library/react-native | Design-system primitives (Button/TextField/OtpField states; motion with and without reduce-motion); Zustand auth store actions; error mapper; api.ts fetch wrapper including refresh-retry logic (mocked) |
| Integration | Jest + MSW | Register happy path, login happy path, forgot/reset password happy path, phone-OTP rate-limit path, profile-completion resume-after-kill |
| E2E | Maestro | `.maestro/auth.yaml` covers register → email-verify (mocked link) → phone-verify (OTP mocked) → skip profile → skip subscribe → Home. Additional flows: login + wrong password, forgot-then-reset, phone-OTP rate-limit, phone-unverified gate (kill app mid-flow). Runs on iOS + Android simulators in CI |
| A11y | RNTL assertions | Every component has a11y tests; every screen asserts `accessibilityRole` + `accessibilityLabel` on all interactive elements |

**Coverage gate:** design-system and auth store ≥ 80% line coverage. Screens are covered by Maestro + feature-hook unit tests; no arbitrary coverage floor on view code.

**Acceptance criteria (merge gate for 3C.1a):**

- [ ] Every interactive element has `accessibilityRole` + `accessibilityLabel`.
- [ ] Every form field has a visible label + `accessibilityLabel`.
- [ ] VoiceOver walkthrough (iOS) and TalkBack walkthrough (Android) of the full happy-path flow pass end-to-end.
- [ ] Reduce Motion enabled → no unexpected motion; durations collapse to 0; no position jumps.
- [ ] Dynamic Type at maximum scale (1.4) → no truncation, no overlapping elements, no horizontal scroll.
- [ ] Hardware-keyboard tab order matches visual order on iPad.
- [ ] Contrast pairs audited and documented in `docs/a11y/3c1a-contrast.md`.
- [ ] Every Toast tested with VoiceOver/TalkBack — announced without stealing focus.
- [ ] Every error state has a clear recovery action.

---

## 15. Loading / Empty / Error State Policy

| Context | Loading | Empty | Error |
|---|---|---|---|
| Register submit | Inline button spinner, form disabled | n/a | Inline field errors; network error → toast "Connection lost, try again" |
| Email verification pending | Subtle `<FadeIn>` on polling indicator; "Checking…" label | n/a — screen IS a waiting state | Resend failed → inline error |
| Phone OTP | Button spinner; OTP field disabled | n/a | Wrong code → cell error + warning haptic + shake (respects reduce-motion); rate-limited → disabled + `<Countdown>` with accessible label |
| Profile completion steps | Button spinner on Continue | n/a | Inline field errors; network → toast, form stays populated |
| Avatar upload (PC4) | `<LoadingState variant="spinner">` ≤ 2s, then skeleton shimmer | n/a | Toast "Couldn't save photo — try again"; avatar reverts to previous |
| Interests (PC3) | Skeleton chips ≤ 500ms, then shimmer | "No interests to choose yet" | Toast + retry in `<ErrorState>` replacing chip area |
| Login submit | Button spinner | n/a | Inline "Wrong email or password"; distinguish "Account not verified" → resend CTA |
| Forgot password | Button spinner | n/a | Inline error; always shows enumeration-safe success message |
| Reset password deep link | Full-screen spinner while validating token | n/a | `<ErrorState title="This link has expired">` with "Request a new reset link" |
| Home placeholder | Skeleton on name until `/me` resolves | n/a | Toast "Couldn't load your profile"; retry button in screen |

**Loading principles (enforced):**

- Loading > 300ms → skeleton or spinner.
- Loading > 1s → replace primary action with inline spinner + label ("Signing in…").
- Form submission buttons lock width so they do not reflow when spinner replaces text.

---

## 16. Error Model

```ts
// src/lib/errors.ts
export type ApiError = {
  code: string           // backend AppError code
  message: string        // user-facing
  field?: string         // for form-field errors
  retryable: boolean
}
```

`src/lib/errors.ts` maps backend codes (`EMAIL_TAKEN`, `OTP_INVALID`, `OTP_MAX_ATTEMPTS`, `OTP_EXPIRED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `RATE_LIMITED`, `NETWORK_ERROR`, `SERVER_ERROR`, etc.) to user-facing copy and the correct surface (inline / toast / full error state). Every error state has a defined recovery action — no dead ends.

---

## 17. File Structure (apps/customer-app/)

```
app.json
app.config.ts
package.json
tsconfig.json
babel.config.js
metro.config.js
eslint.config.js
.env.example
app/                              # expo-router
  _layout.tsx
  +not-found.tsx
  (auth)/
    _layout.tsx
    welcome.tsx
    register.tsx
    verify-email.tsx
    verify-phone.tsx
    login.tsx
    forgot-password.tsx
    reset-password.tsx
    profile-completion/
      _layout.tsx
      about.tsx
      address.tsx
      interests.tsx
      avatar.tsx
    subscribe-prompt.tsx
    subscribe-soon.tsx
  (app)/
    _layout.tsx
    index.tsx
src/
  design-system/                  # (see §8.1)
  lib/
    api.ts
    api/
      auth.ts
      profile.ts
    errors.ts
    location.ts
    deep-link.ts
    storage.ts
  stores/
    auth.ts
  hooks/
    useMe.ts
    useUpdateProfile.ts
    useUpdateInterests.ts
    useUpdateAvatar.ts
    useInterestsCatalogue.ts
    useToast.ts
  features/
    auth/
      components/
      useRegisterFlow.ts
      useLoginFlow.ts
      usePhoneVerify.ts
      usePasswordReset.ts
    profile-completion/
      components/
      useProfileCompletion.ts
      useAvatarPicker.ts
assets/
  fonts/
  images/
.maestro/
  auth.yaml
  login.yaml
tests/
  setup.ts
  design-system/*.test.tsx
  stores/*.test.ts
  lib/*.test.ts
  features/*.test.tsx
```

---

## 18. Risk Register

| Risk | Mitigation |
|---|---|
| Moti incompatible with Reanimated 4 at scaffold | Compatibility gate at scaffold: drop Moti if unsupported, use Reanimated directly. No feature depends on Moti |
| Base64 avatar payloads strain backend | Pre-upload resize to 512px max + JPEG 0.8 → ~80kb typical; reject client-side if > 150kb |
| Backend rejects `profileImageUrl: null` (§12.5) | Plan-level decision: Option A (small backend change) or Option B (defer Remove) |
| Deep-link reset-password token edge cases | Dedicated integration tests: fresh install, background, foreground, malformed URL |
| Reduce-motion missed on a primitive | Lint rule + centralised motion primitives + manual VoiceOver walkthrough merge gate |
| Tab bar disabled-state confusion | Disabled tabs labelled "[name], coming soon" via `accessibilityLabel`; no tap action |
| Phone OTP rate-limit confuses first-time users | Copy: "Too many attempts — try again in X minutes. Still not received? Check your number is correct." |
| Client-enforced phone gate bypass | Low threat; tracked for future server-enforced gate |

---

## 19. Intentional Platform Divergence

**Mobile registration is stricter than website registration by design.**

- Website requires: first name, last name, email, password.
- Mobile requires: first name, last name, email, password, **and a verified phone number** before the user can access Home.

Rationale: mobile is a higher-risk surface for misuse, repeat-account creation, and downstream voucher/subscription abuse. Mandatory phone verification provides stronger identity at the point of account creation. This is a deliberate platform rule and must not be regressed when convenience pressures arise later.

The `User` schema supports both shapes; no data model divergence. Social auth (3C.1b) must route any account that lacks required fields through a completion flow — social is faster sign-in, not a bypass around Redeemo's required customer data.

---

## 20. Handoff

Next step after spec approval: invoke the **superpowers:writing-plans** skill to produce the implementation plan at `docs/superpowers/plans/2026-04-15-customer-app-foundations-auth.md`, then execute via **superpowers:subagent-driven-development** in the `feature/customer-app` worktree at `.worktrees/customer-app/`.

The spec is authoritative. The implementation plan will break this down into bite-sized TDD steps and will confirm or reject the avatar-null backend gap decision (§12.5) before the PC4 task begins.
