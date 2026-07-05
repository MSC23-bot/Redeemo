import { useQuery } from '@tanstack/react-query'
import { getMerchantProfile } from '@/lib/api/profile'

// M1 Slice 5: the lifecycle source (GET /merchant/profile, Bearer). React Query keys
// it ['merchantProfile'] so the shell (StatusPill) and the home page share one fetch.
// Only fetched once authenticated.
export function useMerchantProfile(enabled: boolean) {
  return useQuery({
    queryKey: ['merchantProfile'],
    queryFn: getMerchantProfile,
    enabled,
    staleTime: 60_000,
  })
}

// D-BM1 security correction: a capability-grade variant of the same query. The
// QueryClient is never cleared on logout/login, so the plain observer above can
// briefly report `isSuccess: true` off a PREVIOUS session's cached data before
// its own fetch has landed - which is exactly the crack useBranchCapability
// must not fall through when deciding whether to show owner controls.
//
// This observer is deliberately fresh-per-mount: `staleTime: 0` +
// `refetchOnMount: 'always'` force a real network fetch at subscribe time
// regardless of any cached entry already sitting under the same
// ['merchantProfile'] key, and `isFetchedAfterMount` (which callers must read,
// not `isSuccess` alone) only flips true once THIS observer's own fetch has
// resolved - so a poisoned cache can only ever look "fresh" after this
// instance's own request actually completes. `refetchOnWindowFocus` /
// `refetchOnReconnect` are disabled so an already-settled grant is not
// silently re-validated (and potentially flicker) on background refocus.
//
// This is a second React Query *observer* on the SAME key, not a second
// query: per-observer options like staleTime/refetchOnMount never affect the
// other observers already subscribed to ['merchantProfile'] (e.g. the plain
// `useMerchantProfile` used by the shell/home page), so this hook is additive
// and safe to introduce alongside the existing one.
export function useMerchantProfileFresh(enabled: boolean) {
  return useQuery({
    queryKey: ['merchantProfile'],
    queryFn: getMerchantProfile,
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
