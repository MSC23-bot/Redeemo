import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { SessionProvider, useSession } from '@/lib/auth/session'
import { setAccessToken } from '@/lib/auth/tokenStore'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

const refreshSessionMock = jest.fn()
jest.mock('@/lib/api/client', () => ({ refreshSession: () => refreshSessionMock() }))

const logoutMock = jest.fn<Promise<void>, [string | null]>(async () => {})
jest.mock('@/lib/api/auth', () => ({ authApi: { logout: (t: string | null) => logoutMock(t) } }))

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
