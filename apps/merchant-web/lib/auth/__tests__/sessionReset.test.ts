/**
 * T3 - the teardown pipeline. Uses a REAL QueryClient (not mocked) so cancelQueries
 * and clear() are exercised for real; the transport (`@/lib/api/client`) module is
 * mocked so we can assert `resetRefreshInFlight` was called without depending on the
 * real fetch-based refresh machinery (that machinery is covered in client.test.ts).
 */
import { QueryClient } from '@tanstack/react-query'
import { resetSessionState } from '@/lib/auth/sessionReset'
import { getSessionEpoch } from '@/lib/auth/sessionEpoch'
import { getAccessToken, setAccessToken } from '@/lib/auth/tokenStore'

const resetRefreshInFlightMock = jest.fn()
jest.mock('@/lib/api/client', () => ({
  resetRefreshInFlight: () => resetRefreshInFlightMock(),
}))

describe('resetSessionState (T3 teardown pipeline)', () => {
  beforeEach(() => {
    setAccessToken(null)
    jest.clearAllMocks()
  })

  it('bumps the session epoch', async () => {
    const qc = new QueryClient()
    const before = getSessionEpoch()
    await resetSessionState(qc)
    expect(getSessionEpoch()).toBe(before + 1)
  })

  it('nulls the access token and resets the refresh single-flight', async () => {
    setAccessToken('tok')
    const qc = new QueryClient()
    await resetSessionState(qc)
    expect(getAccessToken()).toBeNull()
    expect(resetRefreshInFlightMock).toHaveBeenCalledTimes(1)
  })

  it('cancels every query and clears the entire cache', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['a'], { x: 1 })
    qc.setQueryData(['b'], { y: 2 })
    expect(qc.getQueryCache().getAll().length).toBeGreaterThan(0)

    const cancelSpy = jest.spyOn(qc, 'cancelQueries')
    const clearSpy = jest.spyOn(qc, 'clear')

    await resetSessionState(qc)

    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(clearSpy).toHaveBeenCalledTimes(1)
    expect(qc.getQueryCache().getAll().length).toBe(0)
    expect(qc.getQueryData(['a'])).toBeUndefined()
    expect(qc.getQueryData(['b'])).toBeUndefined()
  })

  it('clears mutation cache entries too (paused/in-flight mutation records)', async () => {
    const qc = new QueryClient()
    // Seed a mutation cache entry via the mutation cache directly (build() + execute
    // isn't needed - a raw cache-observer-free entry is enough to prove clear() wipes
    // the mutation cache, not just the query cache).
    qc.getMutationCache().build(qc, { mutationFn: async () => 'ok' })
    expect(qc.getMutationCache().getAll().length).toBeGreaterThan(0)
    await resetSessionState(qc)
    expect(qc.getMutationCache().getAll().length).toBe(0)
  })

  it('correction 5 (failure-safe): a cancelQueries rejection does NOT throw out of teardown - clear() still runs and the cache is still wiped', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['x'], { a: 1 })
    jest.spyOn(qc, 'cancelQueries').mockRejectedValue(new Error('cancel boom'))
    const clearSpy = jest.spyOn(qc, 'clear')
    // WITH the try/catch around cancelQueries: resetSessionState resolves (does NOT
    // reject) and clear() still ran. MUTATION (drop the try/catch, bare
    // `await qc.cancelQueries()`): the reject propagates, clear() is skipped, and this
    // expectation flips (the promise rejects + clearSpy is never called).
    await expect(resetSessionState(qc)).resolves.toEqual(expect.any(Number))
    expect(clearSpy).toHaveBeenCalledTimes(1)
    expect(qc.getQueryData(['x'])).toBeUndefined()
  })

  it('returns the generation (the epoch it bumped to) for the overlapping-transition ownership guard (correction 8)', async () => {
    const qc = new QueryClient()
    const generation = await resetSessionState(qc)
    expect(generation).toBe(getSessionEpoch())
  })

  it('ordering: cancelQueries runs BEFORE clear (a fetch resolving in that exact gap cannot survive)', async () => {
    const qc = new QueryClient()
    const order: string[] = []
    let releaseCancel: (() => void) | undefined
    jest.spyOn(qc, 'cancelQueries').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          order.push('cancel-start')
          releaseCancel = () => {
            order.push('cancel-end')
            resolve()
          }
        }),
    )
    jest.spyOn(qc, 'clear').mockImplementation(() => {
      order.push('clear')
    })

    const p = resetSessionState(qc)
    // At this point cancelQueries is pending and clear() must NOT have run yet.
    expect(order).toEqual(['cancel-start'])
    releaseCancel?.()
    await p
    expect(order).toEqual(['cancel-start', 'cancel-end', 'clear'])
  })

  it('deferred-promise pin: a fetch/query update landing exactly between cancel and clear cannot survive teardown', async () => {
    // Simulates the exact race the ordering guards against: something writes into
    // the cache in the narrow window after cancelQueries() resolves but before
    // clear() runs. Because clear() runs unconditionally right after the awaited
    // cancelQueries() (no further await in between), that write is wiped anyway.
    const qc = new QueryClient()
    let deferredWrite: (() => void) | undefined
    jest.spyOn(qc, 'cancelQueries').mockImplementation(async () => {
      // Schedule (but do not yet run) a cache write for "between cancel and clear".
      await new Promise<void>((resolve) => {
        deferredWrite = () => {
          qc.setQueryData(['late'], { poisoned: true })
          resolve()
        }
      })
    })
    const p = resetSessionState(qc)
    deferredWrite?.()
    await p
    expect(qc.getQueryData(['late'])).toBeUndefined()
  })
})
