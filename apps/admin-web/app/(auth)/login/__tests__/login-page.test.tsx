/**
 * Login page — the two-step flow.
 *
 * authApi is mocked (we are testing the page's orchestration, not the network);
 * next/navigation's router is mocked to assert routing on success. setSession is
 * the real localStorage-backed implementation, so a successful verify must leave
 * a readable session behind.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from '../page'
import { SessionProvider } from '@/lib/auth/useSession'
import { ApiError } from '@/lib/api/client'
import { authApi } from '@/lib/api/auth'
import { getSessionMeta, getAccessToken } from '@/lib/auth/session'

// --- Mocks ---------------------------------------------------------------------

const replaceMock = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: jest.fn() }),
  // No `next` param in these tests -> the page falls back to '/'.
  useSearchParams: () => new URLSearchParams(),
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

beforeEach(() => {
  localStorage.clear()
  replaceMock.mockReset()
})

describe('LoginPage — step 1 (credentials)', () => {
  it('advances to the OTP step on OTP_REQUIRED', async () => {
    mockedAuth.login.mockResolvedValueOnce({
      status: 'OTP_REQUIRED',
      sessionChallenge: 'chal-123',
    })
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'ops@redeemo.co.uk')
    await user.type(screen.getByLabelText('Password'), 'Sup3r!pass')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(mockedAuth.login).toHaveBeenCalledWith('ops@redeemo.co.uk', 'Sup3r!pass')
    // OTP step is now showing.
    expect(
      await screen.findByText(/enter the 6-digit code we emailed/i)
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Verification code')).toBeInTheDocument()
  })

  it('renders a clear error on invalid credentials and stays on step 1', async () => {
    mockedAuth.login.mockRejectedValueOnce(
      new ApiError(401, { error: { code: 'INVALID_CREDENTIALS', message: 'nope' } })
    )
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'ops@redeemo.co.uk')
    await user.type(screen.getByLabelText('Password'), 'wrong!Pass1')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /email or password is incorrect/i
    )
    // Still on credentials step.
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })
})

describe('LoginPage — step 2 (OTP)', () => {
  async function reachOtpStep(user: ReturnType<typeof userEvent.setup>) {
    mockedAuth.login.mockResolvedValueOnce({
      status: 'OTP_REQUIRED',
      sessionChallenge: 'chal-123',
    })
    renderLogin()
    await user.type(screen.getByLabelText('Email'), 'ops@redeemo.co.uk')
    await user.type(screen.getByLabelText('Password'), 'Sup3r!pass')
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await screen.findByLabelText('Verification code')
  }

  it('stores the session and routes to / on a successful verify', async () => {
    const user = userEvent.setup()
    await reachOtpStep(user)

    mockedAuth.verifyOtp.mockResolvedValueOnce({
      accessToken: makeAccessToken(),
      refreshToken: 'refresh-1',
      admin: { id: 'admin-1', email: 'ops@redeemo.co.uk', adminRole: 'OPERATIONS' },
    })

    await user.type(screen.getByLabelText('Verification code'), '123456')
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }))

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))

    expect(mockedAuth.verifyOtp).toHaveBeenCalledWith('chal-123', '123456')
    // Session persisted with the decoded entityId/sessionId + role/email.
    expect(getAccessToken()).not.toBeNull()
    expect(getSessionMeta()).toEqual({
      entityId: 'admin-1',
      sessionId: 'sess-1',
      adminRole: 'OPERATIONS',
      email: 'ops@redeemo.co.uk',
    })
  })

  it('shows an expired-code error and does not route', async () => {
    const user = userEvent.setup()
    await reachOtpStep(user)

    mockedAuth.verifyOtp.mockRejectedValueOnce(
      new ApiError(400, { error: { code: 'ACTION_TOKEN_INVALID', message: 'gone' } })
    )

    await user.type(screen.getByLabelText('Verification code'), '000111')
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/has expired/i)
    expect(replaceMock).not.toHaveBeenCalled()
    expect(getAccessToken()).toBeNull()
  })

  it('shows an invalid-code error for OTP_INVALID', async () => {
    const user = userEvent.setup()
    await reachOtpStep(user)

    mockedAuth.verifyOtp.mockRejectedValueOnce(
      new ApiError(400, { error: { code: 'OTP_INVALID', message: 'bad' } })
    )

    await user.type(screen.getByLabelText('Verification code'), '999999')
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/code is incorrect/i)
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('lets the operator go back to the credentials step to resend', async () => {
    const user = userEvent.setup()
    await reachOtpStep(user)

    await user.click(
      screen.getByRole('button', { name: /use a different account or resend/i })
    )

    // Back on the credentials step.
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })
})
