import React from 'react'
import { render } from '@testing-library/react-native'
import { FilterButtonBadge } from '@/features/search/components/FilterButtonBadge'

describe('FilterButtonBadge', () => {
  it('renders nothing when count is 0', () => {
    const { queryByTestId } = render(<FilterButtonBadge count={0} />)
    expect(queryByTestId('filter-active-dot')).toBeNull()
  })

  it('renders nothing when count is negative (defensive)', () => {
    const { queryByTestId } = render(<FilterButtonBadge count={-1} />)
    expect(queryByTestId('filter-active-dot')).toBeNull()
  })

  it('renders the count as text when > 0, using the legacy testID by default', () => {
    const { getByTestId, getByText } = render(<FilterButtonBadge count={2} />)
    expect(getByTestId('filter-active-dot')).toBeTruthy()
    expect(getByText('2')).toBeTruthy()
  })

  it('caps the displayed label at "9+" for double-digit counts', () => {
    const { getByText } = render(<FilterButtonBadge count={12} />)
    expect(getByText('9+')).toBeTruthy()
  })

  it('honours a custom testID', () => {
    const { getByTestId } = render(<FilterButtonBadge count={1} testID="custom-badge" />)
    expect(getByTestId('custom-badge')).toBeTruthy()
  })
})
