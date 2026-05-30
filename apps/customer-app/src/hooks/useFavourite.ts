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
 * Device-QA R1 deviation from the spec §7.2 "pessimistic-with-onSuccess"
 * locked invariant: owner-direction (2026-05-30) switches to OPTIMISTIC
 * toggle because the pessimistic delay felt sluggish on device and
 * compounded a two-phase backdrop render (icon snaps first, container
 * highlight followed on cache refetch).  New contract:
 *
 *   1. Tap → `setIsFavourited` flips immediately (optimistic).
 *   2. POST/DELETE fires under the hood.
 *   3. On success → invalidate caches.  State already matches.
 *   4. On STALE-STATE error (POST→ALREADY_FAVOURITED, DELETE→
 *      FAVOURITE_NOT_FOUND): the server already has the desired state.
 *      Keep the optimistic flip, invalidate caches so other screens
 *      reconcile, and SILENCE the global MutationCache toast (these
 *      codes are surface='silent' in errors.ts).
 *   5. On any other error → revert the optimistic flip.  Global
 *      MutationCache toast surfaces the generic "Something went
 *      wrong" copy.
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

/**
 * Stale-state codes the backend surfaces when the toggle target is
 * already in the desired state.  Treated as silent success — the
 * optimistic flip stands and the cache invalidation still fires so
 * stale views elsewhere reconcile.
 */
function isStaleAddCode(err: unknown): boolean {
  const code = (err as { code?: unknown } | null | undefined)?.code
  return code === 'ALREADY_FAVOURITED'
}
function isStaleRemoveCode(err: unknown): boolean {
  const code = (err as { code?: unknown } | null | undefined)?.code
  return code === 'FAVOURITE_NOT_FOUND'
}

export function useFavourite({
  type,
  id,
  initialIsFavourited,
  contextualQueryKey,
}: UseFavouriteOptions): UseFavouriteReturn {
  const [isFavourited, setIsFavourited] = useState(initialIsFavourited)
  const queryClient = useQueryClient()

  // Device-QA R1 Wave 4 (2026-05-30) — defensive sync hardening per
  // owner direction.  The effect deps are now `[type, id,
  // initialIsFavourited]` (was only `[initialIsFavourited]`) so a
  // mounted hook whose parent SWAPS the identity (e.g. swiping
  // between voucher cards on Merchant Profile that reuse the same
  // FavouriteHeart instance position) re-seeds local state from the
  // NEW server-emitted value instead of carrying the prior entity's
  // optimistic flip.  The single-prop variant covered the steady-
  // state refetch case correctly; the broadened deps close the
  // identity-swap edge case as well.  (Owner referred to this prop
  // as `entity` — it's destructured here as `type` per the existing
  // UseFavouriteOptions shape; same value, the discriminator.)
  useEffect(() => {
    setIsFavourited(initialIsFavourited)
  }, [type, id, initialIsFavourited])

  const endpoint = `/api/v1/customer/favourites/${PATH_SEGMENT[type]}/${id}`

  const invalidateOnSuccess = () => {
    queryClient.invalidateQueries({ queryKey: LIST_QUERY_KEY[type] })
    if (contextualQueryKey) {
      queryClient.invalidateQueries({ queryKey: contextualQueryKey })
    }
    // Phase 3C.1g Device-QA R1 Wave 3 (2026-05-30) — finding #14.
    // Broad cross-surface invalidation so every other screen that
    // renders an isFavourited heart for this entity reconciles on
    // next focus.
    //
    // - ['discovery'] prefix-matches Home feed
    //   (['discovery', 'home', lat, lng]), Map
    //   (['discovery', 'in-area-branches', params]), Search
    //   (['discovery', 'search', params]) and Category
    //   (['discovery', 'category-merchants', id, params]).  Toggling
    //   a heart on the Merchant Profile must flip the same branch's
    //   tile on Home etc; before this, those surfaces only refetched
    //   on their own staleTime or after a manual pull-to-refresh.
    //
    // - ['merchantProfile'] prefix-matches every merchant+branch
    //   variation of the profile cache, so the Voucher Detail's
    //   add-from-CouponHeader path keeps the merchant-profile
    //   voucher cards in sync without requiring each caller to pass
    //   a contextualQueryKey (defence-in-depth on top of the
    //   explicit per-surface key).
    //
    // - ['voucher'] (Wave 4 #21 — locked 2026-05-30) prefix-matches
    //   every voucher-detail cache entry (['voucher', voucherId]).
    //   Without it, Voucher Detail stays stale after a heart flip
    //   that originated elsewhere (e.g. user favourites a voucher on
    //   Voucher Detail, returns to Merchant Profile, unfavourites the
    //   voucher card heart; next tap to re-open Voucher Detail still
    //   reads the cached payload with isFavourited=true).  Owner
    //   device-QA scenario verbatim — confirms the systemic audit.
    queryClient.invalidateQueries({ queryKey: ['discovery'] })
    queryClient.invalidateQueries({ queryKey: ['merchantProfile'] })
    queryClient.invalidateQueries({ queryKey: ['voucher'] })
  }

  const addMutation = useMutation({
    mutationFn: () => api.post(endpoint, undefined),
    onMutate: () => {
      // Optimistic flip.  Owner-direction Device-QA R1 (2026-05-30):
      // heart must feel instant; the pessimistic path was visibly
      // sluggish on a real device.
      setIsFavourited(true)
    },
    onSuccess: () => {
      invalidateOnSuccess()
    },
    onError: (err) => {
      if (isStaleAddCode(err)) {
        // Server already has it favourited — desired state matches.
        // Keep the optimistic flip + invalidate so other views
        // reconcile.  The global MutationCache toast is silenced via
        // the errors.ts surface='silent' mapping (matched by code).
        invalidateOnSuccess()
        return
      }
      setIsFavourited(false)
    },
  })

  const removeMutation = useMutation({
    mutationFn: () => api.del(endpoint),
    onMutate: () => {
      setIsFavourited(false)
    },
    onSuccess: () => {
      invalidateOnSuccess()
    },
    onError: (err) => {
      if (isStaleRemoveCode(err)) {
        invalidateOnSuccess()
        return
      }
      setIsFavourited(true)
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
