/**
 * Login page — ?next= return path (open-redirect-safe).
 *
 * After a successful OTP verify, the login page returns the operator to the
 * `?next=` path they came from. This is validated as a SAME-ORIGIN path before
 * use: protocol-relative (`//evil.com`), backslash-tricked (`/\evil.com`), and
 * non-path values all fall back to `/`.
 *
 * `useSearchParams` is mocked via a mutable holder so each test sets its own
 * `next` value; authApi is mocked; setSession is the real localStorage impl.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from '../page'
import { SessionProvider } from '@/lib/auth/useSession'
import { authApi } from '@/lib/api/auth'

// --- Mocks ---------------------------------------------------------------------

const replaceMock = jest.fn()

// Mutable holder so each test can set the `next` query param the page reads.
let nextParam: string | null = null

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(nextParam ? `next=${nextParam}` : ''),
}))

jest.mock('@/lib/api/auth', () => ({
  authApi: {
    login: jest.fn(),
    verifyOtp: jest.fn(),
  },
}))

const mockedAuth = authApi as jest.Mocked<typeof authApi>

// A structurally valid admin JWT so decodeAdminJwt returns the claims.
function makeAccessToken(): string {
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  return `${b64({ alg: 'HS256' })}.${b64({
    sub: 'admin-1',
    sessionId: 'sess-1',
    adminRole: 'OPERATIONS',
    role: 'admin',
  })}.sig`
}

function renderLogin() {
  return render(
    <SessionProvider>
      <LoginPage />
    </SessionProvider>
  )
}

/** Drive the two-step form through to a successful OTP verify. */
async function signInThroughOtp(user: ReturnType<typeof userEvent.setup>) {
  mockedAuth.login.mockResolvedValueOnce({
    status: 'OTP_REQUIRED',
    sessionChallenge: 'chal-123',
  })
  renderLogin()
  await user.type(screen.getByLabelText('Email'), 'ops@redeemo.co.uk')
  await user.type(screen.getByLabelText('Password'), 'Sup3r!pass')
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await screen.findByLabelText('Verification code')

  mockedAuth.verifyOtp.mockResolvedValueOnce({
    accessToken: makeAccessToken(),
    refreshToken: 'refresh-1',
    admin: { id: 'admin-1', email: 'ops@redeemo.co.uk', adminRole: 'OPERATIONS' },
  })
  await user.type(screen.getByLabelText('Verification code'), '123456')
  await user.click(screen.getByRole('button', { name: /verify and sign in/i }))
}

beforeEach(() => {
  localStorage.clear()
  replaceMock.mockReset()
  nextParam = null
})

describe('LoginPage — ?next= return path', () => {
  it('routes to a valid in-app next path after sign-in', async () => {
    nextParam = encodeURIComponent('/queue/abc-123')
    const user = userEvent.setup()
    await signInThroughOtp(user)
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/queue/abc-123'))
  })

  it('falls back to / when next is protocol-relative (//evil.com)', async () => {
    nextParam = encodeURIComponent('//evil.com')
    const user = userEvent.setup()
    await signInThroughOtp(user)
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))
    expect(replaceMock).not.toHaveBeenCalledWith('//evil.com')
  })

  it('falls back to / when next is backslash-tricked (/\\evil.com)', async () => {
    nextParam = encodeURIComponent('/\\evil.com')
    const user = userEvent.setup()
    await signInThroughOtp(user)
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))
  })

  it('falls back to / when next is an absolute external URL', async () => {
    nextParam = encodeURIComponent('https://evil.com/phish')
    const user = userEvent.setup()
    await signInThroughOtp(user)
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))
  })

  it('falls back to / when next points back at /login (no loop)', async () => {
    nextParam = encodeURIComponent('/login?next=/queue')
    const user = userEvent.setup()
    await signInThroughOtp(user)
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))
  })

  it('falls back to / when next is absent', async () => {
    nextParam = null
    const user = userEvent.setup()
    await signInThroughOtp(user)
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))
  })
})
