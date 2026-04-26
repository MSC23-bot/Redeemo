import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationsSection } from '../components/NotificationsSection'

jest.mock('@/lib/api/profile', () => ({
  profileApi: { updateProfile: jest.fn().mockResolvedValue({}) },
}))

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('NotificationsSection', () => {
  it('shows email toggle reflecting newsletterConsent', () => {
    renderWithClient(<NotificationsSection newsletterConsent={true} userId="u1" />)
    expect(screen.getByRole('switch', { name: /email newsletter/i })).toBeTruthy()
  })

  it('push notifications row is not interactive (Coming soon)', () => {
    renderWithClient(<NotificationsSection newsletterConsent={false} userId="u1" />)
    expect(screen.queryByRole('button', { name: /push notifications/i })).toBeNull()
    expect(screen.getByText('Coming soon')).toBeTruthy()
  })
})
