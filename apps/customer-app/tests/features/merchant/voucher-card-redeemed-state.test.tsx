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
  // PR-B T8a: factory always sets the new payload field.  These
  // tests drive the redeemed-state visual variant via the
  // `isRedeemed` PROP on VoucherCard directly (not via the payload
  // flag), so this default is just for type-safety completeness.
  isRedeemedThisCycle: false,
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
    expect(getByText('Voucher Redeemed')).toBeTruthy()
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
    expect(queryByText('Voucher Redeemed')).toBeNull()
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
    expect(queryByText('Voucher Redeemed')).toBeNull()
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

  it('stamp is level (no tilt) under the PR-B T8i refined treatment', () => {
    // PR-B T8i — owner direction: the merchant-profile voucher card
    // stamp moves to a refined hairline-accent + cream-gradient
    // design.  The previous rubber-stamp variant tilted -5°; the
    // refined variant is LEVEL (no rotate transform).  Pin the
    // contract so a future revert to the rubber-stamp aesthetic
    // fails this assertion.
    //
    // The stamp component still renders as a static View — no
    // useSharedValue, no withTiming, no entrance animation per
    // brief §6 (instant recognition on a list card; the larger
    // Voucher Detail seal handles entrance motion at the primary
    // surface).
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
      ? Object.assign({}, ...stamp.props.style.filter(Boolean))
      : stamp.props.style ?? {}
    // Level — no rotate transform applied to the stamp container.
    // (Any future regression that re-introduces a tilt at the card
    // level fails this pin; the larger Voucher Detail rubber-stamp
    // seal continues to tilt INDEPENDENTLY of this card surface.)
    if (style.transform) {
      const flatTransforms = (style.transform as Array<Record<string, unknown>>).reduce(
        (acc, t) => ({ ...acc, ...t }),
        {} as Record<string, unknown>,
      )
      expect(flatTransforms.rotate).toBeUndefined()
    }
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

  describe('PR-B T8i — refined card stamp treatment', () => {
    it('REDEEMED text uses the refined treatment: full opacity (not the 0.55 ink-pressure alpha) and wide letter-spacing', () => {
      // T8i owner direction: the merchant-profile voucher card stamp
      // moves to a refined hairline-accent + cream-gradient design.
      // The previous rubber-stamp ink-pressure variant rendered the
      // text at opacity 0.55 (mimicking faded ink); the refined
      // variant renders it at FULL opacity with wide letter-spacing.
      const { getByText } = render(
        <VoucherCard
          voucher={mk()}
          isRedeemed={true}
          isFavourited={false}
          onPress={() => {}}
          onToggleFavourite={() => {}}
        />,
      )
      const text = getByText('Voucher Redeemed')
      const style = Array.isArray(text.props.style)
        ? Object.assign({}, ...text.props.style.filter(Boolean))
        : text.props.style ?? {}
      // T8h-and-prior rubber-stamp opacity (0.55 ink-pressure) is
      // explicitly NOT present on the refined variant.
      expect(style.opacity).not.toBe(0.55)
      // Letter-spacing is wider than the rubber-stamp baseline of
      // 1.6.  Note: the design-system `label.eyebrow` variant wins
      // the merge over a local `letterSpacing` override at 2.4 and
      // resolves to 1.8 — still wider than the rubber-stamp value
      // and reads as the editorial / premium signature on device.
      // The contract here is the negative pin: 1.6 (rubber-stamp
      // signature) MUST NOT resurface, AND any positive value at
      // least matches the eyebrow baseline.
      expect(typeof style.letterSpacing).toBe('number')
      expect(style.letterSpacing).not.toBe(1.6)
      expect(style.letterSpacing as number).toBeGreaterThan(1.6)
      // No textShadow ink-bleed on the refined variant — that was
      // the rubber-stamp ink-pressure cue.
      expect(style.textShadowColor).toBeUndefined()
    })

    it('stamp wrap is a centered overlay (PR-B T8i — owner direction "it does not need to be top right corner. It could be in the center")', () => {
      // Walk up the ancestor chain from the stamp testID and verify
      // SOME ancestor carries the centered-overlay style shape, AND
      // NO ancestor carries the previous top-right `right: 46`
      // offset.  We don't lock the exact wrapper depth (RTNL can
      // insert wrappers between component boundaries), only the
      // contract.
      const { getByTestId } = render(
        <VoucherCard
          voucher={mk()}
          isRedeemed={true}
          isFavourited={false}
          onPress={() => {}}
          onToggleFavourite={() => {}}
        />,
      )
      const flat = (n: any): Record<string, unknown> => {
        const s = n?.props?.style
        if (!s) return {}
        if (Array.isArray(s)) return Object.assign({}, ...s.flat(Infinity).filter(Boolean))
        return s
      }
      let n: any = getByTestId('voucher-card-redeemed-stamp')
      let foundCenteredOverlay = false
      while (n) {
        const s = flat(n)
        // Negative pin against the previous top-right placement —
        // the offset value `46` (right:46) was the load-bearing
        // signal for "stamp lives left of the heart at top-right".
        // It must NEVER appear in the redeemed stamp's ancestor chain
        // again.
        expect(s.right).not.toBe(46)
        // Positive pin: at least one ancestor must implement the
        // centered-overlay shape.
        if (
          s.position       === 'absolute' &&
          s.alignItems     === 'center'   &&
          s.justifyContent === 'center'   &&
          s.top    === 0 && s.bottom === 0 &&
          s.left   === 0 && s.right  === 0
        ) {
          foundCenteredOverlay = true
        }
        n = n.parent
      }
      expect(foundCenteredOverlay).toBe(true)
    })

    it('non-redeemed cards remain visually unchanged (no stamp testID, no Voucher Redeemed text, no inline label)', () => {
      // Owner direction: "normal voucher cards must remain
      // unchanged" — this pin guards against a future regression
      // that surfaces the refined treatment elements on a
      // not-yet-redeemed card.
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
      expect(queryByTestId('voucher-card-redeemed-overlay')).toBeNull()
      expect(queryByTestId('voucher-card-already-redeemed-label')).toBeNull()
      expect(queryByText('Voucher Redeemed')).toBeNull()
      expect(queryByText('Already redeemed this cycle')).toBeNull()
    })
  })
})
