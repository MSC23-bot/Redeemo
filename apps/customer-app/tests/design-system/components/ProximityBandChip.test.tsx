import React from 'react'
import { render } from '@testing-library/react-native'
import { ProximityBandChip } from '@/design-system/components/ProximityBandChip'

describe('<ProximityBandChip>', () => {
  // ─── Plan 4 M3.6 — proximityBand → label mapping ──────────────────────
  //
  // Pinned per spec §10.1 + plan M3.6. NEARBY is the only band that
  // renders nothing; the other three render their respective labels.

  it('NEARBY renders null (no chip — already-nearby merchants need no reminder)', () => {
    const { toJSON } = render(<ProximityBandChip band="NEARBY" />)
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
