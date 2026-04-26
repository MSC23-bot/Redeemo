import { useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi, type ProfileUpdate } from '@/lib/api/profile'
import { meQueryKey } from './useMe'

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: ProfileUpdate) => profileApi.updateProfile(patch),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: meQueryKey }) },
  })
}
