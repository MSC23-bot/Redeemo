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
    // PR-B T8j (impeccable pass): wash colour shifted from
    // rgba(245, 240, 235, 0.30) → rgba(255, 246, 238, 0.55).  The
    // newer cream sits in the brand hue family + the alpha bump
    // gives a more decisive desaturation.
    expect(style.backgroundColor).toMatch(/^rgba\(255,\s*246,\s*238/)

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

  it('stamp tilts -10° under the PR-B T8k diagonal-overprint treatment', () => {
    // PR-B T8k (interaction-design pass) — owner direction: the
    // merchant-profile voucher card stamp moves from the T8i
    // centered cream pill (level, no tilt) to a diagonal Mustica
    // Pro overprint (-10° rotation, no backdrop, no border).  The
    // diagonal cancellation overprint reads as the universal
    // "this voucher has been processed" signal, mirroring how
    // banks mark cancelled cheques and museums mark archival
    // documents.  Pin the rotation so a future regression that
    // reverts to either:
    //   • the level T8i hairline-accent treatment, OR
    //   • the rubber-stamp -5° tilt (original §Q4 baseline)
    // fails this assertion.
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
    // -10° rotate must be present on the stamp container's
    // transform array (entry alongside the animated `scale`).
    expect(style.transform).toBeDefined()
    const flatTransforms = (style.transform as Array<Record<string, unknown>>).reduce(
      (acc, t) => ({ ...acc, ...t }),
      {} as Record<string, unknown>,
    )
    expect(flatTransforms.rotate).toBe('-10deg')
    // Negative pin: the previous T8i level (no rotate) and the
    // even earlier rubber-stamp -5° must NOT resurface.
    expect(flatTransforms.rotate).not.toBe('-5deg')
    expect(flatTransforms.rotate).not.toBe('0deg')
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

  describe('PR-B T8k — diagonal Mustica overprint treatment (interaction-design pass)', () => {
    it('"Voucher Redeemed" text renders as a Mustica Pro overprint at brand-rose alpha 0.32 with wide tracking', () => {
      // T8k owner direction: the merchant-profile voucher card stamp
      // moves from the T8i centered cream pill (Lato eyebrow at
      // letterSpacing 1.8 + cream→pale-rose gradient backdrop +
      // 1.5px brand-rose border) to a diagonal Mustica Pro
      // overprint with NO backdrop, NO border, NO shadow.  The
      // editorial cancellation overprint pattern reads as
      // "processed/cancelled" rather than "stickered onto".
      //
      // Visual contract:
      //   • brand-rose `#E20C04` at α 0.32  → "rgba(226, 12, 4, 0.32)"
      //   • letterSpacing: 5 (was 1.8 from eyebrow variant)
      //   • Mustica Pro family via display.sm variant
      //   • textTransform: uppercase
      //
      // Pin the load-bearing values so any regression to either the
      // T8i hairline-pill or the rubber-stamp ink-pressure variant
      // fails this assertion.
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
      // brand-rose at α 0.32 is the load-bearing cancellation colour
      expect(style.color).toBe('rgba(226, 12, 4, 0.32)')
      // Wide editorial letter-spacing — 5pt, well above both the
      // rubber-stamp baseline 1.6 and the T8i hairline-pill 1.8.
      expect(style.letterSpacing).toBe(5)
      // T8h-and-prior rubber-stamp opacity (0.55 ink-pressure) is
      // explicitly NOT present.
      expect(style.opacity).not.toBe(0.55)
      // Mustica Pro Semibold via the display.sm variant — DESIGN.md
      // Mustica-for-Display Rule.  The variant fontFamily appears
      // in the merged style array.
      expect(style.fontFamily).toBe('MusticaPro-SemiBold')
    })

    it('stamp has NO backdrop / NO border / NO shadow (premium overprint, restraint per DESIGN.md Flat-By-Default Rule)', () => {
      // The previous T8i hairline-pill carried a 1.5px brand-rose
      // border + cream→pale-rose gradient backdrop + soft brand-rose
      // shadow.  The T8k overprint has NONE of these — the rotated
      // type IS the entire visual.  Pin negative regression so a
      // future revert that re-introduces any of them fails here.
      const { getByTestId, queryByTestId } = render(
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
      // Border / backdrop / shadow contract: ALL absent on the
      // overprint container.
      expect(style.borderWidth).toBeUndefined()
      expect(style.borderColor).toBeUndefined()
      expect(style.backgroundColor).toBeUndefined()
      expect(style.shadowOpacity).toBeUndefined()
      expect(style.shadowRadius).toBeUndefined()
      // Cream gradient backdrop from T8i — the LinearGradient was a
      // child of the stamp container.  We assert no gradient stub
      // is mounted INSIDE the stamp by walking children.  The card
      // itself still uses LinearGradient for the type gradient
      // (parent of the stamp).
      const stampChildren = stamp.children ?? []
      const hasInnerGradient = stampChildren.some?.((c: any) =>
        typeof c === 'object' && c?.type?.displayName === 'LinearGradient',
      )
      expect(hasInnerGradient).toBeFalsy()
      // Sanity: the stamp container itself still renders.
      expect(queryByTestId('voucher-card-redeemed-stamp')).toBeTruthy()
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

    it('redeemed cards drop the type-tinted card shadow so they sit flat (PR-B T8j impeccable pass — active cards lift, redeemed cards recede)', () => {
      // The visual-weight differentiation between active and
      // redeemed cards on a list is the load-bearing list-scan
      // signal: at a glance "this card sits, those float" tells
      // the user the redeemed state without parsing the centered
      // seal.  Pin: redeemed cards have shadowOpacity 0 +
      // elevation 0; non-redeemed cards keep the §38-bumped
      // shadow (opacity 0.38, elevation 14).
      const { rerender, UNSAFE_getAllByProps } = render(
        <VoucherCard
          voucher={mk()}
          isRedeemed={false}
          isFavourited={false}
          onPress={() => {}}
          onToggleFavourite={() => {}}
        />,
      )
      // Active card: the flat-shadow style is NOT applied; the §38
      // shadow values (opacity 0.38, elevation 14) come through.
      const flat = (style: unknown): Record<string, unknown> => {
        if (!style) return {}
        if (Array.isArray(style)) {
          return Object.assign({}, ...style.flat(Infinity).filter(Boolean))
        }
        return style as Record<string, unknown>
      }
      // Find the outer Animated.View carrying the cardShadow style.
      // We pin via the shadowOpacity value rather than testID
      // because the Animated.View doesn't expose one — and
      // shadowOpacity is the load-bearing differentiator.
      const findOuter = () =>
        UNSAFE_getAllByProps({ accessibilityRole: 'button' })
          .map((p: any) => p.parent)
          .find(Boolean)
      const activeOuter = findOuter()
      const activeStyle = flat(activeOuter?.props?.style)
      expect(activeStyle.shadowOpacity).toBe(0.38)
      expect(activeStyle.elevation).toBe(14)
      // Now flip to redeemed and re-pin.
      rerender(
        <VoucherCard
          voucher={mk()}
          isRedeemed={true}
          isFavourited={false}
          onPress={() => {}}
          onToggleFavourite={() => {}}
        />,
      )
      const redeemedOuter = findOuter()
      const redeemedStyle = flat(redeemedOuter?.props?.style)
      expect(redeemedStyle.shadowOpacity).toBe(0)
      expect(redeemedStyle.elevation).toBe(0)
    })

    it('redeemed-state cream-tint overlay uses the warmer T8j wash — rgba(255, 246, 238, 0.55) — so the type gradient reads as muted-not-erased', () => {
      // Pin the wash colour + opacity precisely.  Owner direction
      // for the impeccable pass: bump 0.3 → 0.55 with a brand-hue
      // warm cream (255, 246, 238) so the gradient recedes
      // visibly without the card going fully greyscale.  Anti-
      // reference (brief §3.5): "greyscale-everything fade".
      const { getByTestId } = render(
        <VoucherCard
          voucher={mk()}
          isRedeemed={true}
          isFavourited={false}
          onPress={() => {}}
          onToggleFavourite={() => {}}
        />,
      )
      const overlay = getByTestId('voucher-card-redeemed-overlay')
      const flat = Array.isArray(overlay.props.style)
        ? Object.assign({}, ...overlay.props.style.filter(Boolean))
        : overlay.props.style
      expect(flat.backgroundColor).toBe('rgba(255, 246, 238, 0.55)')
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
