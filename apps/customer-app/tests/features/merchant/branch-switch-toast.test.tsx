import React from 'react'
import { render, act } from '@testing-library/react-native'
import { BranchSwitchToast } from '@/features/merchant/components/BranchSwitchToast'

describe('BranchSwitchToast — visual correction §4', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers()
    })
    jest.useRealTimers()
  })

  it('returns null when branchName is null (no toast)', () => {
    const { queryByTestId } = render(
      <BranchSwitchToast branchName={null} onDismiss={() => {}} />
    )
    expect(queryByTestId('branch-switch-toast')).toBeNull()
  })

  it('renders "Now viewing {branchName}" when branchName is set', () => {
    const { getByText, getByTestId } = render(
      <BranchSwitchToast branchName="Brightlingsea" onDismiss={() => {}} />
    )
    expect(getByTestId('branch-switch-toast')).toBeTruthy()
    expect(getByText('Now viewing Brightlingsea')).toBeTruthy()
  })

  it('calls onDismiss after the auto-dismiss timer (2.4s)', () => {
    const onDismiss = jest.fn()
    render(<BranchSwitchToast branchName="Brightlingsea" onDismiss={onDismiss} />)
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => {
      jest.advanceTimersByTime(2400)
    })

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does NOT auto-dismiss before the timer elapses', () => {
    const onDismiss = jest.fn()
    render(<BranchSwitchToast branchName="Brightlingsea" onDismiss={onDismiss} />)

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    expect(onDismiss).not.toHaveBeenCalled()
  })
})
