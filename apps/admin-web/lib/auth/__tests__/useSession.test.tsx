/**
 * useSession.ts — the SessionProvider (H5 migration).
 *
 * Covers the two approved guardrails (migration plan §5b):
 *   G1 — refresh-on-mount: exactly one BFF refresh attempt on mount; `ready`
 *        only flips once it settles; the admin is never treated as signed out
 *        before it has been tried.
 *   G2 — signOut forwards the captured bearer token to the BFF logout route,
 *        awaits its bounded response, and ALWAYS clears local state + routes
 *        to /login regardless of the backend outcome.
 * Plus: setSession installs the token + derives role/adminId from the JWT
 * claims, and the onSessionLost hard-logout latch wiring.
 */
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { SessionProvider, useSession } from '@/lib/auth/useSession'
import { getAccessToken, setAccessToken, triggerSessionLost } from '@/lib/auth/tokenStore'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

const refreshSessionMock = jest.fn()
jest.mock('@/lib/api/client', () => ({
  refreshSession: () => refreshSessionMock(),
}))

const logoutMock = jest.fn<Promise<{ ok: boolean; status: number; remoteRevoke: string }>, [string | null, AbortSignal?]>(
  async () => ({ ok: true, status: 200, remoteRevoke: 'confirmed' }),
)
jest.mock('@/lib/api/auth', () => ({
  authApi: { logout: (t: string | null, s?: AbortSignal) => logoutMock(t, s) },
}))

function jwt(payload: object): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256' })}.${b(payload)}.sig`
}

const TOKEN_OPS = jwt({ sub: 'admin-1', sessionId: 'sess-1', adminRole: 'OPERATIONS' })

function Probe() {
  const s = useSession()
  return (
    <div>
      <span data-testid="ready">{String(s.ready)}</span>
      <span data-testid="auth">{String(s.isAuthenticated)}</span>
      <span data-testid="role">{String(s.role)}</span>
      <span data-testid="adminId">{String(s.adminId)}</span>
      <span data-testid="can-approval-read">{String(s.can('approval:read'))}</span>
      <button onClick={() => s.signOut()}>out</button>
      <button
        onClick={() =>
          s.setSession(TOKEN_OPS, { entityId: 'admin-1', sessionId: 'sess-1', adminRole: 'OPERATIONS', email: 'ops@redeemo.co.uk' })
        }
      >
        login
      </button>
    </div>
  )
}

function renderProvider() {
  return render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  )
}

describe('SessionProvider (H5 migration)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    replace.mockClear()
  })

  // ── G1: refresh-on-mount ───────────────────────────────────────────────

  it('G1: attempts exactly ONE BFF refresh on mount, and hydrates the token when it succeeds', async () => {
    refreshSessionMock.mockImplementation(async () => {
      // Mirrors doRefresh's real contract: a successful refresh installs the
      // token into tokenStore BEFORE resolving true.
      setAccessToken(TOKEN_OPS)
      return true
    })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
    expect(screen.getByTestId('auth').textContent).toBe('true')
    expect(screen.getByTestId('role').textContent).toBe('OPERATIONS')
    expect(screen.getByTestId('adminId').textContent).toBe('admin-1')
    expect(refreshSessionMock).toHaveBeenCalledTimes(1)
  })

  it('G1: stays unauthenticated but ready when there is no cookie session (refresh fails)', async () => {
    refreshSessionMock.mockResolvedValue(false)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
    expect(screen.getByTestId('auth').textContent).toBe('false')
    expect(screen.getByTestId('role').textContent).toBe('null')
    expect(refreshSessionMock).toHaveBeenCalledTimes(1)
  })

  it('G1: the shell never observes "signed out" before the bootstrap refresh settles (ready stays false while pending)', async () => {
    let resolveRefresh: (v: boolean) => void = () => {}
    refreshSessionMock.mockImplementation(() => new Promise((resolve) => { resolveRefresh = resolve }))
    renderProvider()

    // Still in flight: ready must be false (NOT a premature "signed out").
    expect(screen.getByTestId('ready').textContent).toBe('false')

    await act(async () => {
      resolveRefresh(false)
      await Promise.resolve()
    })
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
    expect(screen.getByTestId('auth').textContent).toBe('false')
  })

  // ── setSession / can() ─────────────────────────────────────────────────

  it('setSession installs the token and derives role/adminId from its own JWT claims', async () => {
    refreshSessionMock.mockResolvedValue(false)
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))

    act(() => {
      fireEvent.click(screen.getByText('login'))
    })

    expect(screen.getByTestId('auth').textContent).toBe('true')
    expect(screen.getByTestId('role').textContent).toBe('OPERATIONS')
    expect(screen.getByTestId('adminId').textContent).toBe('admin-1')
    expect(screen.getByTestId('can-approval-read').textContent).toBe('true') // OPERATIONS holds approval:read
    expect(getAccessToken()).toBe(TOKEN_OPS)
  })

  // ── G2: signOut ─────────────────────────────────────────────────────────

  it('G2: signOut captures the access token BEFORE clearing and forwards it (with an AbortSignal) to authApi.logout', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken(TOKEN_OPS)
      return true
    })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))

    await act(async () => {
      fireEvent.click(screen.getByText('out'))
    })

    expect(logoutMock).toHaveBeenCalledWith(TOKEN_OPS, expect.any(AbortSignal))
  })

  it('G2: signOut clears local state and routes to /login after a confirmed logout', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken(TOKEN_OPS)
      return true
    })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))

    await act(async () => {
      fireEvent.click(screen.getByText('out'))
    })

    expect(logoutMock).toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('/login')
    expect(screen.getByTestId('auth').textContent).toBe('false')
    expect(screen.getByTestId('role').textContent).toBe('null')
    expect(getAccessToken()).toBeNull()
  })

  it('G2: signOut ALWAYS clears + navigates even when the BFF logout is unconfirmed (degraded path)', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken(TOKEN_OPS)
      return true
    })
    logoutMock.mockResolvedValueOnce({ ok: false, status: 0, remoteRevoke: 'unavailable' })
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))

    await act(async () => {
      fireEvent.click(screen.getByText('out'))
    })

    expect(replace).toHaveBeenCalledWith('/login')
    expect(screen.getByTestId('auth').textContent).toBe('false')
    warnSpy.mockRestore()
  })

  it('G2: signOut ALWAYS clears + navigates even when authApi.logout throws', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken(TOKEN_OPS)
      return true
    })
    logoutMock.mockRejectedValueOnce(new Error('network'))
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))

    await act(async () => {
      fireEvent.click(screen.getByText('out'))
    })

    expect(replace).toHaveBeenCalledWith('/login')
    expect(screen.getByTestId('auth').textContent).toBe('false')
    warnSpy.mockRestore()
  })

  // ── onSessionLost hard-logout latch wiring ─────────────────────────────

  it('onSessionLost teardown: clears state and navigates to /login (no backend call — this is the apiFetch hard-logout hook, not signOut)', async () => {
    refreshSessionMock.mockImplementation(async () => {
      setAccessToken(TOKEN_OPS)
      return true
    })
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'))

    await act(async () => {
      triggerSessionLost()
    })

    expect(replace).toHaveBeenCalledWith('/login')
    expect(screen.getByTestId('auth').textContent).toBe('false')
    expect(logoutMock).not.toHaveBeenCalled()
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
