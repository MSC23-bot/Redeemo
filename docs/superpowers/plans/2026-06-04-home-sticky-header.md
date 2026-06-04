# Home Sticky / Collapsing Header (PR A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Home a sticky, collapsing header — an expanded header with a full-width tap-through search bar that morphs on scroll into a compact pinned bar (location + search icon + avatar), keeping search and identity one tap away throughout the feed.

**Architecture:** Frontend-only, customer-app only. Restructure `HomeHeader` to the Option A layout; add a pinned `HomeCollapsedHeader` (absolute sibling of the feed `ScrollView`) that mirrors the shipped `merchant/CollapsedHeader` scroll-interpolation pattern; drive its opacity from a UI-thread `scrollY` shared value (`useAnimatedRef` + `useScrollViewOffset`) with `fadeEndY` captured via `onLayout`. The existing `scrollActivity` begin/end handlers, `RefreshControl`, and the `scrollTop` focus effect are preserved untouched. **Search behaviour, ranking, and `/search` are not touched** (guardrail in Task 6).

**Tech Stack:** React Native / Expo SDK 54, expo-router v4, react-native-reanimated (`useAnimatedRef`, `useScrollViewOffset`, `useAnimatedStyle`, `interpolate`), expo-image, lucide-react-native, jest-expo + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-06-04-home-sticky-header-design.md`

**Tier:** 2 (plan-first). **Execution (incl. all commits) waits for owner approval of this plan.**

**Run tests from** `apps/customer-app/` with `npx jest <path> --forceExit`. **Typecheck** with `npx tsc --noEmit`. Ensure Node 20.19.4 (`fnm use`).

---

## File Structure

| File | Create / Modify | Responsibility |
|---|---|---|
| `src/features/home/components/HomeHeaderLocation.tsx` | Create | Shared presentational location row (`area/city` MapPin row OR `LocationStatusLabel`); used by expanded + collapsed headers. |
| `src/features/home/components/HomeSearchBar.tsx` | Create | Expanded full-width tap-through search pill (Home-owned; does NOT import `features/search/SearchBar`). |
| `src/features/home/components/HomeCollapsedHeader.tsx` | Create | Pinned compact bar; `scrollY`-driven opacity; location + search icon + avatar. |
| `src/features/home/components/HomeHeader.tsx` | Modify | Option A layout: greeting+avatar top row, `HomeHeaderLocation`, full-width `HomeSearchBar`; `onLayout` height report. |
| `src/features/home/screens/HomeScreen.tsx` | Modify | `Animated.ScrollView` + `useScrollViewOffset` + `fadeEndY` capture + mount `HomeCollapsedHeader`. |
| `tests/features/home/components/HomeHeaderLocation.test.tsx` | Create | Location row states. |
| `tests/features/home/components/HomeSearchBar.test.tsx` | Create | Placeholder + press + a11y. |
| `tests/features/home/components/HomeCollapsedHeader.test.tsx` | Create | Structure + handler contract. |
| `tests/features/home/components/HomeHeader.test.tsx` | Modify | Preserve avatar/greeting/location pins; add search-bar pins. |
| `tests/features/home/HomeScreen.renderOrder.test.tsx` | Modify | Pin collapsed header is mounted. |
| `tests/features/home/home-search-untouched.test.ts` | Create | Static guardrail: no protected Search imports in Home. |

---

## Task 0: Branch + commit the spec & plan

**Files:** none (git only)

- [ ] **Step 1: Create the feature branch off current main**

Run:
```bash
cd /Users/shebinchaliyath/Developer/Redeemo
git checkout main
git checkout -b feature/home-sticky-header
```
Expected: `Switched to a new branch 'feature/home-sticky-header'`. (`apps/customer-web/next.config.ts` stays modified — long-standing owner scrap, leave it.)

- [ ] **Step 2: Commit the spec + plan only**

Run:
```bash
git add docs/superpowers/specs/2026-06-04-home-sticky-header-design.md docs/superpowers/plans/2026-06-04-home-sticky-header.md
git commit -m "docs(home): spec + plan for sticky/collapsing header (PR A)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
Expected: 2 files changed.

---

## Task 1: `HomeHeaderLocation` — shared location row

**Files:**
- Create: `apps/customer-app/src/features/home/components/HomeHeaderLocation.tsx`
- Test: `apps/customer-app/tests/features/home/components/HomeHeaderLocation.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/customer-app/tests/features/home/components/HomeHeaderLocation.test.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { HomeHeaderLocation } from '@/features/home/components/HomeHeaderLocation'

describe('HomeHeaderLocation', () => {
  it('renders the area/city row when GPS location is present', () => {
    const { getByText } = render(<HomeHeaderLocation area="Shoreditch" city="London" />)
    expect(getByText('Shoreditch, London')).toBeTruthy()
  })

  it('renders nothing when no location and no context', () => {
    const { toJSON } = render(<HomeHeaderLocation area={null} city={null} />)
    expect(toJSON()).toBeNull()
  })

  it('renders the status label when context is provided but no GPS area/city', () => {
    const ctx = { source: 'profile', locality: { name: 'Huddersfield' } } as any
    const { getByText } = render(
      <HomeHeaderLocation area={null} city={null} locationContext={ctx} />,
    )
    // LocationStatusLabel renders "Using profile location · Huddersfield"
    expect(getByText(/profile location/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx jest tests/features/home/components/HomeHeaderLocation.test.tsx --forceExit`
Expected: FAIL — cannot find module `HomeHeaderLocation`.

- [ ] **Step 3: Create the component**

```tsx
// apps/customer-app/src/features/home/components/HomeHeaderLocation.tsx
import React from 'react'
import { View } from 'react-native'
import { MapPin } from 'lucide-react-native'
import { Text, color } from '@/design-system'
import { LocationStatusLabel } from '@/lib/location/LocationStatusLabel'
import type { LocationContext } from '@/lib/api/shared/location'

type Props = {
  area: string | null
  city: string | null
  locationContext?: LocationContext | undefined
}

/**
 * Shared Home location row. Extracted from HomeHeader so the expanded
 * header AND the collapsed sticky bar resolve location identically.
 * Owns NO outer margin — the consumer positions it.
 *
 *   1. GPS-on  → MapPin + "area, city"
 *   2. no GPS, context provided → <LocationStatusLabel> strip
 *   3. neither (loading) → null
 */
export function HomeHeaderLocation({ area, city, locationContext }: Props) {
  const showLocation = area !== null || city !== null
  const showStatusLabel = !showLocation && locationContext !== undefined

  if (showLocation) {
    const locationLabel = [area, city].filter(Boolean).join(', ')
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <MapPin size={12} color={color.brandRose} />
        <Text variant="body.sm" color="secondary" style={{ marginLeft: 4 }} numberOfLines={1}>
          {locationLabel}
        </Text>
      </View>
    )
  }
  if (showStatusLabel) {
    return <LocationStatusLabel variant="strip" flush locationContext={locationContext} />
  }
  return null
}
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx jest tests/features/home/components/HomeHeaderLocation.test.tsx --forceExit`
Expected: PASS (3 tests). If the `LocationStatusLabel` copy assertion mismatches, open `src/lib/location/LocationStatusLabel.tsx`, copy the exact profile-source string, and update the regex.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/home/components/HomeHeaderLocation.tsx apps/customer-app/tests/features/home/components/HomeHeaderLocation.test.tsx
git commit -m "feat(home): extract shared HomeHeaderLocation row

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `HomeSearchBar` — expanded tap-through pill

**Files:**
- Create: `apps/customer-app/src/features/home/components/HomeSearchBar.tsx`
- Test: `apps/customer-app/tests/features/home/components/HomeSearchBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/customer-app/tests/features/home/components/HomeSearchBar.test.tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { HomeSearchBar } from '@/features/home/components/HomeSearchBar'

describe('HomeSearchBar', () => {
  it('renders the placeholder copy', () => {
    const { getByText } = render(<HomeSearchBar onPress={jest.fn()} />)
    expect(getByText(/Search merchants, vouchers/i)).toBeTruthy()
  })

  it('exposes the Search button role/label and fires onPress', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(<HomeSearchBar onPress={onPress} />)
    fireEvent.press(getByLabelText('Search'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx jest tests/features/home/components/HomeSearchBar.test.tsx --forceExit`
Expected: FAIL — cannot find module `HomeSearchBar`.

- [ ] **Step 3: Create the component**

```tsx
// apps/customer-app/src/features/home/components/HomeSearchBar.tsx
import React from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { Search } from 'lucide-react-native'
import { Text, color } from '@/design-system'

type Props = {
  /** Tap-through to /search — parent (HomeScreen) owns the routing. */
  onPress: () => void
}

/**
 * Expanded Home search affordance: a full-width pill that LOOKS like a
 * search field but is a button — tapping routes to /search (the real
 * search screen owns the actual TextInput). Home-owned; it visually
 * echoes features/search/SearchBar but does NOT import it, keeping the
 * Search surface untouched (spec §7).
 */
export function HomeSearchBar({ onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      testID="home-search-bar"
      accessibilityRole="button"
      accessibilityLabel="Search"
      style={styles.bar}
    >
      <Search size={18} color={color.brandRose} />
      <Text variant="body.md" color="secondary" style={styles.placeholder} numberOfLines={1}>
        Search merchants, vouchers…
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: color.surface.tint, // cream-rose — echoes SearchBar
    gap: 10,
  },
  placeholder: {
    flex: 1,
  },
})
```

- [ ] **Step 4: Run it; verify it passes**

Run: `npx jest tests/features/home/components/HomeSearchBar.test.tsx --forceExit`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/home/components/HomeSearchBar.tsx apps/customer-app/tests/features/home/components/HomeSearchBar.test.tsx
git commit -m "feat(home): add HomeSearchBar tap-through pill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `HomeHeader` → Option A expanded layout

**Files:**
- Modify: `apps/customer-app/src/features/home/components/HomeHeader.tsx`
- Modify: `apps/customer-app/tests/features/home/components/HomeHeader.test.tsx`

- [ ] **Step 1: Add failing pins to the existing test (keep all existing pins)**

Append these `it(...)` blocks inside the existing `describe('HomeHeader', ...)`:
```tsx
  it('renders the full-width search bar (Option A)', () => {
    const { getByTestId } = render(
      <HomeHeader firstName="Shebin" area={null} city={null} onSearchPress={jest.fn()} onAvatarPress={jest.fn()} />,
    )
    expect(getByTestId('home-search-bar')).toBeTruthy()
  })

  it('search bar tap fires onSearchPress', () => {
    const onSearchPress = jest.fn()
    const { getByTestId } = render(
      <HomeHeader firstName="Shebin" area={null} city={null} onSearchPress={onSearchPress} onAvatarPress={jest.fn()} />,
    )
    fireEvent.press(getByTestId('home-search-bar'))
    expect(onSearchPress).toHaveBeenCalledTimes(1)
  })

  it('reports its height via onLayout', () => {
    const onLayout = jest.fn()
    const { getByTestId } = render(
      <HomeHeader firstName="Shebin" area={null} city={null} onSearchPress={jest.fn()} onAvatarPress={jest.fn()} onHeightChange={onLayout} />,
    )
    fireEvent(getByTestId('home-header'), 'layout', { nativeEvent: { layout: { height: 180 } } })
    expect(onLayout).toHaveBeenCalledWith(180)
  })
```

- [ ] **Step 2: Run it; verify the new pins fail (existing pins still pass)**

Run: `npx jest tests/features/home/components/HomeHeader.test.tsx --forceExit`
Expected: the 3 new pins FAIL (no `home-search-bar`, no `onHeightChange`); all previously-passing pins still PASS.

- [ ] **Step 3: Restructure `HomeHeader` to Option A**

Replace the component body (props type + JSX) so the layout is: top row (greeting left, avatar right), location row, full-width search bar. Remove the top-right search icon `TouchableOpacity`. Add `onHeightChange` + `onLayout`. Keep the avatar block (Image / gradient) verbatim — its testIDs (`home-header-avatar`, `home-header-avatar-image`, `home-header-avatar-initial`) must not change.

```tsx
// apps/customer-app/src/features/home/components/HomeHeader.tsx
import React from 'react'
import { View, TouchableOpacity, type LayoutChangeEvent } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Text, color, spacing } from '@/design-system'
import { HomeHeaderLocation } from './HomeHeaderLocation'
import { HomeSearchBar } from './HomeSearchBar'
import type { LocationContext } from '@/lib/api/shared/location'

type Props = {
  firstName: string | null
  area: string | null
  city: string | null
  avatarUrl?: string | null
  onSearchPress: () => void
  onAvatarPress: () => void
  locationContext?: LocationContext | undefined
  /** Reports the rendered header height so HomeScreen can compute fadeEndY. */
  onHeightChange?: (height: number) => void
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function HomeHeader({
  firstName, area, city, locationContext, avatarUrl,
  onSearchPress, onAvatarPress, onHeightChange,
}: Props) {
  const greeting = getGreeting()
  const displayName = firstName ?? 'there'
  const avatarLetter = firstName ? firstName.charAt(0).toUpperCase() : '?'

  const handleLayout = (e: LayoutChangeEvent) => onHeightChange?.(e.nativeEvent.layout.height)

  return (
    <View
      testID="home-header"
      onLayout={handleLayout}
      style={{ paddingHorizontal: 18, paddingVertical: spacing[3] }}
    >
      {/* Top row: greeting (left) + avatar (right) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, marginRight: spacing[2] }}>
          <Text variant="display.sm" style={{ letterSpacing: -0.2 }}>
            {greeting}, {displayName}
          </Text>
          <View style={{ marginTop: spacing[1] }}>
            <HomeHeaderLocation area={area} city={city} locationContext={locationContext} />
          </View>
        </View>

        <TouchableOpacity
          testID="home-header-avatar"
          onPress={onAvatarPress}
          accessibilityLabel="Profile"
          accessibilityRole="button"
          style={{ width: 36, height: 36, borderRadius: 18, overflow: 'hidden' }}
        >
          {avatarUrl ? (
            <Image
              testID="home-header-avatar-image"
              source={{ uri: avatarUrl }}
              style={{ width: 36, height: 36, borderRadius: 18 }}
              contentFit="cover"
              accessibilityLabel="Profile photo"
            />
          ) : (
            <LinearGradient
              colors={[color.brandRose, color.brandCoral]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text
                testID="home-header-avatar-initial"
                variant="label.md"
                style={{ color: '#FFFFFF', fontSize: 15, lineHeight: 15 }}
              >
                {avatarLetter}
              </Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>

      {/* Full-width tap-through search bar */}
      <View style={{ marginTop: spacing[3] }}>
        <HomeSearchBar onPress={onSearchPress} />
      </View>
    </View>
  )
}
```

Note: the `LocationStatusLabel` import is now indirect (via `HomeHeaderLocation`); remove the now-unused direct `LocationStatusLabel`, `MapPin`, `Search`, `Bell` imports from this file.

- [ ] **Step 4: Run it; verify all pins pass**

Run: `npx jest tests/features/home/components/HomeHeader.test.tsx --forceExit`
Expected: PASS — existing greeting/location/avatar/`no Filter button` pins + the 3 new pins. (The `getByLabelText('Search')` avatar-sibling assertions still pass: the search bar carries `accessibilityLabel="Search"`.)

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/home/components/HomeHeader.tsx apps/customer-app/tests/features/home/components/HomeHeader.test.tsx
git commit -m "feat(home): expanded header Option A layout (greeting+avatar, location, search bar)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `HomeCollapsedHeader` — pinned compact bar

**Files:**
- Create: `apps/customer-app/src/features/home/components/HomeCollapsedHeader.tsx`
- Test: `apps/customer-app/tests/features/home/components/HomeCollapsedHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

Reanimated worklets are not evaluated under jest (the reanimated mock no-ops `useAnimatedStyle`), so this pins **structure + handler contract**, not opacity values. The fade/threshold is device-QA-verified.
```tsx
// apps/customer-app/tests/features/home/components/HomeCollapsedHeader.test.tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { makeMutable } from 'react-native-reanimated'
import { HomeCollapsedHeader } from '@/features/home/components/HomeCollapsedHeader'

const baseProps = {
  fadeEndY: 120,
  firstName: 'Shebin',
  area: 'Shoreditch',
  city: 'London',
  onSearchPress: jest.fn(),
  onAvatarPress: jest.fn(),
}

describe('HomeCollapsedHeader', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders the location + search icon + avatar', () => {
    const scrollY = makeMutable(0)
    const { getByTestId, getByText } = render(<HomeCollapsedHeader scrollY={scrollY} {...baseProps} />)
    expect(getByTestId('home-collapsed-header')).toBeTruthy()
    expect(getByTestId('home-collapsed-search')).toBeTruthy()
    expect(getByTestId('home-collapsed-avatar')).toBeTruthy()
    expect(getByText('Shoreditch, London')).toBeTruthy()
  })

  it('search + avatar fire their handlers', () => {
    const scrollY = makeMutable(0)
    const { getByTestId } = render(<HomeCollapsedHeader scrollY={scrollY} {...baseProps} />)
    fireEvent.press(getByTestId('home-collapsed-search'))
    fireEvent.press(getByTestId('home-collapsed-avatar'))
    expect(baseProps.onSearchPress).toHaveBeenCalledTimes(1)
    expect(baseProps.onAvatarPress).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx jest tests/features/home/components/HomeCollapsedHeader.test.tsx --forceExit`
Expected: FAIL — cannot find module `HomeCollapsedHeader`.

- [ ] **Step 3: Create the component**

```tsx
// apps/customer-app/src/features/home/components/HomeCollapsedHeader.tsx
import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Search } from 'lucide-react-native'
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated'
import { Text, color } from '@/design-system'
import { useMotionScale } from '@/design-system'
import { HomeHeaderLocation } from './HomeHeaderLocation'
import type { LocationContext } from '@/lib/api/shared/location'

export const COMPACT_BAR_HEIGHT = 52
const FADE_WINDOW = 60

type Props = {
  /** Outer ScrollView's vertical offset (UI-thread shared value). */
  scrollY: SharedValue<number>
  /** Scroll Y at which the collapsed bar reaches full opacity (captured via onLayout). */
  fadeEndY: number
  firstName: string | null
  area: string | null
  city: string | null
  avatarUrl?: string | null
  locationContext?: LocationContext | undefined
  onSearchPress: () => void
  onAvatarPress: () => void
}

/**
 * Pinned compact Home header. Absolutely-positioned sibling of the feed
 * ScrollView (top of the z-stack), with its own warm background + safe-
 * area top spacer. Opacity interpolates 0→1 over the last FADE_WINDOW px
 * before `fadeEndY`, on the UI thread — mirrors merchant/CollapsedHeader.
 *
 * Reduced motion (useMotionScale()===0): binary opacity switch at fadeEndY.
 * Gesture-driven so RM-safe either way; the binary branch honours the
 * locked decision for when detection is reliable (§RM).
 *
 * pointerEvents="box-none": container passes taps through; only the search
 * icon + avatar receive them. (Matches merchant/CollapsedHeader.)
 */
export function HomeCollapsedHeader({
  scrollY, fadeEndY, firstName, area, city, avatarUrl, locationContext,
  onSearchPress, onAvatarPress,
}: Props) {
  const insets = useSafeAreaInsets()
  const reduced = useMotionScale() === 0
  const avatarLetter = firstName ? firstName.charAt(0).toUpperCase() : '?'

  const containerStyle = useAnimatedStyle(() => {
    'worklet'
    if (reduced) {
      return { opacity: scrollY.value >= fadeEndY ? 1 : 0 }
    }
    const opacity = interpolate(
      scrollY.value,
      [fadeEndY - FADE_WINDOW, fadeEndY],
      [0, 1],
      Extrapolation.CLAMP,
    )
    return { opacity }
  })

  return (
    <Animated.View
      pointerEvents="box-none"
      testID="home-collapsed-header"
      style={[
        styles.container,
        { paddingTop: insets.top, height: insets.top + COMPACT_BAR_HEIGHT },
        containerStyle,
      ]}
    >
      <View style={styles.row}>
        <View style={styles.location}>
          <HomeHeaderLocation area={area} city={city} locationContext={locationContext} />
        </View>

        <Pressable
          onPress={onSearchPress}
          testID="home-collapsed-search"
          accessibilityRole="button"
          accessibilityLabel="Search"
          hitSlop={6}
          style={styles.iconBtn}
        >
          <Search size={20} color={color.navy} />
        </Pressable>

        <Pressable
          onPress={onAvatarPress}
          testID="home-collapsed-avatar"
          accessibilityRole="button"
          accessibilityLabel="Profile"
          style={styles.avatar}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <LinearGradient
              colors={[color.brandRose, color.brandCoral]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarImg}
            >
              <Text variant="label.md" style={{ color: '#FFFFFF', fontSize: 15, lineHeight: 15 }}>
                {avatarLetter}
              </Text>
            </LinearGradient>
          )}
        </Pressable>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: color.surface.body,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
    zIndex: 20,
    // soft elevation — fades in with the container opacity
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 12,
  },
  location: {
    flex: 1,
    minWidth: 0,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.surface.neutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  avatarImg: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
```

If `color.surface.body` / `color.border.subtle` / `color.surface.neutral` / `color.navy` / `color.brandCoral` don't resolve, open `src/design-system` token exports and use the exact names (these are all used elsewhere: `HomeScreen` uses `color.surface.body`; `HomeHeader` uses `color.surface.neutral` + `color.brandCoral`; `merchant/CollapsedHeader` uses `color.navy`).

- [ ] **Step 4: Run it; verify it passes**

Run: `npx jest tests/features/home/components/HomeCollapsedHeader.test.tsx --forceExit`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/home/components/HomeCollapsedHeader.tsx apps/customer-app/tests/features/home/components/HomeCollapsedHeader.test.tsx
git commit -m "feat(home): add pinned HomeCollapsedHeader (scrollY-driven)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wire the sticky header into `HomeScreen`

**Files:**
- Modify: `apps/customer-app/src/features/home/screens/HomeScreen.tsx`
- Modify: `apps/customer-app/tests/features/home/HomeScreen.renderOrder.test.tsx`

- [ ] **Step 1: Add a failing render-order pin (collapsed header mounted)**

Open `tests/features/home/HomeScreen.renderOrder.test.tsx`, and in the render assertion add:
```tsx
  it('mounts the pinned collapsed header', () => {
    const { getByTestId } = renderHome() // use the file's existing render helper / inline render
    expect(getByTestId('home-collapsed-header')).toBeTruthy()
  })
```
(If the file renders inline rather than via a helper, copy its existing mock+render setup into this `it`.)

- [ ] **Step 2: Run it; verify it fails**

Run: `npx jest tests/features/home/HomeScreen.renderOrder.test.tsx --forceExit`
Expected: the new pin FAILS (`home-collapsed-header` not found); existing render-order pins still PASS.

- [ ] **Step 3: Convert the ScrollView and mount the collapsed header**

In `HomeScreen.tsx`:

(a) Imports — add to the reanimated import and bring in the collapsed header:
```tsx
import Animated, { useAnimatedRef, useScrollViewOffset, useSharedValue } from 'react-native-reanimated'
import { HomeCollapsedHeader } from '../components/HomeCollapsedHeader'
```
(Keep `useSharedValue` — it's already used for `exploreCollapse`.)

(b) Refs + scroll offset — replace `const scrollViewRef = useRef<ScrollView>(null)` with an animated ref and derive the offset + header-height state:
```tsx
  const scrollViewRef = useAnimatedRef<Animated.ScrollView>()
  const scrollY = useScrollViewOffset(scrollViewRef)
  const [headerHeight, setHeaderHeight] = useState(0)
  // paddingTop:60 on the scroll content offsets the header from the scroll
  // origin; fadeEndY = where the expanded header has mostly scrolled away.
  const fadeEndY = Math.max(headerHeight - 12, 1)
```
Remove the now-unused `useRef` import only if nothing else uses it (it isn't elsewhere — `playedInitialDemo` uses `useRef`, so KEEP the `useRef` import).

(c) Change `<ScrollView ...>` to `<Animated.ScrollView ...>` (open and close tags). Leave every existing prop unchanged: `ref={scrollViewRef}`, the four `scrollActivity` handlers, `refreshControl`, `contentContainerStyle`, `showsVerticalScrollIndicator`.

(d) Pass `onHeightChange` to the expanded header:
```tsx
        <HomeHeader
          firstName={me?.firstName ?? null}
          area={location?.area ?? null}
          city={location?.city ?? null}
          {...(me?.profileImageUrl !== undefined ? { avatarUrl: me.profileImageUrl } : {})}
          {...(feed?.locationContext ? { locationContext: feed.locationContext } : {})}
          onSearchPress={() => router.push('/search' as any)}
          onAvatarPress={() => router.push('/profile' as any)}
          onHeightChange={setHeaderHeight}
        />
```

(e) Mount the collapsed header as a sibling of the `Animated.ScrollView`, INSIDE the outer `<View style={styles.container}>`, AFTER the scroll view's closing tag:
```tsx
      </Animated.ScrollView>

      <HomeCollapsedHeader
        scrollY={scrollY}
        fadeEndY={fadeEndY}
        firstName={me?.firstName ?? null}
        area={location?.area ?? null}
        city={location?.city ?? null}
        {...(me?.profileImageUrl !== undefined ? { avatarUrl: me.profileImageUrl } : {})}
        {...(feed?.locationContext ? { locationContext: feed.locationContext } : {})}
        onSearchPress={() => router.push('/search' as any)}
        onAvatarPress={() => router.push('/profile' as any)}
      />
    </View>
```

(f) The `scrollTop` focus effect keeps calling `scrollViewRef.current?.scrollTo({ y: 0, animated: false })`. `useAnimatedRef().current` exposes the ScrollView instance, so this still works; the `?.` already guards the null case in tests.

- [ ] **Step 4: Run the impacted HomeScreen suites; verify green**

Run:
```bash
npx jest tests/features/home/HomeScreen.renderOrder.test.tsx tests/features/home/HomeScreen.scrollReset.test.tsx tests/features/home/HomeScreen.statusLabel.test.tsx tests/features/home/HomeScreen.focusRefetch.test.tsx tests/features/home/HomeScreen.dedupRules.test.tsx --forceExit
```
Expected: ALL PASS, including the new `home-collapsed-header` pin and the unchanged `scrollReset` pins (validates the `Animated.ScrollView` + animated-ref `scrollTo` path).

**If `scrollReset` fails** (animated-ref `.scrollTo` not resolving): apply the documented fallback — keep a plain `useRef<ScrollView>` for imperative `scrollTo`, add `onScroll={scrollHandler}` via `const scrollHandler = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y })` with `scrollY = useSharedValue(0)`, and attach both refs with a merged callback ref. Re-run.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no new errors).

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/home/screens/HomeScreen.tsx apps/customer-app/tests/features/home/HomeScreen.renderOrder.test.tsx
git commit -m "feat(home): wire sticky collapsing header into HomeScreen

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Search-untouched guardrail + full verification

**Files:**
- Create: `apps/customer-app/tests/features/home/home-search-untouched.test.ts`

- [ ] **Step 1: Write the static guardrail test**

```ts
// apps/customer-app/tests/features/home/home-search-untouched.test.ts
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// Walk src/features/home/** and assert no file imports protected Search
// internals. PR A must change ONLY the Home surface (spec §7).
const HOME_DIR = join(__dirname, '..', '..', '..', 'src', 'features', 'home')
const BANNED = [
  'features/search/components/SearchBar',
  'features/search/components/FilterSheet',
  'features/search/screens/SearchScreen',
  'hooks/useSearch',
  'lib/search',
  'lib/api/ranking',
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  }).filter((p) => p.endsWith('.ts') || p.endsWith('.tsx'))
}

describe('Home does not import protected Search internals (spec §7)', () => {
  const files = walk(HOME_DIR)

  it('finds Home source files to scan', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(BANNED)('no Home file imports %s', (banned) => {
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes(banned))
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run it; verify it passes**

Run: `npx jest tests/features/home/home-search-untouched.test.ts --forceExit`
Expected: PASS (the new Home components import only `HomeHeaderLocation`, `HomeSearchBar`, design-system, lucide, reanimated — none of the banned paths).

- [ ] **Step 3: Confirm the diff scope is Home-only**

Run:
```bash
git diff --name-only main...HEAD -- ':!docs'
```
Expected: every path is under `apps/customer-app/src/features/home/` or `apps/customer-app/tests/features/home/`. ZERO paths under `features/search/`, `lib/`, `app/`, backend, `prisma/`, or `apps/customer-web/`.

- [ ] **Step 4: Run the full Home test scope + the Search suites untouched**

Run:
```bash
npx jest tests/features/home tests/features/search src/features/search --forceExit
```
Expected: ALL PASS. The Search suites are unmodified and green (proves §7.4).

- [ ] **Step 5: Final typecheck + Home-scope lint**

Run:
```bash
npx tsc --noEmit
npx eslint src/features/home --ext .ts,.tsx
```
Expected: tsc clean; eslint shows no NEW errors introduced by this PR (baseline-confirm any pre-existing warnings against `main`).

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/tests/features/home/home-search-untouched.test.ts
git commit -m "test(home): static guardrail — Home imports no Search internals

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (against the spec)

**Spec coverage:**

- §3 Decision 1 (Option A expanded) → Task 3. ✅
- §3 Decision 2 (collapsed layout) → Task 4. ✅
- §3 Decision 3 (continuous morph + RM switch) → Task 4 (`useAnimatedStyle` interpolate + `useMotionScale` binary branch). ✅
- §3 Decision 4 (no filter) → no filter affordance added anywhere; existing "no Filter button" pin retained in Task 3. ✅
- §3 Decision 5 (plain tap-through) → Task 5 keeps `router.push('/search')`; both affordances call `onSearchPress`. ✅
- §3 Decision 6 / §7 (Search untouched) → Task 6 (static guardrail + diff-scope + Search suites green). ✅
- §4 search bar Home-owned (no SearchBar import) → Task 2 + Task 6 guardrail. ✅
- §5 pinned absolute sibling + safe-area + hairline/shadow → Task 4 styles. ✅
- §6 `useScrollViewOffset` + `onLayout` fadeEndY + `box-none` + scrollActivity untouched → Task 4 + Task 5. ✅
- §8 risk (animated-ref `scrollTo`) → Task 5 Step 4 with documented fallback. ✅
- §9 constraints (safe-area, Dynamic Type, RM, tab bar, scrollActivity) → covered across Task 4/5. ✅
- §10 testing → Tasks 1–6. ✅

**Placeholder scan:** No TBD/TODO; every code + test step shows real content. ✅

**Type consistency:** `onHeightChange?: (height: number) => void` (Task 3) matches `setHeaderHeight` wiring (Task 5). `scrollY: SharedValue<number>` (Task 4) matches `useScrollViewOffset` output (Task 5). `COMPACT_BAR_HEIGHT`/`FADE_WINDOW` defined in Task 4, used only there. testIDs (`home-search-bar`, `home-collapsed-header`, `home-collapsed-search`, `home-collapsed-avatar`) consistent across components + tests. ✅

---

## Out of scope (PR B / follow-ups)

- Shared-element transition into `/search` (optional polish).
- Search `FilterSheet` / sort, recent searches, trending polish, data-driven trending — separate brainstorm-first PR; Search matching / ranking / location semantics stay protected.
- `isCollapsed` `pointerEvents` gate (only if device QA flags the phantom-tap tradeoff).

---

## ⏸ PAUSE — owner approval required

Per the Tier 2 standing rule and the owner's instruction, **do not begin implementation.** This plan + the spec are written (uncommitted on `main`'s working tree until Task 0). Await owner review and approval of the plan before executing any task.
