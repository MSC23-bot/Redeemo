import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotificationsSection } from '../components/NotificationsSection'
import { meQueryKey } from '@/hooks/useMe'

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

  // Regression pin: previously invalidated ['profile'], which is a stale
  // key — useMe uses meQueryKey (['me']). Toggling the newsletter switch
  // must invalidate meQueryKey so ProfileScreen re-fetches.
  it('invalidates meQueryKey after newsletter toggle succeeds', async () => {
    const { profileApi } = require('@/lib/api/profile')
    profileApi.updateProfile.mockClear()

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries')

    render(
      <QueryClientProvider client={client}>
        <NotificationsSection newsletterConsent={false} userId="u1" />
      </QueryClientProvider>,
    )

    const sw = screen.getByRole('switch', { name: /email newsletter/i })
    await act(async () => {
      fireEvent(sw, 'valueChange', true)
    })

    expect(profileApi.updateProfile).toHaveBeenCalledWith({ newsletterConsent: true })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: meQueryKey })
  })
})
