import React from 'react'
import { render as rtlRender, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BranchTile } from '@/features/shared/BranchTile'
import { makeBranchTile } from '../../fixtures/branchTile'

const mockLightHaptic     = jest.fn()
const mockSelectionHaptic = jest.fn()
jest.mock('@/design-system/haptics', () => ({
  __esModule: true,
  lightHaptic: () => mockLightHaptic(),
  haptics: { selection: () => mockSelectionHaptic() },
}))

function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  mockLightHaptic.mockReset()
  mockSelectionHaptic.mockReset()
})

describe('BranchTile — tap propagation contract (Batch 1B layered-tap defence)', () => {
  it('heart press fires haptic but does NOT call card onPress', () => {
    const onPress = jest.fn()
    const tile = makeBranchTile({
      id:       'brn-tap',
      merchant: { businessName: 'Covelum' },
      isFavourited: false,
    })
    const { getByTestId } = render(<BranchTile branch={tile} onPress={onPress} />)
    fireEvent.press(getByTestId('branch-tile-brn-tap-heart'))
    expect(mockLightHaptic).toHaveBeenCalledTimes(1)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('card press calls onPress and does NOT fire heart haptic', () => {
    const onPress = jest.fn()
    const tile = makeBranchTile({
      id:       'brn-card',
      merchant: { businessName: 'Covelum' },
    })
    const { getByLabelText } = render(<BranchTile branch={tile} onPress={onPress} />)
    fireEvent.press(getByLabelText(/^Covelum/))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(mockLightHaptic).not.toHaveBeenCalled()
    expect(mockSelectionHaptic).not.toHaveBeenCalled()
  })
})
