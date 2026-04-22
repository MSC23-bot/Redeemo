import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { PersonalInfoSheet } from '../components/PersonalInfoSheet'

const mockProfile = {
  firstName: 'Shebin', lastName: 'C', dateOfBirth: null, gender: null,
  email: 'shebin@test.com', phone: '+44 7700 900123',
}

jest.mock('@/hooks/useUpdateProfile', () => ({
  useUpdateProfile: () => ({ mutate: jest.fn(), isPending: false }),
}))

describe('PersonalInfoSheet', () => {
  it('renders first name input pre-filled', () => {
    render(
      <PersonalInfoSheet
        visible={true} onDismiss={jest.fn()} profile={mockProfile as any}
        onGetHelp={jest.fn()}
      />
    )
    expect(screen.getByDisplayValue('Shebin')).toBeTruthy()
  })

  it('shows email as read-only', () => {
    render(
      <PersonalInfoSheet
        visible={true} onDismiss={jest.fn()} profile={mockProfile as any}
        onGetHelp={jest.fn()}
      />
    )
    expect(screen.getByText('shebin@test.com')).toBeTruthy()
  })

  it('calls onGetHelp when the help link is pressed', () => {
    const onGetHelp = jest.fn()
    render(
      <PersonalInfoSheet
        visible={true} onDismiss={jest.fn()} profile={mockProfile as any}
        onGetHelp={onGetHelp}
      />
    )
    fireEvent.press(screen.getByText(/get help with this/i))
    expect(onGetHelp).toHaveBeenCalledWith('Account issue', expect.any(String))
  })
})
