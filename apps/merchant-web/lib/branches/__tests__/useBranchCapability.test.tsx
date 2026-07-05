/**
 * D-BM1 SECURITY CORRECTION suite for useBranchCapability.
 *
 * The QueryClient is never cleared on logout/login, so a plain react-query
 * observer can report `isSuccess: true` off a PREVIOUS session's cached data
 * before its OWN fetch has landed. A capability gate must never trust
 * `isSuccess` alone for that reason - it must gate on `isFetchedAfterMount`
 * (true only once THIS observer's own fetch has resolved, per the installed
 * TanStack v5.100.6 query-core semantics).
 *
 * Unlike the pre-correction suite (which mocked `useMerchantProfile` /
 * `useStaff` directly), this suite exercises the REAL `useMerchantProfileFresh`
 * / `useStaffFresh` hooks against a REAL QueryClient, and only mocks the two
 * network boundaries (`getMerchantProfile`, `listStaff`). This is required to
 * prove the freshness contract: cross-session cache poisoning is simulated via
 * `queryClient.setQueryData(...)` BEFORE the hook mounts, which sets the
 * query's `dataUpdateCount` pre-mount so `isFetchedAfterMount` reads false
 * until the observer's own fetch settles - exactly mirroring a stale
 * previous-session cache entry sitting under the same key.
 */
import * as React from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useBranchCapability } from '../useBranchCapability'
import { effectiveCanManage } from '../capability'
import { STAFF_KEY } from '@/lib/staff/useStaff'

// --- session mock ------------------------------------------------------------
const mockSession = jest.fn()
jest.mock('@/lib/auth/session', () => ({
  useSession: () => mockSession(),
}))

// --- network-boundary mocks (the ONLY things mocked besides session) --------
const mockGetMerchantProfile = jest.fn()
jest.mock('@/lib/api/profile', () => ({
  getMerchantProfile: (...a: unknown[]) => mockGetMerchantProfile(...a),
}))

const mockListStaff = jest.fn()
jest.mock('@/lib/api/staff', () => ({
  listStaff: (...a: unknown[]) => mockListStaff(...a),
  inviteStaff: jest.fn(),
  updateStaff: jest.fn(),
  deactivateStaff: jest.fn(),
  reactivateStaff: jest.fn(),
  removeStaff: jest.fn(),
  resendInvite: jest.fn(),
  listBranchAppUsers: jest.fn(),
  resetAppUserPassword: jest.fn(),
  deactivateAppUser: jest.fn(),
  reactivateAppUser: jest.fn(),
}))

// --- test plumbing ------------------------------------------------------------
interface Deferred<T> {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

// A minimal old-backend-shaped profile: request succeeded, but no role field
// at all (predates #364).
const OLD_BACKEND_PROFILE = { viewerCapabilities: {} }
function modernProfile(role: string) {
  return { viewerCapabilities: { role } }
}
// A previous session's cached staff-list success (content is irrelevant - only
// that the query key already holds a settled success).
const CACHED_STAFF_SUCCESS = [{ id: 'cached-row-from-prior-session' }]

beforeEach(() => {
  mockSession.mockReset()
  mockSession.mockReturnValue({ isAuthenticated: true })
  mockGetMerchantProfile.mockReset()
  mockListStaff.mockReset()
})

describe('useBranchCapability - fresh-session security correction', () => {
  // 1. Cached OWNER profile seeded + fresh request pending -> sample DURING
  // pending: ready=false, role=null, isOwner=false. Fresh resolves
  // BRANCH_MANAGER -> final role='BRANCH_MANAGER', ready=true, isOwner=false.
  // [MUTATION PIN (a): dropping `profileFresh &&` from modernRole makes the
  // pending sample read role='OWNER' instead of null.]
  it('1. cached OWNER + fresh pending -> not-ready; fresh resolves BRANCH_MANAGER -> role BRANCH_MANAGER, never OWNER', async () => {
    const qc = freshClient()
    qc.setQueryData(['merchantProfile'], modernProfile('OWNER'))
    const profile = deferred<unknown>()
    mockGetMerchantProfile.mockReturnValue(profile.promise)

    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    await act(async () => {}) // flush the mount-triggered fetch kickoff without resolving it
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })
    expect(mockListStaff).not.toHaveBeenCalled()

    await act(async () => {
      profile.resolve(modernProfile('BRANCH_MANAGER'))
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: 'BRANCH_MANAGER' })
    expect(mockListStaff).not.toHaveBeenCalled()
  })

  // 2. Cached OWNER profile seeded + fresh resolves STAFF -> isOwner NEVER
  // true, sampled both during pending and after settle.
  it('2. cached OWNER + fresh resolves STAFF -> isOwner never true at any sampled point', async () => {
    const qc = freshClient()
    qc.setQueryData(['merchantProfile'], modernProfile('OWNER'))
    const profile = deferred<unknown>()
    mockGetMerchantProfile.mockReturnValue(profile.promise)

    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    await act(async () => {})
    expect(result.current.isOwner).toBe(false)
    expect(result.current.role).toBe(null)

    await act(async () => {
      profile.resolve(modernProfile('STAFF'))
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: 'STAFF' })
  })

  // 3. Cached staff success seeded + fresh profile resolves with NO role (old
  // backend) -> no OWNER while the fresh staff request is outstanding
  // (ready=false, role=null); fresh staff success -> OWNER.
  // This test ALSO pins mutation (c): if useStaffFresh's staleTime regressed
  // from 0 to a non-zero value, the enable-flip would see the pre-seeded
  // ['staff'] entry as non-stale and never issue a new fetch, so
  // `mockListStaff` would never be called and the waitFor below would time out.
  it('3. cached staff success + fresh profile no-role -> no OWNER until fresh staff settles; enable-flip still fetches despite fresh cache', async () => {
    const qc = freshClient()
    qc.setQueryData(['staff'], CACHED_STAFF_SUCCESS)
    const profile = deferred<unknown>()
    mockGetMerchantProfile.mockReturnValue(profile.promise)
    const staff = deferred<unknown>()
    mockListStaff.mockReturnValue(staff.promise)

    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    await act(async () => {})
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })
    expect(mockListStaff).not.toHaveBeenCalled()

    await act(async () => {
      profile.resolve(OLD_BACKEND_PROFILE)
    })
    // The probe must actually fetch (staleTime:0), even though ['staff'] cache
    // already holds a "fresh-looking" success under a longer staleTime. It is
    // called TWICE per enable: react-query's own `refetchOnMount: 'always'`
    // trigger fires first (call #1, immediately cancelled by
    // `useOwnFetchGate`), then this hook's own cancel-then-refetch issues the
    // real, current-session call (#2) - see the useOwnFetchGate comment.
    await waitFor(() => expect(mockListStaff).toHaveBeenCalledTimes(2))
    // Staff fetch is now outstanding (not yet resolved): must not grant OWNER
    // off the pre-existing cached success.
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })

    await act(async () => {
      staff.resolve(CACHED_STAFF_SUCCESS)
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current).toEqual({ isOwner: true, ready: true, role: 'OWNER' })
  })

  // 4. Cached staff success seeded + fresh staff rejects 403 -> final
  // role=null, ready=true, isOwner=false.
  it('4. cached staff success + fresh staff 403 -> role null, ready true, isOwner false (fail closed)', async () => {
    const qc = freshClient()
    qc.setQueryData(['staff'], CACHED_STAFF_SUCCESS)
    const profile = deferred<unknown>()
    mockGetMerchantProfile.mockReturnValue(profile.promise)
    const staff = deferred<unknown>()
    mockListStaff.mockReturnValue(staff.promise)

    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    await act(async () => {
      profile.resolve(OLD_BACKEND_PROFILE)
    })
    // See test 3's comment: `useOwnFetchGate`'s cancel-then-refetch means
    // listStaff is called twice per enable (the auto-triggered call gets
    // cancelled; the second is this hook's own).
    await waitFor(() => expect(mockListStaff).toHaveBeenCalledTimes(2))

    await act(async () => {
      staff.reject(new Error('403 INSUFFICIENT_PERMISSIONS'))
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: null })
    // BM-widening negative: even if a mutation smuggled a role value through,
    // the effective per-branch formula still denies management without an
    // explicit BM canManage grant on the branch.
    expect(effectiveCanManage(result.current.role, undefined)).toBe(false)
    expect(effectiveCanManage(result.current.role, { viewerCapabilities: { canManage: true } })).toBe(false)
  })

  // 5. Cached staff success seeded + fresh staff rejects 500/network -> final
  // role=null, ready=true.
  it('5. cached staff success + fresh staff 500/network error -> role null, ready true (fail closed)', async () => {
    const qc = freshClient()
    qc.setQueryData(['staff'], CACHED_STAFF_SUCCESS)
    const profile = deferred<unknown>()
    mockGetMerchantProfile.mockReturnValue(profile.promise)
    const staff = deferred<unknown>()
    mockListStaff.mockReturnValue(staff.promise)

    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    await act(async () => {
      profile.resolve(OLD_BACKEND_PROFILE)
    })
    await waitFor(() => expect(mockListStaff).toHaveBeenCalledTimes(2))

    await act(async () => {
      staff.reject(new Error('network error'))
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: null })
  })

  // 6. No cache; fresh profile no-role; fresh staff 200 -> OWNER, ready=true.
  it('6. no cache + fresh profile no-role + fresh staff 200 -> OWNER, ready true', async () => {
    const qc = freshClient()
    const profile = deferred<unknown>()
    mockGetMerchantProfile.mockReturnValue(profile.promise)
    const staff = deferred<unknown>()
    mockListStaff.mockReturnValue(staff.promise)

    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })

    await act(async () => {
      profile.resolve(OLD_BACKEND_PROFILE)
    })
    await waitFor(() => expect(mockListStaff).toHaveBeenCalledTimes(2))
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })

    await act(async () => {
      staff.resolve([{ id: 'm1' }])
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current).toEqual({ isOwner: true, ready: true, role: 'OWNER' })
  })

  // 7. Modern roles suppress the probe entirely: for each of OWNER /
  // BRANCH_MANAGER / STAFF freshly returned, listStaff is NEVER called.
  it.each(['OWNER', 'BRANCH_MANAGER', 'STAFF'])(
    '7. modern role %s freshly resolved -> no probe fired, listStaff never called',
    async (role) => {
      const qc = freshClient()
      const profile = deferred<unknown>()
      mockGetMerchantProfile.mockReturnValue(profile.promise)

      const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
      await act(async () => {
        profile.resolve(modernProfile(role))
      })
      await waitFor(() => expect(result.current.ready).toBe(true))
      expect(result.current).toEqual({ isOwner: role === 'OWNER', ready: true, role })
      expect(mockListStaff).not.toHaveBeenCalled()
    },
  )

  // 8. Not-ready during pre-settle states.
  describe('8. pre-settle states are never treated as a settled grant', () => {
    it('8a. no cache, profile loading -> ready false', async () => {
      const qc = freshClient()
      const profile = deferred<unknown>()
      mockGetMerchantProfile.mockReturnValue(profile.promise)

      const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
      await act(async () => {})
      expect(result.current).toEqual({ isOwner: false, ready: false, role: null })
      expect(mockListStaff).not.toHaveBeenCalled()
    })

    it('8b. cached profile data present, fresh refetch in flight -> ready false, role null', async () => {
      const qc = freshClient()
      qc.setQueryData(['merchantProfile'], modernProfile('STAFF'))
      const profile = deferred<unknown>()
      mockGetMerchantProfile.mockReturnValue(profile.promise)

      const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
      await act(async () => {})
      expect(result.current).toEqual({ isOwner: false, ready: false, role: null })
      expect(mockListStaff).not.toHaveBeenCalled()
    })
  })

  // 9. Remount/session-swap: cache still holds a PRIOR mount's settled OWNER
  // grant, but a fresh session (new mount) must never inherit it before its
  // own fetch resolves - and never see OWNER at all once the new session
  // settles as STAFF.
  it('9. remount after a session swap: cache holds prior-mount OWNER, new mount settles STAFF, never OWNER', async () => {
    const qc = freshClient()
    const firstProfile = deferred<unknown>()
    // `mockReturnValue` (not `Once`): `useOwnFetchGate`'s cancel-then-refetch
    // calls `getMerchantProfile` TWICE per enable (the auto-triggered call is
    // cancelled before it can be adopted; the second is this hook's own -
    // see the useOwnFetchGate comment), so a single `Once` value would starve
    // the second call.
    mockGetMerchantProfile.mockReturnValue(firstProfile.promise)

    const first = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    await act(async () => {
      firstProfile.resolve(modernProfile('OWNER'))
    })
    await waitFor(() => expect(first.result.current.ready).toBe(true))
    expect(first.result.current).toEqual({ isOwner: true, ready: true, role: 'OWNER' })
    first.unmount()

    // Cache still holds the OWNER data from the first mount's settled fetch.
    expect(qc.getQueryData(['merchantProfile'])).toEqual(modernProfile('OWNER'))

    const secondProfile = deferred<unknown>()
    mockGetMerchantProfile.mockReturnValue(secondProfile.promise)
    const second = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    await act(async () => {}) // flush the new mount's own fetch kickoff, unresolved
    expect(second.result.current).toEqual({ isOwner: false, ready: false, role: null })

    await act(async () => {
      secondProfile.resolve(modernProfile('STAFF'))
    })
    await waitFor(() => expect(second.result.current.ready).toBe(true))
    expect(second.result.current).toEqual({ isOwner: false, ready: true, role: 'STAFF' })
  })

  // 10. Disabled / unauthenticated: zero network requests, ready false.
  it('10a. disabled=false (even authenticated): zero requests, ready false', async () => {
    const qc = freshClient()
    const { result } = renderHook(() => useBranchCapability(false), { wrapper: wrapper(qc) })
    await act(async () => {})
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })
    expect(mockGetMerchantProfile).not.toHaveBeenCalled()
    expect(mockListStaff).not.toHaveBeenCalled()
  })

  it('10b. unauthenticated (even enabled=true): zero requests, ready false', async () => {
    mockSession.mockReturnValue({ isAuthenticated: false })
    const qc = freshClient()
    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    await act(async () => {})
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })
    expect(mockGetMerchantProfile).not.toHaveBeenCalled()
    expect(mockListStaff).not.toHaveBeenCalled()
  })

  // --- preserved Wave-9 coverage (adapted to the fresh contract) --------------

  it('preserved: profile request ERROR -> ready true, role null, no probe fired (fail closed)', async () => {
    const qc = freshClient()
    const profile = deferred<unknown>()
    mockGetMerchantProfile.mockReturnValue(profile.promise)

    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    await act(async () => {
      profile.reject(new Error('500'))
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: null })
    expect(mockListStaff).not.toHaveBeenCalled()
  })

  it('preserved: precedence pin - an explicit modern role suppresses the probe even if staff would resolve 200', async () => {
    const qc = freshClient()
    const profile = deferred<unknown>()
    mockGetMerchantProfile.mockReturnValue(profile.promise)
    // Deliberately configured as if the legacy probe would succeed, to prove
    // it is never consulted once a modern role is present.
    mockListStaff.mockResolvedValue([{ id: 'irrelevant' }])

    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    await act(async () => {
      profile.resolve(modernProfile('BRANCH_MANAGER'))
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: 'BRANCH_MANAGER' })
    expect(mockListStaff).not.toHaveBeenCalled()
  })

  // --- Opus adversarial-review pins: query-core dedup adoption ----------------
  //
  // TanStack query-core dedups at the QUERY level, not the observer level.
  // `query.fetch()` ADOPTS an existing in-flight retryer's promise whenever
  // `state.data === undefined` at fetch time - this is true even for a fetch
  // forced by `refetchOnMount: 'always'`. These two tests seed a genuinely
  // in-flight FOREIGN fetch (via `queryClient.prefetchQuery`, simulating a
  // previous session's request that is still pending) on an EMPTY cache
  // BEFORE the hook ever mounts, and prove that this hook's `useOwnFetchGate`
  // cancels that foreign retryer instead of adopting its result.

  it('11a. in-flight adoption (profile vector): a foreign pending fetch on an empty cache must be cancelled, never adopted', async () => {
    const qc = freshClient()
    const foreignDeferred = deferred<unknown>()
    // Simulate a previous session's still-pending FIRST fetch on this key.
    void qc.prefetchQuery({ queryKey: ['merchantProfile'], queryFn: () => foreignDeferred.promise })

    const ownDeferred = deferred<unknown>()
    mockGetMerchantProfile.mockReturnValue(ownDeferred.promise)

    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    await act(async () => {})
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })

    // Resolve the FOREIGN in-flight promise as an OWNER-shaped profile. Pre-fix,
    // `refetchOnMount: 'always'` would have adopted this retryer and
    // `isFetchedAfterMount` would flip true off it, granting OWNER. It must
    // have NO effect here.
    await act(async () => {
      foreignDeferred.resolve(modernProfile('OWNER'))
    })
    expect(result.current.isOwner).toBe(false)
    expect(result.current.ready).toBe(false)
    expect(result.current.role).toBe(null)

    // This observer's OWN cancel-then-refetch fetch settles with a STAFF-shaped
    // profile - the real, current-session result.
    await act(async () => {
      ownDeferred.resolve(modernProfile('STAFF'))
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: 'STAFF' })
  })

  // 11b. Isolates `profileOwnSettled` specifically (distinct from the mere
  // presence of the cancel step exercised by 11a). Artificially DELAYS this
  // hook's `queryClient.cancelQueries()` call so the foreign in-flight fetch
  // can be adopted-and-settle BEFORE this observer's own cancel-then-refetch
  // chain runs at all - the worst-case ordering the fix must still survive.
  // Without the `profileOwnSettled` gate (i.e. gating on `isFetchedAfterMount`
  // alone), the adopted foreign data would flip `isFetchedAfterMount` true the
  // instant it lands (it genuinely did land strictly after this observer
  // subscribed) and grant OWNER off it - even though this observer's OWN
  // fetch has not even started yet.
  it('11b. race guard: adoption settling before this effect even calls cancelQueries must still not grant a role (profileOwnSettled)', async () => {
    const qc = freshClient()
    const foreignDeferred = deferred<unknown>()
    void qc.prefetchQuery({ queryKey: ['merchantProfile'], queryFn: () => foreignDeferred.promise })

    // Gate this hook's own cancelQueries call so we control exactly when it
    // resolves relative to the foreign promise settling.
    const cancelGate = deferred<void>()
    const originalCancelQueries = qc.cancelQueries.bind(qc)
    const cancelSpy = jest.spyOn(qc, 'cancelQueries').mockImplementation(async (...args: unknown[]) => {
      await cancelGate.promise
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalCancelQueries as any)(...args)
    })

    const ownDeferred = deferred<unknown>()
    mockGetMerchantProfile.mockReturnValue(ownDeferred.promise)

    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    await act(async () => {})
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })

    // The foreign retryer is still adopted (our cancel is gated, hasn't run
    // yet) - resolve it as OWNER. This DOES land as a genuine post-subscribe
    // data update for this observer (isFetchedAfterMount would flip true off
    // it in isolation), but this observer's own fetch has not settled.
    await act(async () => {
      foreignDeferred.resolve(modernProfile('OWNER'))
    })
    // Drain the microtask queue past a macrotask boundary: react-query's
    // internal notify chain (retryer settle -> query dispatch -> observer
    // notify -> setState) is several `.then()` hops deep, and a single
    // `act(async () => {})` only guarantees ONE hook flush, not an exhaustive
    // microtask drain. `setTimeout(0)` is a macrotask, so by the time it
    // fires every already-queued microtask (however many chained `.then()`s)
    // has necessarily run - making the assertion below deterministic either
    // way: under the fix, isOwner stays false no matter how long we wait
    // (nothing makes it true until cancelGate resolves); under a regression
    // it would have fully propagated to true by now. Under-flushing here
    // would let a regression hide as a flaky false negative.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(result.current.isOwner).toBe(false)
    expect(result.current.ready).toBe(false)
    expect(result.current.role).toBe(null)

    // Release the gate: this observer's own cancel-then-refetch chain now
    // runs (cancel is a no-op at this point - nothing left in flight - but
    // the explicit `refetch()` still forces a genuinely new fetch since data
    // is now defined), settling with a STAFF-shaped profile.
    await act(async () => {
      cancelGate.resolve()
    })
    await act(async () => {
      ownDeferred.resolve(modernProfile('STAFF'))
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: 'STAFF' })

    cancelSpy.mockRestore()
  })

  it('12. in-flight adoption (staff vector): a foreign pending STAFF_KEY fetch must be cancelled, never adopted', async () => {
    const qc = freshClient()
    mockGetMerchantProfile.mockResolvedValue(OLD_BACKEND_PROFILE)

    // Seed a foreign in-flight STAFF_KEY fetch (empty cache) BEFORE the legacy
    // probe ever enables - mirroring a previous owner session's still-pending
    // GET /merchant/staff.
    const foreignStaffDeferred = deferred<unknown>()
    void qc.prefetchQuery({ queryKey: STAFF_KEY, queryFn: () => foreignStaffDeferred.promise })

    const ownStaffDeferred = deferred<unknown>()
    mockListStaff.mockReturnValue(ownStaffDeferred.promise)

    const { result } = renderHook(() => useBranchCapability(true), { wrapper: wrapper(qc) })
    // Profile resolves no-role (old backend), which enables the probe.
    await waitFor(() => expect(mockListStaff).toHaveBeenCalled())
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })

    // Resolve the FOREIGN staff success FIRST: pre-fix, the probe's
    // `refetchOnMount: 'always'` fetch would have adopted this retryer and
    // granted OWNER off it. It must have no effect.
    await act(async () => {
      foreignStaffDeferred.resolve(CACHED_STAFF_SUCCESS)
    })
    expect(result.current.isOwner).toBe(false)
    expect(result.current.ready).toBe(false)

    // This observer's OWN cancel-then-refetch fetch settles with a 403 - fail
    // closed, never OWNER.
    await act(async () => {
      ownStaffDeferred.reject(new Error('403 INSUFFICIENT_PERMISSIONS'))
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: null })
  })

  // 13. The own-fetch gate is not a one-shot latch: disabling and re-enabling
  // within the SAME mount must reset it to not-settled, and the re-enable must
  // issue a genuinely new own fetch rather than trusting the just-settled
  // cached grant still sitting in the cache.
  it('13. own-fetch gate resets to not-settled when enabled toggles off then on again within the same mount', async () => {
    const qc = freshClient()
    const firstProfile = deferred<unknown>()
    // `mockReturnValue` (not `Once`) - see test 9's comment: two calls land
    // per enable under the cancel-then-refetch design.
    mockGetMerchantProfile.mockReturnValue(firstProfile.promise)

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useBranchCapability(enabled),
      { wrapper: wrapper(qc), initialProps: { enabled: true } },
    )
    await act(async () => {
      firstProfile.resolve(modernProfile('OWNER'))
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current).toEqual({ isOwner: true, ready: true, role: 'OWNER' })

    // Disable: the gate must reset even though the cache still holds the
    // just-settled OWNER data.
    rerender({ enabled: false })
    await act(async () => {})
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })
    expect(qc.getQueryData(['merchantProfile'])).toEqual(modernProfile('OWNER'))

    // Re-enable: must issue a genuinely new own fetch and stay not-ready until
    // THAT settles - never a silent re-grant off the still-cached data.
    const secondProfile = deferred<unknown>()
    mockGetMerchantProfile.mockReturnValue(secondProfile.promise)
    rerender({ enabled: true })
    await act(async () => {})
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })

    await act(async () => {
      secondProfile.resolve(modernProfile('STAFF'))
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: 'STAFF' })
  })
})
