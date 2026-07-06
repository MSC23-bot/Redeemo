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
 */
import * as React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { SessionProvider, useSession } from '@/lib/auth/session'
import { getAccessToken, setAccessToken } from '@/lib/auth/tokenStore'
import { apiFetch } from '@/lib/api/client'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

function jsonRes(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response
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
})
