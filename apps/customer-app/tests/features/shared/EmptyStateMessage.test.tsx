import React from 'react'
import { render } from '@testing-library/react-native'
import { EmptyStateMessage } from '@/features/shared/EmptyStateMessage'

// These three copy strings are LOCKED. Owner sign-off required to change.
describe('EmptyStateMessage', () => {
  it('renders "No merchants found" for reason="none"', () => {
    const { getByText } = render(<EmptyStateMessage reason="none" />)
    expect(getByText('No merchants found')).toBeTruthy()
  })

  it('renders the wider-results banner for reason="expanded_to_wider"', () => {
    const { getByText } = render(<EmptyStateMessage reason="expanded_to_wider" />)
    expect(getByText('No matches nearby — showing wider results')).toBeTruthy()
  })

  it('renders the no-UK-supply copy for reason="no_uk_supply"', () => {
    const { getByText } = render(<EmptyStateMessage reason="no_uk_supply" />)
    expect(getByText(/No matches in the UK yet — we’re growing daily/)).toBeTruthy()
  })

  it('renders nothing when reason is null or undefined', () => {
    const { toJSON } = render(<EmptyStateMessage reason={null} />)
    expect(toJSON()).toBeNull()
    const { toJSON: toJSON2 } = render(<EmptyStateMessage reason={undefined} />)
    expect(toJSON2()).toBeNull()
  })
})
