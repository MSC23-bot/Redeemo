import React from 'react'
import { Text } from 'react-native'
import { render } from '@testing-library/react-native'
import { useBranchSwitchAnimation } from '@/features/merchant/hooks/useBranchSwitchAnimation'

function Probe({ branchId, onFire }: { branchId: string; onFire: () => void }) {
  useBranchSwitchAnimation(branchId, onFire)
  return <Text>id={branchId}</Text>
}

describe('useBranchSwitchAnimation', () => {
  it('does NOT fire on initial mount', () => {
    const onFire = jest.fn()
    render(<Probe branchId="b1" onFire={onFire} />)
    expect(onFire).not.toHaveBeenCalled()
  })

  it('fires when branchId changes after mount', () => {
    const onFire = jest.fn()
    const { rerender } = render(<Probe branchId="b1" onFire={onFire} />)
    expect(onFire).not.toHaveBeenCalled()
    rerender(<Probe branchId="b2" onFire={onFire} />)
    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it('fires again on subsequent changes', () => {
    const onFire = jest.fn()
    const { rerender } = render(<Probe branchId="b1" onFire={onFire} />)
    rerender(<Probe branchId="b2" onFire={onFire} />)
    rerender(<Probe branchId="b3" onFire={onFire} />)
    expect(onFire).toHaveBeenCalledTimes(2)
  })

  it('does not fire when branchId is unchanged on rerender', () => {
    const onFire = jest.fn()
    const { rerender } = render(<Probe branchId="b1" onFire={onFire} />)
    rerender(<Probe branchId="b1" onFire={onFire} />)
    rerender(<Probe branchId="b1" onFire={onFire} />)
    expect(onFire).not.toHaveBeenCalled()
  })
})
