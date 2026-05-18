import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { RedemptionRow } from '@/features/savings/components/RedemptionRow'
import { PRESENTATION_WINDOW_MS } from '@/features/voucher/utils/presentationWindow'
import type { SavingsRedemption } from '@/lib/api/savings'

// §Savings Rebaseline (PR-B, Revision 2 — fixup 2026-05-17):
// RedemptionRow pins.  Three locked adaptations verified here:
//   1. Show-to-staff badge window: 2h via the SHARED
//      `isPresentationActive()` helper (strict `< 2h` semantics).
//      Savings and Voucher Detail share the same boundary check so
//      they never disagree at exactly t = 2h.
//   2. Voucher type label sourced from canonical `voucherTypeLabel`
//      helper.  Long labels like "Buy one, get one free" are
//      preserved verbatim (owner-locked 2026-05-17 — DO NOT switch
//      to a "BOGO" acronym).  Density is solved by the two-line
//      meta layout, not by truncation or rewording.
//   3. Meta lines: two-line layout.  Line 1 = voucher type label.
//      Line 2 = branchShortName · relative time.  Long type labels
//      no longer truncate the branch name.

function makeRedemption(overrides: Partial<SavingsRedemption> = {}): SavingsRedemption {
  return {
    id:              'red-1',
    redeemedAt:      new Date(Date.now() - 30 * 60_000).toISOString(),  // 30 min ago
    estimatedSaving: 12.5,
    isValidated:     false,
    validatedAt:     null,
    merchant:        { id: 'cov', businessName: 'Covelum', logoUrl: null },
    voucher:         { id: 'v-1', title: 'BOGO Karaara', voucherType: 'BOGO' },
    branch:          { id: 'br-1', name: 'Covelum — Brightlingsea' },
    ...overrides,
  }
}

describe('RedemptionRow — badge windows', () => {
  it('shows "Show to staff" amber pill when not validated AND ≤ 2 hours since redemption', () => {
    const r = makeRedemption({
      redeemedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      isValidated: false,
    })
    const { getByTestId, queryByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByTestId('savings-row-badge-show-to-staff')).toBeTruthy()
    expect(queryByTestId('savings-row-badge-validated')).toBeNull()
    expect(queryByTestId('savings-row-badge-plain')).toBeNull()
  })

  it('hides "Show to staff" badge when not validated AND > 2 hours have elapsed (matches §AE5 hide boundary)', () => {
    const r = makeRedemption({
      redeemedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),   // 3h ago — past 2h gate
      isValidated: false,
    })
    const { getByTestId, queryByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(queryByTestId('savings-row-badge-show-to-staff')).toBeNull()
    expect(getByTestId('savings-row-badge-plain')).toBeTruthy()
  })

  it('shows green "Validated ✓" badge when validated AND ≤ 24h since validation', () => {
    const r = makeRedemption({
      redeemedAt: new Date(Date.now() - 4 * 60 * 60_000).toISOString(),
      isValidated: true,
      validatedAt: new Date(Date.now() - 60 * 60_000).toISOString(),       // 1h ago
    })
    const { getByTestId, queryByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByTestId('savings-row-badge-validated')).toBeTruthy()
    expect(queryByTestId('savings-row-badge-show-to-staff')).toBeNull()
  })

  it('shows plain "Redeemed" text when validated > 24h ago', () => {
    const r = makeRedemption({
      isValidated: true,
      validatedAt: new Date(Date.now() - 48 * 60 * 60_000).toISOString(),
    })
    const { getByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByTestId('savings-row-badge-plain')).toBeTruthy()
  })
})

describe('RedemptionRow — voucher type label + branch meta', () => {
  // §Savings device-QA round-2 fixup 2026-05-18 — type label
  // appended with " voucher" per owner direction.  Reads as a noun
  // phrase: "Reusable voucher", "Time-limited voucher", "BOGO
  // voucher".
  //
  // §BO Revision (2026-05-18) — VISIBLE text uses `voucherTypeLabel
  // Short()` (BOGO → "BOGO", PACKAGE_DEAL → "Package", TIME_LIMITED
  // → "Time-limited"; others unchanged).  Accessibility labels keep
  // `voucherTypeLabel()` long form so screen readers say the full
  // type name.  See `apps/customer-app/src/features/voucher/utils/
  // voucherTheme.ts::voucherTypeLabelShort` for the short-form map.

  it('renders TIME_LIMITED with short label "Time-limited voucher" (visible) + long label "Time limited voucher" (a11y)', () => {
    // §BO Revision — flipped from the Revision-2 "Time limited"
    // visible-form pin.  Short form swaps space → hyphen on this
    // type to read crisper at small sizes.
    const r = makeRedemption({
      voucher: { id: 'v', title: 'Lunch deal', voucherType: 'TIME_LIMITED' },
    })
    const { getByText, getByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByText('Time-limited voucher')).toBeTruthy()
    const row = getByTestId('savings-redemption-row-red-1')
    expect(row.props.accessibilityLabel).toContain('Time limited voucher')
  })

  it('renders REUSABLE as "Reusable voucher" (long + short forms match)', () => {
    // §BO Revision — REUSABLE short form === long form (no shortening
    // needed).  Visible + a11y therefore agree.
    const r = makeRedemption({
      voucher: { id: 'v', title: 'Coffee club', voucherType: 'REUSABLE' },
    })
    const { getByText, getByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByText('Reusable voucher')).toBeTruthy()
    const row = getByTestId('savings-redemption-row-red-1')
    expect(row.props.accessibilityLabel).toContain('Reusable voucher')
  })

  it('renders BOGO with short label "BOGO voucher" (visible) + long label "Buy one, get one free voucher" (a11y)', () => {
    // §BO Revision (2026-05-18) — the load-bearing short-form case.
    // Long form "Buy one, get one free voucher" (50+ chars) was
    // truncating the branch suffix on narrow phones; short form
    // "BOGO voucher" fits.  A11y label preserved long form so
    // screen readers don't surface an acronym in isolation.
    const r = makeRedemption({
      voucher: { id: 'v', title: 'Half-price pizza', voucherType: 'BOGO' },
    })
    const { getByText, queryByText, getByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByText('BOGO voucher')).toBeTruthy()
    // Visible text must NOT carry the long form (the whole point of §BO).
    expect(queryByText('Buy one, get one free voucher')).toBeNull()
    // A11y label keeps long form for screen-reader audibility.
    const row = getByTestId('savings-redemption-row-red-1')
    expect(row.props.accessibilityLabel).toContain('Buy one, get one free voucher')
  })

  it('renders PACKAGE_DEAL with short label "Package voucher" (visible) + long label "Package deal voucher" (a11y)', () => {
    // §BO Revision — PACKAGE_DEAL drops the "deal" suffix on the
    // dense row.  A11y keeps "Package deal" so the screen-reader
    // distinction with TIME_LIMITED / Reusable stays clear.
    const r = makeRedemption({
      voucher: { id: 'v', title: 'Dinner for 2', voucherType: 'PACKAGE_DEAL' },
    })
    const { getByText, queryByText, getByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByText('Package voucher')).toBeTruthy()
    expect(queryByText('Package deal voucher')).toBeNull()
    const row = getByTestId('savings-redemption-row-red-1')
    expect(row.props.accessibilityLabel).toContain('Package deal voucher')
  })

  it('meta is two deterministic single-line rows: type on line 1, branch · time on line 2', () => {
    // §Savings device-QA round-8 fixup 2026-05-18 — meta split from
    // one wrap-prone string ("{type} voucher · {branch} · {time}")
    // into TWO deterministic single-line rows so card height is
    // constant across the list (no orphan time fragments on long
    // type labels).
    //
    // §BO Revision (2026-05-18) — visible type label now uses the
    // short form ("BOGO voucher", not "Buy one, get one free
    // voucher") so the branch suffix on the second row reads in
    // full on narrow phones.
    const r = makeRedemption({
      branch: { id: 'br-1', name: 'Covelum — Brightlingsea' },
      voucher: { id: 'v', title: 'Half-price pizza', voucherType: 'BOGO' },
      redeemedAt: new Date(Date.now() - 2 * 60 * 60_000 - 5 * 60_000).toISOString(),
    })
    const { getByText } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    // Line 3 (type-as-noun, SHORT form).
    expect(getByText('BOGO voucher')).toBeTruthy()
    // Line 4 (branch · time, branchShortName-resolved).
    expect(getByText(/^Brightlingsea · /)).toBeTruthy()
  })

  it('voucher title renders on its own line between merchant name and meta', () => {
    // §Savings device-QA round-2 fixup 2026-05-18 — voucher title
    // is now a separate line (the WHAT, between the merchant WHO
    // and the type/branch/time META).  Owner direction: each row
    // should clearly identify which offer was used, not just type.
    const r = makeRedemption({
      voucher: { id: 'v', title: 'Half-price pizza', voucherType: 'BOGO' },
    })
    const { getByText } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByText('Half-price pizza')).toBeTruthy()
  })

  it('long voucher type label does NOT lose the branch name (regression)', () => {
    // §Savings device-QA round-8 fixup 2026-05-18 — regression now
    // asserts BOTH rows render in full.  Previously the single-string
    // meta would visually truncate the time fragment on narrow phones;
    // the two-row stack pins each piece on its own line.
    //
    // §BO Revision (2026-05-18) — visible label flipped to short
    // form ("BOGO voucher"); a11y label keeps the long form
    // ("Buy one, get one free voucher").
    const r = makeRedemption({
      branch: { id: 'br-1', name: 'Covelum — Brightlingsea' },
      voucher: { id: 'v', title: 'Half-price pizza', voucherType: 'BOGO' },
    })
    const { getByText, getByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByText('BOGO voucher')).toBeTruthy()
    expect(getByText(/Brightlingsea/)).toBeTruthy()
    const row = getByTestId('savings-redemption-row-red-1')
    expect(row.props.accessibilityLabel).toContain('Brightlingsea')
    expect(row.props.accessibilityLabel).toContain('Buy one, get one free voucher')
  })
})

describe('RedemptionRow — §AE5 boundary semantics (shared with Voucher Detail)', () => {
  it('boundary OFF: at exactly t = PRESENTATION_WINDOW_MS the show-to-staff badge is GONE', () => {
    // Strict `<` semantics in `isPresentationActive`: at the exact
    // boundary the helper returns false.  Pin: Savings agrees with
    // Voucher Detail at the same instant — never "show to staff"
    // here when the destination has just hidden its code surface.
    const r = makeRedemption({
      redeemedAt: new Date(Date.now() - PRESENTATION_WINDOW_MS).toISOString(),
      isValidated: false,
    })
    const { queryByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(queryByTestId('savings-row-badge-show-to-staff')).toBeNull()
  })

  it('boundary ON: at PRESENTATION_WINDOW_MS minus 1 second the show-to-staff badge IS visible', () => {
    // 1-second buffer (NOT 1ms): test setup + render advance Date.now()
    // by tens of milliseconds, which would otherwise tip a 1ms-margin
    // fixture across the boundary mid-test.  The semantic intent is
    // "just barely inside the window" — 1 second is a fair stand-in
    // and the strict-`<` semantics are still pinned by the OFF case
    // above at the exact boundary.
    const r = makeRedemption({
      redeemedAt: new Date(Date.now() - PRESENTATION_WINDOW_MS + 1000).toISOString(),
      isValidated: false,
    })
    const { getByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    expect(getByTestId('savings-row-badge-show-to-staff')).toBeTruthy()
  })
})

describe('RedemptionRow — tap + a11y', () => {
  it('tap fires onPress with the voucher id', () => {
    const r = makeRedemption()
    const onPress = jest.fn()
    const { getByTestId } = render(<RedemptionRow redemption={r} onPress={onPress} />)
    fireEvent.press(getByTestId('savings-redemption-row-red-1'))
    // §Savings device-QA round-3 fixup 2026-05-18 — onPress receives
    // the redemption id (`red-1`), NOT the voucher id (`v-1`).  See
    // the new dedicated /(app)/redemption/[id] receipt screen.
    expect(onPress).toHaveBeenCalledWith('red-1')
  })

  it('accessibility label includes merchant, voucher title, type-as-noun, branch, amount, relative time', () => {
    const r = makeRedemption({
      redeemedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      branch:     { id: 'br-1', name: 'Covelum — Brightlingsea' },
      voucher:    { id: 'v-1', title: 'Half-price pizza', voucherType: 'BOGO' },
    })
    const { getByTestId } = render(<RedemptionRow redemption={r} onPress={() => {}} />)
    const row = getByTestId('savings-redemption-row-red-1')
    const a11y = row.props.accessibilityLabel as string
    expect(a11y).toContain('Covelum')
    expect(a11y).toContain('Half-price pizza')
    expect(a11y).toContain('Buy one, get one free voucher')
    expect(a11y).toContain('Brightlingsea')
    expect(a11y).toContain('£12.50')
    expect(a11y).toMatch(/(min|h|d|Just) ago|Just now/)
  })
})
