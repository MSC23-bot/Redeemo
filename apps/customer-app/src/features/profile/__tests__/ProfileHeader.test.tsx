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
  latitude: null,
  longitude: null,
  localityId: null,
  locality: null,
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

  // Profile Stabilisation Hotfix #3 — the tip is now field-aware. It walks
  // the live profile for actually-missing fields rather than picking copy
  // from a static completeness-percentage tier. Pre-fix the tip was
  // hardcoded to mention "profile photo" at the 80%+ tier; adding the
  // photo without bumping `profileCompleteness` past the tier left stale
  // "add your profile photo" copy on-screen.

  it('mentions "profile photo" when profileImageUrl is null', () => {
    const p = {
      ...baseProfile,
      profileCompleteness: 80,
      // photo missing — other actionable fields present so it's the only miss
      profileImageUrl: null,
      dateOfBirth: '1990-01-01',
      addressLine1: '1 Test St',
      postcode: 'SW1A 1AA',
      interests: [{ id: 'i1', name: 'Coffee' }],
    }
    render(<ProfileHeader profile={p} subscription={noSub} onAvatarPress={jest.fn()} />)
    expect(screen.getByText(/profile photo/i)).toBeTruthy()
    expect(screen.getByText(/almost there/i)).toBeTruthy()
  })

  it('does NOT mention "profile photo" when profileImageUrl is set', () => {
    const p = {
      ...baseProfile,
      profileCompleteness: 80,
      // photo present, DOB missing — tip should mention DOB, NOT photo
      profileImageUrl: 'data:image/jpeg;base64,Zm9v',
      dateOfBirth: null,
      addressLine1: '1 Test St',
      postcode: 'SW1A 1AA',
      interests: [{ id: 'i1', name: 'Coffee' }],
    }
    render(<ProfileHeader profile={p} subscription={noSub} onAvatarPress={jest.fn()} />)
    expect(screen.queryByText(/profile photo/i)).toBeNull()
    expect(screen.getByText(/date of birth/i)).toBeTruthy()
  })

  it('returns no tip when every client-visible field is set even if backend completeness is <100', () => {
    const p = {
      ...baseProfile,
      profileCompleteness: 95, // backend still says <100 (e.g., counts a future field)
      profileImageUrl: 'data:image/jpeg;base64,Zm9v',
      dateOfBirth: '1990-01-01',
      addressLine1: '1 Test St',
      postcode: 'SW1A 1AA',
      interests: [{ id: 'i1', name: 'Coffee' }],
    }
    render(<ProfileHeader profile={p} subscription={noSub} onAvatarPress={jest.fn()} />)
    expect(screen.queryByText(/almost there/i)).toBeNull()
    expect(screen.queryByText(/improve/i)).toBeNull()
    expect(screen.queryByText(/unlock/i)).toBeNull()
  })

  it('lists multiple missing fields with the natural-language joiner', () => {
    const p = {
      ...baseProfile,
      profileCompleteness: 40,
      // 3+ missing: DOB + address + interests + photo → full list
      profileImageUrl: null,
      dateOfBirth: null,
      addressLine1: null,
      postcode: null,
      interests: [],
    }
    render(<ProfileHeader profile={p} subscription={noSub} onAvatarPress={jest.fn()} />)
    expect(screen.getByText(/date of birth/i)).toBeTruthy()
    expect(screen.getByText(/address/i)).toBeTruthy()
    expect(screen.getByText(/interests/i)).toBeTruthy()
    expect(screen.getByText(/profile photo/i)).toBeTruthy()
    expect(screen.getByText(/unlock more personalised deals/i)).toBeTruthy()
  })
})
