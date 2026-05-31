import { useCallback } from 'react'
import { router, useLocalSearchParams } from 'expo-router'

export function useBranchSelection(params: { merchantId: string }) {
  const { merchantId } = params
  // Wave 6.4-B (2026-05-30) — read `from` (and forward-compat tokens)
  // off the URL so `select` + `reconcile` can preserve them across
  // the router.replace.  Pre-Wave-6.4-B these rebuilds emitted only
  // `{ id, branch }` and silently dropped `from=favourites`, breaking
  // the back chain Favourites > MP > switch branch > Back → Home.
  const search = useLocalSearchParams<{ branch?: string; from?: string; tab?: string }>()
  const branchId: string | null = (search.branch && search.branch.length > 0) ? search.branch : null

  const select = useCallback((nextBranchId: string) => {
    router.replace({
      pathname: '/(app)/merchant/[id]',
      params: {
        id:     merchantId,
        branch: nextBranchId,
        // Preserve `from` so the back-chain origin survives a branch
        // switch initiated from inside Merchant Profile.  Only
        // included when present — passing undefined would violate
        // `exactOptionalPropertyTypes`.
        ...(typeof search.from === 'string' ? { from: search.from } : {}),
        ...(typeof search.tab  === 'string' ? { tab:  search.tab  } : {}),
      },
    })
  }, [merchantId, search.from, search.tab])

  // Called with the server-resolved branch id after a fetch — if it differs
  // from the current URL, replace silently. This is what makes cold-open and
  // candidate-not-found / candidate-inactive flow into a stable URL.
  //
  // Wave 6.4-B — same `from` / `tab` preservation as `select` so a
  // server-side reconcile (e.g. handleMerchantTap from Voucher Detail
  // pushes /(app)/merchant/m1?from=favourites with no branch → server
  // resolves selectedBranch=b1 → reconcile fires) doesn't strip the
  // origin token.
  const reconcile = useCallback((resolvedBranchId: string) => {
    if (branchId === resolvedBranchId) return
    router.replace({
      pathname: '/(app)/merchant/[id]',
      params: {
        id:     merchantId,
        branch: resolvedBranchId,
        ...(typeof search.from === 'string' ? { from: search.from } : {}),
        ...(typeof search.tab  === 'string' ? { tab:  search.tab  } : {}),
      },
    })
  }, [branchId, merchantId, search.from, search.tab])

  return { branchId, select, reconcile }
}
