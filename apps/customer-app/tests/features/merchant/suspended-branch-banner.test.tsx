import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SuspendedBranchBanner } from '@/features/merchant/components/SuspendedBranchBanner'

describe('SuspendedBranchBanner', () => {
  it('renders when visible=true', () => {
    const { getByText } = render(<SuspendedBranchBanner visible onDismiss={() => {}} />)
    expect(getByText(/temporarily unavailable/i)).toBeTruthy()
  })

  it('does NOT render when visible=false', () => {
    const { queryByText } = render(<SuspendedBranchBanner visible={false} onDismiss={() => {}} />)
    expect(queryByText(/temporarily unavailable/i)).toBeNull()
  })

  it('calls onDismiss when the close button is tapped', () => {
    const onDismiss = jest.fn()
    const { getByLabelText } = render(<SuspendedBranchBanner visible onDismiss={onDismiss} />)
    fireEvent.press(getByLabelText(/Dismiss/i))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
