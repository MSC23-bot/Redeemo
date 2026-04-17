import React from 'react'
import { render } from '@testing-library/react-native'
import { PerforationLine } from '@/features/voucher/components/PerforationLine'

describe('PerforationLine', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<PerforationLine testID="perf" />)
    expect(getByTestId('perf')).toBeTruthy()
  })

  it('renders with small variant', () => {
    const { getByTestId } = render(<PerforationLine variant="small" testID="perf-small" />)
    expect(getByTestId('perf-small')).toBeTruthy()
  })
})
