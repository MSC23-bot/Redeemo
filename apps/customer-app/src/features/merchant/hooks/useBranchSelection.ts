import { useCallback } from 'react'
import { router, useLocalSearchParams } from 'expo-router'

export function useBranchSelection(params: { merchantId: string }) {
  const { merchantId } = params
  const search = useLocalSearchParams<{ branch?: string }>()
  const branchId: string | null = (search.branch && search.branch.length > 0) ? search.branch : null

  const select = useCallback((nextBranchId: string) => {
    router.replace({
      pathname: '/(app)/merchant/[id]',
      params: { id: merchantId, branch: nextBranchId },
    })
  }, [merchantId])

  // Called with the server-resolved branch id after a fetch — if it differs
  // from the current URL, replace silently. This is what makes cold-open and
  // candidate-not-found / candidate-inactive flow into a stable URL.
  const reconcile = useCallback((resolvedBranchId: string) => {
    if (branchId === resolvedBranchId) return
    router.replace({
      pathname: '/(app)/merchant/[id]',
      params: { id: merchantId, branch: resolvedBranchId },
    })
  }, [branchId, merchantId])

  return { branchId, select, reconcile }
}
