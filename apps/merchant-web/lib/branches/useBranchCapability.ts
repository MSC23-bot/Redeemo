'use client'

// D-BM1: owner-vs-Branch-Manager signal, derived from the profile
// viewerCapabilities.role (the SAME source Quick-Actions and the shell nav use)
// WITH a temporary owner-only compatibility fallback for deployment skew.
//
// SKEW REALITY (correction round): the live Railway backend can predate #364
// and emit NO viewerCapabilities.role while Vercel auto-deploys this frontend.
// Treating an absent role as a settled non-owner would strip the REAL owner of
// branch-management controls until a separately gated backend deployment. So:
//
//   1. An explicit modern role is ALWAYS authoritative - OWNER, BRANCH_MANAGER
//      and STAFF never invoke the fallback.
//   2. ONLY when the profile request SUCCEEDED and carries no role (old
//      backend) does the legacy owner-probe fire: the assertOwner-gated
//      GET /merchant/staff. Probe 200 establishes OWNER and nothing else.
//   3. Probe 403 establishes only non-owner (NEVER Branch Manager - STAFF
//      receives the identical denial, so inferring BM would over-grant).
//   4. Probe network/server errors fail closed to null role and no controls.
//   5. The fallback can never grant BM or STAFF controls; an old backend also
//      never emits the per-branch canManage block, so effectiveCanManage's BM
//      arm cannot fire either. Owners are preserved; nobody is widened.
//
// REMOVAL TRIGGER: delete the legacy probe (and this comment) only after a
// CONFIRMED Railway backend deployment carrying the #364 profile-role
// contract. The long-term design remains probe-free (one role source).
//
// `ready` is true once the modern role OR the required fallback has settled
// either way, so write controls do not flash before the gate resolves. The
// backend asserts remain the real boundary on every write regardless.
//
// SECURITY CORRECTION (fresh-session requirement): the QueryClient is never
// cleared on logout/login (verified against the app's provider tree). Plain
// `useMerchantProfile` / `useStaff` observers therefore CAN report a settled
// `isSuccess: true` off data cached by a DIFFERENT, PREVIOUS session on the
// same browser/tab (e.g. an owner logs out, a Branch Manager logs in on the
// same device, and the still-cached OWNER profile / staff-200 briefly reads
// as "success" before this session's own request has even been sent). A
// capability gate that trusts `isSuccess` alone can therefore hand a
// non-owner a flash of owner controls. This hook must NEVER make that
// mistake, so:
//
//   - It consumes `useMerchantProfileFresh` / `useStaffFresh` (see those
//     hooks' own comments), NOT the plain `useMerchantProfile` / `useStaff`
//     used elsewhere in the shell - deliberately a SEPARATE observer per
//     query key, with `staleTime: 0` + `refetchOnMount: 'always'`.
//   - ADVERSARIAL-REVIEW CORRECTION: the claim that "this hook's own instance
//     always issues its own fetch rather than adopting someone else's cached
//     entry" was DISPROVEN for the empty-cache in-flight case. TanStack
//     query-core dedups at the QUERY level, not the observer level: in
//     `query.fetch()`, when `state.data === undefined` and a fetch is
//     already in-flight (e.g. a PREVIOUS session's request that started
//     before logout and is still pending), any new observer's fetch -
//     INCLUDING one forced by `refetchOnMount: 'always'` - simply ADOPTS the
//     in-flight retryer promise (`retryer.continueRetry(); return
//     retryer.promise`). The `cancelRefetch` branch that would issue a truly
//     new request only applies once `state.data !== undefined` - which is
//     never true on a first-ever fetch against an empty cache. Concretely: a
//     stale bearer's FIRST profile fetch can hang across logout -> login: a
//     new user mounts this hook, `refetchOnMount: 'always'` fires, but
//     because the query has no data yet it adopts the old, still-pending
//     retryer instead of sending a fresh request. When that foreign request
//     resolves, `dataUpdateCount` bumps strictly after this observer's mount,
//     so `isFetchedAfterMount` flips true off a response THIS observer never
//     asked for and whose bearer belongs to the wrong session.
//   - The fix is `useOwnFetchGate` below: on every enable, it first
//     `cancelQueries()`s the key (killing any adopted/in-flight retryer,
//     whoever's bearer it carries) and only THEN calls this hook's own
//     `refetch()`. Everything that starts fetching after that cancel is
//     necessarily issued post-mount by this observer's own effect, so it
//     carries the CURRENT session's bearer (`apiFetch` reads the token at
//     issue time, not at query-definition time) - there is nothing left
//     in-flight for a subsequent `fetch()` call to adopt. `profileFresh` /
//     `staffFresh` below are therefore gated on BOTH the own-fetch-gate flag
//     AND `isFetchedAfterMount` (belt and braces - either one alone is
//     insufficient, see the mutation-tested cases in the test suite).
//   - The freshness gate is `isFetchedAfterMount` (verified against the
//     installed TanStack v5.100.6 query-core source): `dataUpdateCount >
//     queryInitialState.dataUpdateCount || errorUpdateCount >
//     queryInitialState.errorUpdateCount`, where `queryInitialState` is
//     captured at THIS observer's mount time. It is true iff a data OR error
//     update landed strictly AFTER this observer subscribed - so any data
//     already sitting in the cache from a previous session's fetch can never
//     satisfy it; only a genuinely new response (success or error) can.
//   - `staleTime: 0` on the staff probe is load-bearing beyond that: the
//     probe mounts DISABLED and is only enabled once the profile fallback
//     condition is known. That disabled->enabled transition runs through
//     react-query's `shouldFetchOptionally`, which gates on `isStale(query,
//     options)` - `refetchOnMount: 'always'` does NOT apply on that path (it
//     only forces a fetch on the initial mount/subscribe path). Without
//     `staleTime: 0` a cached STAFF_KEY success that still looked "fresh"
//     under the plain hook's 30s staleTime would never be refetched on the
//     enable-flip, and the probe would silently never resolve.
//   - Every derived value below (`modernRole`, `needsLegacyProbe`,
//     `legacyRole`, `ready`) is therefore gated on the corresponding
//     `*Fresh` flag, not just `isSuccess` - a pre-settle state (initial
//     loading, OR cached data mid-background-refetch) reads as not-ready,
//     never as a settled grant.
//   - A settled, already-fresh grant is not later revoked by a background
//     refetch: `refetchOnWindowFocus` / `refetchOnReconnect` are disabled on
//     both fresh variants specifically so returning focus to the tab can
//     never flicker an owner's controls off and back on. Freshness is a
//     one-way gate for the lifetime of the mounted observer, not a
//     continuously-reasserted one.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfileFresh } from '@/lib/auth/useMerchantProfile'
import { useStaffFresh, STAFF_KEY } from '@/lib/staff/useStaff'

const MERCHANT_PROFILE_KEY = ['merchantProfile'] as const

// ADVERSARIAL-REVIEW CORRECTION (see the header comment above): grants
// freshness only after a fetch OUR OWN effect initiated - post-mount,
// post-cancel of anything that might have been adopted from a previous
// session - has settled. Cancelling first means whatever starts fetching
// next is necessarily issued by THIS effect, after THIS observer subscribed,
// so it carries the current session's bearer.
function useOwnFetchGate(
  enabled: boolean,
  queryKey: readonly unknown[],
  refetch: () => Promise<unknown>,
): boolean {
  const queryClient = useQueryClient()
  const [settled, setSettled] = useState(false)
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch
  useEffect(() => {
    if (!enabled) {
      setSettled(false)
      return
    }
    let alive = true
    // Kill ANY in-flight fetch on this key first: a pre-mount request may
    // have been issued under a PREVIOUS session's bearer, and react-query's
    // dedup would otherwise let our observer adopt its result (empty-cache
    // case: even `refetchOnMount: 'always'` adopts - `query.fetch()` returns
    // the existing retryer's promise when `state.data` is undefined).
    // Everything that starts AFTER this cancel is post-mount and therefore
    // carries the CURRENT session's bearer (apiFetch reads the token at
    // issue time).
    void queryClient.cancelQueries({ queryKey }).then(() => {
      if (!alive) return undefined
      return refetchRef.current().finally(() => {
        if (alive) setSettled(true)
      })
    })
    return () => {
      alive = false
      setSettled(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, queryClient])
  return settled
}

export interface BranchCapability {
  isOwner: boolean
  ready: boolean
  /** The effective role (modern profile role, or 'OWNER' via the legacy probe; fail-closed null otherwise). */
  role: string | null
}

export function useBranchCapability(enabled: boolean): BranchCapability {
  const session = useSession()
  const profileEnabled = enabled && session.isAuthenticated
  const profile = useMerchantProfileFresh(profileEnabled)
  const profileOwnSettled = useOwnFetchGate(profileEnabled, MERCHANT_PROFILE_KEY, profile.refetch)
  const profileFresh = profileOwnSettled && profile.isFetchedAfterMount
  const modernRole = profileFresh && profile.isSuccess ? (profile.data?.viewerCapabilities?.role ?? null) : null

  // Fallback fires ONLY for: enabled + authenticated + profile freshly
  // SUCCEEDED + role absent (an old backend). A failed or not-yet-fresh
  // profile request stays fail-closed (no probe, no controls); modern roles
  // never reach here.
  const needsLegacyProbe = profileEnabled && profileFresh && profile.isSuccess && (profile.data?.viewerCapabilities?.role ?? null) === null
  const staff = useStaffFresh(needsLegacyProbe)
  const staffOwnSettled = useOwnFetchGate(needsLegacyProbe, STAFF_KEY, staff.refetch)
  const staffFresh = staffOwnSettled && staff.isFetchedAfterMount

  // 200 => OWNER only, and only once the probe's OWN fetch has settled.
  // 403 AND any other error => null (non-owner, fail closed).
  const legacyRole = needsLegacyProbe && staffFresh && staff.isSuccess ? 'OWNER' : null
  const role = modernRole ?? legacyRole

  const ready = !profileEnabled
    ? false
    : !profileFresh
      ? false
      : profile.isError
        ? true
        : profile.isSuccess
          ? modernRole !== null || (staffFresh && (staff.isSuccess || staff.isError))
          : false

  return { isOwner: role === 'OWNER', ready, role }
}
