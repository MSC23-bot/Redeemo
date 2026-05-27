import { useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi } from '@/lib/api/profile'
import { useAuthStore } from '@/stores/auth'
import { meQueryKey } from './useMe'

export function useUpdateAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (profileImageUrl: string | null) => profileApi.updateProfile({ profileImageUrl }),
    // Two-path sync so EVERY surface picks up the new avatar URL:
    //   1. refreshUser() pulls a fresh /me snapshot into the auth store so
    //      any surface reading `useAuthStore((s) => s.user.profileImageUrl)`
    //      (HomeHeader, saved-area identity card, etc.) re-renders.
    //   2. invalidate meQueryKey marks the React Query cache stale so
    //      ProfileHeader (which reads useMe().data.profileImageUrl) gets
    //      a fresh refetch on the next render cycle.
    // Pre-fix only path 2 ran, so other-surfaces-via-auth-store updated
    // (since auth-store has its own refresh paths) but Profile header was
    // stuck on the cached initials avatar until the next manual refresh.
    // Mirrors the SavedAreaScreen.onSavePostcode dual-sync pattern.
    onSuccess: async () => {
      await useAuthStore.getState().refreshUser()
      void qc.invalidateQueries({ queryKey: meQueryKey })
    },
  })
}
