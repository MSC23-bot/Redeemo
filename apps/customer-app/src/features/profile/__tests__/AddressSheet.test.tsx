import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { AddressSheet } from '../components/AddressSheet'

const mockMutate = jest.fn()
jest.mock('@/hooks/useUpdateProfile', () => ({
  useUpdateProfile: () => ({ mutate: mockMutate, isPending: false }),
}))

const mockProfile = {
  addressLine1: '123 Main St',
  addressLine2: '',
  city: 'London',
  postcode: 'SW1A 1AA',
}

describe('AddressSheet', () => {
  beforeEach(() => mockMutate.mockClear())

  it('renders prefilled address fields', () => {
    render(<AddressSheet visible={true} onDismiss={jest.fn()} profile={mockProfile as any} />)
    expect(screen.getByDisplayValue('123 Main St')).toBeTruthy()
    expect(screen.getByDisplayValue('London')).toBeTruthy()
    expect(screen.getByDisplayValue('SW1A 1AA')).toBeTruthy()
  })

  it('calls mutate on save with valid address', () => {
    render(<AddressSheet visible={true} onDismiss={jest.fn()} profile={mockProfile as any} />)
    fireEvent.press(screen.getByText('Save address'))
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ addressLine1: '123 Main St', city: 'London', postcode: 'SW1A 1AA' }),
      expect.any(Object),
    )
  })

  it('shows validation error when required field missing', () => {
    render(
      <AddressSheet
        visible={true} onDismiss={jest.fn()}
        profile={{ ...mockProfile, addressLine1: '' } as any}
      />
    )
    fireEvent.press(screen.getByText('Save address'))
    expect(screen.getByText(/required/i)).toBeTruthy()
    expect(mockMutate).not.toHaveBeenCalled()
  })
})
