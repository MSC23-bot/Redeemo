/**
 * T5 - full account-switch integration (design spec §6, plan T5).
 *
 * Exercises the REAL `apiFetch` transport (lib/api/client.ts) and the REAL
 * `SessionProvider` (lib/auth/session.tsx) against a REAL QueryClient. Only the
 * network boundary (global.fetch) is mocked. Simulates: user A logged in and
 * cached + one hung in-flight request for A's data; sign out; log in as B (same
 * tab, same QueryClient); THEN resolve A's hung request. Asserts: no A data ever
 * reaches the cache or the screen after the switch, and the token store ends up
 * holding ONLY B's token - proving the epoch guard (T2) and the teardown pipeline
 * (T3/T4) work together end-to-end, not just in isolation.
 *
 * The SECOND test (Opus review, Finding 1) isolates the epoch GUARD specifically:
 * it uses an IMPERATIVE `apiFetch` caller that is NOT routed through React Query, so
 * React Query's cancelQueries/clear can supply NO isolation for it. Its late,
 * old-bearer resolution can only be stopped by the transport epoch guard - so that
 * test fails if the epoch bump is removed from resetSessionState (the guard would
 * then let the stale response through).
 */
import * as React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { SessionProvider, useSession } from '@/lib/auth/session'
import { getAccessToken, setAccessToken } from '@/lib/auth/tokenStore'
import { apiFetch, ApiError } from '@/lib/api/client'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

function jsonRes(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response
}

// Query-FREE probe: only the session controls, no useQuery. Used by the imperative
// test so nothing the imperative apiFetch touches is owned by React Query.
function SwitchProbe() {
  const session = useSession()
  return (
    <div>
      <span data-testid="auth">{String(session.isAuthenticated)}</span>
      <button onClick={() => void session.setSession('A-token', { id: 'm-a', businessName: 'Merchant A', approvalStatus: 'APPROVED' })}>
        login-a
      </button>
      <button onClick={() => void session.setSession('B-token', { id: 'm-b', businessName: 'Merchant B', approvalStatus: 'APPROVED' })}>
        login-b
      </button>
      <button onClick={() => void session.signOut()}>signout</button>
    </div>
  )
}

function ProfileProbe() {
  const session = useSession()
  const { data } = useQuery({
    queryKey: ['merchantProfile'],
    queryFn: () => apiFetch<{ name: string }>('/merchant/profile', { auth: true }),
    enabled: session.isAuthenticated,
  })
  return (
    <div>
      <span data-testid="name">{data?.name ?? 'none'}</span>
      <span data-testid="auth">{String(session.isAuthenticated)}</span>
      <button onClick={() => void session.setSession('A-token', { id: 'm-a', businessName: 'Merchant A', approvalStatus: 'APPROVED' })}>
        login-a
      </button>
      <button onClick={() => void session.setSession('B-token', { id: 'm-b', businessName: 'Merchant B', approvalStatus: 'APPROVED' })}>
        login-b
      </button>
      <button onClick={() => void session.signOut()}>signout</button>
    </div>
  )
}

describe('full account-switch cache isolation (T5 integration)', () => {
  beforeEach(() => {
    setAccessToken(null)
  })

  it('a hung in-flight request for account A resolving AFTER logout+login-as-B never poisons B, the cache, or the token store', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    let resolveHungA: ((res: Response) => void) | undefined
    let bFetchCount = 0
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/api/merchant-auth/refresh')) return jsonRes(401, {}) // no cookie session in this test
      if (u.endsWith('/api/merchant-auth/logout')) return jsonRes(200, {})
      if (u.endsWith('/merchant/profile')) {
        const headers = init?.headers as Headers | undefined
        const authHeader = headers?.get ? headers.get('Authorization') : undefined
        if (authHeader === 'Bearer A-token') {
          // A's request hangs until manually released, well after the account switch.
          return new Promise<Response>((resolve) => {
            resolveHungA = resolve
          })
        }
        bFetchCount += 1
        return jsonRes(200, { name: 'Merchant B' })
      }
      return jsonRes(200, {})
    }) as unknown as typeof fetch

    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ProfileProbe />
        </SessionProvider>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('false'))

    // Log in as A through the REAL flow - this both installs A's token AND enables
    // (and thus fires) the profile query, which our mock hangs.
    await act(async () => {
      screen.getByText('login-a').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))
    expect(getAccessToken()).toBe('A-token')
    // A's request is still hung - no data yet.
    expect(screen.getByTestId('name').textContent).toBe('none')

    // Sign out, then immediately log in as B - the SAME tab, SAME QueryClient. A's
    // hung request is STILL unresolved throughout this entire sequence.
    await act(async () => {
      screen.getByText('signout').click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getAccessToken()).toBeNull()

    await act(async () => {
      screen.getByText('login-b').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))
    expect(getAccessToken()).toBe('B-token')

    // B's own fetch should have already landed (or be about to).
    await waitFor(() => expect(screen.getByTestId('name').textContent).toBe('Merchant B'))
    expect(bFetchCount).toBeGreaterThan(0)

    // NOW resolve A's long-hung request. It must NOT repopulate the cache, must NOT
    // be rendered, and must NOT touch the token store - the epoch guard (T2) throws
    // SESSION_SWITCHED on its resolution, and react-query's own cancelQueries (T3)
    // additionally discards it at the retryer level.
    await act(async () => {
      resolveHungA?.(jsonRes(200, { name: 'Merchant A (late, must be discarded)' }))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getAccessToken()).toBe('B-token')
    expect(screen.getByTestId('name').textContent).toBe('Merchant B')
    expect(screen.getByTestId('name').textContent).not.toContain('Merchant A')
    expect(queryClient.getQueryData(['merchantProfile'])).toEqual({ name: 'Merchant B' })
  })

  it('epoch-guard-SPECIFIC (Opus Finding 1): an IMPERATIVE apiFetch (NOT via React Query) in-flight across signOut->login-B REJECTS with SESSION_SWITCHED on its late old-bearer resolution', async () => {
    // React Query's cancelQueries/clear cannot touch a raw apiFetch promise, so the
    // ONLY thing that can stop this stale old-account response from resolving is the
    // transport epoch guard (T2) driven by the epoch bump in resetSessionState (T3).
    // Remove that bump and this test fails (the response would DELIVER instead of
    // rejecting). This is the assertion the account-switch test above cannot make,
    // because there React Query's own cancellation already supplies the isolation.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    let resolveHungA: ((res: Response) => void) | undefined
    global.fetch = jest.fn(async (url: unknown) => {
      const u = String(url)
      if (u.endsWith('/api/merchant-auth/refresh')) return jsonRes(401, {}) // no cookie session
      if (u.endsWith('/api/merchant-auth/logout')) return jsonRes(200, {})
      if (u.endsWith('/merchant/imperative')) {
        return new Promise<Response>((resolve) => {
          resolveHungA = resolve // A's imperative request hangs until released post-switch
        })
      }
      return jsonRes(200, {})
    }) as unknown as typeof fetch

    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SwitchProbe />
        </SessionProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('false'))

    // Log in as A, then start the IMPERATIVE apiFetch under A's bearer. Capture its
    // settlement outcome without racing an unhandled rejection: fold both branches
    // into a value we can await AFTER the switch.
    await act(async () => {
      screen.getByText('login-a').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))
    expect(getAccessToken()).toBe('A-token')

    const imperative = apiFetch<{ name: string }>('/merchant/imperative', { auth: true })
    const settled = imperative.then(
      (data) => ({ kind: 'resolved' as const, data }),
      (err: unknown) => ({ kind: 'rejected' as const, err }),
    )
    await Promise.resolve() // let the imperative fetch dispatch (and hang)

    // Account switch: signOut then login-B on the SAME tab. The imperative request
    // remains hung throughout - so its captured epoch is now stale by two bumps.
    await act(async () => {
      screen.getByText('signout').click()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      screen.getByText('login-b').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))
    expect(getAccessToken()).toBe('B-token')

    // Now resolve A's long-hung imperative request with a 200 + old-account body.
    await act(async () => {
      resolveHungA?.(jsonRes(200, { name: 'Merchant A (late, must be rejected)' }))
      await Promise.resolve()
      await Promise.resolve()
    })

    const outcome = await settled
    expect(outcome.kind).toBe('rejected')
    if (outcome.kind === 'rejected') {
      expect(outcome.err).toBeInstanceOf(ApiError)
      expect((outcome.err as ApiError).code).toBe('SESSION_SWITCHED')
    }
    // The old-account data was NEVER delivered to the imperative caller, and B's
    // token is intact.
    expect(getAccessToken()).toBe('B-token')
  })
})
