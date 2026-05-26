import React from 'react'
import { render, screen } from '@testing-library/react-native'

// Import via relative path — they don't exist yet, test should fail RED
import { ProfileSectionCard } from '../components/ProfileSectionCard'
import { ProfileRow } from '../components/ProfileRow'

describe('ProfileSectionCard', () => {
  it('renders with title and children', () => {
    render(
      <ProfileSectionCard title="My Account">
        <ProfileRow label="Some row" isFirst />
      </ProfileSectionCard>,
    )
    expect(screen.getByText('My Account')).toBeTruthy()
    expect(screen.getByText('Some row')).toBeTruthy()
  })
})

describe('ProfileRow', () => {
  it('renders label', () => {
    render(<ProfileRow label="Personal info" isFirst />)
    expect(screen.getByText('Personal info')).toBeTruthy()
  })

  it('renders preview text', () => {
    render(<ProfileRow label="Email" preview="test@example.com" />)
    expect(screen.getByText('test@example.com')).toBeTruthy()
  })
})
