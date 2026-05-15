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

  it('A_LITTLE_FURTHER renders "A little further"', () => {
    const { getByText } = render(<ProximityBandChip band="A_LITTLE_FURTHER" />)
    expect(getByText('A little further')).toBeTruthy()
  })

  it('NEAREST_ON_REDEEMO renders "Nearest on Redeemo"', () => {
    const { getByText } = render(<ProximityBandChip band="NEAREST_ON_REDEEMO" />)
    expect(getByText('Nearest on Redeemo')).toBeTruthy()
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
    expect(queryByLabelText('A little further')).toBeNull()
  })
})
