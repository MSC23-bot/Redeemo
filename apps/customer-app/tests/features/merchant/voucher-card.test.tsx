import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { VoucherCard } from '@/features/merchant/components/VoucherCard'
import type { MerchantVoucher } from '@/lib/api/merchant'

// Round 5 §24: type labels updated to full-readable sentence-case
// per the user's brief — "Buy one, get one free", "Package deal",
// "Time limited", "Spend & save". Pill renders the type label;
// "Save up to" + £hero stays as separate text nodes; description
// renders on 2 lines (fixes §23's `coff…` truncation).
const mk = (overrides?: Partial<MerchantVoucher>): MerchantVoucher => ({
  id: 'v1',
  type: 'FREEBIE',
  title: 'Free Filter Coffee with Any Thali',
  description: 'Order any thali plate and get a complimentary coffee.',
  estimatedSaving: 2.5,
  expiryDate: null,
  terms: 'T&Cs apply',
  imageUrl: null,
  isRedeemedThisCycle: false,
  // M4a-8 TIME_LIMITED fields — defaults for non-TIME_LIMITED vouchers.
  availabilityWindows: [],
  currentWindow: null,
  nextWindow: null,
  redeemedWindow: null,
  ...overrides,
})

describe('VoucherCard — round 5 §24 brand-R coupon ticket', () => {
  it('renders the sentence-case type label + Save up to + hero amount + title + description', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    // Type label rendered in a horizontal pill (no longer rotated).
    // FREEBIE → 'Freebie' (sentence case, web brand parity).
    expect(getByText('Freebie')).toBeTruthy()
    // "Save up to" qualifier above the hero amount — honest about
    // max savings rather than the previous misleading "OFF".
    expect(getByText('Save up to')).toBeTruthy()
    expect(getByText('£2.50')).toBeTruthy()
    expect(getByText('Free Filter Coffee with Any Thali')).toBeTruthy()
    expect(getByText(/complimentary coffee/)).toBeTruthy()
  })

  it('formats whole-pound savings without decimals (£5 not £5.00)', () => {
    const { getByText, queryByText } = render(
      <VoucherCard
        voucher={mk({ estimatedSaving: 5 })}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(getByText('£5')).toBeTruthy()
    expect(queryByText('£5.00')).toBeNull()
  })

  it('formats penny-bearing savings with two decimals (2.5 → £2.50)', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk({ estimatedSaving: 2.5 })}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(getByText('£2.50')).toBeTruthy()
  })

  it('renders the Redeem CTA on non-redeemed vouchers', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(getByText('Redeem')).toBeTruthy()
  })

  it('replaces the Redeem CTA with the centered "Voucher Redeemed" stamp when isRedeemed (PR-B T8i refinement: copy was "REDEEMED")', () => {
    // PR-B T5.1 spec-fix: the prior bottom-row "Redeemed this cycle"
    // meta text is gone — the brief §5.5 places the redeemed cue at
    // the hero (stamp) + below the saving block ("Already redeemed
    // this cycle" inline label).  The bottom-row left text now falls
    // back to the expiry / "No expiry" copy like every other card,
    // so the row visually rebalances.
    //
    // PR-B T8i: stamp copy moves from "REDEEMED" → "Voucher Redeemed"
    // and the wrap moves from top-right corner → centered overlay
    // per owner direction.
    const { queryByText, getByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={true}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(queryByText('Redeem')).toBeNull()
    expect(getByText('Voucher Redeemed')).toBeTruthy()
    expect(getByText('Already redeemed this cycle')).toBeTruthy()
    // Negative pin: the duplicate bottom-row meta MUST NOT reappear.
    expect(queryByText('Redeemed this cycle')).toBeNull()
    // T8i regression pin: previous single-word "REDEEMED" copy must
    // not resurface (the source string is the full two-word phrase).
    expect(queryByText('REDEEMED')).toBeNull()
  })

  it('fires onPress when card body tapped', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={onPress}
        onToggleFavourite={() => {}}
      />,
    )
    // a11y label uses the sentence-case label.
    fireEvent.press(getByLabelText(/Freebie voucher/))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('fires onToggleFavourite when heart tapped (not card onPress)', () => {
    const onPress = jest.fn()
    const onToggleFavourite = jest.fn()
    const { getByLabelText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={onPress}
        onToggleFavourite={onToggleFavourite}
      />,
    )
    fireEvent.press(getByLabelText('Add to favourites'))
    expect(onToggleFavourite).toHaveBeenCalledTimes(1)
  })

  it('renders the correct sentence-case label per voucher type', () => {
    const types: Array<{ type: MerchantVoucher['type']; label: string }> = [
      { type: 'FREEBIE',          label: 'Freebie' },
      { type: 'BOGO',             label: 'Buy one, get one free' },
      { type: 'DISCOUNT_FIXED',   label: 'Discount' },
      { type: 'DISCOUNT_PERCENT', label: 'Discount' },
      { type: 'SPEND_AND_SAVE',   label: 'Spend & save' },
      { type: 'PACKAGE_DEAL',     label: 'Package deal' },
      { type: 'TIME_LIMITED',     label: 'Time limited' },
      { type: 'REUSABLE',         label: 'Reusable' },
    ]
    for (const t of types) {
      const { getByText } = render(
        <VoucherCard
          voucher={mk({ type: t.type })}
          isRedeemed={false}
          isFavourited={false}
          onPress={() => {}}
          onToggleFavourite={() => {}}
        />,
      )
      expect(getByText(t.label)).toBeTruthy()
    }
  })

  it('shows expiry text when expiryDate is set', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk({ expiryDate: '2026-12-28T00:00:00.000Z' })}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(getByText(/Expires 28 Dec/)).toBeTruthy()
  })

  it('shows "No expiry" placeholder when expiryDate is null', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk({ expiryDate: null })}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(getByText('No expiry')).toBeTruthy()
  })
})

// ── M4c Gate J (revised after device QA 2026-05-11) ──────────────────
//
// Layout: heart STAYS in topRow at the top-right (PR-B locked position).
// Pill mounts IMMEDIATELY LEFT of the heart inside a `topRightGroup`
// flex row. Pill ellipsizes (tail) when topRow is tight — heart position
// is invariant. Card minHeight 144pt unchanged across all voucher types.
// No new row introduced.
//
// Copy (badge hierarchy): UPPERCASE state label · sentence-case detail.
//   active   → "AVAILABLE NOW · Until 3pm today"
//   urgent   → "ENDING SOON · 23m left"
//   today    → "AVAILABLE TODAY · From 5pm"
//   tomorrow → "AVAILABLE TOMORROW · From 12pm"
//   future   → "AVAILABLE WEDNESDAY · From 12pm"
//
// Pulse-dot animation reserved for active + urgent states only (D6 lock).
// Redeemed-this-window TL cards: PR-B overprint preserved, no pill.

describe('VoucherCard — Gate J revised TIME_LIMITED state pill (M4c)', () => {
  const renderPill = (overrides: Partial<MerchantVoucher>, now: Date, isRedeemed = false) =>
    render(
      <VoucherCard
        voucher={mk({ type: 'TIME_LIMITED', ...overrides })}
        isRedeemed={isRedeemed}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
        now={now}
      />,
    )

  // ── State copy variants (badge hierarchy) ─────────────────────────

  it('active TL (>60 min): "AVAILABLE NOW · Until 3pm today" + green pulse-dot', () => {
    // now = 11:00 BST (10:00 UTC); endsAt = 3pm BST (14:00 UTC) = 4h remaining → active.
    const { getByTestId, getByText } = renderPill(
      { currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T14:00:00Z' } },
      new Date('2026-05-11T10:00:00Z'),
    )
    expect(getByTestId('merchant-card-pill-active')).toBeTruthy()
    expect(getByText('AVAILABLE NOW · Until 3pm today')).toBeTruthy()
    expect(getByTestId('merchant-card-pill-pulse-dot')).toBeTruthy()
  })

  it('urgent TL (≤60 min): "ENDING SOON · 23m left" + coral pulse-dot', () => {
    // now = 11:00 UTC; endsAt = 11:23 UTC = 23 min remaining → urgent.
    const { getByTestId, getByText } = renderPill(
      { currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T11:23:00Z' } },
      new Date('2026-05-11T11:00:00Z'),
    )
    expect(getByTestId('merchant-card-pill-urgent')).toBeTruthy()
    expect(getByText('ENDING SOON · 23m left')).toBeTruthy()
    expect(getByTestId('merchant-card-pill-pulse-dot')).toBeTruthy()
  })

  it('outside-window today: "AVAILABLE TODAY · From 5pm" + no pulse-dot', () => {
    // now = 11:00 UTC = 12:00 BST. Next opens 16:00 UTC = 17:00 BST = "5pm".
    const { getByTestId, getByText, queryByTestId } = renderPill(
      {
        currentWindow: null,
        nextWindow: { startsAt: '2026-05-11T16:00:00Z', endsAt: '2026-05-11T18:00:00Z' },
      },
      new Date('2026-05-11T11:00:00Z'),
    )
    expect(getByTestId('merchant-card-pill-unavailable-today')).toBeTruthy()
    expect(getByText('AVAILABLE TODAY · From 5pm')).toBeTruthy()
    expect(queryByTestId('merchant-card-pill-pulse-dot')).toBeNull()
  })

  it('outside-window tomorrow: "AVAILABLE TOMORROW · From 12pm" + no pulse-dot', () => {
    // now = Mon 11:00 UTC = 12:00 BST. Next opens Tue 11:00 UTC = 12:00 BST.
    const { getByTestId, getByText, queryByTestId } = renderPill(
      {
        currentWindow: null,
        nextWindow: { startsAt: '2026-05-12T11:00:00Z', endsAt: '2026-05-12T15:00:00Z' },
      },
      new Date('2026-05-11T11:00:00Z'),
    )
    expect(getByTestId('merchant-card-pill-unavailable-future-day')).toBeTruthy()
    expect(getByText('AVAILABLE TOMORROW · From 12pm')).toBeTruthy()
    expect(queryByTestId('merchant-card-pill-pulse-dot')).toBeNull()
  })

  it('outside-window future-day: "AVAILABLE WEDNESDAY · From 12pm" (full uppercase day name + 12h)', () => {
    // Owner-locked device QA round 3 2026-05-11: full day names beat
    // 3-letter abbreviations for user-friendliness. now = Mon 11:00 UTC;
    // next opens Wed 11:00 UTC → 12pm BST. Pill copy uses the full
    // "WEDNESDAY" uppercase (not "WED") so the user reads a complete word
    // without mental expansion.
    const { getByText } = renderPill(
      {
        currentWindow: null,
        nextWindow: { startsAt: '2026-05-13T11:00:00Z', endsAt: '2026-05-13T15:00:00Z' },
      },
      new Date('2026-05-11T11:00:00Z'),
    )
    expect(getByText('AVAILABLE WEDNESDAY · From 12pm')).toBeTruthy()
  })

  it('outside-window future-day: works for all 7 weekday names (full spelling)', () => {
    // Defensive pin: ensure no future code change re-introduces the
    // `.slice(0, 3)` abbreviation. Test all 7 day names — each produces
    // its full uppercase form.
    const weekdayTests: Array<{ iso: string; expected: string }> = [
      { iso: '2026-05-17T11:00:00Z', expected: 'AVAILABLE SUNDAY · From 12pm' },     // Sun
      { iso: '2026-05-18T11:00:00Z', expected: 'AVAILABLE MONDAY · From 12pm' },     // Mon
      { iso: '2026-05-19T11:00:00Z', expected: 'AVAILABLE TUESDAY · From 12pm' },    // Tue
      { iso: '2026-05-20T11:00:00Z', expected: 'AVAILABLE WEDNESDAY · From 12pm' },  // Wed
      { iso: '2026-05-21T11:00:00Z', expected: 'AVAILABLE THURSDAY · From 12pm' },   // Thu
      { iso: '2026-05-22T11:00:00Z', expected: 'AVAILABLE FRIDAY · From 12pm' },     // Fri
      { iso: '2026-05-23T11:00:00Z', expected: 'AVAILABLE SATURDAY · From 12pm' },   // Sat
    ]
    // Reference instant is set to a day FAR enough back that all 7 target
    // days land as future-day (not today/tomorrow). 2026-05-14 Thursday
    // 09:00 UTC → next Sun (May 17) is 3 days out, last Sat (May 23) is
    // 9 days out. ymd-tomorrow check fires only for May 15 Friday; rest
    // route through the full-day-name branch.
    const referenceNow = new Date('2026-05-14T09:00:00Z')
    for (const t of weekdayTests) {
      const { getByText } = renderPill(
        {
          currentWindow: null,
          nextWindow: { startsAt: t.iso, endsAt: t.iso },
        },
        referenceNow,
      )
      expect(getByText(t.expected)).toBeTruthy()
    }
  })

  // ── Outside-window opacity tier (75% — distinct from redeemed) ────

  it('outside-window TL: card root opacity 0.75 (distinct from redeemed-state cream-tint)', () => {
    const { getByTestId } = renderPill(
      {
        currentWindow: null,
        nextWindow: { startsAt: '2026-05-12T11:00:00Z', endsAt: '2026-05-12T15:00:00Z' },
      },
      new Date('2026-05-11T11:00:00Z'),
    )
    const card = getByTestId('merchant-voucher-card')
    const flat = Array.isArray(card.props.style) ? card.props.style.flat(Infinity) : [card.props.style]
    const opacityEntry = flat.find((s: Record<string, unknown> | null | undefined) =>
      s && (s as { opacity?: number }).opacity === 0.75)
    expect(opacityEntry).toBeTruthy()
  })

  it('active TL: card root NOT at 0.75 opacity (live state stays at full presence)', () => {
    const { getByTestId } = renderPill(
      { currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T14:00:00Z' } },
      new Date('2026-05-11T11:00:00Z'),
    )
    const card = getByTestId('merchant-voucher-card')
    const flat = Array.isArray(card.props.style) ? card.props.style.flat(Infinity) : [card.props.style]
    const opacityEntry = flat.find((s: Record<string, unknown> | null | undefined) =>
      s && (s as { opacity?: number }).opacity === 0.75)
    expect(opacityEntry).toBeFalsy()
  })

  // ── Redeemed-this-window TL: no pill, PR-B overprint preserved ────

  it('redeemed-this-window TL: PR-B overprint renders, NO pill', () => {
    const { queryByTestId, getByTestId } = renderPill(
      { redeemedWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T14:00:00Z' } },
      new Date('2026-05-11T11:00:00Z'),
      true,  // isRedeemed=true (TL redeemedWindow drives isRedeemed in MerchantProfileScreen)
    )
    expect(queryByTestId('merchant-card-pill-active')).toBeNull()
    expect(queryByTestId('merchant-card-pill-urgent')).toBeNull()
    expect(queryByTestId('merchant-card-pill-unavailable-today')).toBeNull()
    expect(queryByTestId('merchant-card-pill-unavailable-future-day')).toBeNull()
    expect(queryByTestId('merchant-card-pill-pulse-dot')).toBeNull()
    expect(getByTestId('voucher-redeemed-overprint')).toBeTruthy()
  })

  // ── Negative pins ─────────────────────────────────────────────────

  it('non-TIME_LIMITED voucher: NO pill (regression guard)', () => {
    const { queryByTestId } = render(
      <VoucherCard
        voucher={mk({ type: 'BOGO' })}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
        now={new Date('2026-05-11T11:00:00Z')}
      />,
    )
    expect(queryByTestId('merchant-card-pill-active')).toBeNull()
    expect(queryByTestId('merchant-card-pill-urgent')).toBeNull()
    expect(queryByTestId('merchant-card-pill-unavailable-today')).toBeNull()
    expect(queryByTestId('merchant-card-pill-unavailable-future-day')).toBeNull()
    expect(queryByTestId('merchant-card-pill-pulse-dot')).toBeNull()
  })

  it('stale currentWindow (endsAt in the past): does NOT classify as active/urgent — falls through to outside-window copy', () => {
    const { queryByTestId, getByTestId } = renderPill(
      {
        currentWindow: { startsAt: '2026-05-11T08:00:00Z', endsAt: '2026-05-11T10:00:00Z' },  // closed 1h ago
        nextWindow:    { startsAt: '2026-05-12T11:00:00Z', endsAt: '2026-05-12T15:00:00Z' },
      },
      new Date('2026-05-11T11:00:00Z'),
    )
    expect(queryByTestId('merchant-card-pill-active')).toBeNull()
    expect(queryByTestId('merchant-card-pill-urgent')).toBeNull()
    expect(getByTestId('merchant-card-pill-unavailable-future-day')).toBeTruthy()
  })

  it('degenerate TL voucher (no current AND no next window): pill renders NOTHING', () => {
    const { queryByTestId } = renderPill(
      { currentWindow: null, nextWindow: null },
      new Date('2026-05-11T11:00:00Z'),
    )
    expect(queryByTestId('merchant-card-pill-active')).toBeNull()
    expect(queryByTestId('merchant-card-pill-urgent')).toBeNull()
    expect(queryByTestId('merchant-card-pill-unavailable-today')).toBeNull()
    expect(queryByTestId('merchant-card-pill-unavailable-future-day')).toBeNull()
  })

  // ── Layout regression pins (Gate J revised TWICE) ────────────────
  //
  // TL pill cards (active/urgent/outside-window) use the STACKED layout:
  //   [chip — left]   ⋮   [pill — full right column]
  //                       [heart — right-aligned below]
  // Non-TL / redeemed-TL / degenerate-TL keep the PR-B ROW layout:
  //   [chip — left]                       [heart — right]

  it('TL pill cards: chip → pill → heart in DOM order, all within topRow (stacked layout)', () => {
    // Gate J revised twice: pill gets its own row inside the topRow's
    // right column; heart sits BELOW the pill, right-aligned. All three
    // elements remain inside topRow — no bottomRow involvement.
    const { toJSON } = renderPill(
      { currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T14:00:00Z' } },
      new Date('2026-05-11T11:00:00Z'),
    )
    const tree = JSON.stringify(toJSON())
    const chipIdx  = tree.indexOf('"Time limited"')
    const pillIdx  = tree.indexOf('AVAILABLE NOW · Until')
    const heartIdx = tree.indexOf('Add to favourites')
    expect(chipIdx).toBeGreaterThan(-1)
    expect(pillIdx).toBeGreaterThan(-1)
    expect(heartIdx).toBeGreaterThan(-1)
    // chip → pill → heart in DOM order. Heart STILL precedes bottomRow.
    expect(chipIdx).toBeLessThan(pillIdx)
    expect(pillIdx).toBeLessThan(heartIdx)
  })

  it('TL pill cards: heart precedes the bottomRow expiry text (heart still lives in topRow)', () => {
    // Confirms the stacked heart is in topRow (just visually below the pill),
    // NOT relocated to bottomRow. Bottom-row expiry text ("No expiry" /
    // "Expires …") renders AFTER the heart in DOM order.
    const { toJSON } = renderPill(
      {
        currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T14:00:00Z' },
        expiryDate: null,
      },
      new Date('2026-05-11T11:00:00Z'),
    )
    const tree = JSON.stringify(toJSON())
    const heartIdx  = tree.indexOf('Add to favourites')
    const expiryIdx = tree.indexOf('No expiry')
    expect(heartIdx).toBeGreaterThan(-1)
    expect(expiryIdx).toBeGreaterThan(-1)
    expect(heartIdx).toBeLessThan(expiryIdx)
  })

  it('non-TL cards: heart sits in PR-B locked top-right (row layout, NOT stacked)', () => {
    // Non-TL cards keep the PR-B row layout: chip-left, heart-right, NO pill.
    // The stacked layout is reserved for TL pill cards only. This pin guards
    // against the stacked layout accidentally applying to non-TL cards.
    const { toJSON } = render(
      <VoucherCard
        voucher={mk({ type: 'BOGO', expiryDate: null })}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
        now={new Date('2026-05-11T11:00:00Z')}
      />,
    )
    const tree = JSON.stringify(toJSON())
    // No pill testIDs anywhere in the tree.
    expect(tree).not.toMatch(/merchant-card-pill-(active|urgent|unavailable)/)
    // Heart in topRow (before bottomRow expiry).
    const heartIdx  = tree.indexOf('Add to favourites')
    const expiryIdx = tree.indexOf('No expiry')
    expect(heartIdx).toBeLessThan(expiryIdx)
  })

  it('redeemed-TL cards: heart in PR-B top-right (NOT stacked — redeemed cards have no pill)', () => {
    // Redeemed-this-window TL cards render the PR-B overprint and NO pill.
    // The stacked layout doesn't apply — heart stays in its PR-B top-right
    // position next to the chip.
    const { toJSON, getByTestId } = renderPill(
      { redeemedWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T14:00:00Z' } },
      new Date('2026-05-11T11:00:00Z'),
      true,
    )
    expect(getByTestId('voucher-redeemed-overprint')).toBeTruthy()
    const tree = JSON.stringify(toJSON())
    // No pill testIDs (pill component early-returns for redeemed-this-window).
    expect(tree).not.toMatch(/merchant-card-pill-(active|urgent|unavailable)/)
  })

  it('TL pill cards: pill text is single-line + tail-ellipsize (defensive fallback for very narrow screens)', () => {
    // The stacked layout gives the pill the full right-column width (75% of
    // row) so it should fit on iPhone SE without truncating. The single-line +
    // tail-ellipsize props on the Text are a DEFENSIVE fallback — if a future
    // pill copy variant grows beyond the column width, it truncates rather
    // than wrapping to a 3rd visible line and disturbing the heart slot below.
    const { getByText } = renderPill(
      { currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T14:00:00Z' } },
      new Date('2026-05-11T11:00:00Z'),
    )
    const pillText = getByText('AVAILABLE NOW · Until 3pm today')
    expect(pillText.props.numberOfLines).toBe(1)
    expect(pillText.props.ellipsizeMode).toBe('tail')
  })

  it('stale currentWindow + null nextWindow: PR-B row layout (no empty stacked column)', () => {
    // Gate K Minor #1 fix (2026-05-11): without this guard, a stale
    // `currentWindow` (endsAt in the past) + null `nextWindow` would flip
    // `hasTLPill === true` and render the stacked column WITHOUT a pill —
    // leaving just the heart in an empty top-stack slot. The fix tightens
    // `hasTLPill` to require a LIVE current window (not just any non-null
    // currentWindow). Pinned here so a future regression of the `hasTLPill`
    // composition surfaces immediately.
    const { toJSON, queryByTestId } = renderPill(
      {
        // currentWindow.endsAt is 1h in the past relative to `now`.
        currentWindow: { startsAt: '2026-05-11T08:00:00Z', endsAt: '2026-05-11T10:00:00Z' },
        nextWindow:    null,
      },
      new Date('2026-05-11T11:00:00Z'),
    )
    // Pill renders nothing (degenerate state — no live window AND no next).
    expect(queryByTestId('merchant-card-pill-active')).toBeNull()
    expect(queryByTestId('merchant-card-pill-urgent')).toBeNull()
    expect(queryByTestId('merchant-card-pill-unavailable-today')).toBeNull()
    expect(queryByTestId('merchant-card-pill-unavailable-future-day')).toBeNull()
    // Row layout (not stacked): heart sits in topRow directly, NOT below an
    // empty pill slot. DOM order: chip → heart → bottomRow expiry.
    const tree = JSON.stringify(toJSON())
    const chipIdx   = tree.indexOf('"Time limited"')
    const heartIdx  = tree.indexOf('Add to favourites')
    const expiryIdx = tree.indexOf('No expiry')
    expect(chipIdx).toBeGreaterThan(-1)
    expect(heartIdx).toBeGreaterThan(-1)
    expect(expiryIdx).toBeGreaterThan(-1)
    expect(chipIdx).toBeLessThan(heartIdx)
    expect(heartIdx).toBeLessThan(expiryIdx)
  })

  it('non-TL cards: card minHeight 144pt unchanged (stacked layout does NOT apply)', () => {
    // The stacked TL layout adds vertical space inside topRow for the pill row +
    // heart row. Non-TL cards keep the PR-B baseline minHeight 144pt because
    // the stack is opt-in (only fires when `hasTLPill === true`).
    const { getByLabelText } = render(
      <VoucherCard
        voucher={mk({ type: 'BOGO' })}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
        now={new Date('2026-05-11T11:00:00Z')}
      />,
    )
    const cardPressable = getByLabelText(/voucher:/)
    const flat = Array.isArray(cardPressable.props.style)
      ? cardPressable.props.style.flat(Infinity)
      : [cardPressable.props.style]
    const minHeightEntry = flat.find((s: Record<string, unknown> | null | undefined) =>
      s && (s as { minHeight?: number }).minHeight === 144)
    expect(minHeightEntry).toBeTruthy()
  })
})

// ── M5 REUSABLE pill states (Task 11) ────────────────────────────────
//
// Spec §8.1 + D28-D35:
//   reusable-available           → "AVAILABLE NOW" (standalone, no `·` detail)
//                                  + green pulse-dot (#34D399, same as TL active)
//                                  + card opacity 100%
//   reusable-cooldown ≤60 min    → "AVAILABLE AGAIN · 23m left"
//                                  via formatDurationCompact; NO pulse, opacity 75%
//   reusable-cooldown >60 min    → "AVAILABLE AGAIN · From 4pm today"
//                                                    / "From 11am tomorrow"
//                                                    / "From 12pm WEDNESDAY"
//                                  via formatClockHour12 + day context (full
//                                  uppercase weekday, matching M4c device-QA
//                                  round 3 lock for future-day TL); NO pulse,
//                                  opacity 75%.
//   No urgency colour band for REUSABLE at any state (D31).
//   No rubber-stamp overprint at any REUSABLE state (D35) — overprint stays
//   exclusive to cycle vouchers.
//   No sub-headline ("Every 4 hours") on the card (D34).
//
// testIDs (D32):
//   merchant-card-pill-reusable-available
//   merchant-card-pill-reusable-cooldown   (covers BOTH cooldown sub-thresholds —
//                                           copy distinguishes ≤60 vs >60 min,
//                                           mirroring TL's unavailable-today /
//                                           unavailable-future-day pattern.)

describe('VoucherCard — REUSABLE state pill (M5)', () => {
  const renderPill = (overrides: Partial<MerchantVoucher>, now: Date) =>
    render(
      <VoucherCard
        voucher={mk({ type: 'REUSABLE', ...overrides })}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
        now={now}
      />,
    )

  // ── State 1: available ────────────────────────────────────────────

  it('reusable-available (availableAgainAt = null): "AVAILABLE NOW" standalone + green pulse-dot', () => {
    const { getByTestId, getByText, queryByText } = renderPill(
      { reusableState: { availableAgainAt: null } },
      new Date('2026-05-12T12:00:00Z'),
    )
    expect(getByTestId('merchant-card-pill-reusable-available')).toBeTruthy()
    // Standalone — no `· detail` segment (spec §8.1).
    expect(getByText('AVAILABLE NOW')).toBeTruthy()
    // Confirm `·` separator is absent on the available state.
    expect(queryByText(/AVAILABLE NOW · /)).toBeNull()
    // Green pulse-dot renders (same as TL active state, spec §8.1).
    expect(getByTestId('merchant-card-pill-pulse-dot')).toBeTruthy()
  })

  it('reusable-available (reusableState = null entirely): "AVAILABLE NOW" + green pulse-dot', () => {
    // Defensive: a REUSABLE voucher whose backend payload omits the field
    // (or sends a top-level null) should also surface AVAILABLE NOW —
    // pre-M5 cached responses lacked the field.
    const { getByTestId, getByText } = renderPill(
      { reusableState: null },
      new Date('2026-05-12T12:00:00Z'),
    )
    expect(getByTestId('merchant-card-pill-reusable-available')).toBeTruthy()
    expect(getByText('AVAILABLE NOW')).toBeTruthy()
    expect(getByTestId('merchant-card-pill-pulse-dot')).toBeTruthy()
  })

  it('reusable-available (availableAgainAt in the past): falls through to AVAILABLE NOW', () => {
    // Stale-payload guard analogue: if backend reports a cooldown end-time
    // that's already in the past relative to `now`, render the available
    // state rather than a phantom "AVAILABLE AGAIN · 0m left" pill.
    const now = new Date('2026-05-12T12:00:00Z')
    const pastAvailableAgainAt = new Date(now.getTime() - 5 * 60_000).toISOString()
    const { getByTestId, getByText } = renderPill(
      { reusableState: { availableAgainAt: pastAvailableAgainAt } },
      now,
    )
    expect(getByTestId('merchant-card-pill-reusable-available')).toBeTruthy()
    expect(getByText('AVAILABLE NOW')).toBeTruthy()
  })

  // ── State 2: cooldown ≤60 min ─────────────────────────────────────

  it('reusable-cooldown ≤60min: "AVAILABLE AGAIN · 23m left" + NO pulse-dot', () => {
    const now = new Date('2026-05-12T12:00:00Z')
    const availableAgainAt = new Date(now.getTime() + 23 * 60_000).toISOString()
    const { getByTestId, getByText, queryByTestId } = renderPill(
      { reusableState: { availableAgainAt } },
      now,
    )
    expect(getByTestId('merchant-card-pill-reusable-cooldown')).toBeTruthy()
    expect(getByText('AVAILABLE AGAIN · 23m left')).toBeTruthy()
    // D31: no pulse on cooldown — nothing bad happens at expiry.
    expect(queryByTestId('merchant-card-pill-pulse-dot')).toBeNull()
  })

  it('reusable-cooldown ≤60min (boundary, exactly 60 min away): countdown form (≤60 min branch)', () => {
    // Boundary case: msUntilAvailable === 60 min → use ≤60min countdown branch.
    // `formatDurationCompact` returns "1h 0m" for the 60-min boundary
    // (>= 60 min total minutes flips to hours-and-minutes formatting), so
    // the displayed copy is "AVAILABLE AGAIN · 1h 0m left". Still countdown
    // form (not clock-hour form) — confirms the boundary classification.
    const now = new Date('2026-05-12T12:00:00Z')
    const availableAgainAt = new Date(now.getTime() + 60 * 60_000).toISOString()
    const { getByTestId, getByText } = renderPill(
      { reusableState: { availableAgainAt } },
      now,
    )
    expect(getByTestId('merchant-card-pill-reusable-cooldown')).toBeTruthy()
    expect(getByText('AVAILABLE AGAIN · 1h 0m left')).toBeTruthy()
  })

  // ── State 3: cooldown >60 min ─────────────────────────────────────

  it('reusable-cooldown >60min, today: "AVAILABLE AGAIN · From 4pm today" + NO pulse', () => {
    // now = 12:00 UTC = 13:00 BST. availableAgainAt = 15:00 UTC = 16:00 BST = "4pm".
    const now = new Date('2026-05-12T12:00:00Z')
    const availableAgainAt = '2026-05-12T15:00:00Z'
    const { getByTestId, getByText, queryByTestId } = renderPill(
      { reusableState: { availableAgainAt } },
      now,
    )
    expect(getByTestId('merchant-card-pill-reusable-cooldown')).toBeTruthy()
    expect(getByText('AVAILABLE AGAIN · From 4pm today')).toBeTruthy()
    expect(queryByTestId('merchant-card-pill-pulse-dot')).toBeNull()
  })

  it('reusable-cooldown >60min, tomorrow: "AVAILABLE AGAIN · From 11am tomorrow" + NO pulse', () => {
    // now = Tue 12:00 UTC = 13:00 BST. availableAgainAt = Wed 10:00 UTC = 11:00 BST.
    const now = new Date('2026-05-12T12:00:00Z')
    const availableAgainAt = '2026-05-13T10:00:00Z'
    const { getByTestId, getByText, queryByTestId } = renderPill(
      { reusableState: { availableAgainAt } },
      now,
    )
    expect(getByTestId('merchant-card-pill-reusable-cooldown')).toBeTruthy()
    expect(getByText('AVAILABLE AGAIN · From 11am tomorrow')).toBeTruthy()
    expect(queryByTestId('merchant-card-pill-pulse-dot')).toBeNull()
  })

  it('reusable-cooldown >60min, future-day: "AVAILABLE AGAIN · From 12pm WEDNESDAY" (full uppercase weekday)', () => {
    // now = Mon 12:00 UTC; availableAgainAt = Wed 11:00 UTC = 12:00 BST.
    // Full uppercase weekday name (spec §9 ledger), matching the M4c
    // device-QA round 3 lock that beat 3-letter abbreviations.
    const now = new Date('2026-05-11T12:00:00Z')
    const availableAgainAt = '2026-05-13T11:00:00Z'
    const { getByTestId, getByText, queryByTestId } = renderPill(
      { reusableState: { availableAgainAt } },
      now,
    )
    expect(getByTestId('merchant-card-pill-reusable-cooldown')).toBeTruthy()
    expect(getByText('AVAILABLE AGAIN · From 12pm WEDNESDAY')).toBeTruthy()
    expect(queryByTestId('merchant-card-pill-pulse-dot')).toBeNull()
  })

  it('reusable-cooldown >60min: all 7 weekday names render in full uppercase form', () => {
    // Defensive pin: ensure no future code change reintroduces a `.slice(0, 3)`
    // abbreviation. Reference instant set so all 7 target days land as future-day.
    const weekdayTests: Array<{ iso: string; expected: string }> = [
      { iso: '2026-05-17T11:00:00Z', expected: 'AVAILABLE AGAIN · From 12pm SUNDAY' },
      { iso: '2026-05-18T11:00:00Z', expected: 'AVAILABLE AGAIN · From 12pm MONDAY' },
      { iso: '2026-05-19T11:00:00Z', expected: 'AVAILABLE AGAIN · From 12pm TUESDAY' },
      { iso: '2026-05-20T11:00:00Z', expected: 'AVAILABLE AGAIN · From 12pm WEDNESDAY' },
      { iso: '2026-05-21T11:00:00Z', expected: 'AVAILABLE AGAIN · From 12pm THURSDAY' },
      { iso: '2026-05-22T11:00:00Z', expected: 'AVAILABLE AGAIN · From 12pm FRIDAY' },
      { iso: '2026-05-23T11:00:00Z', expected: 'AVAILABLE AGAIN · From 12pm SATURDAY' },
    ]
    const referenceNow = new Date('2026-05-14T09:00:00Z')  // Thu — all 7 land as future-day
    for (const t of weekdayTests) {
      const { getByText } = renderPill(
        { reusableState: { availableAgainAt: t.iso } },
        referenceNow,
      )
      expect(getByText(t.expected)).toBeTruthy()
    }
  })

  // ── Card opacity tiers (75% in cooldown, 100% available) ──────────

  it('reusable-cooldown card opacity 0.75 (matches TL outside-window tier, spec §6.1)', () => {
    const now = new Date('2026-05-12T12:00:00Z')
    const availableAgainAt = new Date(now.getTime() + 2 * 3_600_000).toISOString()  // 2h ahead
    const { getByTestId } = renderPill(
      { reusableState: { availableAgainAt } },
      now,
    )
    const card = getByTestId('merchant-voucher-card')
    const flat = Array.isArray(card.props.style) ? card.props.style.flat(Infinity) : [card.props.style]
    const opacityEntry = flat.find((s: Record<string, unknown> | null | undefined) =>
      s && (s as { opacity?: number }).opacity === 0.75)
    expect(opacityEntry).toBeTruthy()
  })

  it('reusable-available card NOT at 0.75 opacity (live state stays at full presence)', () => {
    const now = new Date('2026-05-12T12:00:00Z')
    const { getByTestId } = renderPill(
      { reusableState: { availableAgainAt: null } },
      now,
    )
    const card = getByTestId('merchant-voucher-card')
    const flat = Array.isArray(card.props.style) ? card.props.style.flat(Infinity) : [card.props.style]
    const opacityEntry = flat.find((s: Record<string, unknown> | null | undefined) =>
      s && (s as { opacity?: number }).opacity === 0.75)
    expect(opacityEntry).toBeFalsy()
  })

  // ── D35: NO rubber-stamp overprint at ANY REUSABLE state ──────────

  it('reusable-available: NO rubber-stamp overprint (D35)', () => {
    const { queryByTestId } = renderPill(
      { reusableState: { availableAgainAt: null } },
      new Date('2026-05-12T12:00:00Z'),
    )
    expect(queryByTestId('voucher-redeemed-overprint')).toBeNull()
    expect(queryByTestId('voucher-card-redeemed-stamp')).toBeNull()
  })

  it('reusable-cooldown: NO rubber-stamp overprint (D35)', () => {
    const now = new Date('2026-05-12T12:00:00Z')
    const availableAgainAt = new Date(now.getTime() + 2 * 3_600_000).toISOString()
    const { queryByTestId } = renderPill(
      { reusableState: { availableAgainAt } },
      now,
    )
    expect(queryByTestId('voucher-redeemed-overprint')).toBeNull()
    expect(queryByTestId('voucher-card-redeemed-stamp')).toBeNull()
  })

  // ── Negative pins ─────────────────────────────────────────────────

  it('REUSABLE: TL-specific pill testIDs do NOT appear (regression guard)', () => {
    // TL active/urgent/unavailable-today/-future-day testIDs are reserved
    // for TIME_LIMITED. REUSABLE must use its own pair.
    const { queryByTestId } = renderPill(
      { reusableState: { availableAgainAt: null } },
      new Date('2026-05-12T12:00:00Z'),
    )
    expect(queryByTestId('merchant-card-pill-active')).toBeNull()
    expect(queryByTestId('merchant-card-pill-urgent')).toBeNull()
    expect(queryByTestId('merchant-card-pill-unavailable-today')).toBeNull()
    expect(queryByTestId('merchant-card-pill-unavailable-future-day')).toBeNull()
  })
})

// ── M5 REUSABLE sort buckets (Task 11, spec §8.3 D33) ────────────────
//
// Bucket 1 — Actionable now: TL active/urgent + REUSABLE-available
//                            + cycle-not-redeemed-this-cycle
// Bucket 2 — Soon / blocked: TL unavailable-today + REUSABLE-cooldown
//                            + cycle-redeemed-this-cycle
// Bucket 3 — Future:         TL unavailable-future-day
// Bucket 4 — Terminal:       expired (filtered out)
//
// Within Bucket 2 (renumbered to bucket-5 in current sort impl), sort
// nearest-available-time:
//   TL       → nextWindow.startsAt
//   REUSABLE → reusableState.availableAgainAt

describe('sortMerchantVouchers — REUSABLE bucket integration (M5, spec §8.3)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { sortMerchantVouchers } = require('@/features/merchant/utils/voucherCardSort') as {
    sortMerchantVouchers: (vouchers: MerchantVoucher[], now?: Date) => MerchantVoucher[]
  }

  const mkR = (id: string, availableAgainAt: string | null | undefined): MerchantVoucher =>
    mk({
      id,
      type: 'REUSABLE',
      reusableState: availableAgainAt === undefined ? null : { availableAgainAt },
    })

  const mkTL = (id: string, currentWindow: MerchantVoucher['currentWindow'], nextWindow: MerchantVoucher['nextWindow']): MerchantVoucher =>
    mk({ id, type: 'TIME_LIMITED', currentWindow, nextWindow })

  const mkCycle = (id: string, type: MerchantVoucher['type'], isRedeemedThisCycle: boolean): MerchantVoucher =>
    mk({ id, type, isRedeemedThisCycle })

  it('REUSABLE-available joins Bucket 1 alongside TL-active + cycle-not-redeemed', () => {
    // Cards: TL-active, REUSABLE-available, cycle-not-redeemed, TL-outside (Bucket 4).
    // Bucket 1 cards must precede Bucket 4 card in output order.
    const now = new Date('2026-05-12T12:00:00Z')
    const tlActive = mkTL(
      'tl-active',
      { startsAt: '2026-05-12T10:00:00Z', endsAt: '2026-05-12T14:00:00Z' },  // 2h remaining → active
      null,
    )
    const reusableAvailable = mkR('reusable-avail', null)
    const cycleNotRedeemed  = mkCycle('cycle-active', 'BOGO', false)
    const tlOutside         = mkTL('tl-outside', null, {
      startsAt: '2026-05-13T11:00:00Z', endsAt: '2026-05-13T15:00:00Z',
    })

    const sorted = sortMerchantVouchers(
      [tlOutside, reusableAvailable, cycleNotRedeemed, tlActive],
      now,
    )
    const ids = sorted.map(v => v.id)

    // tl-outside must be LAST among these four — Bucket 1 cards in any
    // stable order before it.
    expect(ids[ids.length - 1]).toBe('tl-outside')
    // First three (Bucket 1) include all three actionable cards.
    expect(ids.slice(0, 3).sort()).toEqual(['cycle-active', 'reusable-avail', 'tl-active'])
  })

  it('REUSABLE-cooldown joins the soon/blocked tier alongside TL-unavailable, ordered by nearest available time', () => {
    // Cards: TL-active (Bucket 1 tier — actionable), REUSABLE-cooldown,
    // TL-unavailable (no live window), cycle-redeemed. Existing sort util
    // keeps cycle-redeemed in its terminal bucket (renders last) per the
    // spec §6.3 baseline — REUSABLE-cooldown integration extends the
    // soon/blocked tier WITHOUT collapsing the existing cycle-redeemed
    // separation. D33 ordering is preserved at the visible-tier level:
    // TL-active first, then REUSABLE-cooldown + TL-unavailable (in
    // nearest-time order), then cycle-redeemed last.
    const now = new Date('2026-05-12T12:00:00Z')

    const tlActive = mkTL(
      'tl-active',
      { startsAt: '2026-05-12T10:00:00Z', endsAt: '2026-05-12T14:00:00Z' },
      null,
    )
    // REUSABLE cooldown ends at 14:00 UTC (2h away).
    const reusableCooldown = mkR('reusable-cool', '2026-05-12T14:00:00Z')
    // TL unavailable nextWindow starts at 16:00 UTC (4h away).
    const tlUnavail = mkTL(
      'tl-today',
      null,
      { startsAt: '2026-05-12T16:00:00Z', endsAt: '2026-05-12T18:00:00Z' },
    )
    const cycleRedeemed = mkCycle('cycle-done', 'BOGO', true)

    const sorted = sortMerchantVouchers(
      [cycleRedeemed, tlUnavail, reusableCooldown, tlActive],
      now,
    )
    const ids = sorted.map(v => v.id)

    // Tier 1 (actionable): tl-active first.
    expect(ids[0]).toBe('tl-active')
    // Tier 2 (soon/blocked): reusable-cool (14:00 UTC) before tl-today
    // (16:00 UTC) — nearest-available-time wins.
    expect(ids[1]).toBe('reusable-cool')
    expect(ids[2]).toBe('tl-today')
    // Terminal tier: cycle-done last (existing baseline behaviour).
    expect(ids[3]).toBe('cycle-done')
  })

  it('Intra-Bucket-2 sort: REUSABLE-cooldown availableAgainAt vs TL nextWindow.startsAt — nearest first', () => {
    // Two REUSABLE cooldowns + two TL unavailable-today, interleaved by time.
    const now = new Date('2026-05-12T12:00:00Z')

    const reusableNear   = mkR('reusable-near',   '2026-05-12T13:00:00Z')  // 1h away
    const reusableFar    = mkR('reusable-far',    '2026-05-12T18:00:00Z')  // 6h away
    const tlEarly        = mkTL('tl-early', null, { startsAt: '2026-05-12T14:00:00Z', endsAt: '2026-05-12T15:00:00Z' })  // 2h away
    const tlLate         = mkTL('tl-late',  null, { startsAt: '2026-05-12T17:00:00Z', endsAt: '2026-05-12T18:00:00Z' })  // 5h away

    const sorted = sortMerchantVouchers(
      [tlLate, reusableFar, tlEarly, reusableNear],
      now,
    )
    expect(sorted.map(v => v.id)).toEqual([
      'reusable-near', 'tl-early', 'tl-late', 'reusable-far',
    ])
  })

  it('REUSABLE-available (reusableState = null entirely) → Bucket 1', () => {
    // Defensive: omitted/null reusableState on a REUSABLE voucher is the
    // same as availableAgainAt = null. Must land in Bucket 1, not Bucket 2.
    const now = new Date('2026-05-12T12:00:00Z')

    const reusableNull = mk({ id: 'reusable-null', type: 'REUSABLE', reusableState: null })
    const tlOutside    = mkTL('tl-outside', null, {
      startsAt: '2026-05-13T11:00:00Z', endsAt: '2026-05-13T15:00:00Z',
    })

    const sorted = sortMerchantVouchers([tlOutside, reusableNull], now)
    expect(sorted.map(v => v.id)).toEqual(['reusable-null', 'tl-outside'])
  })

  it('Expired REUSABLE filtered out entirely (D4 lock)', () => {
    const now = new Date('2026-05-12T12:00:00Z')

    const expiredReusable = mk({
      id: 'expired',
      type: 'REUSABLE',
      reusableState: { availableAgainAt: null },
      expiryDate: '2026-05-10T00:00:00Z',  // 2 days ago
    })
    const liveReusable = mkR('live', null)

    const sorted = sortMerchantVouchers([expiredReusable, liveReusable], now)
    expect(sorted.map(v => v.id)).toEqual(['live'])
  })
})
