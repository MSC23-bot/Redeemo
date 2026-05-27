import React from 'react'
import { renderHook, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { profileApi } from '@/lib/api/profile'
import { useUpdateAvatar } from '@/hooks/useUpdateAvatar'
import { meQueryKey } from '@/hooks/useMe'
import { useAuthStore } from '@/stores/auth'

// Profile Stabilisation Hotfix #2 pin — when the avatar mutation succeeds
// it must run TWO sync paths:
//   1. useAuthStore.getState().refreshUser() — so surfaces that read
//      `useAuthStore((s) => s.user.profileImageUrl)` (HomeHeader, saved-
//      area identity card, etc.) re-render with the new URL.
//   2. queryClient.invalidateQueries({ queryKey: meQueryKey }) — so
//      ProfileHeader (which reads useMe().data.profileImageUrl) refetches
//      and re-renders.
//
// Pre-fix only path 2 ran. Profile header stayed on the initials avatar
// after upload because the auth-store user object was not refreshed (and
// some surfaces read from auth-store, masking the React Query refetch
// race that was the actual root cause of the inconsistency).

jest.spyOn(profileApi, 'updateProfile')

describe('useUpdateAvatar', () => {
  it('on success: calls useAuthStore.refreshUser AND invalidates meQueryKey', async () => {
    (profileApi.updateProfile as jest.Mock).mockResolvedValue({
      id: 'u1',
      profileImageUrl: 'data:image/jpeg;base64,Zm9v',
    })

    const refreshUserSpy = jest.fn().mockResolvedValue(undefined)
    const originalState = useAuthStore.getState()
    useAuthStore.setState({ ...originalState, refreshUser: refreshUserSpy })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries')

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useUpdateAvatar(), { wrapper })

    await act(async () => {
      result.current.mutate('data:image/jpeg;base64,Zm9v')
    })

    await waitFor(() => expect(refreshUserSpy).toHaveBeenCalledTimes(1))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: meQueryKey })

    // Restore the original auth store state.
    useAuthStore.setState(originalState)
  })
})
