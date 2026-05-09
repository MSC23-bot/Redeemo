import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { VoucherCard } from '@/features/merchant/components/VoucherCard'
import type { MerchantVoucher } from '@/lib/api/merchant'

/**
 * PR-B T5 (§Q4 fold-in) — VoucherCard redeemed-state visual variant.
 *
 * Pins the brief §3.5 + §5.5 contract:
 *   - REDEEMED stamp top-right of the hero (testID
 *     `voucher-card-redeemed-stamp`)
 *   - "Already redeemed this cycle" inline label below the saving
 *     block (testID `voucher-card-already-redeemed-label`)
 *   - Cream-tint overlay on the gradient (testID
 *     `voucher-card-redeemed-overlay`) — the muted-saturation cue
 *   - Type chip + title + description stay legible
 *   - Tap behaviour unchanged (still routes via onPress)
 *   - Reduced-motion: stamp does not animate on mount
 *
 * Cross-pin: existing tests/features/merchant/voucher-card.test.tsx
 * stays GREEN — that suite asserts text content `REDEEMED` +
 * `Redeemed this cycle` + `Redeem` CTA absence which the new
 * variant continues to satisfy via the new hero stamp text +
 * preserved bottom-row meta text + suppressed CTA respectively.
 */

const mk = (overrides?: Partial<MerchantVoucher>): MerchantVoucher => ({
  id: 'v1',
  type: 'FREEBIE',
  title: 'Free Filter Coffee with Any Thali',
  description: 'Order any thali plate and get a complimentary coffee.',
  estimatedSaving: 2.5,
  expiryDate: null,
  terms: 'T&Cs apply',
  imageUrl: null,
  ...overrides,
})

describe('VoucherCard — redeemed-state variant (PR-B T5, §Q4)', () => {
  it('renders REDEEMED stamp when isRedeemed=true', () => {
    const { getByTestId, getByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={true}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(getByTestId('voucher-card-redeemed-stamp')).toBeTruthy()
    // The stamp text must remain accessible via getByText so the
    // existing voucher-card.test.tsx pin keeps working.
    expect(getByText('REDEEMED')).toBeTruthy()
  })

  it('does NOT render REDEEMED stamp when isRedeemed=false (regression pin)', () => {
    const { queryByTestId, queryByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(queryByTestId('voucher-card-redeemed-stamp')).toBeNull()
    expect(queryByText('REDEEMED')).toBeNull()
  })

  it('does NOT render REDEEMED stamp when isRedeemed prop is omitted', () => {
    const { queryByTestId, queryByText } = render(
      <VoucherCard
        voucher={mk()}
        // intentionally omitted isRedeemed — should default to false
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(queryByTestId('voucher-card-redeemed-stamp')).toBeNull()
    expect(queryByText('REDEEMED')).toBeNull()
  })

  it('renders "Already redeemed this cycle" inline label when isRedeemed=true', () => {
    const { getByTestId, getByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={true}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(getByTestId('voucher-card-already-redeemed-label')).toBeTruthy()
    expect(getByText('Already redeemed this cycle')).toBeTruthy()
  })

  it('does NOT render the inline label when isRedeemed=false', () => {
    const { queryByTestId, queryByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(queryByTestId('voucher-card-already-redeemed-label')).toBeNull()
    expect(queryByText('Already redeemed this cycle')).toBeNull()
  })

  it('hero gradient saturation reduced when isRedeemed=true (cream-tint overlay rendered)', () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={true}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    // The cream-tint overlay marks the muted-saturation cue.
    const overlay = getByTestId('voucher-card-redeemed-overlay')
    expect(overlay).toBeTruthy()
    // Style assertion: overlay carries a cream rgba background —
    // independent visual cue beyond the stamp + inline label.
    const style = Array.isArray(overlay.props.style)
      ? Object.assign({}, ...overlay.props.style)
      : overlay.props.style
    expect(style.backgroundColor).toMatch(/^rgba\(245,\s*240,\s*235/)

    // Regression: overlay absent on the active state.
    rerender(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(queryByTestId('voucher-card-redeemed-overlay')).toBeNull()
  })

  it('type chip stays full opacity in redeemed state', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk({ type: 'FREEBIE' })}
        isRedeemed={true}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    // Type chip text renders at full readable opacity per brief
    // §3.5 — "Type chip stays full saturation (still tells you
    // what type the voucher is)".  T5.1 spec-fix removed the
    // previous card-wide 0.6 opacity dim entirely; this pin
    // confirms no per-chip opacity override exists either.
    const chip = getByText('Freebie')
    const style = Array.isArray(chip.props.style)
      ? Object.assign({}, ...chip.props.style)
      : chip.props.style
    expect(style.opacity).toBeUndefined()
  })

  it('title + description stay legible in redeemed state', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={true}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    // Title + description still render with their existing
    // typography styles; no per-element opacity override applied.
    const title = getByText('Free Filter Coffee with Any Thali')
    const titleStyle = Array.isArray(title.props.style)
      ? Object.assign({}, ...title.props.style)
      : title.props.style
    expect(titleStyle.opacity).toBeUndefined()

    const description = getByText('Order any thali plate and get a complimentary coffee.')
    const descStyle = Array.isArray(description.props.style)
      ? Object.assign({}, ...description.props.style)
      : description.props.style
    expect(descStyle.opacity).toBeUndefined()
  })

  it('tap behaviour unchanged in redeemed state (still routes via onPress)', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={true}
        isFavourited={false}
        onPress={onPress}
        onToggleFavourite={() => {}}
      />,
    )
    // Accessibility label includes the redeemed suffix —
    // confirms the redeemed-state Pressable still has the
    // standard a11y "button" wrapper and fires onPress.
    fireEvent.press(getByLabelText(/Already redeemed this cycle/))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('Dynamic Type AX5: REDEEMED stamp + inline label do not collide', () => {
    // The stamp + label are rendered at different DOM positions
    // (stamp absolutely positioned in the hero region; label
    // inline in the content flow below the saving block). They
    // physically cannot collide in the layout — pin via testID
    // presence + ordering rather than Dynamic Type measurement
    // (which jest-expo doesn't simulate).
    const { getByTestId, getAllByTestId } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={true}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    const stamp = getByTestId('voucher-card-redeemed-stamp')
    const label = getByTestId('voucher-card-already-redeemed-label')
    expect(stamp).toBeTruthy()
    expect(label).toBeTruthy()
    // Sanity pin: each testID resolves to exactly one element —
    // the variant doesn't accidentally double-render either cue.
    expect(getAllByTestId('voucher-card-redeemed-stamp').length).toBe(1)
    expect(getAllByTestId('voucher-card-already-redeemed-label').length).toBe(1)
  })

  it('stamp does not animate on mount under reduced-motion', () => {
    // The stamp component is a static View — no useSharedValue,
    // no withTiming, no entrance animation. Pin by inspecting the
    // stamp element's style: it carries a static rotate transform
    // (-5deg) that does NOT change after mount. Reanimated's
    // withTiming wraps values via the worklet runtime; a static
    // stamp's transform would never be a SharedValue, only a
    // plain string array.
    const { getByTestId } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={true}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    const stamp = getByTestId('voucher-card-redeemed-stamp')
    const style = Array.isArray(stamp.props.style)
      ? Object.assign({}, ...stamp.props.style)
      : stamp.props.style
    // Static rotate transform — not a SharedValue / animated
    // style chain.
    expect(style.transform).toEqual([{ rotate: '-5deg' }])
  })

  it('redeemed card title + description do NOT carry an opacity dim (PR-B T5.1 spec-fix)', () => {
    // Regression pin against the previous PR #35 baseline behaviour:
    // `cardRedeemed: { opacity: 0.6 }` dimmed the entire redeemed
    // card including title + description.  Brief §3.5 explicitly
    // says "Title + description stay full opacity (still legible)"
    // and the §3.5 anti-reference calls out "greyscale-everything
    // fade" as the failure mode.  PR-B's three new contrast cues
    // (cream-tint overlay + REDEEMED stamp + 'Already redeemed
    // this cycle' inline label) carry the contrast at full opacity;
    // the 0.6 dim is removed.  This pin guards against any future
    // re-introduction of a per-element opacity override on the
    // redeemed variant.
    const { getByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={true}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    const title = getByText('Free Filter Coffee with Any Thali')
    const description = getByText('Order any thali plate and get a complimentary coffee.')
    const titleStyle = Array.isArray(title.props.style)
      ? Object.assign({}, ...title.props.style.filter(Boolean))
      : title.props.style
    const descStyle = Array.isArray(description.props.style)
      ? Object.assign({}, ...description.props.style.filter(Boolean))
      : description.props.style
    expect(titleStyle?.opacity).toBeUndefined()
    expect(descStyle?.opacity).toBeUndefined()
  })
})
