/**
 * Client-only session cache-isolation CORE (T3) - the ONE teardown pipeline for
 * every session boundary (signOut, the hard-logout teardown, and setSession on
 * every login/verify path). All three call sites MUST route through this single
 * function rather than reimplementing the sequence.
 *
 * Order is NORMATIVE (design spec §4.3) - do not reorder:
 *
 * 1. bumpSessionEpoch() - instantly invalidates every in-flight request and any
 *    pending refresh at the transport layer (nothing issued before this line can
 *    deliver data or a token after it).
 * 2. setAccessToken(null) + resetRefreshInFlight() - nulling the token BEFORE the
 *    cache is cleared is load-bearing: a clear()-triggered refetch on a
 *    still-mounted observer carries no old bearer, and (being issued post-bump)
 *    would NOT be caught by the epoch guard on its own. Resetting the single-flight
 *    refresh slot stops the next session adopting a promise that belongs to a dead
 *    session.
 * 3. await queryClient.cancelQueries() - cancels every query retryer so nothing can
 *    settle into the cache between here and the next step.
 * 4. queryClient.clear() - removes every query AND mutation cache entry (data,
 *    errors, paused mutations, in-flight mutation records). The next account starts
 *    from an empty cache.
 *
 * Caller-specific state (React `merchant`/`accessToken` state sync, navigation)
 * proceeds in the caller AFTER this resolves - see lib/auth/session.tsx.
 */
import type { QueryClient } from '@tanstack/react-query'
import { bumpSessionEpoch } from './sessionEpoch'
import { setAccessToken } from './tokenStore'
import { resetRefreshInFlight } from '@/lib/api/client'

export async function resetSessionState(queryClient: QueryClient): Promise<void> {
  bumpSessionEpoch()
  setAccessToken(null)
  resetRefreshInFlight()
  await queryClient.cancelQueries()
  queryClient.clear()
}
