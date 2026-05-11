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
//   active   → "AVAILABLE NOW · Ends 3pm today"
//   urgent   → "CLOSING SOON · 23m left"
//   today    → "OPENS TODAY · 5pm"
//   tomorrow → "OPENS TOMORROW · 12pm"
//   future   → "OPENS WED · 12pm"
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

  it('active TL (>60 min): "AVAILABLE NOW · Ends 3pm today" + green pulse-dot', () => {
    // now = 11:00 BST (10:00 UTC); endsAt = 3pm BST (14:00 UTC) = 4h remaining → active.
    const { getByTestId, getByText } = renderPill(
      { currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T14:00:00Z' } },
      new Date('2026-05-11T10:00:00Z'),
    )
    expect(getByTestId('merchant-card-pill-active')).toBeTruthy()
    expect(getByText('AVAILABLE NOW · Ends 3pm today')).toBeTruthy()
    expect(getByTestId('merchant-card-pill-pulse-dot')).toBeTruthy()
  })

  it('urgent TL (≤60 min): "CLOSING SOON · 23m left" + coral pulse-dot', () => {
    // now = 11:00 UTC; endsAt = 11:23 UTC = 23 min remaining → urgent.
    const { getByTestId, getByText } = renderPill(
      { currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T11:23:00Z' } },
      new Date('2026-05-11T11:00:00Z'),
    )
    expect(getByTestId('merchant-card-pill-urgent')).toBeTruthy()
    expect(getByText('CLOSING SOON · 23m left')).toBeTruthy()
    expect(getByTestId('merchant-card-pill-pulse-dot')).toBeTruthy()
  })

  it('outside-window today: "OPENS TODAY · 5pm" + no pulse-dot', () => {
    // now = 11:00 UTC = 12:00 BST. Next opens 16:00 UTC = 17:00 BST = "5pm".
    const { getByTestId, getByText, queryByTestId } = renderPill(
      {
        currentWindow: null,
        nextWindow: { startsAt: '2026-05-11T16:00:00Z', endsAt: '2026-05-11T18:00:00Z' },
      },
      new Date('2026-05-11T11:00:00Z'),
    )
    expect(getByTestId('merchant-card-pill-unavailable-today')).toBeTruthy()
    expect(getByText('OPENS TODAY · 5pm')).toBeTruthy()
    expect(queryByTestId('merchant-card-pill-pulse-dot')).toBeNull()
  })

  it('outside-window tomorrow: "OPENS TOMORROW · 12pm" + no pulse-dot', () => {
    // now = Mon 11:00 UTC = 12:00 BST. Next opens Tue 11:00 UTC = 12:00 BST.
    const { getByTestId, getByText, queryByTestId } = renderPill(
      {
        currentWindow: null,
        nextWindow: { startsAt: '2026-05-12T11:00:00Z', endsAt: '2026-05-12T15:00:00Z' },
      },
      new Date('2026-05-11T11:00:00Z'),
    )
    expect(getByTestId('merchant-card-pill-unavailable-future-day')).toBeTruthy()
    expect(getByText('OPENS TOMORROW · 12pm')).toBeTruthy()
    expect(queryByTestId('merchant-card-pill-pulse-dot')).toBeNull()
  })

  it('outside-window future-day: "OPENS WEDNESDAY · 12pm" (full uppercase day name + 12h)', () => {
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
    expect(getByText('OPENS WEDNESDAY · 12pm')).toBeTruthy()
  })

  it('outside-window future-day: works for all 7 weekday names (full spelling)', () => {
    // Defensive pin: ensure no future code change re-introduces the
    // `.slice(0, 3)` abbreviation. Test all 7 day names — each produces
    // its full uppercase form.
    const weekdayTests: Array<{ iso: string; expected: string }> = [
      { iso: '2026-05-17T11:00:00Z', expected: 'OPENS SUNDAY · 12pm' },     // Sun
      { iso: '2026-05-18T11:00:00Z', expected: 'OPENS MONDAY · 12pm' },     // Mon
      { iso: '2026-05-19T11:00:00Z', expected: 'OPENS TUESDAY · 12pm' },    // Tue
      { iso: '2026-05-20T11:00:00Z', expected: 'OPENS WEDNESDAY · 12pm' },  // Wed
      { iso: '2026-05-21T11:00:00Z', expected: 'OPENS THURSDAY · 12pm' },   // Thu
      { iso: '2026-05-22T11:00:00Z', expected: 'OPENS FRIDAY · 12pm' },     // Fri
      { iso: '2026-05-23T11:00:00Z', expected: 'OPENS SATURDAY · 12pm' },   // Sat
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
    const pillIdx  = tree.indexOf('AVAILABLE NOW · Ends')
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
    const pillText = getByText('AVAILABLE NOW · Ends 3pm today')
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
