import { useState, useCallback, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/**
 * Phase 3C.1g M2.2 — `useFavourite` is the canonical favourite-toggle
 * hook.  The shared `<FavouriteHeart>` component is the only intended
 * caller for surface entry points; `useRemoveFavourite` (M2.4) is the
 * other internal caller for the swipe-to-remove path on the Favourites
 * tab.  Surface consumers MUST route through `<FavouriteHeart>` and
 * NOT call this hook inline.
 *
 * Discriminator (spec §7.2):
 *   - `'branch'`   — POST/DELETE `/favourites/branches/:id`,
 *                    invalidates `['favouriteBranches']`.
 *   - `'voucher'`  — POST/DELETE `/favourites/vouchers/:id`,
 *                    invalidates `['favouriteVouchers']`.
 *   - `'merchant'` — POST/DELETE `/favourites/merchants/:id`,
 *                    invalidates `['favouriteMerchants']`.
 *                    Kept for the v1 transition only; retires alongside
 *                    the backend route in the cleanup PR.
 *
 * Pessimistic-with-onSuccess: state advances only after the API
 * resolves.  On failure the prior value is retained (no rollback needed
 * because state never advanced).
 *
 * `contextualQueryKey` — additional cache key to invalidate alongside
 * the list key.  Drives the per-screen contextual invalidation pattern
 * for the surface where the heart toggle happened (e.g.
 * `['merchantProfile', merchantId, branchId]` from `<HeroSection>` or
 * `['voucher', voucherId]` from `<CouponHeader>`).
 */

type FavouriteEntity = 'branch' | 'voucher' | 'merchant'

interface UseFavouriteOptions {
  type:                FavouriteEntity
  id:                  string
  initialIsFavourited: boolean
  /** Optional additional cache key to invalidate alongside the list key. */
  contextualQueryKey?: readonly unknown[]
}

interface UseFavouriteReturn {
  isFavourited: boolean
  toggle:       () => Promise<void>
  isLoading:    boolean
}

const PATH_SEGMENT: Record<FavouriteEntity, string> = {
  branch:   'branches',
  voucher:  'vouchers',
  merchant: 'merchants',
}

const LIST_QUERY_KEY: Record<FavouriteEntity, readonly unknown[]> = {
  branch:   ['favouriteBranches'],
  voucher:  ['favouriteVouchers'],
  merchant: ['favouriteMerchants'],
}

export function useFavourite({
  type,
  id,
  initialIsFavourited,
  contextualQueryKey,
}: UseFavouriteOptions): UseFavouriteReturn {
  const [isFavourited, setIsFavourited] = useState(initialIsFavourited)
  const queryClient = useQueryClient()

  useEffect(() => {
    setIsFavourited(initialIsFavourited)
  }, [initialIsFavourited])

  const endpoint = `/api/v1/customer/favourites/${PATH_SEGMENT[type]}/${id}`

  const invalidateOnSuccess = () => {
    queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY[type] })
    if (contextualQueryKey) {
      queryClient.invalidateQueries({ queryKey: contextualQueryKey })
    }
  }

  const addMutation = useMutation({
    mutationFn: () => api.post(endpoint, undefined),
    onSuccess: () => {
      setIsFavourited(true)
      invalidateOnSuccess()
    },
  })

  const removeMutation = useMutation({
    mutationFn: () => api.del(endpoint),
    onSuccess: () => {
      setIsFavourited(false)
      invalidateOnSuccess()
    },
  })

  const toggle = useCallback(async () => {
    if (isFavourited) {
      await removeMutation.mutateAsync()
    } else {
      await addMutation.mutateAsync()
    }
  }, [isFavourited, addMutation, removeMutation])

  return {
    isFavourited,
    toggle,
    isLoading: addMutation.isPending || removeMutation.isPending,
  }
}
