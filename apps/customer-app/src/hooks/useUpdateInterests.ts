import { useMutation, useQueryClient } from '@tanstack/react-query'
import { profileApi } from '@/lib/api/profile'
import { meQueryKey } from './useMe'

export function useUpdateInterests() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => profileApi.updateInterests(ids),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: meQueryKey }) },
  })
}
