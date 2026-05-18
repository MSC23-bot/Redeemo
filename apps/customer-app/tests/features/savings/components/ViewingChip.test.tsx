import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { ViewingChip } from '@/features/savings/components/ViewingChip'

describe('ViewingChip', () => {
  it('renders nothing when month === null (current month, no drill-down)', () => {
    const { queryByTestId } = render(<ViewingChip month={null} onDismiss={() => {}} />)
    expect(queryByTestId('savings-viewing-chip')).toBeNull()
  })

  it('renders "Viewing: April 2026" when month === "2026-04"', () => {
    const { getByTestId, getByText } = render(<ViewingChip month="2026-04" onDismiss={() => {}} />)
    expect(getByTestId('savings-viewing-chip')).toBeTruthy()
    expect(getByText('Viewing: April 2026')).toBeTruthy()
  })

  it('tap on ✕ fires onDismiss', () => {
    const onDismiss = jest.fn()
    const { getByTestId } = render(<ViewingChip month="2026-04" onDismiss={onDismiss} />)
    fireEvent.press(getByTestId('savings-viewing-chip-dismiss'))
    expect(onDismiss).toHaveBeenCalled()
  })
})
