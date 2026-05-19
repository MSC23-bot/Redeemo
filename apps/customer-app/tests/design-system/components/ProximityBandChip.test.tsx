import React from 'react'
import { render } from '@testing-library/react-native'
import { ProximityBandChip } from '@/design-system/components/ProximityBandChip'

describe('<ProximityBandChip>', () => {
  // ─── Plan 4 M3.6 — proximityBand → label mapping ──────────────────────
  //
  // Pinned per spec §10.1 + plan M3.6. The chip renders nothing in
  // FOUR situations:
  //   - 'NEARBY' band (already-nearby merchants — visual contract)
  //   - null band (M3a hybrid phase — V2-rejected merchants like
  //     POSTCODE_CENTROID / NEEDS_REVIEW)
  //   - undefined band (older / pre-M3 responses missing the field)
  //   - missing band prop (forward-compat with future call sites)
  //
  // All four "renders nothing" cases are pinned so M3b's tile
  // rendering can write `<ProximityBandChip band={tile.proximityBand} />`
  // without a guard, regardless of whether the backend response was
  // pre-M3, M3a hybrid, or full M3b.

  it('NEARBY renders null (no chip — already-nearby merchants need no reminder)', () => {
    const { toJSON } = render(<ProximityBandChip band="NEARBY" />)
    expect(toJSON()).toBeNull()
  })

  it('null band renders null (M3a hybrid — V2-rejected merchants)', () => {
    const { toJSON } = render(<ProximityBandChip band={null} />)
    expect(toJSON()).toBeNull()
  })

  it('undefined band renders null (pre-M3 responses without the field)', () => {
    const { toJSON } = render(<ProximityBandChip band={undefined} />)
    expect(toJSON()).toBeNull()
  })

  it('missing band prop renders null (forward-compat)', () => {
    const { toJSON } = render(<ProximityBandChip />)
    expect(toJSON()).toBeNull()
  })

  it('IN_YOUR_AREA renders "In your area"', () => {
    const { getByText } = render(<ProximityBandChip band="IN_YOUR_AREA" />)
    expect(getByText('In your area')).toBeTruthy()
  })

  // PR #112 device-QA fixup-3 copy lock (2026-05-19) — owner-locked copy:
  //   A_LITTLE_FURTHER   → 'A short trip away'        (was 'A little further away' —
  //                                                    too casual at 6.7 miles per device QA)
  //   NEAREST_ON_REDEEMO → 'Closest match on Redeemo' (unchanged)
  // Negative pins guard old copy across BOTH prior fixups.
  it('A_LITTLE_FURTHER renders "A short trip away" (PR #112 fixup-3 copy)', () => {
    const { getByText, queryByText } = render(<ProximityBandChip band="A_LITTLE_FURTHER" />)
    expect(getByText('A short trip away')).toBeTruthy()
    expect(queryByText('A little further')).toBeNull()
    expect(queryByText('A little further away')).toBeNull()
  })

  it('NEAREST_ON_REDEEMO renders "Closest match on Redeemo" (locked since fixup-2)', () => {
    const { getByText, queryByText } = render(<ProximityBandChip band="NEAREST_ON_REDEEMO" />)
    expect(getByText('Closest match on Redeemo')).toBeTruthy()
    expect(queryByText('Nearest on Redeemo')).toBeNull()
  })

  it('uses the visible label as the default accessibilityLabel', () => {
    const { getByLabelText } = render(<ProximityBandChip band="IN_YOUR_AREA" />)
    expect(getByLabelText('In your area')).toBeTruthy()
  })

  it('honours an explicit accessibilityLabel override', () => {
    const { getByLabelText, queryByLabelText } = render(
      <ProximityBandChip band="A_LITTLE_FURTHER" accessibilityLabel="About 5 miles away" />,
    )
    expect(getByLabelText('About 5 miles away')).toBeTruthy()
    // Default label is NOT applied when an override is provided.
    expect(queryByLabelText('A short trip away')).toBeNull()
  })
})
