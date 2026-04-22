import { useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi } from '@/lib/api/profile'
import { meQueryKey } from './useMe'

export function useUpdateAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (profileImageUrl: string | null) => profileApi.updateProfile({ profileImageUrl }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: meQueryKey }) },
  })
}
