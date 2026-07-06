import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { SessionProvider, useSession } from '@/lib/auth/session'
import { setAccessToken } from '@/lib/auth/tokenStore'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

const refreshSessionMock = jest.fn()
jest.mock('@/lib/api/client', () => ({ refreshSession: () => refreshSessionMock() }))

// authApi.logout now returns a LogoutResult ({ ok, status, remoteRevoke })
// instead of throwing (logout-durability design §4.5 — signOut reads
// result.ok to decide confirmed vs UNCONFIRMED). Default mock resolves the
// "confirmed" happy path; individual tests override for the unconfirmed path.
const logoutMock = jest.fn<Promise<{ ok: boolean; status: number; remoteRevoke: string }>, [string | null, AbortSignal?]>(
  async () => ({ ok: true, status: 200, remoteRevoke: 'confirmed' }),
)
jest.mock('@/lib/api/auth', () => ({
  authApi: { logout: (t: string | null, s?: AbortSignal) => logoutMock(t, s) },
}))

function Probe() {
  const s = useSession()
  return (
    <div>
      <span data-testid="ready">{String(s.ready)}</span>
      <span data-testid="auth">{String(s.isAuthenticated)}</span>
      <button onClick={() => s.signOut()}>out</button>
    </div>
  )
}

describe('SessionProvider (M1 Slice 1)', () => {
  beforeEach(() => {
    setAccessToken(null)
    jest.clearAllMocks()
  })

  it('refresh-on-mount hydrates the access token from the cookie and flips ready', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken('hydrated')
      return true
    })
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
    expect(screen.getByTestId('auth').textContent).toBe('true')
    expect(refreshSessionMock).toHaveBeenCalledTimes(1)
  })

  it('stays unauthenticated but ready when there is no cookie session', async () => {
    refreshSessionMock.mockResolvedValue(false)
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
    expect(screen.getByTestId('auth').textContent).toBe('false')
  })

  it('signOut calls the backend logout, clears state, and redirects to /sign-in', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken('hydrated')
      return true
    })
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))
    await act(async () => {
      fireEvent.click(screen.getByText('out'))
    })
    expect(logoutMock).toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('/sign-in')
    expect(screen.getByTestId('auth').textContent).toBe('false')
  })

  it('signOut captures the access token BEFORE clearing state and forwards it to authApi.logout', async () => {
    // Logout-durability design §4.5 point 0 — the token must be read BEFORE
    // applyToken(null) runs, else authApi.logout would be called with null
    // and the backend would fall through to the (much weaker) no-proof path.
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken('the-captured-token')
      return true
    })
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))
    await act(async () => {
      fireEvent.click(screen.getByText('out'))
    })
    expect(logoutMock).toHaveBeenCalledWith('the-captured-token', expect.any(AbortSignal))
  })

  it('signOut clears client state BEFORE the BFF logout resolves, and awaits it before navigating', async () => {
    // Design §4.5 points 1-3: client state (token/merchant) clears
    // immediately and independently of the network call; navigation must NOT
    // fire until the bounded BFF response is observed.
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken('hydrated')
      return true
    })
    let resolveLogout: (v: { ok: boolean; status: number; remoteRevoke: string }) => void = () => {}
    logoutMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveLogout = resolve }),
    )
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))

    act(() => {
      fireEvent.click(screen.getByText('out'))
    })

    // Client state is cleared even though the BFF logout promise is still pending.
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('false'))
    expect(replace).not.toHaveBeenCalled()

    await act(async () => {
      resolveLogout({ ok: true, status: 200, remoteRevoke: 'confirmed' })
    })
    expect(replace).toHaveBeenCalledWith('/sign-in')
  })

  it('signOut still navigates to /sign-in when the BFF logout is unconfirmed (honest degraded path, design §4.5 point 5)', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken('hydrated')
      return true
    })
    logoutMock.mockResolvedValueOnce({ ok: false, status: 0, remoteRevoke: 'unavailable' })
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))
    await act(async () => {
      fireEvent.click(screen.getByText('out'))
    })
    expect(logoutMock).toHaveBeenCalled()
    // Navigation is NOT trapped by an unconfirmed/failed logout response.
    expect(replace).toHaveBeenCalledWith('/sign-in')
    expect(screen.getByTestId('auth').textContent).toBe('false')
    expect(warnSpy).toHaveBeenCalledWith(
      '[signOut] cookie clearance unconfirmed',
      expect.objectContaining({ status: 0, remoteRevoke: 'unavailable' }),
    )
    warnSpy.mockRestore()
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
