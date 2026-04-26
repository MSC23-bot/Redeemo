import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { ProfileHeader } from '../components/ProfileHeader'

const baseProfile = {
  id: 'u1',
  firstName: 'Shebin',
  lastName: 'C',
  email: 'shebin@test.com',
  profileCompleteness: 72,
  profileImageUrl: null,
  dateOfBirth: null,
  gender: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  postcode: null,
  phone: null,
  interests: [],
  newsletterConsent: false,
  emailVerified: true,
  phoneVerified: true,
  onboardingCompletedAt: null,
  subscriptionPromptSeenAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
}
const noSub = undefined

describe('ProfileHeader', () => {
  it('shows initials when no profileImageUrl', () => {
    render(<ProfileHeader profile={baseProfile} subscription={noSub} onAvatarPress={jest.fn()} />)
    expect(screen.getByText('S')).toBeTruthy()
  })

  it('shows completeness percentage', () => {
    render(<ProfileHeader profile={baseProfile} subscription={noSub} onAvatarPress={jest.fn()} />)
    expect(screen.getByText(/72%/)).toBeTruthy()
  })

  it('shows ACTIVE badge when subscription is ACTIVE', () => {
    const sub = { status: 'ACTIVE', planName: 'Monthly', price: 6.99, renewsAt: '2026-05-12' }
    render(<ProfileHeader profile={baseProfile} subscription={sub as any} onAvatarPress={jest.fn()} />)
    expect(screen.getByText('ACTIVE')).toBeTruthy()
  })

  it('hides badge when no subscription', () => {
    render(<ProfileHeader profile={baseProfile} subscription={noSub} onAvatarPress={jest.fn()} />)
    expect(screen.queryByText('ACTIVE')).toBeNull()
    expect(screen.queryByText('CANCELLED')).toBeNull()
  })

  it('hides tip text when completeness is 100%', () => {
    const fullProfile = { ...baseProfile, profileCompleteness: 100 }
    render(<ProfileHeader profile={fullProfile} subscription={noSub} onAvatarPress={jest.fn()} />)
    expect(screen.queryByText(/unlock/i)).toBeNull()
    expect(screen.queryByText(/improve/i)).toBeNull()
    expect(screen.queryByText(/almost there/i)).toBeNull()
  })
})
