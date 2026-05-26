import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InterestsSheet } from '../components/InterestsSheet'

const mockMutate = jest.fn()
jest.mock('@/hooks/useUpdateInterests', () => ({
  useUpdateInterests: () => ({ mutate: mockMutate, isPending: false }),
}))
jest.mock('@/hooks/useInterestsCatalogue', () => ({
  useInterestsCatalogue: () => ({
    data: {
      interests: [
        { id: 'i1', name: 'Food' },
        { id: 'i2', name: 'Fitness' },
        { id: 'i3', name: 'Travel' },
      ],
    },
  }),
}))

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('InterestsSheet', () => {
  beforeEach(() => mockMutate.mockClear())

  it('renders interest options', () => {
    wrap(<InterestsSheet visible={true} onDismiss={jest.fn()} selectedIds={[]} />)
    expect(screen.getByText('Food')).toBeTruthy()
    expect(screen.getByText('Fitness')).toBeTruthy()
    expect(screen.getByText('Travel')).toBeTruthy()
  })

  it('fires updateInterests on save', () => {
    wrap(<InterestsSheet visible={true} onDismiss={jest.fn()} selectedIds={['i1']} />)
    fireEvent.press(screen.getByText('Save interests'))
    expect(mockMutate).toHaveBeenCalledWith(['i1'], expect.any(Object))
  })
})
