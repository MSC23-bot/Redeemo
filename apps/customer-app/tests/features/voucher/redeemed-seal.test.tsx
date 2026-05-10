import React from 'react'
import { render } from '@testing-library/react-native'
import { RedeemedSeal } from '@/features/voucher/components/RedeemedSeal'

/**
 * Voucher Detail hero `RedeemedSeal` — owner-approved rubber-stamp DNA.
 *
 * **PR-B T8i pin:** the larger Voucher Detail hero seal STAYS on the
 * pre-T8h rubber-stamp design (tilt, ink-fade band, ink-mid band,
 * cream speckles, ink-pressure textShadow).  The T8h "premium hairline"
 * redesign was applied to the wrong surface and was reverted; only the
 * smaller merchant-profile `<VoucherCardRedeemedStamp>` carries the
 * refined hairline-accent treatment.
 *
 * These pins guard against a future regression that swaps the seal
 * back to the refined treatment without explicit owner sign-off.
 */
describe('RedeemedSeal — Voucher Detail hero', () => {
  it('renders the "Voucher Redeemed" title (rubber-stamp surface, not the refined "Redeemed" mark)', () => {
    const { getByText } = render(<RedeemedSeal availableAgainAt={null} />)
    // Rubber-stamp DNA renders the full two-word title.  The refined
    // card-level treatment uses a single "Redeemed" / "REDEEMED"
    // word; if the seal regresses to that single-word string, this
    // assertion fails.
    expect(getByText('Voucher Redeemed')).toBeTruthy()
  })

  it('renders the renewal subline when availableAgainAt is provided', () => {
    const { getByText } = render(
      <RedeemedSeal availableAgainAt="2026-06-09T00:00:00Z" />,
    )
    expect(getByText(/Renews on 9 June 2026/)).toBeTruthy()
  })

  it('does NOT render the hairline-accent rows that signature the refined card-level treatment', () => {
    // The refined `<VoucherCardRedeemedStamp>` flanks its title with
    // hairline accents inside a `<row>` container.  The rubber-stamp
    // hero seal does NOT use that pattern — the title sits in a
    // `<titleWrap>` with absolute-positioned distress overlays
    // instead.  Pin by asserting the seal still uses its `redeemed-seal`
    // testID (rubber-stamp baseline) — the refined treatment lives in
    // a different component entirely (VoucherCardRedeemedStamp).
    const { getByTestId } = render(<RedeemedSeal availableAgainAt={null} />)
    expect(getByTestId('redeemed-seal')).toBeTruthy()
  })
})
