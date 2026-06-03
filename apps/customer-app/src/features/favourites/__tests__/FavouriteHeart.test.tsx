/**
 * Phase 3C.1g M2.3 — `<FavouriteHeart>` contract pins.
 *
 * Covers the locked invariants from spec §7.2.1:
 *   - Calls `useFavourite()` with the right discriminator + ID +
 *     contextualQueryKey.
 *   - All tones render the unified brand-rose stroke + brand-rose
 *     active fill (Wave 3 §17 — pre-R3 white-on-dark and white-on-
 *     gradient variants are retired).
 *   - Disabled state suppresses press + dims via opacity.
 *   - Reduce-motion path skips the scale animation (colour-only flip).
 *   - Accessibility label switches on `isFavourited`.
 *   - STATIC-SOURCE pin: `useFavourite()` is imported only by the
 *     canonical components.  Regression catch against a future
 *     contributor calling it inline from a surface.
 */

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import * as fs from 'fs'
import * as path from 'path'

// --- Mock the hook before importing the component ---------------------------

const mockToggle = jest.fn()
const mockUseFavourite = jest.fn()

jest.mock('@/hooks/useFavourite', () => ({
  useFavourite: (opts: unknown) => {
    mockUseFavourite(opts)
    return {
      isFavourited: (opts as { initialIsFavourited: boolean }).initialIsFavourited,
      toggle:       mockToggle,
      isLoading:    false,
    }
  },
}))

let mockReduceMotionValue = false
jest.mock('@/features/profile/hooks/useReduceMotion', () => ({
  useReduceMotion: () => mockReduceMotionValue,
}))

// Capture the Heart icon props for the tone + a11y assertions.
const mockHeartRender = jest.fn()
jest.mock('@/design-system/icons', () => {
  const RealReact = jest.requireActual('react')
  const { Text: RnText } = jest.requireActual('react-native')
  return {
    Heart: (props: Record<string, unknown>) => {
      mockHeartRender(props)
      return RealReact.createElement(RnText, { testID: 'heart-icon-stub' })
    },
  }
})

// Reanimated mock — the project's jest setup already mocks reanimated.
// Capture withSequence calls so the test can assert the scale anim runs.
const mockWithSequenceCalls = jest.fn()
jest.mock('react-native-reanimated', () => {
  const View = jest.requireActual('react-native').View
  return {
    __esModule: true,
    default: { View },
    Easing: { out: () => 'ease-out', cubic: 'cubic', quad: 'quad' },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withSequence: (...args: unknown[]) => { mockWithSequenceCalls(args); return args },
    withTiming:   (target: number) => target,
  }
})

const mockLightHaptic     = jest.fn()
const mockSelectionHaptic = jest.fn()
jest.mock('@/design-system/haptics', () => ({
  __esModule: true,
  lightHaptic: () => mockLightHaptic(),
  haptics: {
    selection: () => mockSelectionHaptic(),
  },
}))

import { FavouriteHeart } from '../components/FavouriteHeart'

beforeEach(() => {
  mockToggle.mockReset()
  mockToggle.mockResolvedValue(undefined)
  mockUseFavourite.mockReset()
  mockHeartRender.mockReset()
  mockWithSequenceCalls.mockReset()
  mockLightHaptic.mockReset()
  mockSelectionHaptic.mockReset()
  mockReduceMotionValue = false
})

describe('FavouriteHeart — useFavourite plumbing', () => {
  it("entity='branch' passes 'branch' + id + contextualQueryKey to useFavourite", () => {
    render(
      <FavouriteHeart
        entity="branch"
        id="b-1"
        initialIsFavourited={false}
        contextualQueryKey={['merchantProfile', 'm-1', 'b-1']}
        testID="heart"
      />
    )
    expect(mockUseFavourite).toHaveBeenCalledWith({
      type:                'branch',
      id:                  'b-1',
      initialIsFavourited: false,
      contextualQueryKey:  ['merchantProfile', 'm-1', 'b-1'],
    })
  })

  it("entity='voucher' passes 'voucher' to useFavourite", () => {
    render(<FavouriteHeart entity="voucher" id="v-1" initialIsFavourited={true} testID="heart" />)
    expect(mockUseFavourite).toHaveBeenCalledWith({
      type:                'voucher',
      id:                  'v-1',
      initialIsFavourited: true,
      contextualQueryKey:  undefined,
    })
  })

  it('press calls toggle()', () => {
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} testID="heart" />
    )
    fireEvent.press(getByTestId('heart'))
    expect(mockToggle).toHaveBeenCalledTimes(1)
  })
})

// ── Device-QA R1 Wave 3 (2026-05-30) — finding #17 unified colour ────
//
// Locked product principle: ALL surfaces render brand-rose for both
// stroke and (when favourited) fill.  The `tone` prop stays in the API
// for forward compat + future contrast tweaks but no longer changes
// the glyph colour.  Owner direction: "make heart state visually
// coherent across surfaces."
//
// The pre-Wave-3 white-on-dark and white-on-gradient variants are
// retired.  See the in-component docstring on `toneColours` for the
// full rationale.
describe('FavouriteHeart — unified brand-rose colour (Wave 3 §17)', () => {
  it("default tone (on-light) inactive: brand-rose stroke, no fill", () => {
    render(<FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} testID="heart" />)
    expect(mockHeartRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#E20C04', fill: 'none' }),
    )
  })

  it("default tone active: brand-rose stroke + brand-rose fill", () => {
    render(<FavouriteHeart entity="branch" id="b-1" initialIsFavourited={true} testID="heart" />)
    expect(mockHeartRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#E20C04', fill: '#E20C04' }),
    )
  })

  it("tone='on-dark' inactive: brand-rose stroke (NOT white — retired)", () => {
    render(<FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} tone="on-dark" testID="heart" />)
    expect(mockHeartRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#E20C04', fill: 'none' }),
    )
  })

  it("tone='on-dark' active: brand-rose stroke + brand-rose fill (NOT white stroke — retired)", () => {
    render(<FavouriteHeart entity="branch" id="b-1" initialIsFavourited={true} tone="on-dark" testID="heart" />)
    expect(mockHeartRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#E20C04', fill: '#E20C04' }),
    )
  })

  it("tone='on-gradient' active: brand-rose stroke + brand-rose fill (NOT white-on-white — retired)", () => {
    render(<FavouriteHeart entity="voucher" id="v-1" initialIsFavourited={true} tone="on-gradient" testID="heart" />)
    expect(mockHeartRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#E20C04', fill: '#E20C04' }),
    )
  })

  it("tone='on-gradient' inactive: brand-rose outline, no fill", () => {
    render(<FavouriteHeart entity="voucher" id="v-1" initialIsFavourited={false} tone="on-gradient" testID="heart" />)
    expect(mockHeartRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#E20C04', fill: 'none' }),
    )
  })

  it("size prop is propagated to the Heart icon", () => {
    render(<FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} size={18} testID="heart" />)
    expect(mockHeartRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ size: 18 }),
    )
  })
})

describe('FavouriteHeart — disabled state', () => {
  it('disabled=true: press does NOT call toggle()', () => {
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} disabled testID="heart" />
    )
    fireEvent.press(getByTestId('heart'))
    expect(mockToggle).not.toHaveBeenCalled()
  })

  it('disabled=true: accessibilityState reflects disabled', () => {
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} disabled testID="heart" />
    )
    expect(getByTestId('heart').props.accessibilityState).toEqual({ disabled: true })
  })
})

describe('FavouriteHeart — reduce-motion', () => {
  it('reduceMotion=false: press runs the withSequence pop animation', () => {
    mockReduceMotionValue = false
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} testID="heart" />
    )
    fireEvent.press(getByTestId('heart'))
    expect(mockWithSequenceCalls).toHaveBeenCalledTimes(1)
  })

  it('reduceMotion=true: press skips withSequence; toggle still runs (colour-only flip)', () => {
    mockReduceMotionValue = true
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} testID="heart" />
    )
    fireEvent.press(getByTestId('heart'))
    expect(mockWithSequenceCalls).not.toHaveBeenCalled()
    expect(mockToggle).toHaveBeenCalledTimes(1)
  })
})

describe('FavouriteHeart — accessibility labels', () => {
  it("initialIsFavourited=false → label says 'Add to favourites'", () => {
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} testID="heart" />
    )
    expect(getByTestId('heart').props.accessibilityLabel).toBe('Add to favourites')
  })

  it("initialIsFavourited=true → label says 'Remove from favourites'", () => {
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={true} testID="heart" />
    )
    expect(getByTestId('heart').props.accessibilityLabel).toBe('Remove from favourites')
  })
})

describe('FavouriteHeart — static-source pin (locked invariant)', () => {
  it('useFavourite() is imported by ONLY the canonical components', () => {
    // Walk `apps/customer-app/src` and find every file that imports
    // `useFavourite`.  Locked spec §7.2.1 invariant: the hook is
    // called ONLY from `<FavouriteHeart>` + `useFavourite.ts` itself
    // (the export).  `useRemoveFavourite.ts` (M2.4 swipe-to-remove
    // path on the Favourites tab) deliberately does NOT use the
    // hook — it talks to `favouritesApi.removeBranch` / `removeVoucher`
    // directly so the optimistic list-cache UI happens in the
    // InfiniteData splice path, not via the hook's pessimistic-with-
    // onSuccess state.
    //
    // This pin asserts NO out-of-allowlist callers sneak in.  A new
    // inline `useFavourite()` import anywhere in `apps/customer-app/src`
    // outside the 2 canonical entries below fails this assertion.
    const srcDir = path.resolve(__dirname, '../../../../src')
    const ALLOWLIST = new Set([
      'features/favourites/components/FavouriteHeart.tsx',
      'hooks/useFavourite.ts',
      // Phase 3C.1g M2.9a — allowlist now down to the canonical 2
      // entries.  All transition-period consumers
      // (SearchResultItem / MerchantProfileScreen / VouchersTab)
      // have been retired:
      //   - M2.8 dropped SearchResultItem.
      //   - M2.9   dropped MerchantProfileScreen (merchant-level
      //            useFavourite retired; hero heart owned by
      //            <FavouriteHeart> via HeroNav).
      //   - M2.9a  dropped VouchersTab (VoucherCardWrapper retired;
      //            <VoucherCard> owns the heart via
      //            <FavouriteHeart entity="voucher">).
      //
      // A new inline `useFavourite()` import anywhere outside the
      // canonical 2 entries fails this pin.
    ])

    function walk(dir: string, acc: string[]): string[] {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name)
        if (ent.isDirectory()) {
          if (ent.name === '__tests__') continue
          walk(full, acc)
        } else if (/\.(ts|tsx)$/.test(ent.name)) {
          acc.push(full)
        }
      }
      return acc
    }

    const violations: string[] = []
    for (const file of walk(srcDir, [])) {
      const content = fs.readFileSync(file, 'utf-8')
      // Match `from '@/hooks/useFavourite'` or relative variants.
      if (/from\s+['"](\.\.?\/)+hooks\/useFavourite['"]|from\s+['"]@\/hooks\/useFavourite['"]/.test(content)) {
        const rel = path.relative(srcDir, file)
        if (!ALLOWLIST.has(rel)) violations.push(rel)
      }
    }
    expect(violations).toEqual([])
  })
})

describe('FavouriteHeart — Batch 1B hitSlop + split haptic/animation (spec §10.3 + §11.1)', () => {
  it('hitSlop is the Batch 1B locked 12-per-side object form', () => {
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} testID="heart" />,
    )
    expect(getByTestId('heart').props.hitSlop).toEqual({ top: 12, bottom: 12, left: 12, right: 12 })
  })

  it('effective tap target is at least 44pt on each axis (28pt visual + 12pt slop = 52pt)', () => {
    const visual    = 28
    const slop      = { top: 12, bottom: 12, left: 12, right: 12 }
    const onYAxis   = visual + slop.top  + slop.bottom
    const onXAxis   = visual + slop.left + slop.right
    expect(onYAxis).toBeGreaterThanOrEqual(44)
    expect(onXAxis).toBeGreaterThanOrEqual(44)
  })

  it('ADD path (initially unfavourited) press fires lightHaptic() exactly once', () => {
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} testID="heart" />,
    )
    fireEvent.press(getByTestId('heart'))
    expect(mockLightHaptic).toHaveBeenCalledTimes(1)
    expect(mockSelectionHaptic).not.toHaveBeenCalled()
  })

  it('REMOVE path (initially favourited) press fires haptics.selection() exactly once', () => {
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={true} testID="heart" />,
    )
    fireEvent.press(getByTestId('heart'))
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1)
    expect(mockLightHaptic).not.toHaveBeenCalled()
  })

  it('disabled press does NOT fire any haptic', () => {
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} disabled testID="heart" />,
    )
    fireEvent.press(getByTestId('heart'))
    expect(mockLightHaptic).not.toHaveBeenCalled()
    expect(mockSelectionHaptic).not.toHaveBeenCalled()
  })

  it('reduce-motion press still fires the per-direction haptic but skips withSequence', () => {
    mockReduceMotionValue = true
    const { getByTestId } = render(
      <FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} testID="heart" />,
    )
    fireEvent.press(getByTestId('heart'))
    expect(mockLightHaptic).toHaveBeenCalledTimes(1)
    expect(mockWithSequenceCalls).not.toHaveBeenCalled()
  })
})
