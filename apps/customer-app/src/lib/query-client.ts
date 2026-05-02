import { MutationCache, QueryClient } from '@tanstack/react-query'
import { emitToast } from '@/design-system/motion/Toast'
import { mapError } from '@/lib/errors'

let queryClient: QueryClient | null = null

export function getQueryClient(): QueryClient {
  if (!queryClient) {
    queryClient = new QueryClient({
      // Last-resort error surface for any mutation that doesn't handle errors
      // locally (PC1/PC2/PC3 profile saves currently rely on this).
      mutationCache: new MutationCache({
        onError: (error) => {
          emitToast(mapError(error).message, 'danger')
        },
      }),
    })
  }
  return queryClient
}

/**
 * Wipe every cached query + mutation. Called on sign-out and on forced
 * session-expiry so a subsequent user can never see the previous user's
 * cached data. Without this, user-scoped flags baked into responses (e.g.
 * `Review.isOwnReview`, `Voucher.isFavourited`, `selectedBranch.myReview`)
 * would leak across logins because React Query keys are scoped by
 * resource id only — the next user is "user u2 looking at merchant m1",
 * which collides with the cached entry "user u1 looking at merchant m1".
 *
 * Belt-and-braces: also clear the in-memory mutation cache so any in-flight
 * mutation doesn't write back into the now-cleared query cache after the
 * new user has signed in.
 */
export function clearAllQueries(): void {
  queryClient?.clear()
}
