import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider, useSession } from '@/lib/auth/session'
import { getAccessToken, setAccessToken, setOnSessionLost } from '@/lib/auth/tokenStore'
import { getSessionEpoch } from '@/lib/auth/sessionEpoch'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

// `setOnSessionLost` is exported as a non-configurable binding under this project's
// SWC/ESM-CJS interop, so `jest.spyOn` cannot wrap it directly. Instead, mock the
// tokenStore module but keep every OTHER export byte-identical to the real
// implementation (getAccessToken/setAccessToken/triggerSessionLost all call
// through), wrapping ONLY setOnSessionLost in a jest.fn so the test can inspect
// which callback SessionProvider registered.
jest.mock('@/lib/auth/tokenStore', () => {
  const actual = jest.requireActual('@/lib/auth/tokenStore')
  return { ...actual, setOnSessionLost: jest.fn(actual.setOnSessionLost) }
})

const refreshSessionMock = jest.fn()
const resetRefreshInFlightMock = jest.fn()
jest.mock('@/lib/api/client', () => ({
  refreshSession: () => refreshSessionMock(),
  resetRefreshInFlight: () => resetRefreshInFlightMock(),
}))

const logoutMock = jest.fn<Promise<void>, [string | null]>(async () => {})
jest.mock('@/lib/api/auth', () => ({ authApi: { logout: (t: string | null) => logoutMock(t) } }))

function Probe() {
  const s = useSession()
  // `.catch(() => {})` swallows the (deliberate) rejection when a test drives a
  // reset failure through setSession (correction 6), so an unhandled rejection does
  // not leak into the test runner.
  return (
    <div>
      <span data-testid="ready">{String(s.ready)}</span>
      <span data-testid="auth">{String(s.isAuthenticated)}</span>
      <button onClick={() => s.signOut()}>out</button>
      <button onClick={() => void s.setSession('new-tok', { id: 'm2', businessName: 'B2', approvalStatus: 'APPROVED' }).catch(() => {})}>
        login
      </button>
      <button onClick={() => void s.setSession('A-token', { id: 'm-a', businessName: 'A', approvalStatus: 'APPROVED' }).catch(() => {})}>
        login-a
      </button>
      <button onClick={() => void s.setSession('B-token', { id: 'm-b', businessName: 'B', approvalStatus: 'APPROVED' }).catch(() => {})}>
        login-b
      </button>
    </div>
  )
}

function renderProvider(queryClient: QueryClient = new QueryClient()) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </QueryClientProvider>,
    ),
  }
}

describe('SessionProvider (M1 Slice 1 + session cache-isolation core T4)', () => {
  beforeEach(() => {
    setAccessToken(null)
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  it('refresh-on-mount hydrates the access token from the cookie and flips ready', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken('hydrated')
      return true
    })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
    expect(screen.getByTestId('auth').textContent).toBe('true')
    expect(refreshSessionMock).toHaveBeenCalledTimes(1)
  })

  it('stays unauthenticated but ready when there is no cookie session', async () => {
    refreshSessionMock.mockResolvedValue(false)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
    expect(screen.getByTestId('auth').textContent).toBe('false')
  })

  it('signOut calls the backend logout, clears state, and redirects to /sign-in', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken('hydrated')
      return true
    })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))
    await act(async () => {
      fireEvent.click(screen.getByText('out'))
    })
    expect(logoutMock).toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('/sign-in')
    expect(screen.getByTestId('auth').textContent).toBe('false')
  })

  it('signOut bumps the session epoch and clears the query cache', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken('hydrated')
      return true
    })
    const { queryClient } = renderProvider()
    queryClient.setQueryData(['some-cached-thing'], { secret: 'a-data' })
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))
    const before = getSessionEpoch()
    await act(async () => {
      fireEvent.click(screen.getByText('out'))
    })
    expect(getSessionEpoch()).toBe(before + 1)
    expect(queryClient.getQueryData(['some-cached-thing'])).toBeUndefined()
  })

  it('signOut forwards the token captured BEFORE the reset to the backend logout', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken('captured-token')
      return true
    })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))
    await act(async () => {
      fireEvent.click(screen.getByText('out'))
    })
    expect(logoutMock).toHaveBeenCalledWith('captured-token')
  })

  it('setSession does NOT install the new token until the reset pipeline resolves (Codex #2)', async () => {
    refreshSessionMock.mockResolvedValue(false)
    let releaseCancel: (() => void) | undefined
    const queryClient = new QueryClient()
    jest.spyOn(queryClient, 'cancelQueries').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseCancel = resolve
        }),
    )
    renderProvider(queryClient)
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
    expect(getAccessToken()).toBeNull()

    act(() => {
      fireEvent.click(screen.getByText('login'))
    })
    // The reset is deliberately stuck mid-flight (cancelQueries pending) - the new
    // token must NOT be installed yet.
    await Promise.resolve()
    await Promise.resolve()
    expect(getAccessToken()).toBeNull()
    expect(screen.getByTestId('auth').textContent).toBe('false')

    await act(async () => {
      releaseCancel?.()
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(getAccessToken()).toBe('new-tok'))
    expect(screen.getByTestId('auth').textContent).toBe('true')
  })

  it('onSessionLost teardown: single-flight - a duplicate invocation reuses ONE teardown', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken('hydrated')
      return true
    })
    const setOnSessionLostMock = setOnSessionLost as jest.Mock
    const queryClient = new QueryClient()
    const cancelSpy = jest.spyOn(queryClient, 'cancelQueries')

    renderProvider(queryClient)
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))

    const calls = setOnSessionLostMock.mock.calls
    const capturedOnSessionLost = calls[calls.length - 1][0] as (() => void) | null
    expect(capturedOnSessionLost).not.toBeNull()

    await act(async () => {
      capturedOnSessionLost?.()
      capturedOnSessionLost?.() // duplicate re-entry - must reuse the SAME teardown
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(cancelSpy).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledWith('/sign-in')
  })

  it('onSessionLost navigates only AFTER the reset resolves, and a rejected teardown still navigates', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken('hydrated')
      return true
    })
    const setOnSessionLostMock = setOnSessionLost as jest.Mock
    const queryClient = new QueryClient()
    let rejectCancel: ((err: Error) => void) | undefined
    jest.spyOn(queryClient, 'cancelQueries').mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectCancel = reject
        }),
    )

    renderProvider(queryClient)
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))
    const calls = setOnSessionLostMock.mock.calls
    const capturedOnSessionLost = calls[calls.length - 1][0] as (() => void) | null

    act(() => {
      capturedOnSessionLost?.()
    })
    // Teardown is stuck (cancelQueries pending) - no navigation yet.
    await Promise.resolve()
    expect(replace).not.toHaveBeenCalled()

    await act(async () => {
      rejectCancel?.(new Error('boom'))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // A rejected teardown must STILL navigate - a dead session always reaches /sign-in.
    expect(replace).toHaveBeenCalledWith('/sign-in')
  })

  it('correction 6 (login fails closed): if the pre-install reset throws, setSession does NOT install the new token', async () => {
    refreshSessionMock.mockResolvedValue(false)
    const queryClient = new QueryClient()
    // clear() throwing is the only path that still rejects after correction 5 (which
    // swallows cancelQueries rejections). It models "a safe reset cannot complete".
    jest.spyOn(queryClient, 'clear').mockImplementation(() => {
      throw new Error('clear boom')
    })
    renderProvider(queryClient)
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
    expect(getAccessToken()).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByText('login'))
      await Promise.resolve()
      await Promise.resolve()
    })

    // WITH the fail-closed ordering (await reset BEFORE install, no catch): the token
    // is never installed. MUTATION (wrap the reset in try/catch + install anyway):
    // the token would be installed and these expectations flip.
    expect(getAccessToken()).toBeNull()
    expect(screen.getByTestId('auth').textContent).toBe('false')
  })

  it('correction 7 (logout continues safely): signOut still clears the cache and navigates even when the backend logout throws', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken('hydrated')
      return true
    })
    logoutMock.mockRejectedValueOnce(new Error('network'))
    const { queryClient } = renderProvider()
    queryClient.setQueryData(['cached'], { s: 1 })
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))

    await act(async () => {
      fireEvent.click(screen.getByText('out'))
    })

    // The reset (clear) runs BEFORE the throwing logout, and logout is wrapped in
    // try/catch. MUTATION (remove the try/catch around authApi.logout): the rejection
    // propagates and the navigation below is skipped, flipping this test.
    expect(queryClient.getQueryData(['cached'])).toBeUndefined()
    expect(replace).toHaveBeenCalledWith('/sign-in')
    expect(screen.getByTestId('auth').textContent).toBe('false')
  })

  it('correction 7 (reset failure): signOut still nulls local state and navigates even if the reset pipeline throws', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken('hydrated')
      return true
    })
    const queryClient = new QueryClient()
    jest.spyOn(queryClient, 'clear').mockImplementation(() => {
      throw new Error('clear boom')
    })
    renderProvider(queryClient)
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))

    await act(async () => {
      fireEvent.click(screen.getByText('out'))
      await Promise.resolve()
      await Promise.resolve()
    })

    // WITH the try/catch around resetSessionState in signOut: sign-out completes and
    // navigates. MUTATION (bare `await resetSessionState`): the throw propagates,
    // router.replace is skipped, and this expectation flips.
    expect(getAccessToken()).toBeNull()
    expect(replace).toHaveBeenCalledWith('/sign-in')
  })

  it('correction 8 (overlapping logins): an OLDER setSession whose reset resolves LAST must NOT clobber the NEWER session', async () => {
    refreshSessionMock.mockResolvedValue(false)
    const queryClient = new QueryClient()
    const cancelResolvers: Array<() => void> = []
    jest.spyOn(queryClient, 'cancelQueries').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          cancelResolvers.push(resolve)
        }),
    )
    renderProvider(queryClient)
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))

    // Login-A then login-B overlap: each reset bumps the epoch synchronously and then
    // hangs at cancelQueries (resolver[0] = A, resolver[1] = B).
    act(() => {
      fireEvent.click(screen.getByText('login-a'))
    })
    act(() => {
      fireEvent.click(screen.getByText('login-b'))
    })
    await Promise.resolve()
    expect(cancelResolvers.length).toBe(2)

    // Resolve B (the NEWER transition) FIRST, then A (the OLDER) LAST.
    await act(async () => {
      cancelResolvers[1]()
      await Promise.resolve()
      await Promise.resolve()
      cancelResolvers[0]()
      await Promise.resolve()
      await Promise.resolve()
    })

    // WITH the ownership guard: A sees the epoch has moved past its generation and
    // skips its install, so B wins. MUTATION (remove the `getSessionEpoch() !==
    // generation` guard in setSession): A's late completion installs 'A-token',
    // clobbering B, and this expectation flips.
    expect(getAccessToken()).toBe('B-token')
    expect(screen.getByTestId('auth').textContent).toBe('true')
  })

  it('correction 8 (hard-logout superseded by re-login): a dead-session teardown whose reset resolves after a newer login must NOT clear that newer session or navigate away', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken('hydrated')
      return true
    })
    const queryClient = new QueryClient()
    const cancelResolvers: Array<() => void> = []
    jest.spyOn(queryClient, 'cancelQueries').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          cancelResolvers.push(resolve)
        }),
    )
    const setOnSessionLostMock = setOnSessionLost as jest.Mock
    renderProvider(queryClient)
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))
    const calls = setOnSessionLostMock.mock.calls
    const capturedOnSessionLost = calls[calls.length - 1][0] as () => void

    // Hard-logout fires (reset bumps -> resolver[0], hangs). Then a newer login
    // completes fully BEFORE the hard-logout's reset resolves.
    act(() => {
      capturedOnSessionLost()
    })
    act(() => {
      fireEvent.click(screen.getByText('login-b'))
    })
    await Promise.resolve()
    expect(cancelResolvers.length).toBe(2)

    await act(async () => {
      cancelResolvers[1]() // B's reset completes first -> B installed
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(getAccessToken()).toBe('B-token')
    replace.mockClear()

    await act(async () => {
      cancelResolvers[0]() // the stale hard-logout's reset completes LAST
      await Promise.resolve()
      await Promise.resolve()
    })

    // WITH the ownership guard in finish: the stale teardown sees the epoch moved past
    // its generation and does nothing. MUTATION (drop the guard in finish): it nulls
    // the token and navigates to /sign-in, clobbering B - flipping these expectations.
    expect(getAccessToken()).toBe('B-token')
    expect(replace).not.toHaveBeenCalled()
  })

  it('useSession throws when used outside a SessionProvider', () => {
    function Bad() {
      useSession()
      return null
    }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bad />)).toThrow(/within a SessionProvider/)
    spy.mockRestore()
  })
})
