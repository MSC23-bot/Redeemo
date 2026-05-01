import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

const mockSignOut = jest.fn()
let mockUser: any = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+447700900000',
  emailVerified: true,
  phoneVerified: true,
  dateOfBirth: '1990-01-01',
  gender: 'female',
  postcode: 'SW1A 1AA',
  onboardingCompletedAt: '2026-04-23T00:00:00.000Z',
  subscriptionPromptSeenAt: '2026-04-23T00:00:00.000Z',
}

jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((sel: (s: any) => any) =>
    sel({ user: mockUser, signOut: mockSignOut }),
  ),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

import ProfileScreen from '@/../app/(app)/profile'

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockSignOut.mockClear()
    mockUser = {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phone: '+447700900000',
      emailVerified: true,
      phoneVerified: true,
      dateOfBirth: '1990-01-01',
      gender: 'female',
      postcode: 'SW1A 1AA',
      onboardingCompletedAt: '2026-04-23T00:00:00.000Z',
      subscriptionPromptSeenAt: '2026-04-23T00:00:00.000Z',
    }
  })

  it('renders the signed-in user name and email', () => {
    const { getByText } = render(<ProfileScreen />)
    expect(getByText('Ada Lovelace')).toBeTruthy()
    expect(getByText('ada@example.com')).toBeTruthy()
  })

  it('renders an em-dash placeholder when name is missing', () => {
    mockUser = { ...mockUser, firstName: '', lastName: '' }
    const { getByText } = render(<ProfileScreen />)
    expect(getByText('—')).toBeTruthy()
  })

  it('renders an em-dash placeholder when user is null', () => {
    mockUser = null
    const { getAllByText } = render(<ProfileScreen />)
    // both name and email fall back to '—'
    expect(getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it('invokes signOut when the Sign out button is pressed', () => {
    const { getByLabelText } = render(<ProfileScreen />)
    fireEvent.press(getByLabelText('Sign out'))
    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })
})
