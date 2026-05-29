/**
 * Phase 3C.1g M2.3 — `<FavouriteHeart>` contract pins.
 *
 * Covers the locked invariants from spec §7.2.1:
 *   - Calls `useFavourite()` with the right discriminator + ID +
 *     contextualQueryKey.
 *   - Tone variants render with the expected stroke/fill combos.
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
    Easing: { out: () => 'ease-out' },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withSequence: (...args: unknown[]) => { mockWithSequenceCalls(args); return args },
    withTiming:   (target: number) => target,
  }
})

import { FavouriteHeart } from '../components/FavouriteHeart'

beforeEach(() => {
  mockToggle.mockReset()
  mockToggle.mockResolvedValue(undefined)
  mockUseFavourite.mockReset()
  mockHeartRender.mockReset()
  mockWithSequenceCalls.mockReset()
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

describe('FavouriteHeart — tone variants', () => {
  it("tone='on-light' default: stroke = brand-rose, fill = 'none' when not favourited", () => {
    render(<FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} testID="heart" />)
    expect(mockHeartRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#E20C04', fill: 'none' }),
    )
  })

  it("tone='on-light' active: fill = brand-rose when favourited", () => {
    render(<FavouriteHeart entity="branch" id="b-1" initialIsFavourited={true} testID="heart" />)
    expect(mockHeartRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#E20C04', fill: '#E20C04' }),
    )
  })

  it("tone='on-dark' inactive: white stroke, no fill", () => {
    render(<FavouriteHeart entity="branch" id="b-1" initialIsFavourited={false} tone="on-dark" testID="heart" />)
    expect(mockHeartRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#FFFFFF', fill: 'none' }),
    )
  })

  it("tone='on-dark' active: white stroke + brand-rose fill", () => {
    render(<FavouriteHeart entity="branch" id="b-1" initialIsFavourited={true} tone="on-dark" testID="heart" />)
    expect(mockHeartRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#FFFFFF', fill: '#E20C04' }),
    )
  })

  it("tone='on-gradient' active: white stroke + white fill", () => {
    render(<FavouriteHeart entity="voucher" id="v-1" initialIsFavourited={true} tone="on-gradient" testID="heart" />)
    expect(mockHeartRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ color: '#FFFFFF', fill: '#FFFFFF' }),
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
    // `useFavourite`.  After M2.3 the allowlist is `FavouriteHeart.tsx`
    // and `useFavourite.ts` itself (the export).  M2.4 adds
    // `useRemoveFavourite.ts`.  M2.7-M2.10 swap surface consumers
    // (SearchResultItem, MerchantProfileScreen, VouchersTab) for
    // `<FavouriteHeart>`, so they drop off this list — at which point
    // the cleanup PR will remove the merchant discriminator entirely.
    //
    // This pin asserts NO NEW out-of-allowlist callers sneak in.  It
    // intentionally lists the IN-FLIGHT M2.3 state — the M2.4 commit
    // updates the allowlist when `useRemoveFavourite` lands.
    const srcDir = path.resolve(__dirname, '../../../../src')
    const ALLOWLIST = new Set([
      'features/favourites/components/FavouriteHeart.tsx',
      'hooks/useFavourite.ts',
      // Transition-period surface consumers — swap to <FavouriteHeart>
      // in M2.7-M2.10.  Listed explicitly so the pin tracks the
      // migration without false negatives.
      'features/search/components/SearchResultItem.tsx',
      'features/merchant/screens/MerchantProfileScreen.tsx',
      'features/merchant/components/VouchersTab.tsx',
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
