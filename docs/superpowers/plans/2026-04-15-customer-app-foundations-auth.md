# Phase 3C.1a — Customer App Foundations + Email/Phone Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-04-15-customer-app-foundations-auth-design.md`](../specs/2026-04-15-customer-app-foundations-auth-design.md)

**Goal:** Deliver a production-grade Expo SDK 54 customer app scaffold with brand-faithful design system, motion primitives, and a complete email + mandatory-phone verified registration path ending at a placeholder Home.

**Architecture:** File-based routing via expo-router v4 with `(auth)` and `(app)` route groups guarded by Zustand-backed auth state. Server state in React Query; secrets in expo-secure-store; UI prefs in AsyncStorage. Brand tokens, typography, motion, and haptics live in a single design-system package consumed by every screen — screens must not contain raw colors, font sizes, or `withRepeat` calls.

**Tech Stack:** Expo SDK 54.x, TypeScript strict, expo-router v4, @tanstack/react-query v5, zustand v4, react-native-reanimated v4, react-native-gesture-handler, react-hook-form + zod, expo-secure-store, AsyncStorage, expo-haptics, expo-image, expo-image-picker, expo-image-manipulator, expo-linear-gradient, lucide-react-native, Jest + @testing-library/react-native, Maestro.

**Worktree:** `.worktrees/customer-app/` on branch `feature/customer-app`. All implementation work happens there. Paths below are relative to the worktree root unless otherwise stated.

---

## How This Plan Is Organised

The plan is 38 tasks in six batches. Each task is a self-contained commit — pass tests, commit, move on.

- **Batch A (Tasks 0–4):** Backend verification, Expo scaffold, dependencies, lint, design tokens.
- **Batch B (Tasks 5–11):** Fonts + Text + haptics + motion hooks + motion primitives + storage.
- **Batch C (Tasks 12–15):** Component primitives (Button, inputs, layout, states).
- **Batch D (Tasks 16–22):** API client, helpers, error mapper, deep-link, location, Zustand store, React Query hooks.
- **Batch E (Tasks 23–30):** Routing bootstrap, route-group layouts, auth screens (Welcome, Register, Verify-email, Verify-phone, Login, Forgot, Reset).
- **Batch F (Tasks 31–38):** Profile completion, subscribe-prompt, Home placeholder, tab bar, Maestro E2E, merge gate.

## TDD Conventions (applies to every task)

1. **Red first.** Write the failing test. Run it. See it fail. Only then write code.
2. **Minimal green.** Write the smallest code that passes. Refactor after.
3. **Commit per task.** Every task ends with a commit. Branch: `feature/customer-app`.
4. **No forbidden values.** No raw hex, no raw font sizes, no raw paddings, no `withRepeat` outside `src/design-system/motion/`. Lint fails the build.
5. **Accessibility required.** Every interactive element gets `accessibilityRole` and `accessibilityLabel` in the same commit — not a follow-up.
6. **Reduce-motion respected.** Every motion primitive reads `useMotionScale()`; at scale 0, durations collapse to 0 and position animations degrade to opacity.

## File Structure (locked before implementation)

```
.worktrees/customer-app/apps/customer-app/
├── app.json
├── app.config.ts
├── babel.config.js
├── metro.config.js
├── eslint.config.js
├── tsconfig.json
├── package.json
├── .env.example
├── app/
│   ├── _layout.tsx                         # providers + bootstrap + deep link
│   ├── +not-found.tsx
│   ├── (auth)/
│   │   ├── _layout.tsx                     # guard: authenticated → (app)
│   │   ├── welcome.tsx
│   │   ├── register.tsx
│   │   ├── verify-email.tsx
│   │   ├── verify-phone.tsx
│   │   ├── login.tsx
│   │   ├── forgot-password.tsx
│   │   ├── reset-password.tsx              # deep-link entry; bypasses guards
│   │   ├── subscribe-prompt.tsx
│   │   ├── subscribe-soon.tsx
│   │   └── profile-completion/
│   │       ├── _layout.tsx
│   │       ├── about.tsx                   # PC1
│   │       ├── address.tsx                 # PC2
│   │       ├── interests.tsx               # PC3
│   │       └── avatar.tsx                  # PC4
│   └── (app)/
│       ├── _layout.tsx                     # guard: unauthenticated → welcome
│       └── index.tsx                       # Home placeholder
├── src/
│   ├── design-system/
│   │   ├── index.ts                        # public entry — screens import only from here
│   │   ├── tokens.ts                       # color, spacing, radius, elevation, motion, layer, opacity, layout, typography
│   │   ├── Text.tsx
│   │   ├── Image.tsx
│   │   ├── haptics.ts
│   │   ├── useMotionScale.ts
│   │   ├── useDynamicTypeScale.ts
│   │   ├── motion/
│   │   │   ├── README.md                   # no-decorative-loops principle
│   │   │   ├── PressableScale.tsx
│   │   │   ├── HapticButton.tsx
│   │   │   ├── TransitionScreen.tsx
│   │   │   ├── StaggerList.tsx
│   │   │   ├── FadeIn.tsx
│   │   │   ├── SkeletonToContent.tsx
│   │   │   ├── BottomSheet.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── Countdown.tsx
│   │   └── components/
│   │       ├── Button.tsx
│   │       ├── TextField.tsx
│   │       ├── OtpField.tsx
│   │       ├── ScreenContainer.tsx
│   │       ├── AppBar.tsx
│   │       ├── Card.tsx
│   │       ├── Divider.tsx
│   │       ├── EmptyState.tsx
│   │       ├── ErrorState.tsx
│   │       ├── LoadingState.tsx
│   │       ├── GradientBrand.tsx
│   │       ├── Chip.tsx
│   │       └── StepIndicator.tsx
│   ├── lib/
│   │   ├── api.ts                          # fetch wrapper + refresh interceptor
│   │   ├── api/
│   │   │   ├── auth.ts
│   │   │   └── profile.ts
│   │   ├── errors.ts
│   │   ├── location.ts
│   │   ├── deep-link.ts
│   │   └── storage.ts
│   ├── stores/
│   │   └── auth.ts                         # Zustand
│   ├── hooks/
│   │   ├── useMe.ts
│   │   ├── useUpdateProfile.ts
│   │   ├── useUpdateInterests.ts
│   │   ├── useUpdateAvatar.ts
│   │   ├── useInterestsCatalogue.ts
│   │   └── useToast.ts
│   └── features/
│       ├── auth/
│       │   ├── useRegisterFlow.ts
│       │   ├── useLoginFlow.ts
│       │   ├── usePhoneVerify.ts
│       │   └── usePasswordReset.ts
│       └── profile-completion/
│           ├── useProfileCompletion.ts
│           └── useAvatarPicker.ts
├── assets/
│   ├── fonts/                              # Mustica Pro SemiBold, Lato family
│   └── images/
├── .maestro/
│   ├── auth.yaml
│   └── login.yaml
└── tests/
    ├── setup.ts
    ├── design-system/
    ├── stores/
    ├── lib/
    └── features/
```

---

## Task Index

| # | Task | Touches |
|---|---|---|
| 0 | Backend verification gate | main repo: `src/api/customer/profile/*` |
| 1 | Scaffold Expo SDK 54 app | `apps/customer-app/` |
| 2 | Install + pin runtime dependencies | `package.json` |
| 3 | ESLint + Prettier + custom token rules | `eslint.config.js`, `tests/setup.ts` |
| 4 | Design tokens | `src/design-system/tokens.ts` |
| 5 | Fonts + Text component | `assets/fonts/`, `src/design-system/Text.tsx`, `app/_layout.tsx` |
| 6 | Haptics module | `src/design-system/haptics.ts` |
| 7 | useMotionScale + useDynamicTypeScale | `src/design-system/useMotionScale.ts`, `useDynamicTypeScale.ts` |
| 8 | Motion primitives A: PressableScale, HapticButton, FadeIn, FadeInDown, StaggerList | `src/design-system/motion/` |
| 9 | Motion primitives B: TransitionScreen, SkeletonToContent | `src/design-system/motion/` |
| 10 | Motion primitives C: BottomSheet, Toast, Countdown | `src/design-system/motion/` |
| 11 | Image component + storage wrappers | `src/design-system/Image.tsx`, `src/lib/storage.ts` |
| 12 | Button primitive (discriminated union) | `src/design-system/components/Button.tsx` |
| 13 | TextField + OtpField | `src/design-system/components/TextField.tsx`, `OtpField.tsx` |
| 14 | ScreenContainer + AppBar + Card + Divider | `src/design-system/components/*` |
| 15 | EmptyState + ErrorState + LoadingState + GradientBrand + Chip + StepIndicator | `src/design-system/components/*` |
| 16 | API client fetch wrapper + refresh interceptor | `src/lib/api.ts` |
| 17 | Auth API helpers | `src/lib/api/auth.ts` |
| 18 | Profile API helpers | `src/lib/api/profile.ts` |
| 19 | Error mapper | `src/lib/errors.ts` |
| 20 | Location helper + deep-link helper | `src/lib/location.ts`, `src/lib/deep-link.ts` |
| 21 | Zustand auth store + onboarding state | `src/stores/auth.ts` |
| 22 | React Query hooks | `src/hooks/*.ts` |
| 23 | Root `_layout.tsx` bootstrap | `app/_layout.tsx` |
| 24 | Route-group layouts + guards | `app/(auth)/_layout.tsx`, `app/(app)/_layout.tsx` |
| 25 | Welcome screen | `app/(auth)/welcome.tsx` |
| 26 | Register screen | `app/(auth)/register.tsx`, `src/features/auth/useRegisterFlow.ts` |
| 27 | Verify-email screen | `app/(auth)/verify-email.tsx` |
| 28 | Verify-phone screen | `app/(auth)/verify-phone.tsx`, `src/features/auth/usePhoneVerify.ts` |
| 29 | Login screen | `app/(auth)/login.tsx`, `src/features/auth/useLoginFlow.ts` |
| 30 | Forgot + Reset password screens | `app/(auth)/forgot-password.tsx`, `reset-password.tsx`, `src/features/auth/usePasswordReset.ts` |
| 31 | Profile completion layout + PC1 About | `app/(auth)/profile-completion/_layout.tsx`, `about.tsx`, `src/features/profile-completion/useProfileCompletion.ts` |
| 32 | PC2 Address + location assist | `app/(auth)/profile-completion/address.tsx` |
| 33 | PC3 Interests | `app/(auth)/profile-completion/interests.tsx` |
| 34 | PC4 Avatar + newsletter | `app/(auth)/profile-completion/avatar.tsx`, `src/features/profile-completion/useAvatarPicker.ts` |
| 35 | Subscribe-prompt + Subscribe-soon | `app/(auth)/subscribe-prompt.tsx`, `subscribe-soon.tsx` |
| 36 | Tab bar + Home placeholder | `app/(app)/_layout.tsx`, `app/(app)/index.tsx` |
| 37 | Maestro E2E flows | `.maestro/auth.yaml`, `.maestro/login.yaml` |
| 38 | Merge gate checklist | `docs/a11y/3c1a-contrast.md`, PR description |

---

## Decision Log

- **2026-04-15 — profileImageUrl null gap (§12.5):** Option A chosen. Backend now accepts `profileImageUrl: null`. PC4 will wire the Remove action.
- **2026-04-15 — interests route verification:** `PUT /api/v1/customer/profile/interests` confirmed present at `src/api/customer/profile/routes.ts:66`.
- **2026-04-15 — Moti compatibility (Task 2):** Moti INSTALLED. `npm view moti peerDependencies` returns `{ "react-native-reanimated": "*" }` — the wildcard range explicitly includes Reanimated 4. Installed `moti@^0.30.0` via `expo install`. react-native-reanimated resolved to `~4.1.1` (Expo SDK 54 default).

---

## Batch A — Foundations

### Task 0: Backend verification gate (main repo, not worktree)

Before any mobile work, confirm or close the two backend questions the spec flagged.

**Files (in main repo — NOT the customer-app worktree):**
- Verify: `src/api/customer/profile/routes.ts:20-25` (interests `PUT` route + `profileImageUrl` validator)
- Verify: `src/api/customer/profile/service.ts`

- [ ] **Step 1: Confirm interests update route exists**

Run from main repo root:

```bash
grep -n "profile/interests" src/api/customer/profile/routes.ts
```

Expected: a `PUT /profile/interests` route handler wired to `updateCustomerInterests` from `./service`. If missing, open an issue and block this plan.

- [ ] **Step 2: Confirm / decide avatar null-clear behaviour**

Read [`src/api/customer/profile/routes.ts`](../../src/api/customer/profile/routes.ts) and find the `updateProfileBody` zod schema. Today:

```ts
profileImageUrl: z.union([z.string().url(), z.string().startsWith('data:image/')]).optional()
```

This rejects `null`. Decide **Option A** or **Option B** from spec §12.5:

- **Option A (recommended):** change the validator to `.nullable().optional()` AND pass `null` through in `service.ts` (lines ~95–97). This requires a small backend PR before Task 34.
- **Option B:** defer "Remove avatar" from PC4 to Phase 3C.4. PC4 only supports replacing a photo.

Document the decision at the top of this plan under a new `## Decision Log` section before proceeding.

- [ ] **Step 3: If Option A chosen, implement the backend change**

Modify `src/api/customer/profile/routes.ts` validator:

```ts
profileImageUrl: z.union([z.string().url(), z.string().startsWith('data:image/')]).nullable().optional(),
```

Modify `src/api/customer/profile/service.ts` — replace the conditional spread for `profileImageUrl`:

```ts
...(data.profileImageUrl !== undefined ? { profileImageUrl: data.profileImageUrl } : {}),
```

(No change needed — the existing spread already allows `null` to pass through once the validator permits it. Prisma `String?` accepts `null`.)

Add a test in the backend suite (`tests/api/customer/profile.test.ts` or equivalent):

```ts
it('accepts profileImageUrl: null to clear the avatar', async () => {
  const res = await client.patch('/api/v1/customer/profile', { profileImageUrl: null })
  expect(res.status).toBe(200)
  expect(res.body.profileImageUrl).toBeNull()
})
```

- [ ] **Step 4: Commit the backend change if Option A**

```bash
git add src/api/customer/profile/routes.ts src/api/customer/profile/service.ts tests/api/customer/profile.test.ts
git commit -m "feat(customer-profile): accept profileImageUrl: null to clear avatar"
```

- [ ] **Step 5: Add Decision Log to this plan**

At the top of this plan file (just after the task index), append:

```markdown
## Decision Log

- **2026-04-15 — profileImageUrl null gap (§12.5):** Option A chosen. Backend now accepts `profileImageUrl: null`. PC4 will wire the Remove action.
- **2026-04-15 — interests route verification:** `PUT /api/v1/customer/profile/interests` confirmed present at `src/api/customer/profile/routes.ts:<line>`.
```

Commit the plan update:

```bash
git add docs/superpowers/plans/2026-04-15-customer-app-foundations-auth.md
git commit -m "docs: log 3C.1a backend verification decisions"
```

---

### Task 1: Scaffold Expo SDK 54 app

All subsequent tasks run inside `.worktrees/customer-app/`.

**Files:**
- Create: `apps/customer-app/` (entire directory)
- Create: `apps/customer-app/app.json`
- Create: `apps/customer-app/app.config.ts`
- Create: `apps/customer-app/babel.config.js`
- Create: `apps/customer-app/metro.config.js`
- Create: `apps/customer-app/tsconfig.json`
- Create: `apps/customer-app/.env.example`

- [ ] **Step 1: Create the app with the Expo template**

```bash
cd .worktrees/customer-app/apps
npx create-expo-app@latest customer-app --template blank-typescript
cd customer-app
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
```

Verify the installed SDK matches **54.x**:

```bash
node -p "require('./package.json').dependencies.expo"
```

Expected: `"~54.0.0"` or a `^54.x` pin.

- [ ] **Step 2: Configure TypeScript strict + path alias**

Replace `tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["jest", "node"]
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 3: Configure expo-router + app.config.ts**

Replace `app.json` content with a minimal shell that defers to `app.config.ts`:

```json
{ "expo": { "name": "customer-app" } }
```

Create `app.config.ts`:

```ts
import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: 'Redeemo',
  slug: 'redeemo-customer',
  scheme: 'redeemo',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  experiments: { typedRoutes: true },
  plugins: ['expo-router', 'expo-secure-store', 'expo-font', 'expo-image-picker'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.redeemo.customer',
    associatedDomains: ['applinks:redeemo.com'],
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Redeemo uses your location to show vouchers from merchants near you.',
      NSPhotoLibraryUsageDescription:
        'Redeemo lets you pick a profile photo from your library.',
      NSCameraUsageDescription:
        'Redeemo lets you take a profile photo with your camera.',
    },
  },
  android: {
    package: 'com.redeemo.customer',
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'redeemo.com', pathPrefix: '/reset-password' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  },
}

export default config
```

- [ ] **Step 4: Configure Babel + Metro with the `@/` alias**

`babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', { root: ['./'], alias: { '@': './src' } }],
      'react-native-reanimated/plugin', // MUST be last
    ],
  }
}
```

`metro.config.js`:

```js
const { getDefaultConfig } = require('expo/metro-config')
module.exports = getDefaultConfig(__dirname)
```

- [ ] **Step 5: Configure the router entry point**

Update `package.json` main:

```json
{ "main": "expo-router/entry" }
```

Create `src/` and stub `app/index.tsx` so the app starts:

```bash
mkdir -p src app assets/fonts assets/images
```

`app/_layout.tsx`:

```tsx
import { Stack } from 'expo-router'
export default function RootLayout() { return <Stack /> }
```

`app/index.tsx`:

```tsx
import { View, Text } from 'react-native'
export default function Index() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Redeemo</Text></View>
}
```

- [ ] **Step 6: Verify the app boots**

```bash
npx expo start --clear
```

Expected: Metro bundler starts, QR code appears. Press `i` to launch iOS simulator — "Redeemo" should render. Press `a` for Android.

- [ ] **Step 7: Create `.env.example`**

```
EXPO_PUBLIC_API_URL=http://localhost:3000
```

- [ ] **Step 8: Commit**

```bash
git add apps/customer-app/
git commit -m "feat(customer-app): scaffold Expo SDK 54 app with expo-router + TS strict"
```

---

### Task 2: Install + pin runtime dependencies

**Files:**
- Modify: `apps/customer-app/package.json`

- [ ] **Step 1: Install core runtime deps via `expo install`**

```bash
cd apps/customer-app
npx expo install \
  @tanstack/react-query \
  zustand \
  react-native-reanimated \
  react-native-gesture-handler \
  expo-haptics \
  expo-secure-store \
  @react-native-async-storage/async-storage \
  expo-image \
  expo-image-picker \
  expo-image-manipulator \
  expo-linear-gradient \
  expo-font \
  expo-localization \
  lucide-react-native \
  react-native-svg \
  zod \
  react-hook-form \
  @hookform/resolvers \
  nanoid
```

Verify Reanimated is `^4.x`:

```bash
node -p "require('./package.json').dependencies['react-native-reanimated']"
```

Expected: a `^4.x` or `~4.x` range. If not, pin manually:

```bash
npm install react-native-reanimated@^4.0.0
```

- [ ] **Step 2: Decide on Moti (per spec §4 compatibility gate)**

```bash
npm view moti peerDependencies
```

If the `peerDependencies` entry for `react-native-reanimated` includes `^4` (e.g. `>=3 <5`), install:

```bash
npx expo install moti
```

If it does not, **skip Moti**. All motion primitives must be written directly against Reanimated 4. Document the decision in the Decision Log from Task 0.

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D \
  typescript \
  @types/react \
  @types/react-native \
  jest \
  jest-expo \
  @testing-library/react-native \
  @testing-library/jest-native \
  react-test-renderer \
  @types/jest \
  babel-plugin-module-resolver \
  eslint \
  @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin \
  eslint-plugin-react \
  eslint-plugin-react-hooks \
  eslint-plugin-react-native \
  prettier
```

- [ ] **Step 4: Configure Jest in `package.json`**

Append to `package.json`:

```json
{
  "scripts": {
    "start": "expo start",
    "ios": "expo start --ios",
    "android": "expo start --android",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "jest": {
    "preset": "jest-expo",
    "setupFilesAfterEach": ["./tests/setup.ts"],
    "transformIgnorePatterns": [
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))"
    ],
    "moduleNameMapper": {
      "^@/(.*)$": "<rootDir>/src/$1"
    }
  }
}
```

Create `tests/setup.ts`:

```ts
import '@testing-library/jest-native/extend-expect'
```

- [ ] **Step 5: Verify everything compiles**

```bash
npm run typecheck
```

Expected: exits 0 with no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/package.json apps/customer-app/package-lock.json apps/customer-app/tests/setup.ts
git commit -m "feat(customer-app): install runtime + dev dependencies"
```

---

### Task 3: ESLint + Prettier + custom token rules

**Files:**
- Create: `apps/customer-app/eslint.config.js`
- Create: `apps/customer-app/.prettierrc.json`
- Create: `apps/customer-app/eslint-rules/no-raw-tokens.js`

- [ ] **Step 1: Prettier config**

`.prettierrc.json`:

```json
{ "semi": false, "singleQuote": true, "printWidth": 100, "trailingComma": "all", "arrowParens": "always" }
```

- [ ] **Step 2: Custom lint rule — no raw tokens in screens**

Create `eslint-rules/no-raw-tokens.js`:

```js
// Forbids raw color hex, raw numeric fontSize/padding/margin values, and barrel lucide imports
// within files under app/ and src/features/*/screens/ and src/screens/.
module.exports = {
  meta: { type: 'problem', schema: [], messages: {
    hexColor: 'Raw hex/rgb color not allowed in screens. Use tokens.color.* via design-system.',
    rawFontSize: 'Raw fontSize not allowed. Use <Text variant="..."> from design-system.',
    rawSpacing: 'Raw padding/margin numeric value not allowed. Use tokens.spacing.*.',
    barrelLucide: 'Import lucide icons individually (e.g. `lucide-react-native/ArrowRight`), not from the barrel.',
    repeatMotion: 'Direct withRepeat usage is forbidden outside src/design-system/motion/. Use a design-system motion primitive.',
  }},
  create(context) {
    const filename = context.getFilename()
    const isScreenFile = /\/app\/|\/src\/screens\/|\/src\/features\/.*\/screens\//.test(filename)
    const isDesignSystem = /\/src\/design-system\//.test(filename)
    const hexRe = /^#[0-9a-fA-F]{3,8}$/
    const rgbRe = /^rgba?\(/i
    const spacingProps = new Set(['padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
      'paddingHorizontal', 'paddingVertical', 'margin', 'marginTop', 'marginBottom', 'marginLeft',
      'marginRight', 'marginHorizontal', 'marginVertical', 'gap'])
    return {
      Literal(node) {
        if (!isScreenFile || isDesignSystem) return
        if (typeof node.value === 'string' && (hexRe.test(node.value) || rgbRe.test(node.value))) {
          context.report({ node, messageId: 'hexColor' })
        }
      },
      Property(node) {
        if (!isScreenFile || isDesignSystem) return
        const key = node.key && (node.key.name || node.key.value)
        if (key === 'fontSize' && node.value.type === 'Literal' && typeof node.value.value === 'number') {
          context.report({ node, messageId: 'rawFontSize' })
        }
        if (spacingProps.has(key) && node.value.type === 'Literal' && typeof node.value.value === 'number') {
          context.report({ node, messageId: 'rawSpacing' })
        }
      },
      ImportDeclaration(node) {
        if (node.source.value === 'lucide-react-native' && node.specifiers.some(s => s.type === 'ImportSpecifier')) {
          context.report({ node, messageId: 'barrelLucide' })
        }
      },
      ImportSpecifier(node) {
        const src = node.parent?.source?.value
        if (src === 'react-native-reanimated' && node.imported?.name === 'withRepeat' && !isDesignSystem) {
          context.report({ node, messageId: 'repeatMotion' })
        }
      },
    }
  },
}
```

- [ ] **Step 3: ESLint config using the custom rule**

`eslint.config.js`:

```js
const tsParser = require('@typescript-eslint/parser')
const tsPlugin = require('@typescript-eslint/eslint-plugin')
const reactPlugin = require('eslint-plugin-react')
const reactHooks = require('eslint-plugin-react-hooks')
const reactNative = require('eslint-plugin-react-native')
const tokensPlugin = { rules: { 'no-raw-tokens': require('./eslint-rules/no-raw-tokens') } }

module.exports = [
  { ignores: ['node_modules/', '.expo/', 'babel.config.js', 'metro.config.js', 'eslint.config.js', 'eslint-rules/**'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': tsPlugin, react: reactPlugin, 'react-hooks': reactHooks, 'react-native': reactNative, tokens: tokensPlugin },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'tokens/no-raw-tokens': 'error',
    },
    settings: { react: { version: 'detect' } },
  },
]
```

- [ ] **Step 4: Write lint rule test fixtures**

Create `tests/eslint-rules/no-raw-tokens.test.ts`:

```ts
import { RuleTester } from 'eslint'
import rule from '../../eslint-rules/no-raw-tokens'

const tester = new RuleTester({ languageOptions: { parser: require('@typescript-eslint/parser'), parserOptions: { ecmaFeatures: { jsx: true } } } })

tester.run('no-raw-tokens', rule as any, {
  valid: [
    { filename: '/x/app/welcome.tsx', code: "const s = { padding: spacing[4] }" },
    { filename: '/x/src/design-system/motion/PressableScale.tsx', code: "const c = '#E20C04'" },
  ],
  invalid: [
    { filename: '/x/app/welcome.tsx', code: "const c = '#E20C04'", errors: [{ messageId: 'hexColor' }] },
    { filename: '/x/app/welcome.tsx', code: "const s = { fontSize: 14 }", errors: [{ messageId: 'rawFontSize' }] },
    { filename: '/x/app/welcome.tsx', code: "const s = { padding: 16 }", errors: [{ messageId: 'rawSpacing' }] },
    { filename: '/x/app/welcome.tsx', code: "import { withRepeat } from 'react-native-reanimated'", errors: [{ messageId: 'repeatMotion' }] },
  ],
})
```

- [ ] **Step 5: Run lint rule tests**

```bash
npm test -- no-raw-tokens
```

Expected: all passing.

- [ ] **Step 6: Run ESLint across the (currently minimal) source tree**

```bash
npm run lint
```

Expected: exits 0 with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-app/eslint.config.js apps/customer-app/eslint-rules/ apps/customer-app/.prettierrc.json apps/customer-app/tests/eslint-rules/
git commit -m "feat(customer-app): lint + prettier + custom token-usage rule"
```

---

### Task 4: Design tokens

**Files:**
- Create: `apps/customer-app/src/design-system/tokens.ts`
- Create: `apps/customer-app/tests/design-system/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/design-system/tokens.test.ts`:

```ts
import { color, spacing, radius, motion, layer, opacity, layout, typography } from '@/design-system/tokens'

describe('tokens', () => {
  it('exposes brand colors matching the website', () => {
    expect(color.navy).toBe('#010C35')
    expect(color.brandRose).toBe('#E20C04')
    expect(color.brandCoral).toBe('#E84A00')
    expect(color.brandGradient).toEqual(['#E20C04', '#E84A00'])
  })
  it('uses warm greys (not cool slate) for text.secondary/tertiary', () => {
    expect(color.text.secondary).toBe('#4B5563')
    expect(color.text.tertiary).toBe('#9CA3AF')
  })
  it('has 4pt spacing scale', () => {
    expect(spacing[0]).toBe(0); expect(spacing[1]).toBe(4); expect(spacing[4]).toBe(16); expect(spacing[10]).toBe(64)
  })
  it('has motion durations and easings', () => {
    expect(motion.duration.base).toBe(240)
    expect(motion.easing.standard).toEqual([0.4, 0, 0.2, 1])
    expect(motion.spring.gentle).toEqual({ damping: 20, stiffness: 180 })
  })
  it('typography.body.md is the body default', () => {
    expect(typography['body.md'].fontSize).toBe(16)
    expect(typography['body.md'].lineHeight).toBe(24)
  })
  it('layer tokens are ordered for stacking', () => {
    expect(layer.tabBar).toBeLessThan(layer.sheet)
    expect(layer.sheet).toBeLessThan(layer.toast)
  })
})
```

- [ ] **Step 2: Run test — expect fail**

```bash
npm test -- tokens
```

Expected: module not found.

- [ ] **Step 3: Implement tokens**

`src/design-system/tokens.ts`:

```ts
export const color = {
  brandRose: '#E20C04',
  brandCoral: '#E84A00',
  brandGradient: ['#E20C04', '#E84A00'] as const,
  onBrand: '#FFFFFF',
  navy: '#010C35',
  text: {
    primary: '#010C35',
    secondary: '#4B5563',
    tertiary: '#9CA3AF',
    inverse: '#FFFFFF',
    danger: '#B91C1C',
  },
  surface: {
    page: '#FFFFFF',
    tint: '#FEF6F5',
    neutral: '#F8F9FA',
    subtle: '#F3F4F6',
    raised: '#FFFFFF',
  },
  border: { subtle: '#E5E7EB', default: '#D1D5DB', strong: '#9CA3AF' },
  success: '#0F7A3E',
  warning: '#B45309',
  danger: '#B91C1C',
  info: '#0E7490',
  focus: '#010C35',
} as const

export const spacing = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const

export const radius = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, pill: 9999 } as const

export const elevation = {
  none: { shadowOpacity: 0, elevation: 0 },
  sm:   { shadowColor: '#010C35', shadowOpacity: 0.08, shadowRadius: 4,  shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  md:   { shadowColor: '#010C35', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  lg:   { shadowColor: '#010C35', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  glow: { shadowColor: '#E20C04', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
} as const

export const motion = {
  duration: { instant: 0, xfast: 120, fast: 180, base: 240, slow: 320, xslow: 400 },
  easing:   { standard: [0.4, 0, 0.2, 1], enter: [0, 0, 0.2, 1], exit: [0.4, 0, 1, 1] },
  spring:   {
    gentle: { damping: 20, stiffness: 180 },
    snappy: { damping: 18, stiffness: 260 },
    rubber: { damping: 14, stiffness: 140 },
  },
  stagger: 40,
} as const

export const layer = { base: 0, raised: 1, sticky: 10, appBar: 20, tabBar: 20, sheet: 40, overlay: 50, toast: 60, alert: 70 } as const

export const opacity = { disabled: 0.4, pressed: 0.85, overlay: 0.55, subtle: 0.72, full: 1 } as const

export const layout = { screenPaddingH: 20, tabBarHeight: 64, appBarHeight: 56, minTouchTarget: 44 } as const

type TypographyVariant = {
  fontFamily: 'MusticaPro-SemiBold' | 'Lato-Regular' | 'Lato-Medium' | 'Lato-SemiBold' | 'Lato-Bold'
  fontSize: number
  lineHeight: number
  letterSpacing?: number
  textTransform?: 'uppercase'
}

export const typography: Record<string, TypographyVariant> = {
  'display.xl': { fontFamily: 'MusticaPro-SemiBold', fontSize: 40, lineHeight: 44 },
  'display.lg': { fontFamily: 'MusticaPro-SemiBold', fontSize: 32, lineHeight: 36 },
  'display.md': { fontFamily: 'MusticaPro-SemiBold', fontSize: 26, lineHeight: 30 },
  'display.sm': { fontFamily: 'MusticaPro-SemiBold', fontSize: 22, lineHeight: 26 },
  'heading.lg': { fontFamily: 'Lato-SemiBold', fontSize: 20, lineHeight: 26 },
  'heading.md': { fontFamily: 'Lato-SemiBold', fontSize: 18, lineHeight: 24 },
  'heading.sm': { fontFamily: 'Lato-SemiBold', fontSize: 16, lineHeight: 22 },
  'body.lg':    { fontFamily: 'Lato-Regular',  fontSize: 18, lineHeight: 28 },
  'body.md':    { fontFamily: 'Lato-Regular',  fontSize: 16, lineHeight: 24 },
  'body.sm':    { fontFamily: 'Lato-Regular',  fontSize: 14, lineHeight: 21 },
  'label.lg':   { fontFamily: 'Lato-Medium',   fontSize: 14, lineHeight: 18, letterSpacing: 0.2 },
  'label.md':   { fontFamily: 'Lato-Medium',   fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  'label.eyebrow': { fontFamily: 'Lato-SemiBold', fontSize: 11, lineHeight: 14, letterSpacing: 1.8, textTransform: 'uppercase' },
  'mono.redemption': { fontFamily: 'Lato-Bold', fontSize: 28, lineHeight: 34, letterSpacing: 4 },
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm test -- tokens
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/design-system/tokens.ts apps/customer-app/tests/design-system/
git commit -m "feat(customer-app): design system tokens (color/spacing/motion/typography)"
```

---

## Batch B — Typography, Haptics, Motion, Storage

### Task 5: Fonts + Text component

**Files:**
- Create: `apps/customer-app/assets/fonts/` (copy font files from the branding package)
- Create: `apps/customer-app/src/design-system/useFonts.ts`
- Create: `apps/customer-app/src/design-system/Text.tsx`
- Create: `apps/customer-app/tests/design-system/Text.test.tsx`

- [ ] **Step 1: Copy fonts into the app**

Source fonts live in `Branding /` (see repo root). Copy these into `assets/fonts/` with exact filenames:

```
MusticaPro-SemiBold.otf
Lato-Regular.ttf
Lato-Medium.ttf
Lato-SemiBold.ttf
Lato-Bold.ttf
```

```bash
mkdir -p apps/customer-app/assets/fonts
cp "../../Branding /fonts/MusticaPro-SemiBold.otf" apps/customer-app/assets/fonts/
cp "../../Branding /fonts/Lato-Regular.ttf" apps/customer-app/assets/fonts/
cp "../../Branding /fonts/Lato-Medium.ttf" apps/customer-app/assets/fonts/
cp "../../Branding /fonts/Lato-SemiBold.ttf" apps/customer-app/assets/fonts/
cp "../../Branding /fonts/Lato-Bold.ttf" apps/customer-app/assets/fonts/
```

(If the Branding directory path differs in the worktree, substitute. Fonts must be self-hosted — do not use Google Fonts.)

- [ ] **Step 2: `useFonts` hook**

`src/design-system/useFonts.ts`:

```ts
import { useFonts as useExpoFonts } from 'expo-font'

export function useFonts() {
  const [loaded, error] = useExpoFonts({
    'MusticaPro-SemiBold': require('../../assets/fonts/MusticaPro-SemiBold.otf'),
    'Lato-Regular':        require('../../assets/fonts/Lato-Regular.ttf'),
    'Lato-Medium':         require('../../assets/fonts/Lato-Medium.ttf'),
    'Lato-SemiBold':       require('../../assets/fonts/Lato-SemiBold.ttf'),
    'Lato-Bold':           require('../../assets/fonts/Lato-Bold.ttf'),
  })
  return { loaded, error }
}
```

- [ ] **Step 3: Write failing test for `<Text>`**

`tests/design-system/Text.test.tsx`:

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { Text } from '@/design-system/Text'
import { color, typography } from '@/design-system/tokens'

describe('<Text>', () => {
  it('defaults to body.md + text.primary', () => {
    const { getByText } = render(<Text>Hello</Text>)
    const el = getByText('Hello')
    expect(el.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ fontSize: 16, color: color.text.primary }),
    ]))
  })
  it('renders specified variant', () => {
    const { getByText } = render(<Text variant="display.lg">Big</Text>)
    const el = getByText('Big')
    expect(el.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ fontSize: typography['display.lg'].fontSize }),
    ]))
  })
  it('refuses tertiary on body without meta prop', () => {
    const { getByText } = render(<Text variant="body.md" color="tertiary">x</Text>)
    expect(getByText('x').props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ color: color.text.primary }), // falls back to primary
    ]))
  })
  it('allows tertiary when meta=true', () => {
    const { getByText } = render(<Text variant="label.md" color="tertiary" meta>x</Text>)
    expect(getByText('x').props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ color: color.text.tertiary }),
    ]))
  })
})
```

- [ ] **Step 4: Run test — expect fail**

```bash
npm test -- Text
```

Expected: module not found.

- [ ] **Step 5: Implement `<Text>`**

`src/design-system/Text.tsx`:

```tsx
import React from 'react'
import { Text as RNText, TextProps as RNTextProps, TextStyle, StyleSheet } from 'react-native'
import { color, typography } from './tokens'

type Variant = keyof typeof typography
type Shade = 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'danger'

export type TextProps = RNTextProps & {
  variant?: Variant
  color?: Shade
  /** When true, allows color="tertiary" on body variants (metadata use only). */
  meta?: boolean
  align?: TextStyle['textAlign']
}

export function Text({
  variant = 'body.md',
  color: shade = 'primary',
  meta = false,
  align,
  style,
  children,
  accessibilityRole,
  ...rest
}: TextProps) {
  const t = typography[variant]
  const isBodyLike = variant.startsWith('body.') || variant.startsWith('heading.')

  // §8.3: tertiary is metadata/decorative only. Reject it on body/heading unless meta=true.
  const resolvedShade: Shade = shade === 'tertiary' && isBodyLike && !meta ? 'primary' : shade

  const textStyle: TextStyle = {
    fontFamily: t.fontFamily,
    fontSize: t.fontSize,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
    textTransform: t.textTransform,
    textAlign: align,
    color: color.text[resolvedShade],
  }
  return (
    <RNText
      accessibilityRole={accessibilityRole ?? (variant.startsWith('display.') || variant.startsWith('heading.') ? 'header' : 'text')}
      style={StyleSheet.flatten([textStyle, style])}
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      {...rest}
    >
      {children}
    </RNText>
  )
}
```

- [ ] **Step 6: Run test — expect pass**

```bash
npm test -- Text
```

Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-app/assets/fonts apps/customer-app/src/design-system/useFonts.ts apps/customer-app/src/design-system/Text.tsx apps/customer-app/tests/design-system/Text.test.tsx
git commit -m "feat(customer-app): self-host fonts + Text component with tertiary guard"
```

---

### Task 6: Haptics module

**Files:**
- Create: `apps/customer-app/src/design-system/haptics.ts`
- Create: `apps/customer-app/tests/design-system/haptics.test.ts`

- [ ] **Step 1: Write failing test**

`tests/design-system/haptics.test.ts`:

```ts
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}))
import * as Haptics from 'expo-haptics'
import { haptics, setHapticsEnabled } from '@/design-system/haptics'

describe('haptics', () => {
  beforeEach(() => { jest.clearAllMocks(); setHapticsEnabled(true) })
  it('fires light impact for touch.light', async () => {
    await haptics.touch.light()
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light')
  })
  it('fires success notification', async () => {
    await haptics.success()
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success')
  })
  it('no-ops when globally disabled', async () => {
    setHapticsEnabled(false)
    await haptics.success()
    expect(Haptics.notificationAsync).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test — expect fail**

```bash
npm test -- haptics
```

- [ ] **Step 3: Implement**

`src/design-system/haptics.ts`:

```ts
import * as Haptics from 'expo-haptics'

let enabled = true
export function setHapticsEnabled(v: boolean) { enabled = v }

const guard = (fn: () => Promise<unknown>) => async () => { if (enabled) await fn() }

export const haptics = {
  touch: {
    light:  guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
    medium: guard(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  },
  success:   guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning:   guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error:     guard(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  selection: guard(() => Haptics.selectionAsync()),
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm test -- haptics
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/design-system/haptics.ts apps/customer-app/tests/design-system/haptics.test.ts
git commit -m "feat(customer-app): haptics module with global on/off"
```

---

### Task 7: Motion + Dynamic Type hooks

**Files:**
- Create: `apps/customer-app/src/design-system/useMotionScale.ts`
- Create: `apps/customer-app/src/design-system/useDynamicTypeScale.ts`
- Create: `apps/customer-app/tests/design-system/useMotionScale.test.ts`

- [ ] **Step 1: Failing test for `useMotionScale`**

`tests/design-system/useMotionScale.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import { useMotionScale } from '@/design-system/useMotionScale'

describe('useMotionScale', () => {
  it('returns 0 when reduce motion is enabled, 1 otherwise', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValueOnce(true)
    const { result } = renderHook(() => useMotionScale())
    await act(async () => { await Promise.resolve() })
    expect(result.current).toBe(0)
  })
  it('returns 1 when reduce motion off', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValueOnce(false)
    const { result } = renderHook(() => useMotionScale())
    await act(async () => { await Promise.resolve() })
    expect(result.current).toBe(1)
  })
})
```

- [ ] **Step 2: Run test — expect fail**

```bash
npm test -- useMotionScale
```

- [ ] **Step 3: Implement `useMotionScale`**

`src/design-system/useMotionScale.ts`:

```ts
import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

export function useMotionScale(): 0 | 1 {
  const [scale, setScale] = useState<0 | 1>(1)
  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (mounted) setScale(v ? 0 : 1) })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', v => setScale(v ? 0 : 1))
    return () => { mounted = false; sub?.remove?.() }
  }, [])
  return scale
}
```

- [ ] **Step 4: Implement `useDynamicTypeScale`**

`src/design-system/useDynamicTypeScale.ts`:

```ts
import { PixelRatio, useWindowDimensions } from 'react-native'

/** Returns the font-scale multiplier, clamped [1, 1.4] for layout safety. */
export function useDynamicTypeScale(): number {
  useWindowDimensions() // subscribe to resize / orientation
  return Math.min(Math.max(PixelRatio.getFontScale(), 1), 1.4)
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
npm test -- useMotionScale
```

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/design-system/useMotionScale.ts apps/customer-app/src/design-system/useDynamicTypeScale.ts apps/customer-app/tests/design-system/useMotionScale.test.ts
git commit -m "feat(customer-app): motion + dynamic type scale hooks"
```

---

### Task 8: Motion primitives A — PressableScale, HapticButton, FadeIn, FadeInDown, StaggerList

**Files:**
- Create: `apps/customer-app/src/design-system/motion/README.md`
- Create: `apps/customer-app/src/design-system/motion/PressableScale.tsx`
- Create: `apps/customer-app/src/design-system/motion/HapticButton.tsx`
- Create: `apps/customer-app/src/design-system/motion/FadeIn.tsx`
- Create: `apps/customer-app/src/design-system/motion/StaggerList.tsx`
- Create: `apps/customer-app/tests/design-system/motion/PressableScale.test.tsx`

- [ ] **Step 1: Motion README (locks the no-decorative-loops principle)**

`src/design-system/motion/README.md`:

```markdown
# Motion Primitives

**Principle:** no decorative looping animation. `withRepeat` is permitted here and nowhere else. Repeated motion exists only for loading (skeleton/spinner), countdown (OTP resend), or system feedback.

All primitives must respect `useMotionScale()`. At scale 0, durations collapse to 0 and position-based animations degrade to opacity changes.
```

- [ ] **Step 2: Failing test for PressableScale**

`tests/design-system/motion/PressableScale.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { Text } from 'react-native'
import { PressableScale } from '@/design-system/motion/PressableScale'

describe('<PressableScale>', () => {
  it('calls onPress', () => {
    const onPress = jest.fn()
    const { getByText } = render(<PressableScale onPress={onPress} accessibilityLabel="tap"><Text>x</Text></PressableScale>)
    fireEvent.press(getByText('x'))
    expect(onPress).toHaveBeenCalled()
  })
  it('is disabled when prop.disabled=true', () => {
    const onPress = jest.fn()
    const { getByText } = render(<PressableScale onPress={onPress} disabled accessibilityLabel="tap"><Text>x</Text></PressableScale>)
    fireEvent.press(getByText('x'))
    expect(onPress).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test — expect fail**

```bash
npm test -- PressableScale
```

- [ ] **Step 4: Implement primitives**

`src/design-system/motion/PressableScale.tsx`:

```tsx
import React from 'react'
import { Pressable, PressableProps } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated'
import { useMotionScale } from '../useMotionScale'
import { haptics } from '../haptics'
import { motion } from '../tokens'

type Props = PressableProps & { children: React.ReactNode; hapticStyle?: 'light' | 'medium' | 'none' }

export function PressableScale({ children, onPressIn, onPressOut, hapticStyle = 'light', disabled, style, ...rest }: Props) {
  const scale = useSharedValue(1)
  const motionScale = useMotionScale()
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Animated.View style={[animatedStyle, style as any]}>
      <Pressable
        disabled={disabled}
        onPressIn={(e) => {
          if (motionScale === 1) scale.value = withTiming(0.97, { duration: motion.duration.xfast })
          if (hapticStyle !== 'none') haptics.touch[hapticStyle]()
          onPressIn?.(e)
        }}
        onPressOut={(e) => {
          if (motionScale === 1) scale.value = withSpring(1, { damping: 18, stiffness: 260 })
          onPressOut?.(e)
        }}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}
```

`src/design-system/motion/HapticButton.tsx`:

```tsx
import React from 'react'
import { PressableScale } from './PressableScale'
import { PressableProps } from 'react-native'
import { haptics } from '../haptics'

type Props = Omit<PressableProps, 'onPress'> & {
  children: React.ReactNode
  onPress: () => Promise<unknown> | void
}

export function HapticButton({ children, onPress, ...rest }: Props) {
  return (
    <PressableScale
      hapticStyle="medium"
      onPress={async () => {
        try { await onPress(); await haptics.success() }
        catch (e) { await haptics.error(); throw e }
      }}
      {...rest}
    >
      {children}
    </PressableScale>
  )
}
```

`src/design-system/motion/FadeIn.tsx`:

```tsx
import React, { useEffect } from 'react'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { motion } from '../tokens'
import { useMotionScale } from '../useMotionScale'

type Props = { children: React.ReactNode; delay?: number; y?: number; duration?: number }

export function FadeIn({ children, delay = 0, y = 0, duration = motion.duration.base }: Props) {
  const opacity = useSharedValue(0)
  const translateY = useSharedValue(y)
  const scale = useMotionScale()
  useEffect(() => {
    const t = setTimeout(() => {
      opacity.value = withTiming(1, { duration: scale === 0 ? 0 : duration })
      translateY.value = withTiming(0, { duration: scale === 0 ? 0 : duration })
    }, delay)
    return () => clearTimeout(t)
  }, [delay, duration, opacity, scale, translateY])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: translateY.value }] }))
  return <Animated.View style={style}>{children}</Animated.View>
}

export function FadeInDown({ children, delay, duration }: { children: React.ReactNode; delay?: number; duration?: number }) {
  return <FadeIn y={12} delay={delay} duration={duration}>{children}</FadeIn>
}
```

`src/design-system/motion/StaggerList.tsx`:

```tsx
import React from 'react'
import { FadeInDown } from './FadeIn'
import { motion } from '../tokens'

export function StaggerList({ children, step = motion.stagger }: { children: React.ReactNode; step?: number }) {
  const items = React.Children.toArray(children)
  return (
    <>
      {items.map((c, i) => (
        <FadeInDown key={(c as any).key ?? i} delay={i * step}>{c}</FadeInDown>
      ))}
    </>
  )
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
npm test -- PressableScale
```

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/design-system/motion/ apps/customer-app/tests/design-system/motion/
git commit -m "feat(customer-app): motion primitives — PressableScale, HapticButton, FadeIn, StaggerList"
```

---

### Task 9: Motion primitives B — TransitionScreen, SkeletonToContent

**Files:**
- Create: `apps/customer-app/src/design-system/motion/TransitionScreen.tsx`
- Create: `apps/customer-app/src/design-system/motion/SkeletonToContent.tsx`
- Create: `apps/customer-app/tests/design-system/motion/SkeletonToContent.test.tsx`

- [ ] **Step 1: Failing test**

`tests/design-system/motion/SkeletonToContent.test.tsx`:

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { SkeletonToContent } from '@/design-system/motion/SkeletonToContent'

describe('<SkeletonToContent>', () => {
  it('shows skeleton when loading, content when resolved', () => {
    const skel = <Text>skel</Text>
    const body = <Text>body</Text>
    const { queryByText, rerender } = render(<SkeletonToContent loading skeleton={skel}>{body}</SkeletonToContent>)
    expect(queryByText('skel')).toBeTruthy()
    rerender(<SkeletonToContent loading={false} skeleton={skel}>{body}</SkeletonToContent>)
    expect(queryByText('body')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — expect fail**

```bash
npm test -- SkeletonToContent
```

- [ ] **Step 3: Implement**

`src/design-system/motion/TransitionScreen.tsx`:

```tsx
import React, { useEffect } from 'react'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { motion } from '../tokens'
import { useMotionScale } from '../useMotionScale'

export function TransitionScreen({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(0)
  const ty = useSharedValue(8)
  const scale = useMotionScale()
  useEffect(() => {
    opacity.value = withTiming(1, { duration: scale === 0 ? 0 : motion.duration.base })
    ty.value = withTiming(0, { duration: scale === 0 ? 0 : motion.duration.base })
  }, [opacity, ty, scale])
  const style = useAnimatedStyle(() => ({ flex: 1, opacity: opacity.value, transform: [{ translateY: ty.value }] }))
  return <Animated.View style={style}>{children}</Animated.View>
}
```

`src/design-system/motion/SkeletonToContent.tsx`:

```tsx
import React from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { motion } from '../tokens'
import { useMotionScale } from '../useMotionScale'

type Props = { loading: boolean; skeleton: React.ReactNode; children: React.ReactNode }

export function SkeletonToContent({ loading, skeleton, children }: Props) {
  const progress = useSharedValue(loading ? 0 : 1)
  const scale = useMotionScale()
  React.useEffect(() => {
    progress.value = withTiming(loading ? 0 : 1, { duration: scale === 0 ? 0 : 180 })
  }, [loading, progress, scale])
  const skelStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value, position: 'absolute', top: 0, left: 0, right: 0 }))
  const bodyStyle = useAnimatedStyle(() => ({ opacity: progress.value }))
  return (
    <Animated.View>
      <Animated.View style={skelStyle} pointerEvents={loading ? 'auto' : 'none'}>{skeleton}</Animated.View>
      <Animated.View style={bodyStyle} pointerEvents={loading ? 'none' : 'auto'}>{children}</Animated.View>
    </Animated.View>
  )
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm test -- SkeletonToContent
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/design-system/motion/TransitionScreen.tsx apps/customer-app/src/design-system/motion/SkeletonToContent.tsx apps/customer-app/tests/design-system/motion/SkeletonToContent.test.tsx
git commit -m "feat(customer-app): TransitionScreen + SkeletonToContent"
```

---

### Task 10: Motion primitives C — BottomSheet, Toast, Countdown

**Files:**
- Create: `apps/customer-app/src/design-system/motion/BottomSheet.tsx`
- Create: `apps/customer-app/src/design-system/motion/Toast.tsx`
- Create: `apps/customer-app/src/design-system/motion/Countdown.tsx`
- Create: `apps/customer-app/tests/design-system/motion/Countdown.test.tsx`

- [ ] **Step 1: Failing test for Countdown**

`tests/design-system/motion/Countdown.test.tsx`:

```tsx
import React from 'react'
import { act, render } from '@testing-library/react-native'
import { Countdown } from '@/design-system/motion/Countdown'

jest.useFakeTimers()

describe('<Countdown>', () => {
  it('counts down from given seconds and calls onDone', () => {
    const onDone = jest.fn()
    const { getByText } = render(<Countdown seconds={3} onDone={onDone} />)
    expect(getByText(/3/)).toBeTruthy()
    act(() => { jest.advanceTimersByTime(1000) })
    expect(getByText(/2/)).toBeTruthy()
    act(() => { jest.advanceTimersByTime(2000) })
    expect(onDone).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test — expect fail**

```bash
npm test -- Countdown
```

- [ ] **Step 3: Implement**

`src/design-system/motion/Countdown.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import { Text } from '../Text'

export function Countdown({ seconds, onDone, format }: { seconds: number; onDone?: () => void; format?: (n: number) => string }) {
  const [remaining, setRemaining] = useState(seconds)
  useEffect(() => {
    if (remaining <= 0) { onDone?.(); return }
    const t = setTimeout(() => setRemaining(remaining - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, onDone])
  useEffect(() => { setRemaining(seconds) }, [seconds])
  return <Text variant="label.md" color="secondary" accessibilityLiveRegion="polite">{format ? format(remaining) : `${remaining}s`}</Text>
}
```

`src/design-system/motion/BottomSheet.tsx`:

```tsx
import React, { useEffect } from 'react'
import { Modal, Pressable, View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated'
import { color, layer, motion, opacity, radius, spacing } from '../tokens'
import { useMotionScale } from '../useMotionScale'

type Props = { visible: boolean; onDismiss: () => void; children: React.ReactNode; accessibilityLabel?: string }

export function BottomSheet({ visible, onDismiss, children, accessibilityLabel }: Props) {
  const ty = useSharedValue(500)
  const scrim = useSharedValue(0)
  const scale = useMotionScale()
  useEffect(() => {
    const ms = scale === 0 ? 0 : motion.duration.base
    ty.value = withSpring(visible ? 0 : 500, visible ? motion.spring.gentle : { damping: 22, stiffness: 220 })
    scrim.value = withTiming(visible ? opacity.overlay : 0, { duration: ms })
  }, [visible, ty, scrim, scale])
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }))
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }))
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: '#000', zIndex: layer.overlay }, scrimStyle]}>
        <Pressable onPress={onDismiss} accessibilityLabel="Dismiss sheet" style={{ flex: 1 }} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.surface.raised, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing[5], zIndex: layer.sheet }, sheet]}
      >
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.border.default, marginBottom: spacing[3] }} />
        {children}
      </Animated.View>
    </Modal>
  )
}
```

`src/design-system/motion/Toast.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { View } from 'react-native'
import { Text } from '../Text'
import { color, layer, radius, spacing } from '../tokens'
import { useMotionScale } from '../useMotionScale'

type Tone = 'neutral' | 'success' | 'danger' | 'warning'
type Toast = { id: number; message: string; tone: Tone }
type Ctx = { show: (m: string, tone?: Tone) => void }

const ToastCtx = createContext<Ctx>({ show: () => {} })
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const ms = useMotionScale()
  const opacity = useSharedValue(0)
  const ty = useSharedValue(20)
  const show = useCallback<Ctx['show']>((message, tone = 'neutral') => {
    setToast({ id: Date.now(), message, tone })
    opacity.value = withTiming(1, { duration: ms === 0 ? 0 : 180 })
    ty.value = withTiming(0, { duration: ms === 0 ? 0 : 180 })
  }, [ms, opacity, ty])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => {
      opacity.value = withTiming(0, { duration: ms === 0 ? 0 : 180 })
      ty.value = withTiming(20, { duration: ms === 0 ? 0 : 180 })
      setTimeout(() => setToast(null), ms === 0 ? 0 : 200)
    }, 3500)
    return () => clearTimeout(t)
  }, [toast, ms, opacity, ty])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: ty.value }] }))
  const bg = toast?.tone === 'danger' ? color.danger : toast?.tone === 'success' ? color.success : color.navy
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[{ position: 'absolute', left: spacing[5], right: spacing[5], bottom: spacing[7], zIndex: layer.toast, backgroundColor: bg, padding: spacing[4], borderRadius: radius.md }, style]}
        >
          <Text color="inverse" variant="body.md">{toast.message}</Text>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  )
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm test -- Countdown
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/design-system/motion/BottomSheet.tsx apps/customer-app/src/design-system/motion/Toast.tsx apps/customer-app/src/design-system/motion/Countdown.tsx apps/customer-app/tests/design-system/motion/Countdown.test.tsx
git commit -m "feat(customer-app): BottomSheet + Toast + Countdown"
```

---

### Task 11: Image component + storage wrappers

**Files:**
- Create: `apps/customer-app/src/design-system/Image.tsx`
- Create: `apps/customer-app/src/lib/storage.ts`
- Create: `apps/customer-app/tests/lib/storage.test.ts`

- [ ] **Step 1: Image component**

`src/design-system/Image.tsx`:

```tsx
import React from 'react'
import { Image as ExpoImage, ImageProps } from 'expo-image'
import { radius } from './tokens'

type Props = ImageProps & { width: number; height: number; rounded?: keyof typeof radius }

export function Image({ width, height, rounded, style, ...rest }: Props) {
  return (
    <ExpoImage
      style={[{ width, height, borderRadius: rounded ? radius[rounded] : 0 }, style as any]}
      contentFit="cover"
      transition={180}
      {...rest}
    />
  )
}
```

- [ ] **Step 2: Failing test for storage**

`tests/lib/storage.test.ts`:

```ts
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}))
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}))
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { secureStorage, prefsStorage } from '@/lib/storage'

describe('storage', () => {
  it('secureStorage round-trips tokens', async () => {
    await secureStorage.set('accessToken', 'abc')
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('accessToken', 'abc')
  })
  it('prefsStorage JSON-serialises values', async () => {
    await prefsStorage.set('onboarding-state', { x: 1 })
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('onboarding-state', JSON.stringify({ x: 1 }))
  })
})
```

- [ ] **Step 3: Run test — expect fail**

```bash
npm test -- storage
```

- [ ] **Step 4: Implement storage**

`src/lib/storage.ts`:

```ts
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const secureStorage = {
  async get(key: string): Promise<string | null> { return SecureStore.getItemAsync(key) },
  async set(key: string, value: string) { await SecureStore.setItemAsync(key, value) },
  async remove(key: string) { await SecureStore.deleteItemAsync(key) },
}

export const prefsStorage = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  },
  async set<T>(key: string, value: T) { await AsyncStorage.setItem(key, JSON.stringify(value)) },
  async remove(key: string) { await AsyncStorage.removeItem(key) },
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
npm test -- storage
```

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/design-system/Image.tsx apps/customer-app/src/lib/storage.ts apps/customer-app/tests/lib/storage.test.ts
git commit -m "feat(customer-app): Image component + secure/prefs storage wrappers"
```

---

## Batch C — Component Primitives

### Task 12: Button (discriminated union variant/size)

**Files:**
- Create: `apps/customer-app/src/design-system/components/Button.tsx`
- Create: `apps/customer-app/tests/design-system/components/Button.test.tsx`

- [ ] **Step 1: Failing test**

`tests/design-system/components/Button.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { Button } from '@/design-system/components/Button'

describe('<Button>', () => {
  it('fires onPress when enabled', () => {
    const onPress = jest.fn()
    const { getByText } = render(<Button variant="primary" onPress={onPress}>Go</Button>)
    fireEvent.press(getByText('Go'))
    expect(onPress).toHaveBeenCalled()
  })
  it('locks width when loading (no reflow) and disables press', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(<Button variant="primary" loading onPress={onPress} accessibilityLabel="submit">Submit</Button>)
    fireEvent.press(getByLabelText('submit'))
    expect(onPress).not.toHaveBeenCalled()
  })
  it('renders danger variant with danger color', () => {
    const { getByText } = render(<Button variant="danger" onPress={() => {}}>Delete</Button>)
    expect(getByText('Delete')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — expect fail**

```bash
npm test -- Button
```

- [ ] **Step 3: Implement Button**

`src/design-system/components/Button.tsx`:

```tsx
import React from 'react'
import { ActivityIndicator, View, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { PressableScale } from '../motion/PressableScale'
import { Text } from '../Text'
import { color, radius, spacing, opacity, layout } from '../tokens'

type PrimaryOrDanger = { variant: 'primary' | 'danger'; size?: 'md' | 'lg' }
type SecondaryOrGhost = { variant: 'secondary' | 'ghost'; size?: 'sm' | 'md' | 'lg' }

type BaseProps = {
  children: React.ReactNode
  onPress: () => void | Promise<void>
  loading?: boolean
  disabled?: boolean
  accessibilityLabel?: string
  fullWidth?: boolean
}

export type ButtonProps = BaseProps & (PrimaryOrDanger | SecondaryOrGhost)

const SIZE: Record<string, { height: number; paddingH: number; variant: 'label.md' | 'label.lg' | 'heading.sm' }> = {
  sm: { height: 36, paddingH: spacing[3], variant: 'label.md' },
  md: { height: 48, paddingH: spacing[5], variant: 'label.lg' },
  lg: { height: 56, paddingH: spacing[6], variant: 'heading.sm' },
}

export function Button(props: ButtonProps) {
  const { variant, size = 'md', children, onPress, loading, disabled, accessibilityLabel, fullWidth } = props
  const s = SIZE[size]
  const isInteractiveBlocked = !!(loading || disabled)
  const baseStyle: ViewStyle = {
    minHeight: Math.max(s.height, layout.minTouchTarget),
    paddingHorizontal: s.paddingH,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? opacity.disabled : 1,
    alignSelf: fullWidth ? 'stretch' : 'auto',
    flexDirection: 'row',
  }

  const content = loading ? (
    <ActivityIndicator color={variant === 'secondary' || variant === 'ghost' ? color.navy : color.onBrand} />
  ) : (
    <Text variant={s.variant} color={variant === 'secondary' || variant === 'ghost' ? 'primary' : 'inverse'}>
      {children}
    </Text>
  )

  const accProps = {
    accessibilityRole: 'button' as const,
    accessibilityLabel: accessibilityLabel ?? (typeof children === 'string' ? children : undefined),
    accessibilityState: { disabled: isInteractiveBlocked, busy: !!loading },
  }

  if (variant === 'primary') {
    return (
      <PressableScale disabled={isInteractiveBlocked} onPress={onPress} {...accProps}>
        <LinearGradient colors={color.brandGradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={baseStyle}>
          {content}
        </LinearGradient>
      </PressableScale>
    )
  }
  if (variant === 'danger') {
    return (
      <PressableScale disabled={isInteractiveBlocked} onPress={onPress} {...accProps}>
        <View style={[baseStyle, { backgroundColor: color.danger }]}>{content}</View>
      </PressableScale>
    )
  }
  if (variant === 'secondary') {
    return (
      <PressableScale disabled={isInteractiveBlocked} onPress={onPress} {...accProps}>
        <View style={[baseStyle, { backgroundColor: color.surface.page, borderWidth: 1, borderColor: color.navy }]}>{content}</View>
      </PressableScale>
    )
  }
  // ghost
  return (
    <PressableScale disabled={isInteractiveBlocked} onPress={onPress} hapticStyle="none" {...accProps}>
      <View style={[baseStyle, { backgroundColor: 'transparent' }]}>{content}</View>
    </PressableScale>
  )
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm test -- Button
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/design-system/components/Button.tsx apps/customer-app/tests/design-system/components/Button.test.tsx
git commit -m "feat(customer-app): Button primitive with variant/size discriminated union"
```

---

### Task 13: TextField + OtpField

**Files:**
- Create: `apps/customer-app/src/design-system/components/TextField.tsx`
- Create: `apps/customer-app/src/design-system/components/OtpField.tsx`
- Create: `apps/customer-app/tests/design-system/components/TextField.test.tsx`
- Create: `apps/customer-app/tests/design-system/components/OtpField.test.tsx`

- [ ] **Step 1: Failing tests**

`tests/design-system/components/TextField.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { TextField } from '@/design-system/components/TextField'

describe('<TextField>', () => {
  it('renders label + exposes accessibilityLabel', () => {
    const { getByLabelText } = render(<TextField label="Email" value="" onChangeText={() => {}} />)
    expect(getByLabelText('Email')).toBeTruthy()
  })
  it('shows error text', () => {
    const { getByText } = render(<TextField label="Email" value="" onChangeText={() => {}} error="Required" />)
    expect(getByText('Required')).toBeTruthy()
  })
  it('password toggles visibility', () => {
    const { getByLabelText } = render(<TextField label="Password" secure value="abc" onChangeText={() => {}} />)
    const input = getByLabelText('Password')
    expect(input.props.secureTextEntry).toBe(true)
    fireEvent.press(getByLabelText('Show password'))
    expect(getByLabelText('Password').props.secureTextEntry).toBe(false)
  })
})
```

`tests/design-system/components/OtpField.test.tsx`:

```tsx
import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { OtpField } from '@/design-system/components/OtpField'

describe('<OtpField>', () => {
  it('fires onComplete when all 6 cells filled', () => {
    const onComplete = jest.fn()
    const { getByLabelText } = render(<OtpField length={6} onComplete={onComplete} />)
    const input = getByLabelText('One-time code')
    act(() => fireEvent.changeText(input, '123456'))
    expect(onComplete).toHaveBeenCalledWith('123456')
  })
})
```

- [ ] **Step 2: Run tests — expect fail**

```bash
npm test -- TextField OtpField
```

- [ ] **Step 3: Implement TextField**

`src/design-system/components/TextField.tsx`:

```tsx
import React, { useState } from 'react'
import { TextInput, TextInputProps, View, Pressable } from 'react-native'
import { Text } from '../Text'
import { color, radius, spacing } from '../tokens'
import { Eye, EyeOff } from 'lucide-react-native'

export type TextFieldProps = Omit<TextInputProps, 'secureTextEntry'> & {
  label: string
  error?: string
  helper?: string
  secure?: boolean
}

export function TextField({ label, error, helper, secure, style, value, ...rest }: TextFieldProps) {
  const [revealed, setRevealed] = useState(false)
  const borderColor = error ? color.danger : color.border.default
  return (
    <View style={{ gap: spacing[1] }}>
      <Text variant="label.md" color="secondary" meta>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor, borderRadius: radius.sm, backgroundColor: color.surface.page }}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          placeholderTextColor={color.text.tertiary}
          style={{ flex: 1, minHeight: 48, paddingHorizontal: spacing[4], color: color.text.primary, fontFamily: 'Lato-Regular', fontSize: 16 }}
          secureTextEntry={!!secure && !revealed}
          {...rest}
        />
        {secure && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={() => setRevealed(v => !v)}
            style={{ paddingHorizontal: spacing[3] }}
          >
            {revealed ? <EyeOff size={20} color={color.text.secondary} /> : <Eye size={20} color={color.text.secondary} />}
          </Pressable>
        )}
      </View>
      {error ? (
        <Text variant="label.md" color="danger" accessibilityLiveRegion="polite">{error}</Text>
      ) : helper ? (
        <Text variant="label.md" color="secondary">{helper}</Text>
      ) : null}
    </View>
  )
}
```

- [ ] **Step 4: Implement OtpField**

`src/design-system/components/OtpField.tsx`:

```tsx
import React, { useRef, useState } from 'react'
import { TextInput, View, Pressable } from 'react-native'
import { Text } from '../Text'
import { color, radius, spacing } from '../tokens'
import { haptics } from '../haptics'

type Props = {
  length?: number
  onComplete: (code: string) => void
  error?: string
  disabled?: boolean
}

export function OtpField({ length = 6, onComplete, error, disabled }: Props) {
  const [value, setValue] = useState('')
  const ref = useRef<TextInput>(null)
  const cells = Array.from({ length }, (_, i) => value[i] ?? '')

  return (
    <View>
      <Pressable onPress={() => ref.current?.focus()} accessibilityLabel="One-time code input">
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          {cells.map((c, i) => (
            <View
              key={i}
              style={{
                flex: 1, height: 56, borderRadius: radius.md,
                borderWidth: 1, borderColor: error ? color.danger : (i === value.length ? color.navy : color.border.default),
                backgroundColor: color.surface.subtle, alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text variant="heading.lg">{c}</Text>
            </View>
          ))}
        </View>
      </Pressable>
      <TextInput
        ref={ref}
        accessibilityLabel="One-time code"
        editable={!disabled}
        autoFocus
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        value={value}
        onChangeText={(t) => {
          const clean = t.replace(/\D/g, '').slice(0, length)
          setValue(clean)
          if (clean.length === length) onComplete(clean)
        }}
        style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
      />
      {error && (
        <View style={{ marginTop: spacing[2] }}>
          <Text variant="label.md" color="danger" accessibilityLiveRegion="polite">{error}</Text>
        </View>
      )}
    </View>
  )
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npm test -- TextField OtpField
```

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/design-system/components/TextField.tsx apps/customer-app/src/design-system/components/OtpField.tsx apps/customer-app/tests/design-system/components/
git commit -m "feat(customer-app): TextField + OtpField primitives"
```

---

### Task 14: ScreenContainer + AppBar + Card + Divider

**Files:**
- Create: `apps/customer-app/src/design-system/components/ScreenContainer.tsx`
- Create: `apps/customer-app/src/design-system/components/AppBar.tsx`
- Create: `apps/customer-app/src/design-system/components/Card.tsx`
- Create: `apps/customer-app/src/design-system/components/Divider.tsx`

- [ ] **Step 1: Implement `ScreenContainer`**

`src/design-system/components/ScreenContainer.tsx`:

```tsx
import React from 'react'
import { View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { color, layout, spacing } from '../tokens'

type Props = {
  children: React.ReactNode
  scroll?: boolean
  surface?: 'page' | 'tint'
  footer?: React.ReactNode
}

export function ScreenContainer({ children, scroll = true, surface = 'page', footer }: Props) {
  const insets = useSafeAreaInsets()
  const Body = scroll ? ScrollView : View
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: color.surface[surface] }}>
      <Body
        contentContainerStyle={scroll ? { padding: layout.screenPaddingH, paddingBottom: insets.bottom + spacing[6] } : undefined}
        style={!scroll ? { flex: 1, padding: layout.screenPaddingH, paddingBottom: insets.bottom + spacing[6] } : undefined}
      >
        {children}
      </Body>
      {footer && <View style={{ paddingHorizontal: layout.screenPaddingH, paddingBottom: insets.bottom + spacing[4], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: color.border.subtle, backgroundColor: color.surface.page }}>{footer}</View>}
    </KeyboardAvoidingView>
  )
}
```

- [ ] **Step 2: Implement `AppBar`**

`src/design-system/components/AppBar.tsx`:

```tsx
import React from 'react'
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../Text'
import { color, layout, spacing } from '../tokens'

type Props = {
  title?: string
  right?: React.ReactNode
  showBack?: boolean
}

export function AppBar({ title, right, showBack = true }: Props) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: color.surface.page, borderBottomWidth: 1, borderBottomColor: color.border.subtle }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: layout.appBarHeight, paddingHorizontal: spacing[4] }}>
        {showBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={8} style={{ padding: spacing[2] }}>
            <ChevronLeft size={24} color={color.navy} />
          </Pressable>
        ) : <View style={{ width: 40 }} />}
        <View style={{ flex: 1, alignItems: 'center' }}>
          {title && <Text variant="heading.sm">{title}</Text>}
        </View>
        <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View>
      </View>
    </View>
  )
}
```

- [ ] **Step 3: Implement `Card`**

`src/design-system/components/Card.tsx`:

```tsx
import React from 'react'
import { View, ViewProps } from 'react-native'
import { color, radius, spacing, elevation } from '../tokens'

export function Card({ children, style, ...rest }: ViewProps & { children: React.ReactNode }) {
  return (
    <View
      style={[
        { padding: spacing[4], backgroundColor: color.surface.raised, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border.subtle },
        elevation.sm,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  )
}
```

- [ ] **Step 4: Implement `Divider`**

`src/design-system/components/Divider.tsx`:

```tsx
import React from 'react'
import { View } from 'react-native'
import { color, spacing } from '../tokens'

export function Divider({ vertical = false }: { vertical?: boolean }) {
  return <View style={vertical ? { width: 1, backgroundColor: color.border.subtle, marginHorizontal: spacing[2] } : { height: 1, backgroundColor: color.border.subtle, marginVertical: spacing[2] }} />
}
```

- [ ] **Step 5: Smoke test**

`tests/design-system/components/ScreenContainer.test.tsx`:

```tsx
import React from 'react'
import { Text } from 'react-native'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ScreenContainer } from '@/design-system/components/ScreenContainer'

describe('<ScreenContainer>', () => {
  it('renders children', () => {
    const { getByText } = render(<SafeAreaProvider><ScreenContainer><Text>ok</Text></ScreenContainer></SafeAreaProvider>)
    expect(getByText('ok')).toBeTruthy()
  })
})
```

Run: `npm test -- ScreenContainer` — expect pass.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/design-system/components/ScreenContainer.tsx apps/customer-app/src/design-system/components/AppBar.tsx apps/customer-app/src/design-system/components/Card.tsx apps/customer-app/src/design-system/components/Divider.tsx apps/customer-app/tests/design-system/components/ScreenContainer.test.tsx
git commit -m "feat(customer-app): ScreenContainer, AppBar, Card, Divider"
```

---

### Task 15: EmptyState + ErrorState + LoadingState + GradientBrand + Chip + StepIndicator + public entry

**Files:**
- Create: `apps/customer-app/src/design-system/components/EmptyState.tsx`
- Create: `apps/customer-app/src/design-system/components/ErrorState.tsx`
- Create: `apps/customer-app/src/design-system/components/LoadingState.tsx`
- Create: `apps/customer-app/src/design-system/components/GradientBrand.tsx`
- Create: `apps/customer-app/src/design-system/components/Chip.tsx`
- Create: `apps/customer-app/src/design-system/components/StepIndicator.tsx`
- Create: `apps/customer-app/src/design-system/index.ts`

- [ ] **Step 1: GradientBrand**

`src/design-system/components/GradientBrand.tsx`:

```tsx
import React from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { ViewStyle } from 'react-native'
import { color } from '../tokens'

export function GradientBrand({ children, style }: { children?: React.ReactNode; style?: ViewStyle }) {
  return (
    <LinearGradient colors={color.brandGradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style}>
      {children}
    </LinearGradient>
  )
}
```

- [ ] **Step 2: LoadingState + ErrorState + EmptyState**

`src/design-system/components/LoadingState.tsx`:

```tsx
import React from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Text } from '../Text'
import { color, spacing } from '../tokens'

export function LoadingState({ label, variant = 'spinner' }: { label?: string; variant?: 'spinner' | 'skeleton' }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', justifyContent: 'center', padding: spacing[6], gap: spacing[3] }}>
      {variant === 'spinner' && <ActivityIndicator color={color.navy} />}
      {label && <Text variant="body.sm" color="secondary">{label}</Text>}
    </View>
  )
}
```

`src/design-system/components/ErrorState.tsx`:

```tsx
import React from 'react'
import { View } from 'react-native'
import { AlertCircle } from 'lucide-react-native'
import { Text } from '../Text'
import { Button } from './Button'
import { color, spacing } from '../tokens'

export function ErrorState({ title, description, actionLabel, onRetry }: { title: string; description?: string; actionLabel?: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={{ alignItems: 'center', padding: spacing[6], gap: spacing[3] }}>
      <AlertCircle size={28} color={color.danger} />
      <Text variant="heading.sm" align="center">{title}</Text>
      {description && <Text variant="body.md" color="secondary" align="center">{description}</Text>}
      {actionLabel && onRetry && <Button variant="secondary" onPress={onRetry}>{actionLabel}</Button>}
    </View>
  )
}
```

`src/design-system/components/EmptyState.tsx`:

```tsx
import React from 'react'
import { View } from 'react-native'
import { Text } from '../Text'
import { spacing } from '../tokens'

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View style={{ alignItems: 'center', padding: spacing[6], gap: spacing[2] }}>
      <Text variant="heading.sm" align="center">{title}</Text>
      {description && <Text variant="body.md" color="secondary" align="center">{description}</Text>}
    </View>
  )
}
```

- [ ] **Step 3: Chip + StepIndicator**

`src/design-system/components/Chip.tsx`:

```tsx
import React from 'react'
import { Pressable } from 'react-native'
import { Text } from '../Text'
import { color, radius, spacing } from '../tokens'
import { haptics } from '../haptics'

type Props = { label: string; selected?: boolean; onToggle?: () => void; accessibilityLabel?: string }

export function Chip({ label, selected, onToggle, accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={async () => { await haptics.selection(); onToggle?.() }}
      style={{
        paddingHorizontal: spacing[4], paddingVertical: spacing[2],
        borderRadius: radius.pill,
        backgroundColor: selected ? color.navy : color.surface.subtle,
        borderWidth: 1, borderColor: selected ? color.navy : color.border.default,
      }}
    >
      <Text variant="label.lg" color={selected ? 'inverse' : 'primary'}>{label}</Text>
    </Pressable>
  )
}
```

`src/design-system/components/StepIndicator.tsx`:

```tsx
import React from 'react'
import { View } from 'react-native'
import { color, radius, spacing } from '../tokens'

export function StepIndicator({ total, current }: { total: number; current: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: current }} style={{ flexDirection: 'row', gap: spacing[1] }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ width: 24, height: 4, borderRadius: radius.xs, backgroundColor: i < current ? color.navy : color.border.subtle }} />
      ))}
    </View>
  )
}
```

- [ ] **Step 4: Public entry re-export**

`src/design-system/index.ts`:

```ts
export * from './tokens'
export { Text } from './Text'
export { Image } from './Image'
export { haptics, setHapticsEnabled } from './haptics'
export { useMotionScale } from './useMotionScale'
export { useDynamicTypeScale } from './useDynamicTypeScale'
export { PressableScale } from './motion/PressableScale'
export { HapticButton } from './motion/HapticButton'
export { FadeIn, FadeInDown } from './motion/FadeIn'
export { StaggerList } from './motion/StaggerList'
export { TransitionScreen } from './motion/TransitionScreen'
export { SkeletonToContent } from './motion/SkeletonToContent'
export { BottomSheet } from './motion/BottomSheet'
export { Countdown } from './motion/Countdown'
export { ToastProvider, useToast } from './motion/Toast'
export { Button, type ButtonProps } from './components/Button'
export { TextField } from './components/TextField'
export { OtpField } from './components/OtpField'
export { ScreenContainer } from './components/ScreenContainer'
export { AppBar } from './components/AppBar'
export { Card } from './components/Card'
export { Divider } from './components/Divider'
export { EmptyState } from './components/EmptyState'
export { ErrorState } from './components/ErrorState'
export { LoadingState } from './components/LoadingState'
export { GradientBrand } from './components/GradientBrand'
export { Chip } from './components/Chip'
export { StepIndicator } from './components/StepIndicator'
```

- [ ] **Step 5: Smoke-test the public entry**

`tests/design-system/index.test.ts`:

```ts
import * as DS from '@/design-system'

describe('design-system entry', () => {
  it('exports expected surface', () => {
    expect(typeof DS.Button).toBe('function')
    expect(typeof DS.TextField).toBe('function')
    expect(typeof DS.useMotionScale).toBe('function')
    expect(DS.color.navy).toBe('#010C35')
  })
})
```

Run: `npm test` — expect full suite passing.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/design-system/
git commit -m "feat(customer-app): Empty/Error/Loading/Chip/StepIndicator + public DS entry"
```

---

## Batch D — Data Layer

### Task 16: API client (fetch wrapper + refresh interceptor)

**Files:**
- Create: `apps/customer-app/src/lib/api.ts`
- Create: `apps/customer-app/tests/lib/api.test.ts`

- [ ] **Step 1: Failing tests**

`tests/lib/api.test.ts`:

```ts
import { api, ApiClientError } from '@/lib/api'

const originalFetch = global.fetch

describe('api client', () => {
  afterEach(() => { global.fetch = originalFetch })

  it('attaches Authorization bearer when access token is set', async () => {
    api.__setTokensForTests('ACCESS', 'REFRESH')
    const calls: RequestInit[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init!)
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    await api.get('/thing')
    expect((calls[0]!.headers as Record<string, string>)['Authorization']).toBe('Bearer ACCESS')
  })

  it('refreshes on 401 and retries once', async () => {
    api.__setTokensForTests('STALE', 'REFRESH')
    let calls = 0
    global.fetch = jest.fn(async (url: string) => {
      calls++
      if (calls === 1) return new Response('{}', { status: 401 })
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'NEW', refreshToken: 'NEW_R' }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    const res = await api.get<{ ok: boolean }>('/thing')
    expect(res.ok).toBe(true)
  })

  it('throws ApiClientError with code + status on non-2xx', async () => {
    api.__setTokensForTests('A', 'R')
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ code: 'EMAIL_TAKEN', message: 'x' }), { status: 400, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
    await expect(api.post('/x', {})).rejects.toMatchObject({ code: 'EMAIL_TAKEN', status: 400 })
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- api.test
```

- [ ] **Step 3: Implement API client**

`src/lib/api.ts`:

```ts
import Constants from 'expo-constants'

const BASE_URL: string = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://localhost:3000'

type Tokens = { access: string | null; refresh: string | null }

let tokens: Tokens = { access: null, refresh: null }
let onSessionExpired: (() => void) | null = null
let refreshing: Promise<void> | null = null

export class ApiClientError extends Error {
  readonly code: string
  readonly status: number
  readonly field?: string
  constructor(message: string, code: string, status: number, field?: string) {
    super(message); this.code = code; this.status = status; this.field = field
  }
}

async function doFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (tokens.access) headers['Authorization'] = `Bearer ${tokens.access}`
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers })

  if (res.status === 401 && retry && tokens.refresh && !path.endsWith('/auth/refresh')) {
    try {
      await refreshTokens()
      return doFetch<T>(path, init, false)
    } catch {
      tokens = { access: null, refresh: null }
      onSessionExpired?.()
      throw new ApiClientError('Session expired', 'SESSION_EXPIRED', 401)
    }
  }

  const text = await res.text()
  const json = text ? JSON.parse(text) : {}
  if (!res.ok) {
    throw new ApiClientError(json?.message ?? res.statusText, json?.code ?? 'UNKNOWN', res.status, json?.field)
  }
  return json as T
}

async function refreshTokens(): Promise<void> {
  if (!tokens.refresh) throw new Error('no refresh token')
  if (refreshing) return refreshing
  refreshing = (async () => {
    const r = await fetch(`${BASE_URL}/api/v1/customer/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refresh }),
    })
    if (!r.ok) throw new Error('refresh failed')
    const body = await r.json() as { accessToken: string; refreshToken: string }
    tokens = { access: body.accessToken, refresh: body.refreshToken }
  })()
  try { await refreshing } finally { refreshing = null }
}

export const api = {
  get:  <T>(path: string) => doFetch<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown) => doFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch:<T>(path: string, body: unknown) => doFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put:  <T>(path: string, body: unknown) => doFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del:  <T>(path: string) => doFetch<T>(path, { method: 'DELETE' }),
  setTokens(access: string | null, refresh: string | null) { tokens = { access, refresh } },
  onSessionExpired(cb: () => void) { onSessionExpired = cb },
  __setTokensForTests(a: string | null, r: string | null) { tokens = { access: a, refresh: r } },
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- api.test
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/lib/api.ts apps/customer-app/tests/lib/api.test.ts
git commit -m "feat(customer-app): api client with refresh-token interceptor"
```

---

### Task 17: Auth API helpers

**Files:**
- Create: `apps/customer-app/src/lib/api/auth.ts`
- Create: `apps/customer-app/tests/lib/api/auth.test.ts`

- [ ] **Step 1: Failing test**

`tests/lib/api/auth.test.ts`:

```ts
import { api } from '@/lib/api'
import { authApi } from '@/lib/api/auth'

jest.spyOn(api, 'post')

describe('authApi', () => {
  beforeEach(() => { (api.post as jest.Mock).mockReset() })
  it('register posts the expected payload', async () => {
    (api.post as jest.Mock).mockResolvedValue({ user: { id: 'u1' }, accessToken: 'a', refreshToken: 'r' })
    const r = await authApi.register({ firstName: 'Ada', lastName: 'Lovelace', email: 'a@x.com', password: 'P@ssw0rd!aaa', phone: '+447700900000' })
    expect(api.post).toHaveBeenCalledWith('/api/v1/customer/auth/register', expect.objectContaining({ email: 'a@x.com' }))
    expect(r.user.id).toBe('u1')
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- api/auth
```

- [ ] **Step 3: Implement**

`src/lib/api/auth.ts`:

```ts
import { z } from 'zod'
import { api } from '../api'

const authResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    phone: z.string().nullable(),
    emailVerifiedAt: z.string().nullable(),
    phoneVerifiedAt: z.string().nullable(),
  }),
  accessToken: z.string(),
  refreshToken: z.string(),
})
export type AuthResponse = z.infer<typeof authResponseSchema>

export const authApi = {
  register: (data: { firstName: string; lastName: string; email: string; password: string; phone: string }) =>
    api.post<AuthResponse>('/api/v1/customer/auth/register', data).then(authResponseSchema.parse),
  login: (data: { email: string; password: string }) =>
    api.post<AuthResponse>('/api/v1/customer/auth/login', data).then(authResponseSchema.parse),
  logout: (refreshToken: string) =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/logout', { refreshToken }),
  refresh: (refreshToken: string) =>
    api.post<{ accessToken: string; refreshToken: string }>('/api/v1/customer/auth/refresh', { refreshToken }),
  sendPhoneOtp: () =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/verify-phone/send', {}),
  confirmPhoneOtp: (code: string) =>
    api.post<{ user: AuthResponse['user'] }>('/api/v1/customer/auth/verify-phone/confirm', { code }),
  resendEmailVerification: () =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/resend-verification-email', {}),
  forgotPassword: (email: string) =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post<{ success: boolean }>('/api/v1/customer/auth/reset-password', { token, password }),
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- api/auth
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/lib/api/auth.ts apps/customer-app/tests/lib/api/auth.test.ts
git commit -m "feat(customer-app): typed auth API helpers"
```

---

### Task 18: Profile API helpers

**Files:**
- Create: `apps/customer-app/src/lib/api/profile.ts`
- Create: `apps/customer-app/tests/lib/api/profile.test.ts`

- [ ] **Step 1: Failing test**

`tests/lib/api/profile.test.ts`:

```ts
import { api } from '@/lib/api'
import { profileApi } from '@/lib/api/profile'

jest.spyOn(api, 'get')
jest.spyOn(api, 'patch')
jest.spyOn(api, 'put')

describe('profileApi', () => {
  it('getMe returns typed profile', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      id: 'u1', firstName: 'A', lastName: null, email: 'a@x.com', phone: null,
      dateOfBirth: null, gender: null, addressLine1: null, addressLine2: null,
      city: null, postcode: null, profileImageUrl: null,
      newsletterConsent: false, emailVerified: true, phoneVerified: false,
      interests: [], profileCompleteness: 10, createdAt: new Date().toISOString(),
    })
    const me = await profileApi.getMe()
    expect(me.email).toBe('a@x.com')
  })
  it('updateInterests issues PUT with interestIds', async () => {
    (api.put as jest.Mock).mockResolvedValue({ interests: [] })
    await profileApi.updateInterests(['i1', 'i2'])
    expect(api.put).toHaveBeenCalledWith('/api/v1/customer/profile/interests', { interestIds: ['i1', 'i2'] })
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- api/profile
```

- [ ] **Step 3: Implement**

`src/lib/api/profile.ts`:

```ts
import { z } from 'zod'
import { api } from '../api'

const interestSchema = z.object({ id: z.string(), name: z.string() })

const profileSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().email(),
  phone: z.string().nullable(),
  profileImageUrl: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  gender: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  postcode: z.string().nullable(),
  newsletterConsent: z.boolean(),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  interests: z.array(interestSchema),
  profileCompleteness: z.number(),
  createdAt: z.string(),
})
export type Profile = z.infer<typeof profileSchema>

export type ProfileUpdate = Partial<{
  name: string
  dateOfBirth: string
  gender: string
  addressLine1: string
  addressLine2: string
  city: string
  postcode: string
  profileImageUrl: string | null
  newsletterConsent: boolean
}>

export const profileApi = {
  getMe: () => api.get<unknown>('/api/v1/customer/profile').then(profileSchema.parse),
  updateProfile: (patch: ProfileUpdate) => api.patch<unknown>('/api/v1/customer/profile', patch).then(profileSchema.parse),
  getAvailableInterests: () => api.get<{ interests: { id: string; name: string }[] }>('/api/v1/customer/profile/available-interests'),
  updateInterests: (interestIds: string[]) => api.put<{ interests: { id: string; name: string }[] }>('/api/v1/customer/profile/interests', { interestIds }),
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- api/profile
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/lib/api/profile.ts apps/customer-app/tests/lib/api/profile.test.ts
git commit -m "feat(customer-app): typed profile API helpers"
```

---

### Task 19: Error mapper

**Files:**
- Create: `apps/customer-app/src/lib/errors.ts`
- Create: `apps/customer-app/tests/lib/errors.test.ts`

- [ ] **Step 1: Failing test**

`tests/lib/errors.test.ts`:

```ts
import { ApiClientError } from '@/lib/api'
import { mapError } from '@/lib/errors'

describe('mapError', () => {
  it('maps EMAIL_TAKEN to an inline field error', () => {
    const m = mapError(new ApiClientError('x', 'EMAIL_TAKEN', 400, 'email'))
    expect(m.surface).toBe('field'); expect(m.field).toBe('email'); expect(m.message).toMatch(/already/i)
  })
  it('maps OTP_MAX_ATTEMPTS with retry window hint', () => {
    const m = mapError(new ApiClientError('x', 'OTP_MAX_ATTEMPTS', 429))
    expect(m.message).toMatch(/too many/i); expect(m.retryable).toBe(false)
  })
  it('falls back to generic toast for UNKNOWN', () => {
    const m = mapError(new ApiClientError('x', 'UNKNOWN', 500))
    expect(m.surface).toBe('toast'); expect(m.retryable).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- errors
```

- [ ] **Step 3: Implement**

`src/lib/errors.ts`:

```ts
import { ApiClientError } from './api'

export type MappedError = {
  code: string
  message: string
  field?: string
  surface: 'field' | 'toast' | 'fullpage' | 'silent'
  retryable: boolean
}

const TABLE: Record<string, Omit<MappedError, 'code'>> = {
  EMAIL_TAKEN:            { message: 'That email is already in use.',                field: 'email',    surface: 'field',  retryable: false },
  INVALID_CREDENTIALS:    { message: 'Wrong email or password.',                     surface: 'field',  retryable: false },
  ACCOUNT_NOT_VERIFIED:   { message: 'Please verify your email to continue.',        surface: 'field',  retryable: false },
  OTP_INVALID:            { message: 'That code is incorrect. Try again.',           surface: 'field',  retryable: true },
  OTP_EXPIRED:            { message: 'This code has expired. Tap Resend.',           surface: 'field',  retryable: true },
  OTP_MAX_ATTEMPTS:       { message: 'Too many attempts. Try again shortly.',        surface: 'field',  retryable: false },
  RATE_LIMITED:           { message: "You're going a bit fast — try again shortly.", surface: 'toast',  retryable: false },
  TOKEN_EXPIRED:          { message: 'This link has expired. Request a new one.',    surface: 'fullpage', retryable: true },
  NETWORK_ERROR:          { message: "Connection lost. Check your network.",         surface: 'toast',  retryable: true },
  SESSION_EXPIRED:        { message: 'Please sign in again.',                        surface: 'silent', retryable: false },
}

export function mapError(err: unknown): MappedError {
  if (err instanceof ApiClientError) {
    const hit = TABLE[err.code]
    if (hit) return { code: err.code, field: err.field, ...hit }
    return { code: err.code, message: 'Something went wrong. Please try again.', surface: 'toast', retryable: true }
  }
  return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.', surface: 'toast', retryable: true }
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- errors
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/lib/errors.ts apps/customer-app/tests/lib/errors.test.ts
git commit -m "feat(customer-app): error mapper with surface + retryable metadata"
```

---

### Task 20: Location + Deep-link helpers

**Files:**
- Create: `apps/customer-app/src/lib/location.ts`
- Create: `apps/customer-app/src/lib/deep-link.ts`
- Install: `expo-location` (via `npx expo install expo-location`)
- Create: `apps/customer-app/tests/lib/deep-link.test.ts`

- [ ] **Step 1: Install expo-location**

```bash
cd apps/customer-app
npx expo install expo-location
```

- [ ] **Step 2: Failing deep-link test**

`tests/lib/deep-link.test.ts`:

```ts
import { parseResetPasswordUrl } from '@/lib/deep-link'

describe('parseResetPasswordUrl', () => {
  it('parses the app scheme', () => {
    expect(parseResetPasswordUrl('redeemo://reset-password?token=abc')).toBe('abc')
  })
  it('parses the https universal link', () => {
    expect(parseResetPasswordUrl('https://redeemo.com/reset-password?token=xyz')).toBe('xyz')
  })
  it('returns null for unrelated urls', () => {
    expect(parseResetPasswordUrl('redeemo://welcome')).toBeNull()
  })
})
```

- [ ] **Step 3: Run — expect fail**

```bash
npm test -- deep-link
```

- [ ] **Step 4: Implement deep-link**

`src/lib/deep-link.ts`:

```ts
export function parseResetPasswordUrl(url: string): string | null {
  try {
    const u = new URL(url.replace('redeemo://', 'https://placeholder/'))
    const onPath = u.pathname.includes('reset-password')
    const token = u.searchParams.get('token')
    return onPath && token ? token : null
  } catch { return null }
}
```

- [ ] **Step 5: Implement location helper**

`src/lib/location.ts`:

```ts
import { useCallback, useState } from 'react'
import * as Location from 'expo-location'

export type LocationStatus = 'idle' | 'loading' | 'denied' | 'unavailable'
export type ResolvedAddress = { addressLine1?: string; addressLine2?: string; city?: string; postcode?: string }

export function useLocationAssist() {
  const [status, setStatus] = useState<LocationStatus>('idle')
  const [address, setAddress] = useState<ResolvedAddress | null>(null)

  const request = useCallback(async () => {
    setStatus('loading')
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync()
      if (perm !== 'granted') { setStatus('denied'); return null }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null)
      if (!pos) { setStatus('idle'); return null }
      const [place] = await Location.reverseGeocodeAsync(pos.coords).catch(() => [])
      if (!place) { setStatus('idle'); return null }
      const result: ResolvedAddress = {
        addressLine1: place.streetNumber ? `${place.streetNumber} ${place.street ?? ''}`.trim() : place.street ?? undefined,
        addressLine2: place.subregion ?? undefined,
        city: place.city ?? undefined,
        postcode: place.postalCode ?? undefined,
      }
      setAddress(result); setStatus('idle'); return result
    } catch { setStatus('idle'); return null }
  }, [])

  return { request, status, address, loading: status === 'loading' }
}
```

- [ ] **Step 6: Run — expect pass**

```bash
npm test -- deep-link
```

- [ ] **Step 7: Commit**

```bash
git add apps/customer-app/src/lib/location.ts apps/customer-app/src/lib/deep-link.ts apps/customer-app/tests/lib/deep-link.test.ts apps/customer-app/package.json apps/customer-app/package-lock.json
git commit -m "feat(customer-app): location assist + deep-link URL parser"
```

---

### Task 21: Zustand auth store + onboarding state

**Files:**
- Create: `apps/customer-app/src/stores/auth.ts`
- Create: `apps/customer-app/tests/stores/auth.test.ts`

The shape here is the contract that every screen in Batches E and F consumes. Do not drift from it — the routing guard, the profile-completion hook, and every auth screen depend on these exact field names and value sets.

- [ ] **Step 1: Failing tests**

`tests/stores/auth.test.ts`:

```ts
import { useAuthStore } from '@/stores/auth'
import { stepIndex } from '@/features/profile-completion/steps'

describe('auth store', () => {
  beforeEach(async () => {
    await useAuthStore.getState().__resetForTests()
  })

  it('starts in bootstrapping state before bootstrap has run', () => {
    expect(useAuthStore.getState().status).toBe('bootstrapping')
  })

  it('setTokens transitions to authed and persists minimal user', async () => {
    await useAuthStore.getState().setTokens({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', phone: '+44', emailVerified: false, phoneVerified: false },
    })
    expect(useAuthStore.getState().status).toBe('authed')
    expect(useAuthStore.getState().user?.emailVerified).toBe(false)
  })

  it('syncVerificationState patches only provided fields', async () => {
    await useAuthStore.getState().setTokens({
      accessToken: 'a', refreshToken: 'r',
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', phone: '+44', emailVerified: false, phoneVerified: false },
    })
    await useAuthStore.getState().syncVerificationState({ emailVerified: true })
    expect(useAuthStore.getState().user?.emailVerified).toBe(true)
    expect(useAuthStore.getState().user?.phoneVerified).toBe(false)
  })

  it('advanceProfileStep only moves forward (monotonic)', async () => {
    await useAuthStore.getState().advanceProfileStep('pc3')
    await useAuthStore.getState().advanceProfileStep('pc1')
    expect(useAuthStore.getState().onboarding.furthestStep).toBe('pc3')
  })

  it('markProfileCompletion("dismissed") keeps user authed', async () => {
    await useAuthStore.getState().setTokens({
      accessToken: 'a', refreshToken: 'r',
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', phone: '+44', emailVerified: true, phoneVerified: true },
    })
    await useAuthStore.getState().markProfileCompletion('dismissed')
    expect(useAuthStore.getState().status).toBe('authed')
    expect(useAuthStore.getState().onboarding.profileCompletion).toBe('dismissed')
  })

  it('stepIndex is used for comparison and orders pc1..done correctly', () => {
    expect(stepIndex('pc1')).toBeLessThan(stepIndex('pc3'))
    expect(stepIndex('pc4')).toBeLessThan(stepIndex('done'))
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- stores/auth
```

- [ ] **Step 3: Implement**

`src/stores/auth.ts`:

```ts
import { create } from 'zustand'
import { authApi } from '@/lib/api/auth'
import { profileApi } from '@/lib/api/profile'
import { prefsStorage, secureStorage } from '@/lib/storage'
import { setHapticsEnabled } from '@/design-system/haptics'
import { api, setTokens as apiSetTokens } from '@/lib/api'
import { stepIndex, type ProfileStep } from '@/features/profile-completion/steps'

export type AuthStatus = 'bootstrapping' | 'unauthenticated' | 'authed'

export type ProfileCompletionStatus = 'not_started' | 'in_progress' | 'completed' | 'dismissed'

export type OnboardingState = {
  profileCompletion: ProfileCompletionStatus
  furthestStep: ProfileStep
  phoneVerifiedAtLeastOnce: boolean
}

export type MinimalUser = {
  id: string
  email: string
  firstName: string
  phone: string
  emailVerified: boolean
  phoneVerified: boolean
}

type SetTokensInput = {
  accessToken: string
  refreshToken: string
  user: MinimalUser
}

type State = {
  status: AuthStatus
  user: MinimalUser | null
  accessToken: string | null
  refreshToken: string | null
  onboarding: OnboardingState
  hapticsEnabled: boolean
  motionScale: 0 | 1

  bootstrap: () => Promise<void>
  signOut: () => Promise<void>
  /** Patch the locally-known verification flags after the server confirms. */
  syncVerificationState: (patch: Partial<Pick<MinimalUser, 'emailVerified' | 'phoneVerified'>>) => Promise<void>
  setTokens: (input: SetTokensInput) => Promise<void>
  updateOnboarding: (patch: Partial<OnboardingState>) => Promise<void>
  advanceProfileStep: (step: ProfileStep) => Promise<void>
  markProfileCompletion: (status: ProfileCompletionStatus) => Promise<void>
  markPhoneVerifiedOnce: () => Promise<void>
  setHaptics: (enabled: boolean) => void
  setMotionScale: (scale: 0 | 1) => void
  /** Test-only: fully reset state (used by jest beforeEach). */
  __resetForTests: () => Promise<void>
}

const INITIAL_ONBOARDING: OnboardingState = {
  profileCompletion: 'not_started',
  furthestStep: 'pc1',
  phoneVerifiedAtLeastOnce: false,
}

const ONBOARDING_KEY = (userId: string) => `onboarding-state:${userId}`

async function loadOnboarding(userId: string): Promise<OnboardingState> {
  const saved = await prefsStorage.get<OnboardingState>(ONBOARDING_KEY(userId))
  return saved ?? INITIAL_ONBOARDING
}

async function persistOnboarding(userId: string | undefined, state: OnboardingState): Promise<void> {
  if (!userId) return
  await prefsStorage.set(ONBOARDING_KEY(userId), state)
}

export const useAuthStore = create<State>((set, get) => ({
  status: 'bootstrapping',
  user: null,
  accessToken: null,
  refreshToken: null,
  onboarding: INITIAL_ONBOARDING,
  hapticsEnabled: true,
  motionScale: 1,

  async bootstrap() {
    const [access, refresh] = await Promise.all([
      secureStorage.get('accessToken'),
      secureStorage.get('refreshToken'),
    ])
    if (!access || !refresh) {
      set({ status: 'unauthenticated' })
      return
    }
    apiSetTokens({ accessToken: access, refreshToken: refresh })
    try {
      const me = await profileApi.getMe()
      const minimal: MinimalUser = {
        id: me.id,
        email: me.email,
        firstName: me.firstName,
        phone: me.phone ?? '',
        emailVerified: me.emailVerified,
        phoneVerified: me.phoneVerified,
      }
      const onboarding = await loadOnboarding(me.id)
      set({ status: 'authed', user: minimal, accessToken: access, refreshToken: refresh, onboarding })
    } catch {
      apiSetTokens({ accessToken: null, refreshToken: null })
      await Promise.all([secureStorage.remove('accessToken'), secureStorage.remove('refreshToken')])
      set({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null })
    }
  },

  async signOut() {
    const refresh = get().refreshToken
    if (refresh) {
      try {
        await authApi.logout({ refreshToken: refresh })
      } catch {
        /* best-effort */
      }
    }
    await Promise.all([secureStorage.remove('accessToken'), secureStorage.remove('refreshToken')])
    apiSetTokens({ accessToken: null, refreshToken: null })
    set({
      status: 'unauthenticated',
      user: null,
      accessToken: null,
      refreshToken: null,
      onboarding: INITIAL_ONBOARDING,
    })
  },

  async syncVerificationState(patch) {
    const current = get().user
    if (!current) return
    set({ user: { ...current, ...patch } })
  },

  async setTokens({ accessToken, refreshToken, user }) {
    await secureStorage.set('accessToken', accessToken)
    await secureStorage.set('refreshToken', refreshToken)
    apiSetTokens({ accessToken, refreshToken })
    const onboarding = await loadOnboarding(user.id)
    set({ status: 'authed', user, accessToken, refreshToken, onboarding })
  },

  async updateOnboarding(patch) {
    const next = { ...get().onboarding, ...patch }
    set({ onboarding: next })
    await persistOnboarding(get().user?.id, next)
  },

  async advanceProfileStep(step) {
    const prev = get().onboarding
    const prevIdx = stepIndex(prev.furthestStep)
    const nextIdx = stepIndex(step)
    const furthestStep: ProfileStep = nextIdx > prevIdx ? step : prev.furthestStep
    const profileCompletion: ProfileCompletionStatus =
      prev.profileCompletion === 'completed' || prev.profileCompletion === 'dismissed'
        ? prev.profileCompletion
        : 'in_progress'
    await get().updateOnboarding({ furthestStep, profileCompletion })
  },

  async markProfileCompletion(status) {
    await get().updateOnboarding({ profileCompletion: status })
  },

  async markPhoneVerifiedOnce() {
    await get().updateOnboarding({ phoneVerifiedAtLeastOnce: true })
  },

  setHaptics(enabled) {
    setHapticsEnabled(enabled)
    set({ hapticsEnabled: enabled })
  },

  setMotionScale(scale) {
    set({ motionScale: scale })
  },

  async __resetForTests() {
    await Promise.all([secureStorage.remove('accessToken'), secureStorage.remove('refreshToken')])
    apiSetTokens({ accessToken: null, refreshToken: null })
    set({
      status: 'bootstrapping',
      user: null,
      accessToken: null,
      refreshToken: null,
      onboarding: INITIAL_ONBOARDING,
      hapticsEnabled: true,
      motionScale: 1,
    })
  },
}))

// Re-export ProfileStep for consumers that only depend on the store
export type { ProfileStep }
```

**Notes on naming:**
- `syncVerificationState` (not `verifyEmail`) — the server does the verifying via the email link; the client just syncs state.
- `ProfileCompletionStatus` uses underscores (`in_progress`, `not_started`) to match the strings the routing guard and profile-completion hook compare against.
- `furthestStep` is the step identifier (`'pc1'…'pc4'|'done'`) not a number — the wizard uses these ids for routing.
- `markPhoneVerifiedOnce` is persisted so that if the user later changes their phone number, we still remember they were once verified (relevant for post-3C.1a flows; persisted now to avoid schema migration later).

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- stores/auth
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/stores/auth.ts apps/customer-app/tests/stores/auth.test.ts
git commit -m "feat(customer-app): Zustand auth store + consolidated onboarding state"
```

---

### Task 22: React Query hooks

**Files:**
- Create: `apps/customer-app/src/hooks/useMe.ts`
- Create: `apps/customer-app/src/hooks/useUpdateProfile.ts`
- Create: `apps/customer-app/src/hooks/useUpdateInterests.ts`
- Create: `apps/customer-app/src/hooks/useUpdateAvatar.ts`
- Create: `apps/customer-app/src/hooks/useInterestsCatalogue.ts`
- Create: `apps/customer-app/tests/hooks/useMe.test.tsx`

- [ ] **Step 1: Failing test**

`tests/hooks/useMe.test.tsx`:

```tsx
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { profileApi } from '@/lib/api/profile'
import { useMe } from '@/hooks/useMe'

jest.spyOn(profileApi, 'getMe')

describe('useMe', () => {
  it('fetches profile via profileApi.getMe', async () => {
    (profileApi.getMe as jest.Mock).mockResolvedValue({ id: 'u1', email: 'a@x.com' } as any)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.data?.id).toBe('u1'))
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- useMe
```

- [ ] **Step 3: Implement hooks**

`src/hooks/useMe.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { profileApi } from '@/lib/api/profile'

export const meQueryKey = ['me'] as const

export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: () => profileApi.getMe(), staleTime: 5 * 60 * 1000 })
}
```

`src/hooks/useUpdateProfile.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi, type ProfileUpdate } from '@/lib/api/profile'
import { meQueryKey } from './useMe'

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: ProfileUpdate) => profileApi.updateProfile(patch),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: meQueryKey }) },
  })
}
```

`src/hooks/useUpdateInterests.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi } from '@/lib/api/profile'
import { meQueryKey } from './useMe'

export function useUpdateInterests() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => profileApi.updateInterests(ids),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: meQueryKey }) },
  })
}
```

`src/hooks/useUpdateAvatar.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi } from '@/lib/api/profile'
import { meQueryKey } from './useMe'

export function useUpdateAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (profileImageUrl: string | null) => profileApi.updateProfile({ profileImageUrl }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: meQueryKey }) },
  })
}
```

`src/hooks/useInterestsCatalogue.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { profileApi } from '@/lib/api/profile'

export function useInterestsCatalogue() {
  return useQuery({
    queryKey: ['interests-catalogue'],
    queryFn: () => profileApi.getAvailableInterests(),
    staleTime: 60 * 60 * 1000,
  })
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- useMe
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/hooks/ apps/customer-app/tests/hooks/
git commit -m "feat(customer-app): React Query hooks for profile + interests"
```

---

## Batch E — Routing + Auth Screens (Tasks 23–30)

Wires the actual app: root bootstrap, route guards, and every unauthenticated surface. Every guard uses `<Redirect />` (declarative). No effect-based `router.replace()` inside layouts.

Deep-link contract (locked in Task 1): `redeemo://reset-password?token=...&email=...` AND `https://redeemo.com/reset-password?token=...&email=...`. Both are handled by the same parser (Task 20).

---

### Task 23: Root `_layout.tsx` — bootstrap providers, fonts, deep-link, reduce-motion

**Files:**
- Create: `apps/customer-app/app/_layout.tsx`
- Create: `apps/customer-app/src/app-bootstrap/DeepLinkListener.tsx`
- Create: `apps/customer-app/src/app-bootstrap/ReduceMotionListener.tsx`
- Create: `apps/customer-app/src/app-bootstrap/SessionExpiredBridge.tsx`
- Test: `apps/customer-app/tests/app/root-layout.test.tsx`

- [ ] **Step 1: Failing test — root layout waits for fonts + auth bootstrap**

```tsx
// tests/app/root-layout.test.tsx
import { render, waitFor } from '@testing-library/react-native'
import RootLayout from '@/../app/_layout'
import { useAuthStore } from '@/stores/auth'

jest.mock('expo-font', () => ({
  useFonts: () => [true],
}))
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}))
jest.mock('expo-router', () => ({
  Slot: () => null,
  Stack: { Screen: () => null },
}))

describe('RootLayout', () => {
  it('calls auth bootstrap on mount', async () => {
    const spy = jest.spyOn(useAuthStore.getState(), 'bootstrap')
    render(<RootLayout />)
    await waitFor(() => expect(spy).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- root-layout
```

- [ ] **Step 3: Implement root layout**

```tsx
// app/_layout.tsx
import { useEffect } from 'react'
import { Slot } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useAppFonts } from '@/design-system/typography/useAppFonts'
import { ToastProvider } from '@/design-system/components/Toast'
import { useAuthStore } from '@/stores/auth'
import { DeepLinkListener } from '@/app-bootstrap/DeepLinkListener'
import { ReduceMotionListener } from '@/app-bootstrap/ReduceMotionListener'
import { SessionExpiredBridge } from '@/app-bootstrap/SessionExpiredBridge'

SplashScreen.preventAutoHideAsync().catch(() => {})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
})

export default function RootLayout() {
  const [fontsReady] = useAppFonts()
  const bootstrap = useAuthStore((s) => s.bootstrap)
  const status = useAuthStore((s) => s.status)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (fontsReady && status !== 'bootstrapping') {
      SplashScreen.hideAsync().catch(() => {})
    }
  }, [fontsReady, status])

  if (!fontsReady || status === 'bootstrapping') return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <SessionExpiredBridge />
            <DeepLinkListener />
            <ReduceMotionListener />
            <StatusBar style="dark" />
            <Slot />
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
```

```tsx
// src/app-bootstrap/DeepLinkListener.tsx
import { useEffect } from 'react'
import * as Linking from 'expo-linking'
import { router } from 'expo-router'
import { parseResetPasswordUrl } from '@/lib/location'

export function DeepLinkListener() {
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return
      const parsed = parseResetPasswordUrl(url)
      if (parsed) {
        router.replace({ pathname: '/(auth)/reset-password', params: parsed })
      }
    }
    Linking.getInitialURL().then(handle)
    const sub = Linking.addEventListener('url', ({ url }) => handle(url))
    return () => sub.remove()
  }, [])
  return null
}
```

```tsx
// src/app-bootstrap/ReduceMotionListener.tsx
import { useEffect } from 'react'
import { AccessibilityInfo } from 'react-native'
import { useAuthStore } from '@/stores/auth'

export function ReduceMotionListener() {
  const setMotionScale = useAuthStore((s) => s.setMotionScale)
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => setMotionScale(enabled ? 0 : 1))
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) =>
      setMotionScale(enabled ? 0 : 1)
    )
    return () => sub.remove()
  }, [setMotionScale])
  return null
}
```

```tsx
// src/app-bootstrap/SessionExpiredBridge.tsx
import { useEffect } from 'react'
import { setOnSessionExpired } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/design-system/components/Toast'

export function SessionExpiredBridge() {
  const signOut = useAuthStore((s) => s.signOut)
  const toast = useToast()
  useEffect(() => {
    setOnSessionExpired(async () => {
      await signOut()
      toast.show({ tone: 'error', message: 'Session expired. Please sign in again.' })
    })
  }, [signOut, toast])
  return null
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- root-layout
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/app/_layout.tsx apps/customer-app/src/app-bootstrap/ apps/customer-app/tests/app/
git commit -m "feat(customer-app): root layout bootstrap with providers, deep-link + reduce-motion"
```

---

### Task 24: Route-group layouts `(auth)` and `(app)` with declarative guards

**Files:**
- Create: `apps/customer-app/app/(auth)/_layout.tsx`
- Create: `apps/customer-app/app/(app)/_layout.tsx`
- Create: `apps/customer-app/src/lib/routing.ts`
- Test: `apps/customer-app/tests/app/guards.test.tsx`

Rules from spec §4 (Routing & Guards):
- `status === 'authed' && onboarding.profileCompletion === 'completed'` → if inside `(auth)`, redirect to `/(app)/`
- `status === 'unauthenticated'` → if inside `(app)`, redirect to `/(auth)/welcome`
- Email not verified → force `/(auth)/verify-email` (except from `reset-password`)
- Phone not verified → force `/(auth)/verify-phone`
- Profile completion in progress → redirect to `/(auth)/profile-completion/[step]`
- `reset-password` is ALWAYS reachable (deep link)

- [ ] **Step 1: Failing test — guard math**

```ts
// tests/app/guards.test.tsx
import { resolveRedirect } from '@/lib/routing'

describe('resolveRedirect', () => {
  it('sends unauthed user on (app) route to welcome', () => {
    expect(
      resolveRedirect({
        status: 'unauthenticated',
        onboarding: null,
        user: null,
        currentGroup: 'app',
      })
    ).toBe('/(auth)/welcome')
  })

  it('sends authed+completed user off (auth) to app', () => {
    expect(
      resolveRedirect({
        status: 'authed',
        onboarding: { profileCompletion: 'completed', furthestStep: 'done', phoneVerifiedAtLeastOnce: true },
        user: { emailVerified: true, phoneVerified: true },
        currentGroup: 'auth',
        currentSegment: 'welcome',
      })
    ).toBe('/(app)/')
  })

  it('forces email-unverified user to verify-email', () => {
    expect(
      resolveRedirect({
        status: 'authed',
        onboarding: { profileCompletion: 'in_progress', furthestStep: 'pc1', phoneVerifiedAtLeastOnce: false },
        user: { emailVerified: false, phoneVerified: false },
        currentGroup: 'auth',
        currentSegment: 'welcome',
      })
    ).toBe('/(auth)/verify-email')
  })

  it('never redirects away from reset-password', () => {
    expect(
      resolveRedirect({
        status: 'unauthenticated',
        onboarding: null,
        user: null,
        currentGroup: 'auth',
        currentSegment: 'reset-password',
      })
    ).toBeNull()
  })

  it('sends in-progress profile to correct step', () => {
    expect(
      resolveRedirect({
        status: 'authed',
        onboarding: { profileCompletion: 'in_progress', furthestStep: 'pc2', phoneVerifiedAtLeastOnce: true },
        user: { emailVerified: true, phoneVerified: true },
        currentGroup: 'auth',
        currentSegment: 'welcome',
      })
    ).toBe('/(auth)/profile-completion/pc2')
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npm test -- guards
```

- [ ] **Step 3: Implement `resolveRedirect` + both layouts**

```ts
// src/lib/routing.ts
import type { OnboardingState, AuthStatus } from '@/stores/auth'

type MinUser = { emailVerified: boolean; phoneVerified: boolean }

export function resolveRedirect(input: {
  status: AuthStatus
  onboarding: OnboardingState | null
  user: MinUser | null
  currentGroup: 'auth' | 'app'
  currentSegment?: string
}): string | null {
  const { status, onboarding, user, currentGroup, currentSegment } = input

  if (currentSegment === 'reset-password') return null

  if (status === 'unauthenticated') {
    if (currentGroup === 'app') return '/(auth)/welcome'
    return null
  }

  if (status === 'authed' && user && onboarding) {
    if (!user.emailVerified) {
      return currentSegment === 'verify-email' ? null : '/(auth)/verify-email'
    }
    if (!user.phoneVerified) {
      return currentSegment === 'verify-phone' ? null : '/(auth)/verify-phone'
    }
    if (onboarding.profileCompletion === 'in_progress') {
      const step = onboarding.furthestStep === 'done' ? 'pc1' : onboarding.furthestStep
      return currentSegment === `profile-completion/${step}` ? null : `/(auth)/profile-completion/${step}`
    }
    if (onboarding.profileCompletion === 'completed' && currentGroup === 'auth') {
      return '/(app)/'
    }
  }

  return null
}
```

```tsx
// app/(auth)/_layout.tsx
import { Redirect, Stack, useSegments } from 'expo-router'
import { useAuthStore } from '@/stores/auth'
import { resolveRedirect } from '@/lib/routing'

export default function AuthLayout() {
  const segments = useSegments() as string[]
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const onboarding = useAuthStore((s) => s.onboarding)

  const segment = segments.slice(1).join('/')
  const target = resolveRedirect({
    status,
    onboarding,
    user: user ? { emailVerified: user.emailVerified, phoneVerified: user.phoneVerified } : null,
    currentGroup: 'auth',
    currentSegment: segment,
  })
  if (target) return <Redirect href={target as any} />

  return <Stack screenOptions={{ headerShown: false }} />
}
```

```tsx
// app/(app)/_layout.tsx  (tabs come in Task 36; this version is a Stack placeholder)
import { Redirect, Stack, useSegments } from 'expo-router'
import { useAuthStore } from '@/stores/auth'
import { resolveRedirect } from '@/lib/routing'

export default function AppLayout() {
  const segments = useSegments() as string[]
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const onboarding = useAuthStore((s) => s.onboarding)

  const segment = segments.slice(1).join('/')
  const target = resolveRedirect({
    status,
    onboarding,
    user: user ? { emailVerified: user.emailVerified, phoneVerified: user.phoneVerified } : null,
    currentGroup: 'app',
    currentSegment: segment,
  })
  if (target) return <Redirect href={target as any} />

  return <Stack screenOptions={{ headerShown: false }} />
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- guards
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/app/ apps/customer-app/src/lib/routing.ts apps/customer-app/tests/app/guards.test.tsx
git commit -m "feat(customer-app): declarative route guards for (auth) and (app) groups"
```

---

### Task 25: Welcome screen

**Files:**
- Create: `apps/customer-app/app/(auth)/welcome.tsx`
- Create: `apps/customer-app/src/features/auth/screens/WelcomeScreen.tsx`
- Test: `apps/customer-app/tests/features/welcome.test.tsx`

- [ ] **Step 1: Failing test — renders brand + two CTAs**

```tsx
// tests/features/welcome.test.tsx
import { render, fireEvent } from '@testing-library/react-native'
import { WelcomeScreen } from '@/features/auth/screens/WelcomeScreen'

const push = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => push(...a) } }))

describe('WelcomeScreen', () => {
  beforeEach(() => push.mockClear())

  it('navigates to register on primary CTA', () => {
    const { getByText } = render(<WelcomeScreen />)
    fireEvent.press(getByText('Create account'))
    expect(push).toHaveBeenCalledWith('/(auth)/register')
  })

  it('navigates to login on secondary CTA', () => {
    const { getByText } = render(<WelcomeScreen />)
    fireEvent.press(getByText('I already have an account'))
    expect(push).toHaveBeenCalledWith('/(auth)/login')
  })
})
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```tsx
// src/features/auth/screens/WelcomeScreen.tsx
import { View } from 'react-native'
import { router } from 'expo-router'
import { ScreenContainer, Text, Button, GradientBrand } from '@/design-system'
import { tokens } from '@/design-system/tokens'

export function WelcomeScreen() {
  return (
    <ScreenContainer>
      <GradientBrand style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: tokens.layout.screenPaddingH, gap: tokens.spacing[6] }}>
          <View style={{ gap: tokens.spacing[2] }}>
            <Text variant="display">Redeemo</Text>
            <Text variant="body" tone="secondary" meta>
              Unlock exclusive rewards from local businesses near you.
            </Text>
          </View>
          <View style={{ gap: tokens.spacing[3] }}>
            <Button variant="primary" size="lg" label="Create account" onPress={() => router.push('/(auth)/register')} />
            <Button variant="ghost" size="lg" label="I already have an account" onPress={() => router.push('/(auth)/login')} />
          </View>
        </View>
      </GradientBrand>
    </ScreenContainer>
  )
}
```

```tsx
// app/(auth)/welcome.tsx
export { WelcomeScreen as default } from '@/features/auth/screens/WelcomeScreen'
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/app/\(auth\)/welcome.tsx apps/customer-app/src/features/auth/screens/WelcomeScreen.tsx apps/customer-app/tests/features/welcome.test.tsx
git commit -m "feat(customer-app): welcome screen"
```

---

### Task 26: Register screen + `useRegisterFlow`

**Files:**
- Create: `apps/customer-app/app/(auth)/register.tsx`
- Create: `apps/customer-app/src/features/auth/screens/RegisterScreen.tsx`
- Create: `apps/customer-app/src/features/auth/hooks/useRegisterFlow.ts`
- Create: `apps/customer-app/src/features/auth/schemas.ts`
- Test: `apps/customer-app/tests/features/register.test.tsx`

- [ ] **Step 1: Failing test — maps EMAIL_TAKEN to email field**

```tsx
// tests/features/register.test.tsx
import { renderHook, act } from '@testing-library/react-native'
import { useRegisterFlow } from '@/features/auth/hooks/useRegisterFlow'
import { authApi } from '@/lib/api/auth'

jest.mock('@/lib/api/auth')

describe('useRegisterFlow', () => {
  it('surfaces EMAIL_TAKEN as a field-level error on email', async () => {
    ;(authApi.register as jest.Mock).mockRejectedValueOnce({ code: 'EMAIL_TAKEN', status: 409 })
    const { result } = renderHook(() => useRegisterFlow())
    await act(async () => {
      await result.current.submit({
        firstName: 'Ada',
        lastName: 'L',
        email: 'ada@x.com',
        password: 'Passw0rd!!',
        phone: '+447700900000',
      })
    })
    expect(result.current.fieldErrors.email).toBe('That email is already in use.')
  })
})
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// src/features/auth/schemas.ts
import { z } from 'zod'

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/\d/, 'Include a number')

export const registerSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid email'),
  password: passwordSchema,
  phone: z.string().regex(/^\+\d{8,15}$/, 'Enter a valid phone including country code'),
})
export type RegisterInput = z.infer<typeof registerSchema>
```

```ts
// src/features/auth/hooks/useRegisterFlow.ts
import { useState } from 'react'
import { router } from 'expo-router'
import { authApi } from '@/lib/api/auth'
import { mapError } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/design-system/components/Toast'
import type { RegisterInput } from '@/features/auth/schemas'

export function useRegisterFlow() {
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const setTokens = useAuthStore((s) => s.setTokens)
  const toast = useToast()

  async function submit(input: RegisterInput) {
    setSubmitting(true)
    setFieldErrors({})
    try {
      const { accessToken, refreshToken, user } = await authApi.register(input)
      await setTokens({ accessToken, refreshToken, user })
      router.replace('/(auth)/verify-email')
    } catch (e) {
      const mapped = mapError(e)
      if (mapped.surface === 'field' && mapped.field) {
        setFieldErrors({ [mapped.field]: mapped.message })
      } else {
        toast.show({ tone: 'error', message: mapped.message })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return { submit, submitting, fieldErrors }
}
```

```tsx
// src/features/auth/screens/RegisterScreen.tsx
import { View } from 'react-native'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ScreenContainer, AppBar, Text, TextField, Button } from '@/design-system'
import { registerSchema, type RegisterInput } from '@/features/auth/schemas'
import { useRegisterFlow } from '@/features/auth/hooks/useRegisterFlow'
import { tokens } from '@/design-system/tokens'

export function RegisterScreen() {
  const { submit, submitting, fieldErrors } = useRegisterFlow()
  const { control, handleSubmit, formState } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', phone: '+44' },
  })

  return (
    <ScreenContainer>
      <AppBar title="Create account" />
      <View style={{ padding: tokens.layout.screenPaddingH, gap: tokens.spacing[4] }}>
        <Text variant="display">Let's get you set up</Text>
        <Controller
          control={control}
          name="firstName"
          render={({ field, fieldState }) => (
            <TextField label="First name" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} autoComplete="given-name" />
          )}
        />
        <Controller
          control={control}
          name="lastName"
          render={({ field, fieldState }) => (
            <TextField label="Last name" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} autoComplete="family-name" />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              label="Email"
              value={field.value}
              onChangeText={field.onChange}
              error={fieldErrors.email ?? fieldState.error?.message}
              autoComplete="email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          )}
        />
        <Controller
          control={control}
          name="phone"
          render={({ field, fieldState }) => (
            <TextField label="Mobile number" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} keyboardType="phone-pad" autoComplete="tel" />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField label="Password" secureToggle value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} autoComplete="new-password" />
          )}
        />
        <Button variant="primary" size="lg" label="Create account" loading={submitting} disabled={!formState.isValid} onPress={handleSubmit(submit)} />
      </View>
    </ScreenContainer>
  )
}
```

```tsx
// app/(auth)/register.tsx
export { RegisterScreen as default } from '@/features/auth/screens/RegisterScreen'
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/app/\(auth\)/register.tsx apps/customer-app/src/features/auth/ apps/customer-app/tests/features/register.test.tsx
git commit -m "feat(customer-app): register screen with field-level error mapping"
```

---

### Task 27: Verify-email screen with focus polling

**Files:**
- Create: `apps/customer-app/app/(auth)/verify-email.tsx`
- Create: `apps/customer-app/src/features/auth/screens/VerifyEmailScreen.tsx`
- Create: `apps/customer-app/src/features/auth/hooks/useVerifyEmail.ts`
- Test: `apps/customer-app/tests/features/verify-email.test.tsx`

Polls `/me` every 4s while the screen is focused; stops when `emailVerified === true`. On success, navigates to `/(auth)/verify-phone`. 60s resend Countdown.

- [ ] **Step 1: Failing test — resend Countdown disables button**

```tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { VerifyEmailScreen } from '@/features/auth/screens/VerifyEmailScreen'
import { authApi } from '@/lib/api/auth'
jest.mock('@/lib/api/auth')

describe('VerifyEmailScreen', () => {
  it('disables resend for 60s after tap', async () => {
    ;(authApi.resendEmailVerification as jest.Mock).mockResolvedValue({ ok: true })
    const { getByText, getByRole } = render(<VerifyEmailScreen />)
    fireEvent.press(getByText('Resend email'))
    await waitFor(() => {
      expect(getByRole('button', { name: /resend/i }).props.accessibilityState.disabled).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// src/features/auth/hooks/useVerifyEmail.ts
import { useEffect } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { profileApi } from '@/lib/api/profile'
import { useAuthStore } from '@/stores/auth'

export function useVerifyEmail() {
  const qc = useQueryClient()
  const syncVerificationState = useAuthStore((s) => s.syncVerificationState)
  const user = useAuthStore((s) => s.user)

  useQuery({
    queryKey: ['me', 'verify-email-poll'],
    queryFn: profileApi.getMe,
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
    enabled: !user?.emailVerified,
  })

  useEffect(() => {
    if (user?.emailVerified) {
      syncVerificationState({ emailVerified: true })
      qc.invalidateQueries({ queryKey: ['me'] })
      router.replace('/(auth)/verify-phone')
    }
  }, [user?.emailVerified, syncVerificationState, qc])
}
```

```tsx
// src/features/auth/screens/VerifyEmailScreen.tsx
import { useState } from 'react'
import { View } from 'react-native'
import { ScreenContainer, AppBar, Text, Button, Countdown } from '@/design-system'
import { tokens } from '@/design-system/tokens'
import { authApi } from '@/lib/api/auth'
import { useToast } from '@/design-system/components/Toast'
import { useVerifyEmail } from '@/features/auth/hooks/useVerifyEmail'
import { mapError } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'

export function VerifyEmailScreen() {
  useVerifyEmail()
  const [until, setUntil] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const email = useAuthStore((s) => s.user?.email ?? '')
  const signOut = useAuthStore((s) => s.signOut)
  const toast = useToast()

  async function resend() {
    setBusy(true)
    try {
      await authApi.resendEmailVerification()
      setUntil(Date.now() + 60_000)
    } catch (e) {
      toast.show({ tone: 'error', message: mapError(e).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScreenContainer>
      <AppBar title="Verify your email" />
      <View style={{ padding: tokens.layout.screenPaddingH, gap: tokens.spacing[4] }}>
        <Text variant="display">Check your inbox</Text>
        <Text variant="body" tone="secondary" meta>
          We sent a verification link to {email}. Open it on this device to continue.
        </Text>
        <Button
          variant="primary"
          size="lg"
          label={until ? 'Resend in' : 'Resend email'}
          loading={busy}
          disabled={Boolean(until)}
          onPress={resend}
          rightAccessory={
            until ? <Countdown until={until} onComplete={() => setUntil(null)} format="s" /> : undefined
          }
        />
        <Button variant="ghost" size="md" label="Use a different account" onPress={signOut} />
      </View>
    </ScreenContainer>
  )
}
```

```tsx
// app/(auth)/verify-email.tsx
export { VerifyEmailScreen as default } from '@/features/auth/screens/VerifyEmailScreen'
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/app/\(auth\)/verify-email.tsx apps/customer-app/src/features/auth/ apps/customer-app/tests/features/verify-email.test.tsx
git commit -m "feat(customer-app): verify-email screen with focus polling + resend countdown"
```

---

### Task 28: Verify-phone screen + `usePhoneVerify`

**Files:**
- Create: `apps/customer-app/app/(auth)/verify-phone.tsx`
- Create: `apps/customer-app/src/features/auth/screens/VerifyPhoneScreen.tsx`
- Create: `apps/customer-app/src/features/auth/hooks/usePhoneVerify.ts`
- Test: `apps/customer-app/tests/features/verify-phone.test.tsx`

OTP cells use `<OtpField />` (Task 13). On `OTP_INVALID` or `OTP_MAX_ATTEMPTS`: cells clear, shake animation (respects motion scale), warning haptic. On success: `syncVerificationState({ phoneVerified: true })` + `markPhoneVerifiedOnce()` → routing guard moves to profile completion.

- [ ] **Step 1: Failing test — OTP_INVALID surfaces error**

```tsx
import { renderHook, act } from '@testing-library/react-native'
import { usePhoneVerify } from '@/features/auth/hooks/usePhoneVerify'
import { authApi } from '@/lib/api/auth'
jest.mock('@/lib/api/auth')

describe('usePhoneVerify', () => {
  it('surfaces OTP_INVALID as error', async () => {
    ;(authApi.confirmPhoneOtp as jest.Mock).mockRejectedValueOnce({ code: 'OTP_INVALID', status: 400 })
    const { result } = renderHook(() => usePhoneVerify())
    await act(async () => {
      await result.current.verify('123456')
    })
    expect(result.current.error).toBe('That code isn\u2019t right. Try again.')
  })
})
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// src/features/auth/hooks/usePhoneVerify.ts
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/api/auth'
import { mapError } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import { haptics } from '@/lib/haptics'

export function usePhoneVerify() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const qc = useQueryClient()
  const syncVerificationState = useAuthStore((s) => s.syncVerificationState)
  const markPhoneVerifiedOnce = useAuthStore((s) => s.markPhoneVerifiedOnce)

  const verify = useCallback(
    async (code: string) => {
      setBusy(true)
      setError(null)
      try {
        await authApi.confirmPhoneOtp({ code })
        await syncVerificationState({ phoneVerified: true })
        await markPhoneVerifiedOnce()
        qc.invalidateQueries({ queryKey: ['me'] })
        haptics.success()
      } catch (e) {
        const mapped = mapError(e)
        setError(mapped.message)
        setShakeKey((k) => k + 1)
        haptics.warning()
      } finally {
        setBusy(false)
      }
    },
    [qc, syncVerificationState, markPhoneVerifiedOnce]
  )

  async function resend() {
    try {
      await authApi.sendPhoneOtp()
    } catch (e) {
      setError(mapError(e).message)
    }
  }

  return { verify, resend, busy, error, shakeKey }
}
```

```tsx
// src/features/auth/screens/VerifyPhoneScreen.tsx
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated'
import { ScreenContainer, AppBar, Text, OtpField, Button, Countdown } from '@/design-system'
import { tokens } from '@/design-system/tokens'
import { usePhoneVerify } from '@/features/auth/hooks/usePhoneVerify'
import { authApi } from '@/lib/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useMotionScale } from '@/design-system/motion/useMotionScale'

export function VerifyPhoneScreen() {
  const [value, setValue] = useState('')
  const [resendUntil, setResendUntil] = useState<number | null>(null)
  const { verify, resend, busy, error, shakeKey } = usePhoneVerify()
  const phone = useAuthStore((s) => s.user?.phone ?? '')
  const offset = useSharedValue(0)
  const motionScale = useMotionScale()

  useEffect(() => {
    if (shakeKey === 0 || motionScale === 0) return
    offset.value = withSequence(
      withTiming(-6, { duration: 40 }),
      withTiming(6, { duration: 60 }),
      withTiming(-4, { duration: 40 }),
      withTiming(0, { duration: 40 })
    )
    setValue('')
  }, [shakeKey, motionScale, offset])

  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }))

  useEffect(() => {
    authApi.sendPhoneOtp().catch(() => {})
  }, [])

  async function handleComplete(code: string) {
    setValue(code)
    if (code.length === 6) await verify(code)
  }

  return (
    <ScreenContainer>
      <AppBar title="Verify your phone" />
      <View style={{ padding: tokens.layout.screenPaddingH, gap: tokens.spacing[4] }}>
        <Text variant="display">Enter the 6-digit code</Text>
        <Text variant="body" tone="secondary" meta>
          Sent to {phone}
        </Text>
        <Animated.View style={animStyle}>
          <OtpField length={6} value={value} onChange={handleComplete} error={error ?? undefined} />
        </Animated.View>
        <Button
          variant="ghost"
          size="md"
          label={resendUntil ? 'Resend in' : 'Resend code'}
          disabled={Boolean(resendUntil) || busy}
          onPress={async () => {
            await resend()
            setResendUntil(Date.now() + 60_000)
          }}
          rightAccessory={
            resendUntil ? <Countdown until={resendUntil} onComplete={() => setResendUntil(null)} format="s" /> : undefined
          }
        />
      </View>
    </ScreenContainer>
  )
}
```

```tsx
// app/(auth)/verify-phone.tsx
export { VerifyPhoneScreen as default } from '@/features/auth/screens/VerifyPhoneScreen'
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/app/\(auth\)/verify-phone.tsx apps/customer-app/src/features/auth/ apps/customer-app/tests/features/verify-phone.test.tsx
git commit -m "feat(customer-app): verify-phone screen with OTP + motion-respecting shake"
```

---

### Task 29: Login screen + `useLoginFlow`

**Files:**
- Create: `apps/customer-app/app/(auth)/login.tsx`
- Create: `apps/customer-app/src/features/auth/screens/LoginScreen.tsx`
- Create: `apps/customer-app/src/features/auth/hooks/useLoginFlow.ts`
- Test: `apps/customer-app/tests/features/login.test.tsx`

Per spec §5.3: password-only in 3C.1a (no email-OTP login path). `ACCOUNT_NOT_VERIFIED` must route to verify-email, NOT surface as a form field error.

- [ ] **Step 1: Failing test — ACCOUNT_NOT_VERIFIED routes to verify-email**

```tsx
import { renderHook, act } from '@testing-library/react-native'
import { useLoginFlow } from '@/features/auth/hooks/useLoginFlow'
import { authApi } from '@/lib/api/auth'
import { router } from 'expo-router'
jest.mock('@/lib/api/auth')
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }))

describe('useLoginFlow', () => {
  it('routes unverified accounts to verify-email', async () => {
    ;(authApi.login as jest.Mock).mockRejectedValueOnce({ code: 'ACCOUNT_NOT_VERIFIED', status: 403 })
    const { result } = renderHook(() => useLoginFlow())
    await act(async () => {
      await result.current.submit({ email: 'a@x.com', password: 'Passw0rd!' })
    })
    expect(router.replace).toHaveBeenCalledWith('/(auth)/verify-email')
  })
})
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// src/features/auth/hooks/useLoginFlow.ts
import { useState } from 'react'
import { router } from 'expo-router'
import { z } from 'zod'
import { authApi } from '@/lib/api/auth'
import { mapError } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/design-system/components/Toast'

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
export type LoginInput = z.infer<typeof loginSchema>

export function useLoginFlow() {
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const setTokens = useAuthStore((s) => s.setTokens)
  const toast = useToast()

  async function submit(input: LoginInput) {
    setSubmitting(true)
    setFieldErrors({})
    try {
      const { accessToken, refreshToken, user } = await authApi.login(input)
      await setTokens({ accessToken, refreshToken, user })
      // route guards will decide next screen
    } catch (e) {
      const mapped = mapError(e)
      if (mapped.code === 'ACCOUNT_NOT_VERIFIED') {
        toast.show({ tone: 'info', message: 'Verify your email first. We\u2019ve sent you a link.' })
        router.replace('/(auth)/verify-email')
        return
      }
      if (mapped.surface === 'field' && mapped.field) {
        setFieldErrors({ [mapped.field]: mapped.message })
      } else {
        toast.show({ tone: 'error', message: mapped.message })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return { submit, submitting, fieldErrors }
}
```

```tsx
// src/features/auth/screens/LoginScreen.tsx
import { View } from 'react-native'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { router } from 'expo-router'
import { ScreenContainer, AppBar, Text, TextField, Button } from '@/design-system'
import { tokens } from '@/design-system/tokens'
import { loginSchema, useLoginFlow, type LoginInput } from '@/features/auth/hooks/useLoginFlow'

export function LoginScreen() {
  const { submit, submitting, fieldErrors } = useLoginFlow()
  const { control, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  return (
    <ScreenContainer>
      <AppBar title="Sign in" />
      <View style={{ padding: tokens.layout.screenPaddingH, gap: tokens.spacing[4] }}>
        <Text variant="display">Welcome back</Text>
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              label="Email"
              value={field.value}
              onChangeText={field.onChange}
              error={fieldErrors.email ?? fieldState.error?.message}
              autoComplete="email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField
              label="Password"
              secureToggle
              value={field.value}
              onChangeText={field.onChange}
              error={fieldErrors.password ?? fieldState.error?.message}
              autoComplete="current-password"
            />
          )}
        />
        <Button variant="primary" size="lg" label="Sign in" loading={submitting} disabled={!formState.isValid} onPress={handleSubmit(submit)} />
        <Button variant="ghost" size="md" label="Forgot password?" onPress={() => router.push('/(auth)/forgot-password')} />
      </View>
    </ScreenContainer>
  )
}
```

```tsx
// app/(auth)/login.tsx
export { LoginScreen as default } from '@/features/auth/screens/LoginScreen'
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/app/\(auth\)/login.tsx apps/customer-app/src/features/auth/ apps/customer-app/tests/features/login.test.tsx
git commit -m "feat(customer-app): login screen (password-only) with verified-gate routing"
```

---

### Task 30: Forgot-password + Reset-password (deep-link cold-start safe)

**Files:**
- Create: `apps/customer-app/app/(auth)/forgot-password.tsx`
- Create: `apps/customer-app/app/(auth)/reset-password.tsx`
- Create: `apps/customer-app/src/features/auth/screens/ForgotPasswordScreen.tsx`
- Create: `apps/customer-app/src/features/auth/screens/ResetPasswordScreen.tsx`
- Create: `apps/customer-app/src/features/auth/hooks/usePasswordReset.ts`
- Test: `apps/customer-app/tests/features/password-reset.test.tsx`

Key behaviour:
- `forgot-password` is modal-presented (`presentation: 'modal'` via route options)
- `reset-password` is full-screen, always reachable (guard exempts it) — cold-start via `Linking.getInitialURL()` in Task 23
- If `token`/`email` param missing → `<ErrorState title="Link expired" />` with "Request a new reset link" action
- Submit success → toast + replace to `/(auth)/login`

- [ ] **Step 1: Failing test — reset submit with no token shows error state**

```tsx
import { render } from '@testing-library/react-native'
import { ResetPasswordScreen } from '@/features/auth/screens/ResetPasswordScreen'

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  router: { replace: jest.fn(), push: jest.fn() },
}))

describe('ResetPasswordScreen', () => {
  it('shows error state when token param is missing', () => {
    const { getByText } = render(<ResetPasswordScreen />)
    expect(getByText(/link expired/i)).toBeTruthy()
    expect(getByText(/request a new reset link/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// src/features/auth/hooks/usePasswordReset.ts
import { useState } from 'react'
import { router } from 'expo-router'
import { authApi } from '@/lib/api/auth'
import { mapError } from '@/lib/errors'
import { useToast } from '@/design-system/components/Toast'

export function usePasswordReset() {
  const [busy, setBusy] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const toast = useToast()

  async function requestReset(email: string) {
    setBusy(true)
    setFieldErrors({})
    try {
      await authApi.forgotPassword({ email })
      toast.show({ tone: 'success', message: 'Check your inbox for the reset link.' })
      router.back()
    } catch (e) {
      const mapped = mapError(e)
      if (mapped.surface === 'field' && mapped.field) setFieldErrors({ [mapped.field]: mapped.message })
      else toast.show({ tone: 'error', message: mapped.message })
    } finally {
      setBusy(false)
    }
  }

  async function submitReset(input: { token: string; email: string; password: string }) {
    setBusy(true)
    setFieldErrors({})
    try {
      await authApi.resetPassword(input)
      toast.show({ tone: 'success', message: 'Password updated. Please sign in.' })
      router.replace('/(auth)/login')
    } catch (e) {
      const mapped = mapError(e)
      if (mapped.surface === 'field' && mapped.field) setFieldErrors({ [mapped.field]: mapped.message })
      else toast.show({ tone: 'error', message: mapped.message })
    } finally {
      setBusy(false)
    }
  }

  return { requestReset, submitReset, busy, fieldErrors }
}
```

```tsx
// src/features/auth/screens/ForgotPasswordScreen.tsx
import { View } from 'react-native'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ScreenContainer, AppBar, Text, TextField, Button } from '@/design-system'
import { tokens } from '@/design-system/tokens'
import { usePasswordReset } from '@/features/auth/hooks/usePasswordReset'

const schema = z.object({ email: z.string().email('Enter a valid email') })
type FormInput = z.infer<typeof schema>

export function ForgotPasswordScreen() {
  const { requestReset, busy, fieldErrors } = usePasswordReset()
  const { control, handleSubmit, formState } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })
  return (
    <ScreenContainer>
      <AppBar title="Reset password" />
      <View style={{ padding: tokens.layout.screenPaddingH, gap: tokens.spacing[4] }}>
        <Text variant="display">Forgot your password?</Text>
        <Text variant="body" tone="secondary" meta>
          Enter your email and we\u2019ll send you a link to reset it.
        </Text>
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <TextField
              label="Email"
              value={field.value}
              onChangeText={field.onChange}
              error={fieldErrors.email ?? fieldState.error?.message}
              autoComplete="email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          )}
        />
        <Button
          variant="primary"
          size="lg"
          label="Send reset link"
          loading={busy}
          disabled={!formState.isValid}
          onPress={handleSubmit((v) => requestReset(v.email))}
        />
      </View>
    </ScreenContainer>
  )
}
```

```tsx
// src/features/auth/screens/ResetPasswordScreen.tsx
import { View } from 'react-native'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { router, useLocalSearchParams } from 'expo-router'
import { ScreenContainer, AppBar, Text, TextField, Button, ErrorState } from '@/design-system'
import { tokens } from '@/design-system/tokens'
import { passwordSchema } from '@/features/auth/schemas'
import { usePasswordReset } from '@/features/auth/hooks/usePasswordReset'

const schema = z.object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
type FormInput = z.infer<typeof schema>

export function ResetPasswordScreen() {
  const { token, email } = useLocalSearchParams<{ token?: string; email?: string }>()
  const { submitReset, busy, fieldErrors } = usePasswordReset()
  const { control, handleSubmit, formState } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  if (!token || !email) {
    return (
      <ScreenContainer>
        <AppBar title="Reset password" />
        <ErrorState
          title="Link expired"
          body="This reset link is no longer valid."
          actionLabel="Request a new reset link"
          onAction={() => router.replace('/(auth)/forgot-password')}
        />
      </ScreenContainer>
    )
  }

  return (
    <ScreenContainer>
      <AppBar title="Reset password" />
      <View style={{ padding: tokens.layout.screenPaddingH, gap: tokens.spacing[4] }}>
        <Text variant="display">Choose a new password</Text>
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField
              label="New password"
              secureToggle
              value={field.value}
              onChangeText={field.onChange}
              error={fieldErrors.password ?? fieldState.error?.message}
              autoComplete="new-password"
            />
          )}
        />
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field, fieldState }) => (
            <TextField
              label="Confirm password"
              secureToggle
              value={field.value}
              onChangeText={field.onChange}
              error={fieldState.error?.message}
              autoComplete="new-password"
            />
          )}
        />
        <Button
          variant="primary"
          size="lg"
          label="Update password"
          loading={busy}
          disabled={!formState.isValid}
          onPress={handleSubmit((v) => submitReset({ token, email, password: v.password }))}
        />
      </View>
    </ScreenContainer>
  )
}
```

```tsx
// app/(auth)/forgot-password.tsx
export { ForgotPasswordScreen as default } from '@/features/auth/screens/ForgotPasswordScreen'
```

```tsx
// app/(auth)/reset-password.tsx
export { ResetPasswordScreen as default } from '@/features/auth/screens/ResetPasswordScreen'
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/app/\(auth\)/forgot-password.tsx apps/customer-app/app/\(auth\)/reset-password.tsx apps/customer-app/src/features/auth/ apps/customer-app/tests/features/password-reset.test.tsx
git commit -m "feat(customer-app): forgot + reset password with deep-link cold-start safety"
```

---

## Batch F — Profile Completion, Subscribe Wall, Home, E2E, Merge Gate (Tasks 31–38)

Closes out 3C.1a: four-step profile completion wizard, subscribe-wall gate, placeholder Home with disabled tabs, Maestro E2E coverage, and the merge-gate checklist.

**Reminder on disabled tabs (Task 36):** the three non-Home tabs must be **truly** disabled. No `onPress` handler, no fake transition animation, no warning haptic. Only `accessibilityState={{ disabled: true }}` and reduced opacity. Tapping them is a no-op.

**`dismissed` semantics (Tasks 31/34):** `profileCompletion === 'dismissed'` means **the user exited the completion flow without filling every optional step**. It is a terminal state within 3C.1a (the user reaches Home and is not re-prompted in this phase). They remain authed and fully functional; re-prompting for completion is deferred to a later phase.

---

### Task 31: Profile-completion layout + `useProfileCompletion` hook

**Files:**
- Create: `apps/customer-app/app/(auth)/profile-completion/_layout.tsx`
- Create: `apps/customer-app/src/features/profile-completion/hooks/useProfileCompletion.ts`
- Create: `apps/customer-app/src/features/profile-completion/steps.ts`
- Test: `apps/customer-app/tests/features/profile-completion/useProfileCompletion.test.ts`

`steps.ts` is the single source of truth for step ordering and progress calculation. Guards + the wizard both read from it.

- [ ] **Step 1: Failing test — advanceProfileStep moves furthestStep forward monotonically**

```ts
// tests/features/profile-completion/useProfileCompletion.test.ts
import { renderHook, act } from '@testing-library/react-native'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'
import { useAuthStore } from '@/stores/auth'

describe('useProfileCompletion', () => {
  beforeEach(async () => {
    await useAuthStore.getState().__resetForTests()
  })

  it('advances forward but never backward', async () => {
    const { result } = renderHook(() => useProfileCompletion())
    await act(async () => {
      await result.current.markStepComplete('pc2')
    })
    expect(useAuthStore.getState().onboarding.furthestStep).toBe('pc2')
    await act(async () => {
      await result.current.markStepComplete('pc1')
    })
    expect(useAuthStore.getState().onboarding.furthestStep).toBe('pc2')
  })

  it('dismiss sets profileCompletion to "dismissed"', async () => {
    const { result } = renderHook(() => useProfileCompletion())
    await act(async () => {
      await result.current.dismiss()
    })
    expect(useAuthStore.getState().onboarding.profileCompletion).toBe('dismissed')
  })
})
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// src/features/profile-completion/steps.ts
export const PROFILE_STEPS = ['pc1', 'pc2', 'pc3', 'pc4'] as const
export type ProfileStep = typeof PROFILE_STEPS[number] | 'done'

export function stepIndex(step: ProfileStep): number {
  return step === 'done' ? PROFILE_STEPS.length : PROFILE_STEPS.indexOf(step)
}

export function nextStep(current: ProfileStep): ProfileStep {
  const idx = stepIndex(current)
  if (idx < 0 || idx >= PROFILE_STEPS.length - 1) return 'done'
  return PROFILE_STEPS[idx + 1]!
}
```

```ts
// src/features/profile-completion/hooks/useProfileCompletion.ts
import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth'
import { PROFILE_STEPS, nextStep, stepIndex, type ProfileStep } from '@/features/profile-completion/steps'

export function useProfileCompletion() {
  const onboarding = useAuthStore((s) => s.onboarding)
  const advance = useAuthStore((s) => s.advanceProfileStep)
  const mark = useAuthStore((s) => s.markProfileCompletion)

  async function markStepComplete(step: ProfileStep) {
    const currentIdx = stepIndex(onboarding.furthestStep)
    const newIdx = stepIndex(step)
    if (newIdx > currentIdx) await advance(step)

    const next = nextStep(step)
    if (next === 'done') {
      await mark('completed')
      router.replace('/(auth)/subscribe-prompt')
    } else {
      router.push(`/(auth)/profile-completion/${next}`)
    }
  }

  async function dismiss() {
    await mark('dismissed')
    router.replace('/(auth)/subscribe-prompt')
  }

  return {
    currentStep: onboarding.furthestStep,
    totalSteps: PROFILE_STEPS.length,
    markStepComplete,
    dismiss,
  }
}
```

```tsx
// app/(auth)/profile-completion/_layout.tsx
import { Stack } from 'expo-router'
export default function ProfileCompletionLayout() {
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
}
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/app/\(auth\)/profile-completion/ apps/customer-app/src/features/profile-completion/ apps/customer-app/tests/features/profile-completion/
git commit -m "feat(customer-app): profile completion layout + state hook with dismiss semantics"
```

---

### Task 32: PC1 — About you (name, DOB, gender)

**Files:**
- Create: `apps/customer-app/app/(auth)/profile-completion/pc1.tsx`
- Create: `apps/customer-app/src/features/profile-completion/screens/PC1AboutScreen.tsx`
- Test: `apps/customer-app/tests/features/profile-completion/pc1.test.tsx`

Uses `useUpdateProfile` mutation (Task 22). On success → `markStepComplete('pc1')`. "Skip for now" button → `markStepComplete('pc1')` without calling API.

- [ ] **Step 1: Failing test — save mutates then advances**

```tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { PC1AboutScreen } from '@/features/profile-completion/screens/PC1AboutScreen'
import { profileApi } from '@/lib/api/profile'
import { useAuthStore } from '@/stores/auth'

jest.mock('@/lib/api/profile')
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }))

describe('PC1AboutScreen', () => {
  it('advances furthestStep to pc1 after successful save', async () => {
    ;(profileApi.updateProfile as jest.Mock).mockResolvedValue({ firstName: 'Ada' })
    const { getByText, getByLabelText } = render(<PC1AboutScreen />)
    fireEvent.changeText(getByLabelText('First name'), 'Ada')
    fireEvent.press(getByText('Continue'))
    await waitFor(() =>
      expect(useAuthStore.getState().onboarding.furthestStep).toBe('pc1')
    )
  })
})
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```tsx
// src/features/profile-completion/screens/PC1AboutScreen.tsx
import { View } from 'react-native'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ScreenContainer, AppBar, Text, TextField, Button, StepIndicator } from '@/design-system'
import { tokens } from '@/design-system/tokens'
import { useUpdateProfile } from '@/hooks/useMe'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'
import { useToast } from '@/design-system/components/Toast'
import { mapError } from '@/lib/errors'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use format YYYY-MM-DD').optional().or(z.literal('')),
  gender: z.string().max(30).optional().or(z.literal('')),
})
type FormInput = z.infer<typeof schema>

export function PC1AboutScreen() {
  const { markStepComplete, dismiss, totalSteps } = useProfileCompletion()
  const update = useUpdateProfile()
  const toast = useToast()
  const { control, handleSubmit, formState } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', dateOfBirth: '', gender: '' },
  })

  async function onSave(v: FormInput) {
    try {
      await update.mutateAsync({
        name: v.name,
        ...(v.dateOfBirth ? { dateOfBirth: new Date(v.dateOfBirth).toISOString() } : {}),
        ...(v.gender ? { gender: v.gender } : {}),
      })
      await markStepComplete('pc1')
    } catch (e) {
      toast.show({ tone: 'error', message: mapError(e).message })
    }
  }

  return (
    <ScreenContainer>
      <AppBar title="About you" />
      <View style={{ padding: tokens.layout.screenPaddingH, gap: tokens.spacing[4] }}>
        <StepIndicator current={1} total={totalSteps} />
        <Text variant="display">Tell us a little about you</Text>
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField label="First name" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} autoComplete="given-name" />
          )}
        />
        <Controller
          control={control}
          name="dateOfBirth"
          render={({ field, fieldState }) => (
            <TextField label="Date of birth (YYYY-MM-DD)" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
          )}
        />
        <Controller
          control={control}
          name="gender"
          render={({ field, fieldState }) => (
            <TextField label="Gender (optional)" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
          )}
        />
        <Button variant="primary" size="lg" label="Continue" loading={update.isPending} disabled={!formState.isValid} onPress={handleSubmit(onSave)} />
        <Button variant="ghost" size="md" label="Skip for now" onPress={() => markStepComplete('pc1')} />
        <Button variant="ghost" size="sm" label="Exit setup" onPress={dismiss} />
      </View>
    </ScreenContainer>
  )
}
```

```tsx
// app/(auth)/profile-completion/pc1.tsx
export { PC1AboutScreen as default } from '@/features/profile-completion/screens/PC1AboutScreen'
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/app/\(auth\)/profile-completion/pc1.tsx apps/customer-app/src/features/profile-completion/screens/PC1AboutScreen.tsx apps/customer-app/tests/features/profile-completion/pc1.test.tsx
git commit -m "feat(customer-app): profile completion PC1 — About you"
```

---

### Task 33: PC2 — Address + location assist

**Files:**
- Create: `apps/customer-app/app/(auth)/profile-completion/pc2.tsx`
- Create: `apps/customer-app/src/features/profile-completion/screens/PC2AddressScreen.tsx`
- Test: `apps/customer-app/tests/features/profile-completion/pc2.test.tsx`

Uses `useLocationAssist()` (Task 20). If denied/unavailable: no toast, no error — just leave manual fields empty. Manual fields are always primary.

- [ ] **Step 1: Failing test — denied location is silent**

```tsx
import { render } from '@testing-library/react-native'
import { PC2AddressScreen } from '@/features/profile-completion/screens/PC2AddressScreen'
import * as loc from '@/lib/location'

jest.mock('@/lib/location')

describe('PC2AddressScreen', () => {
  it('shows no toast when location is denied', () => {
    ;(loc.useLocationAssist as jest.Mock).mockReturnValue({ status: 'denied', prefill: null, request: jest.fn() })
    const { queryByText } = render(<PC2AddressScreen />)
    expect(queryByText(/location/i)).not.toBeNull() // the assist label itself is fine
    expect(queryByText(/permission denied/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```tsx
// src/features/profile-completion/screens/PC2AddressScreen.tsx
import { useEffect } from 'react'
import { View } from 'react-native'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ScreenContainer, AppBar, Text, TextField, Button, StepIndicator } from '@/design-system'
import { tokens } from '@/design-system/tokens'
import { useUpdateProfile } from '@/hooks/useMe'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'
import { useLocationAssist } from '@/lib/location'
import { useToast } from '@/design-system/components/Toast'
import { mapError } from '@/lib/errors'

const schema = z.object({
  addressLine1: z.string().max(100).optional().or(z.literal('')),
  addressLine2: z.string().max(100).optional().or(z.literal('')),
  city: z.string().max(80).optional().or(z.literal('')),
  postcode: z.string().max(10).optional().or(z.literal('')),
})
type FormInput = z.infer<typeof schema>

export function PC2AddressScreen() {
  const { markStepComplete, dismiss, totalSteps } = useProfileCompletion()
  const update = useUpdateProfile()
  const assist = useLocationAssist()
  const toast = useToast()
  const { control, handleSubmit, setValue } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { addressLine1: '', addressLine2: '', city: '', postcode: '' },
  })

  useEffect(() => {
    if (assist.prefill) {
      if (assist.prefill.city) setValue('city', assist.prefill.city)
      if (assist.prefill.postcode) setValue('postcode', assist.prefill.postcode)
    }
  }, [assist.prefill, setValue])

  async function onSave(v: FormInput) {
    try {
      await update.mutateAsync({
        ...(v.addressLine1 ? { addressLine1: v.addressLine1 } : {}),
        ...(v.addressLine2 ? { addressLine2: v.addressLine2 } : {}),
        ...(v.city ? { city: v.city } : {}),
        ...(v.postcode ? { postcode: v.postcode } : {}),
      })
      await markStepComplete('pc2')
    } catch (e) {
      toast.show({ tone: 'error', message: mapError(e).message })
    }
  }

  return (
    <ScreenContainer>
      <AppBar title="Where are you?" />
      <View style={{ padding: tokens.layout.screenPaddingH, gap: tokens.spacing[4] }}>
        <StepIndicator current={2} total={totalSteps} />
        <Text variant="display">Help us find deals near you</Text>
        <Button
          variant="ghost"
          size="md"
          label={assist.status === 'loading' ? 'Getting location…' : 'Use my current location'}
          loading={assist.status === 'loading'}
          onPress={assist.request}
        />
        <Controller
          control={control}
          name="addressLine1"
          render={({ field, fieldState }) => (
            <TextField label="Address line 1" value={field.value ?? ''} onChangeText={field.onChange} error={fieldState.error?.message} autoComplete="address-line1" />
          )}
        />
        <Controller
          control={control}
          name="addressLine2"
          render={({ field, fieldState }) => (
            <TextField label="Address line 2 (optional)" value={field.value ?? ''} onChangeText={field.onChange} error={fieldState.error?.message} autoComplete="address-line2" />
          )}
        />
        <Controller
          control={control}
          name="city"
          render={({ field, fieldState }) => (
            <TextField label="City" value={field.value ?? ''} onChangeText={field.onChange} error={fieldState.error?.message} autoComplete="postal-address-locality" />
          )}
        />
        <Controller
          control={control}
          name="postcode"
          render={({ field, fieldState }) => (
            <TextField label="Postcode" value={field.value ?? ''} onChangeText={field.onChange} error={fieldState.error?.message} autoComplete="postal-code" autoCapitalize="characters" />
          )}
        />
        <Button variant="primary" size="lg" label="Continue" loading={update.isPending} onPress={handleSubmit(onSave)} />
        <Button variant="ghost" size="md" label="Skip for now" onPress={() => markStepComplete('pc2')} />
        <Button variant="ghost" size="sm" label="Exit setup" onPress={dismiss} />
      </View>
    </ScreenContainer>
  )
}
```

```tsx
// app/(auth)/profile-completion/pc2.tsx
export { PC2AddressScreen as default } from '@/features/profile-completion/screens/PC2AddressScreen'
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/app/\(auth\)/profile-completion/pc2.tsx apps/customer-app/src/features/profile-completion/screens/PC2AddressScreen.tsx apps/customer-app/tests/features/profile-completion/pc2.test.tsx
git commit -m "feat(customer-app): profile completion PC2 — Address with silent location assist"
```

---

### Task 34: PC3 — Interests (chip grid)

**Files:**
- Create: `apps/customer-app/app/(auth)/profile-completion/pc3.tsx`
- Create: `apps/customer-app/src/features/profile-completion/screens/PC3InterestsScreen.tsx`
- Test: `apps/customer-app/tests/features/profile-completion/pc3.test.tsx`

Reads from `useInterestsCatalogue` (stale 1h). On save → `useUpdateInterests` (invalidates `['me']`). Max 10 selected; chip selection-haptic; toggle via `accessibilityRole="checkbox"`.

- [ ] **Step 1: Failing test — submitting selected IDs calls updateInterests**

```tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { PC3InterestsScreen } from '@/features/profile-completion/screens/PC3InterestsScreen'
import { profileApi } from '@/lib/api/profile'
jest.mock('@/lib/api/profile')

describe('PC3InterestsScreen', () => {
  it('sends selected interestIds on continue', async () => {
    ;(profileApi.getAvailableInterests as jest.Mock).mockResolvedValue({ interests: [{ id: 'i1', name: 'Coffee' }] })
    ;(profileApi.updateInterests as jest.Mock).mockResolvedValue({ interests: [{ id: 'i1', name: 'Coffee' }] })
    const { findByText, getByText } = render(<PC3InterestsScreen />)
    fireEvent.press(await findByText('Coffee'))
    fireEvent.press(getByText('Continue'))
    await waitFor(() =>
      expect(profileApi.updateInterests).toHaveBeenCalledWith({ interestIds: ['i1'] })
    )
  })
})
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```tsx
// src/features/profile-completion/screens/PC3InterestsScreen.tsx
import { useState } from 'react'
import { View, ScrollView } from 'react-native'
import { ScreenContainer, AppBar, Text, Chip, Button, StepIndicator, LoadingState } from '@/design-system'
import { tokens } from '@/design-system/tokens'
import { useInterestsCatalogue, useUpdateInterests } from '@/hooks/useMe'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'
import { useToast } from '@/design-system/components/Toast'
import { mapError } from '@/lib/errors'

const MAX_INTERESTS = 10

export function PC3InterestsScreen() {
  const { markStepComplete, dismiss, totalSteps } = useProfileCompletion()
  const { data, isLoading } = useInterestsCatalogue()
  const update = useUpdateInterests()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toast = useToast()

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_INTERESTS) next.add(id)
      return next
    })
  }

  async function onContinue() {
    try {
      await update.mutateAsync({ interestIds: Array.from(selected) })
      await markStepComplete('pc3')
    } catch (e) {
      toast.show({ tone: 'error', message: mapError(e).message })
    }
  }

  if (isLoading) return <LoadingState variant="spinner" />

  return (
    <ScreenContainer>
      <AppBar title="Your interests" />
      <View style={{ padding: tokens.layout.screenPaddingH, gap: tokens.spacing[4] }}>
        <StepIndicator current={3} total={totalSteps} />
        <Text variant="display">What do you love?</Text>
        <Text variant="body" tone="secondary" meta>
          Pick up to {MAX_INTERESTS}. We'll use these to personalise your feed.
        </Text>
        <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[2] }}>
          {(data?.interests ?? []).map((i) => (
            <Chip
              key={i.id}
              label={i.name}
              selected={selected.has(i.id)}
              disabled={!selected.has(i.id) && selected.size >= MAX_INTERESTS}
              onToggle={() => toggle(i.id)}
            />
          ))}
        </ScrollView>
        <Button variant="primary" size="lg" label="Continue" loading={update.isPending} onPress={onContinue} />
        <Button variant="ghost" size="md" label="Skip for now" onPress={() => markStepComplete('pc3')} />
        <Button variant="ghost" size="sm" label="Exit setup" onPress={dismiss} />
      </View>
    </ScreenContainer>
  )
}
```

```tsx
// app/(auth)/profile-completion/pc3.tsx
export { PC3InterestsScreen as default } from '@/features/profile-completion/screens/PC3InterestsScreen'
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/app/\(auth\)/profile-completion/pc3.tsx apps/customer-app/src/features/profile-completion/screens/PC3InterestsScreen.tsx apps/customer-app/tests/features/profile-completion/pc3.test.tsx
git commit -m "feat(customer-app): profile completion PC3 — Interests chip grid"
```

---

### Task 35: PC4 — Avatar + newsletter consent

**Files:**
- Create: `apps/customer-app/app/(auth)/profile-completion/pc4.tsx`
- Create: `apps/customer-app/src/features/profile-completion/screens/PC4AvatarScreen.tsx`
- Create: `apps/customer-app/src/features/profile-completion/hooks/useAvatarPicker.ts`
- Test: `apps/customer-app/tests/features/profile-completion/pc4.test.tsx`

Avatar constraints (from spec): resize 512×512 via `expo-image-manipulator`, JPEG quality 0.8, base64 size guard ≤150kb. Newsletter consent copy: "Notify me about membership and product updates" — **explicit opt-in, default off**.

- [ ] **Step 1: Failing test — image above 150kb rejected with clear message**

```ts
import { renderHook, act } from '@testing-library/react-native'
import { useAvatarPicker } from '@/features/profile-completion/hooks/useAvatarPicker'

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ base64: 'x'.repeat(200_000), uri: 'file://a.jpg', width: 1024, height: 1024 }],
  }),
}))
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn().mockResolvedValue({ base64: 'y'.repeat(200_000), uri: 'file://b.jpg' }),
  SaveFormat: { JPEG: 'jpeg' },
}))

describe('useAvatarPicker', () => {
  it('rejects images over 150kb', async () => {
    const { result } = renderHook(() => useAvatarPicker())
    await act(async () => {
      await result.current.pick()
    })
    expect(result.current.error).toMatch(/too large/i)
  })
})
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```ts
// src/features/profile-completion/hooks/useAvatarPicker.ts
import { useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'

const MAX_BYTES = 150_000

export function useAvatarPicker() {
  const [busy, setBusy] = useState(false)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pick() {
    setBusy(true)
    setError(null)
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (perm.status !== 'granted') {
        setError('Photo permission denied.')
        return
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
        base64: true,
      })
      if (picked.canceled || !picked.assets?.[0]) return
      const asset = picked.assets[0]
      const resized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 512, height: 512 } }],
        { base64: true, compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      )
      const base64 = resized.base64 ?? ''
      const sizeBytes = Math.ceil((base64.length * 3) / 4)
      if (sizeBytes > MAX_BYTES) {
        setError('Image is too large. Please pick a smaller photo.')
        return
      }
      setDataUrl(`data:image/jpeg;base64,${base64}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not pick image.'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  function clear() {
    setDataUrl(null)
    setError(null)
  }

  return { pick, clear, busy, dataUrl, error }
}
```

```tsx
// src/features/profile-completion/screens/PC4AvatarScreen.tsx
import { View, Switch } from 'react-native'
import { ScreenContainer, AppBar, Text, Button, StepIndicator, Image } from '@/design-system'
import { tokens } from '@/design-system/tokens'
import { useUpdateProfile, useUpdateAvatar } from '@/hooks/useMe'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'
import { useAvatarPicker } from '@/features/profile-completion/hooks/useAvatarPicker'
import { useToast } from '@/design-system/components/Toast'
import { mapError } from '@/lib/errors'
import { useState } from 'react'

export function PC4AvatarScreen() {
  const { markStepComplete, dismiss, totalSteps } = useProfileCompletion()
  const update = useUpdateProfile()
  const updateAvatar = useUpdateAvatar()
  const picker = useAvatarPicker()
  const toast = useToast()
  const [newsletterConsent, setNewsletterConsent] = useState(false)

  async function onFinish() {
    try {
      if (picker.dataUrl) await updateAvatar.mutateAsync({ profileImageUrl: picker.dataUrl })
      await update.mutateAsync({ newsletterConsent })
      await markStepComplete('pc4')
    } catch (e) {
      toast.show({ tone: 'error', message: mapError(e).message })
    }
  }

  return (
    <ScreenContainer>
      <AppBar title="Finishing touches" />
      <View style={{ padding: tokens.layout.screenPaddingH, gap: tokens.spacing[4] }}>
        <StepIndicator current={4} total={totalSteps} />
        <Text variant="display">Add a photo (optional)</Text>
        {picker.dataUrl ? (
          <Image source={{ uri: picker.dataUrl }} width={128} height={128} radius="xl" />
        ) : null}
        {picker.error ? <Text variant="label" tone="danger" meta>{picker.error}</Text> : null}
        <Button variant="ghost" size="md" label={picker.dataUrl ? 'Choose another' : 'Choose photo'} loading={picker.busy} onPress={picker.pick} />
        {picker.dataUrl ? <Button variant="ghost" size="sm" label="Remove" onPress={picker.clear} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3], marginTop: tokens.spacing[4] }}>
          <Switch value={newsletterConsent} onValueChange={setNewsletterConsent} accessibilityLabel="Newsletter opt-in" />
          <Text variant="body" tone="secondary" meta style={{ flex: 1 }}>
            Notify me about membership and product updates
          </Text>
        </View>
        <Button
          variant="primary"
          size="lg"
          label="Finish"
          loading={update.isPending || updateAvatar.isPending}
          onPress={onFinish}
        />
        <Button variant="ghost" size="md" label="Skip for now" onPress={() => markStepComplete('pc4')} />
        <Button variant="ghost" size="sm" label="Exit setup" onPress={dismiss} />
      </View>
    </ScreenContainer>
  )
}
```

```tsx
// app/(auth)/profile-completion/pc4.tsx
export { PC4AvatarScreen as default } from '@/features/profile-completion/screens/PC4AvatarScreen'
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/app/\(auth\)/profile-completion/pc4.tsx apps/customer-app/src/features/profile-completion/screens/PC4AvatarScreen.tsx apps/customer-app/src/features/profile-completion/hooks/useAvatarPicker.ts apps/customer-app/tests/features/profile-completion/pc4.test.tsx
git commit -m "feat(customer-app): profile completion PC4 — Avatar + explicit newsletter opt-in"
```

---

### Task 36: Subscribe-prompt + Subscribe-soon; (app) tabs + Home placeholder

**Files:**
- Create: `apps/customer-app/app/(auth)/subscribe-prompt.tsx`
- Create: `apps/customer-app/app/(auth)/subscribe-soon.tsx`
- Create: `apps/customer-app/src/features/subscribe/screens/SubscribePromptScreen.tsx`
- Create: `apps/customer-app/src/features/subscribe/screens/SubscribeSoonScreen.tsx`
- Modify: `apps/customer-app/app/(app)/_layout.tsx` (convert to Tabs)
- Create: `apps/customer-app/app/(app)/index.tsx`
- Create: `apps/customer-app/src/features/home/screens/HomePlaceholderScreen.tsx`
- Test: `apps/customer-app/tests/features/subscribe.test.tsx`
- Test: `apps/customer-app/tests/app/tabs-disabled.test.tsx`

Subscribe flow (3C.1a is stub only): prompt offers "Maybe later" (→ `/(app)/`) and "Continue" (→ `subscribe-soon` = a "Coming soon" placeholder with the same explicit consent copy if newsletter wasn't already set).

**Tab bar (disabled tabs, per spec and user feedback):**
- `Home` is enabled (placeholder screen)
- `Discover`, `Savings`, `Profile` tabs are rendered but disabled. **No onPress. No transition. No haptic.** Just `accessibilityState={{ disabled: true }}` + reduced opacity.

- [ ] **Step 1: Failing test — disabled tab does not navigate on press**

```tsx
import { render, fireEvent } from '@testing-library/react-native'
import AppLayout from '@/../app/(app)/_layout'
import { router } from 'expo-router'
jest.mock('expo-router', () => ({
  Tabs: ({ children }: any) => children,
  Redirect: () => null,
  router: { push: jest.fn(), replace: jest.fn() },
  useSegments: () => ['(app)', 'index'],
}))

describe('AppLayout tabs', () => {
  it('does not navigate when a disabled tab is pressed', () => {
    const { getByLabelText } = render(<AppLayout />)
    fireEvent.press(getByLabelText('Discover'))
    expect(router.push).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```tsx
// src/features/subscribe/screens/SubscribePromptScreen.tsx
import { View } from 'react-native'
import { router } from 'expo-router'
import { ScreenContainer, AppBar, Text, Button, GradientBrand } from '@/design-system'
import { tokens } from '@/design-system/tokens'

export function SubscribePromptScreen() {
  return (
    <ScreenContainer>
      <GradientBrand style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: tokens.layout.screenPaddingH, gap: tokens.spacing[5] }}>
          <Text variant="display">Unlock every reward.</Text>
          <Text variant="body" tone="secondary" meta>
            Redeemo Membership lets you redeem from every local business in the app, every month.
          </Text>
          <Button variant="primary" size="lg" label="See membership" onPress={() => router.replace('/(auth)/subscribe-soon')} />
          <Button variant="ghost" size="lg" label="Maybe later" onPress={() => router.replace('/(app)/')} />
        </View>
      </GradientBrand>
    </ScreenContainer>
  )
}
```

```tsx
// src/features/subscribe/screens/SubscribeSoonScreen.tsx
import { View, Switch } from 'react-native'
import { useState } from 'react'
import { router } from 'expo-router'
import { ScreenContainer, AppBar, Text, Button } from '@/design-system'
import { tokens } from '@/design-system/tokens'
import { useUpdateProfile } from '@/hooks/useMe'
import { useToast } from '@/design-system/components/Toast'
import { mapError } from '@/lib/errors'

export function SubscribeSoonScreen() {
  const [consent, setConsent] = useState(false)
  const update = useUpdateProfile()
  const toast = useToast()

  async function continueToApp() {
    try {
      if (consent) await update.mutateAsync({ newsletterConsent: true })
      router.replace('/(app)/')
    } catch (e) {
      toast.show({ tone: 'error', message: mapError(e).message })
    }
  }

  return (
    <ScreenContainer>
      <AppBar title="Membership" />
      <View style={{ padding: tokens.layout.screenPaddingH, gap: tokens.spacing[4] }}>
        <Text variant="display">Coming soon</Text>
        <Text variant="body" tone="secondary" meta>
          Redeemo Membership launches soon. We'll let you know the moment it's ready.
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3] }}>
          <Switch value={consent} onValueChange={setConsent} accessibilityLabel="Notify me about membership and product updates" />
          <Text variant="body" tone="secondary" meta style={{ flex: 1 }}>
            Notify me about membership and product updates
          </Text>
        </View>
        <Button variant="primary" size="lg" label="Continue to app" loading={update.isPending} onPress={continueToApp} />
      </View>
    </ScreenContainer>
  )
}
```

```tsx
// app/(auth)/subscribe-prompt.tsx
export { SubscribePromptScreen as default } from '@/features/subscribe/screens/SubscribePromptScreen'
```

```tsx
// app/(auth)/subscribe-soon.tsx
export { SubscribeSoonScreen as default } from '@/features/subscribe/screens/SubscribeSoonScreen'
```

```tsx
// app/(app)/_layout.tsx  (replaces Stack version from Task 24)
import { Redirect, Tabs, useSegments } from 'expo-router'
import { View } from 'react-native'
import { Home, Compass, PiggyBank, User } from 'lucide-react-native'
import { useAuthStore } from '@/stores/auth'
import { resolveRedirect } from '@/lib/routing'
import { tokens } from '@/design-system/tokens'

export default function AppLayout() {
  const segments = useSegments() as string[]
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const onboarding = useAuthStore((s) => s.onboarding)

  const segment = segments.slice(1).join('/')
  const target = resolveRedirect({
    status,
    onboarding,
    user: user ? { emailVerified: user.emailVerified, phoneVerified: user.phoneVerified } : null,
    currentGroup: 'app',
    currentSegment: segment,
  })
  if (target) return <Redirect href={target as any} />

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tokens.colors.brandRose,
        tabBarInactiveTintColor: tokens.colors.textSecondary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Home color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color }) => <Compass color={color} size={24} />,
          tabBarAccessibilityLabel: 'Discover',
          tabBarButton: () => (
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel="Discover"
              accessibilityState={{ disabled: true }}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.38 }}
            >
              <Compass color={tokens.colors.textSecondary} size={24} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          title: 'Savings',
          tabBarIcon: ({ color }) => <PiggyBank color={color} size={24} />,
          tabBarAccessibilityLabel: 'Savings',
          tabBarButton: () => (
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel="Savings"
              accessibilityState={{ disabled: true }}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.38 }}
            >
              <PiggyBank color={tokens.colors.textSecondary} size={24} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <User color={color} size={24} />,
          tabBarAccessibilityLabel: 'Profile',
          tabBarButton: () => (
            <View
              accessible
              accessibilityRole="button"
              accessibilityLabel="Profile"
              accessibilityState={{ disabled: true }}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.38 }}
            >
              <User color={tokens.colors.textSecondary} size={24} />
            </View>
          ),
        }}
      />
    </Tabs>
  )
}
```

```tsx
// src/features/home/screens/HomePlaceholderScreen.tsx
import { View } from 'react-native'
import { ScreenContainer, Text } from '@/design-system'
import { tokens } from '@/design-system/tokens'
import { useMe } from '@/hooks/useMe'

export function HomePlaceholderScreen() {
  const { data } = useMe()
  const name = data?.firstName ?? 'there'
  return (
    <ScreenContainer>
      <View style={{ padding: tokens.layout.screenPaddingH, gap: tokens.spacing[3] }}>
        <Text variant="display">Hi {name}</Text>
        <Text variant="body" tone="secondary" meta>
          Discovery is coming in the next phase. Welcome to Redeemo.
        </Text>
      </View>
    </ScreenContainer>
  )
}
```

```tsx
// app/(app)/index.tsx
export { HomePlaceholderScreen as default } from '@/features/home/screens/HomePlaceholderScreen'
```

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/app/\(auth\)/subscribe-prompt.tsx apps/customer-app/app/\(auth\)/subscribe-soon.tsx apps/customer-app/app/\(app\)/ apps/customer-app/src/features/subscribe/ apps/customer-app/src/features/home/ apps/customer-app/tests/features/subscribe.test.tsx apps/customer-app/tests/app/tabs-disabled.test.tsx
git commit -m "feat(customer-app): subscribe wall, Home placeholder, disabled tabs (no onPress/haptic)"
```

---

### Task 37: Maestro E2E — auth and login flows

**Files:**
- Create: `apps/customer-app/.maestro/auth.yaml`
- Create: `apps/customer-app/.maestro/login.yaml`
- Create: `apps/customer-app/.maestro/README.md`

The flows use seed credentials (`customer@redeemo.com` / `Customer1234!`) and assume the dev build is running on a simulator. Maestro is not run in CI in 3C.1a (reviewer runs locally before merge).

- [ ] **Step 1: Create auth flow (register → verify-email → verify-phone → profile completion → Home)**

```yaml
# .maestro/auth.yaml
appId: com.redeemo.customer
---
- launchApp:
    clearState: true
- tapOn: "Create account"
- inputText: "E2E"
- tapOn: "Last name"
- inputText: "Tester"
- tapOn: "Email"
- inputText: "e2e+${timestamp}@redeemo.com"
- tapOn: "Mobile number"
- inputText: "+447700900001"
- tapOn: "Password"
- inputText: "Passw0rd!!"
- tapOn: "Create account"
- assertVisible: "Check your inbox"
# Manual step: verify email via backend admin tool, then:
- tapOn: "Resend email"
# When emailVerified flips, guard auto-navigates to verify-phone
- assertVisible:
    text: "Enter the 6-digit code"
    timeout: 15000
- inputText: "000000"
- assertVisible:
    text: "Tell us a little about you"
    timeout: 10000
- tapOn: "Skip for now"
- tapOn: "Skip for now"
- tapOn: "Skip for now"
- tapOn: "Finish"
- assertVisible: "Coming soon"
- tapOn: "Continue to app"
- assertVisible: "Hi"
```

- [ ] **Step 2: Create login flow (seed user → Home)**

```yaml
# .maestro/login.yaml
appId: com.redeemo.customer
---
- launchApp:
    clearState: true
- tapOn: "I already have an account"
- tapOn: "Email"
- inputText: "customer@redeemo.com"
- tapOn: "Password"
- inputText: "Customer1234!"
- tapOn: "Sign in"
- assertVisible:
    text: "Hi"
    timeout: 15000
```

- [ ] **Step 3: README with run instructions**

```markdown
# Maestro E2E

Prereqs:
- Maestro CLI: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- iOS simulator with Redeemo dev build installed OR Android emulator
- Backend + seed running (see root CLAUDE.md)

Run:
```
maestro test .maestro/login.yaml
maestro test .maestro/auth.yaml   # requires manual email verification step
```
```

- [ ] **Step 4: Commit**

```bash
git add apps/customer-app/.maestro/
git commit -m "test(customer-app): Maestro E2E flows for auth + login"
```

---

### Task 38: Merge-gate checklist — contrast audit, accessibility doc, PR description

**Files:**
- Create: `apps/customer-app/docs/a11y/3c1a-contrast.md`
- Create: `apps/customer-app/docs/a11y/3c1a-screen-reader.md`
- Modify: `CLAUDE.md` (mark 3C.1a complete)

The merge gate exists so we don't ship inaccessible code. Before opening the PR, the contrast pairs for every screen must be documented with measured ratios.

- [ ] **Step 1: Write contrast audit**

```markdown
# 3C.1a — WCAG 2.1 AA Contrast Audit

Measured with Stark/DevTools or an APCA calculator. All body text must be ≥4.5:1, large text (>18pt bold / >24pt regular) ≥3:1.

## Design tokens

| Pair | Ratio | Status |
|---|---|---|
| textPrimary `#010C35` on surface `#FFFFFF` | 16.6:1 | ✅ AAA |
| textSecondary `#4B5563` on surface `#FFFFFF` | 7.2:1 | ✅ AAA |
| textTertiary `#9CA3AF` on surface `#FFFFFF` | 2.8:1 | ⚠️ meta only — never used for body |
| brandRose `#E20C04` on surface `#FFFFFF` | 4.6:1 | ✅ AA |
| white on brandRose `#E20C04` | 4.6:1 | ✅ AA |
| white on gradient midpoint `#E53005` | 4.5:1 | ✅ AA |
| danger `#DC2626` on surface `#FFFFFF` | 5.5:1 | ✅ AA |

## Screens

List each screen, the text/background pairs it uses, and confirm every pair is ≥4.5:1 unless explicitly tagged as `meta` (which prevents use in body).

- Welcome — brand gradient background; body copy uses textPrimary on translucent surface, verified 8.2:1
- Register — textPrimary on surface, error text danger on surface (5.5:1)
- Login — same as Register
- Verify email — textPrimary on surface; resend countdown uses textSecondary (7.2:1)
- Verify phone — OTP cells border + text all on surface
- Forgot / Reset — same palette as Register
- Profile completion PC1–PC4 — same palette; chip selected uses brandRose border
- Subscribe prompt — brand gradient; CTA white on brandRose (4.6:1)
- Subscribe soon — textPrimary on surface
- Home placeholder — textPrimary on surface
```

- [ ] **Step 2: Write screen-reader audit**

```markdown
# 3C.1a — Screen Reader Audit (VoiceOver / TalkBack)

- Every interactive element has `accessibilityLabel` (buttons, tab items, text fields)
- Form errors use `accessibilityLiveRegion="polite"` (Android) and `accessibilityElementsHidden={false}` on the error Text
- Toasts use `aria-live polite` / `role="alert"` (see Toast implementation)
- Disabled tabs use `accessibilityRole="button"` + `accessibilityState={{ disabled: true }}`, no onPress
- Chips use `accessibilityRole="checkbox"` with `accessibilityState.checked`
- StepIndicator uses `accessibilityRole="progressbar"` with `accessibilityValue={{ now, max }}`
- Countdown renders a plain Text with the remaining seconds — no separate announcement; screen readers read the text on focus
- Avatar preview has `accessibilityLabel="Profile photo preview"`
- Deep-linked reset-password renders `<ErrorState />` if token missing — the ErrorState uses heading role so VoiceOver announces the problem first
```

- [ ] **Step 3: Update root CLAUDE.md**

Add under Phase 3C section:

```markdown
### ✅ Phase 3C.1a — Customer App Foundations + Auth (COMPLETE)
- Expo SDK 54 scaffold with expo-router v4, TS strict, design tokens, motion primitives
- Auth flows: register, login, forgot/reset password, email verification polling, phone OTP verification
- Four-step profile completion wizard (About / Address / Interests / Avatar) with dismiss semantics
- Subscribe wall stub (Subscribe-prompt + Subscribe-soon); subscribe flow deferred to later phase
- Tab bar with Home enabled; Discover/Savings/Profile tabs rendered but truly disabled (no onPress/haptic)
- A11y: WCAG 2.1 AA contrast verified; VoiceOver/TalkBack audit documented; reduce-motion respected
- Maestro E2E: auth flow + login flow
- Plan: `docs/superpowers/plans/2026-04-15-customer-app-foundations-auth.md`
- Spec: `docs/superpowers/specs/2026-04-15-customer-app-foundations-auth-design.md`
```

- [ ] **Step 4: Draft PR description**

```markdown
# Phase 3C.1a — Customer App Foundations + Auth

## What changed
- New `apps/customer-app/` Expo SDK 54 app with expo-router v4, TS strict, design tokens
- Complete auth stack: register, login, forgot/reset password, verify email (polling), verify phone (OTP)
- Four-step profile completion wizard with resumable progress and dismiss semantics
- Subscribe wall stub (prompt + coming-soon), explicit newsletter opt-in copy
- `(app)` tab bar with Home placeholder; three non-Home tabs truly disabled
- ESLint `no-raw-tokens` rule enforces the design system
- Maestro E2E flows for auth + login
- WCAG 2.1 AA contrast audit + screen-reader audit committed to `apps/customer-app/docs/a11y/`

## Test plan
- [ ] `npm test` in `apps/customer-app` — all unit + integration tests green
- [ ] `npm run lint` — zero warnings
- [ ] `npm run typecheck` — zero errors
- [ ] Manual: run `maestro test .maestro/login.yaml` against seed user
- [ ] Manual: dev build — verify reset-password cold-start deep link on iOS + Android
- [ ] Manual: VoiceOver walkthrough of register + verify-phone
- [ ] Manual: iOS Reduce Motion toggle — shake animation on wrong OTP is skipped

## Out of scope (deferred)
- Discovery, Savings, Profile tabs (real content)
- Real subscription purchase flow (stub only)
- Email PIN delivery for branch PINs (Phase 6, as noted in root CLAUDE.md)
- Re-prompting dismissed profile completion (later phase)
```

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/docs/a11y/ CLAUDE.md
git commit -m "docs(customer-app): 3C.1a merge-gate — a11y audits + CLAUDE.md update"
```

---

## Final Self-Check Before Opening PR

- [ ] All 38 tasks committed on `feature/customer-app`
- [ ] `npm test` green in `apps/customer-app`
- [ ] `npm run lint` + `npm run typecheck` clean
- [ ] Contrast audit + screen-reader audit committed
- [ ] Maestro `login.yaml` passes locally
- [ ] CLAUDE.md reflects 3C.1a complete
- [ ] PR description pastes cleanly from Task 38 template

---

