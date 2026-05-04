import React from 'react'
import { render, act } from '@testing-library/react-native'
import { BranchSwitchToast } from '@/features/merchant/components/BranchSwitchToast'

describe('BranchSwitchToast — visual correction §4 + round 3 §B6', () => {
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
      <BranchSwitchToast branchName={null} merchantName="Covelum" onDismiss={() => {}} />
    )
    expect(queryByTestId('branch-switch-toast')).toBeNull()
  })

  it('renders "Now viewing {merchantName}, {branchName} branch" when branchName is set', () => {
    const { getByText, getByTestId } = render(
      <BranchSwitchToast branchName="Brightlingsea" merchantName="Covelum" onDismiss={() => {}} />
    )
    expect(getByTestId('branch-switch-toast')).toBeTruthy()
    expect(getByText('Now viewing Covelum, Brightlingsea branch')).toBeTruthy()
  })

  it('calls onDismiss after the auto-dismiss timer (2.4s)', () => {
    const onDismiss = jest.fn()
    render(<BranchSwitchToast branchName="Brightlingsea" merchantName="Covelum" onDismiss={onDismiss} />)
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => {
      jest.advanceTimersByTime(2400)
    })

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does NOT auto-dismiss before the timer elapses', () => {
    const onDismiss = jest.fn()
    render(<BranchSwitchToast branchName="Brightlingsea" merchantName="Covelum" onDismiss={onDismiss} />)

    act(() => {
      jest.advanceTimersByTime(1000)
    })

    expect(onDismiss).not.toHaveBeenCalled()
  })
})
