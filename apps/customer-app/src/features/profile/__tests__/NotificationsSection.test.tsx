import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { NotificationsSection } from '../components/NotificationsSection'

jest.mock('@/lib/api/profile', () => ({
  profileApi: { updateProfile: jest.fn().mockResolvedValue({}) },
}))

describe('NotificationsSection', () => {
  it('shows email toggle reflecting newsletterConsent', () => {
    render(<NotificationsSection newsletterConsent={true} userId="u1" />)
    expect(screen.getByRole('switch', { name: /email newsletter/i })).toBeTruthy()
  })

  it('push notifications row is not interactive (Coming soon)', () => {
    render(<NotificationsSection newsletterConsent={false} userId="u1" />)
    expect(screen.queryByRole('button', { name: /push notifications/i })).toBeNull()
    expect(screen.getByText('Coming soon')).toBeTruthy()
  })
})
