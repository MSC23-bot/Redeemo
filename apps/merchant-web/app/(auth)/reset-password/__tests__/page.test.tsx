import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ResetPasswordPage from '@/app/(auth)/reset-password/page'
import { ApiError } from '@/lib/api/client'

const mockReset = jest.fn()
jest.mock('@/lib/api/auth', () => ({ authApi: { resetPassword: (...a: unknown[]) => mockReset(...a) } }))
let mockToken: string | null = 'tok-1'
jest.mock('next/navigation', () => ({ useSearchParams: () => ({ get: (k: string) => (k === 'token' ? mockToken : null) }) }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))

function fill(pw: string, confirm: string) {
  fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: pw } })
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: confirm } })
  fireEvent.click(screen.getByRole('button', { name: /update password/i }))
}

describe('ResetPasswordPage (M1 Slice 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockToken = 'tok-1'
  })

  it('shows the invalid-link state when there is no token', () => {
    mockToken = null
    render(<ResetPasswordPage />)
    expect(screen.getByText(/link not valid/i)).toBeInTheDocument()
  })

  it('blocks a weak password client-side (no API call)', async () => {
    render(<ResetPasswordPage />)
    fill('weakpw', 'weakpw')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/requirements/i))
    expect(mockReset).not.toHaveBeenCalled()
  })

  it('blocks mismatched passwords (no API call)', async () => {
    render(<ResetPasswordPage />)
    fill('ValidPass1!', 'Different1!')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/do not match/i))
    expect(mockReset).not.toHaveBeenCalled()
  })

  it('submits a valid new password and shows the success state', async () => {
    mockReset.mockResolvedValue({ message: 'ok' })
    render(<ResetPasswordPage />)
    fill('ValidPass1!', 'ValidPass1!')
    await waitFor(() => expect(mockReset).toHaveBeenCalledWith({ token: 'tok-1', newPassword: 'ValidPass1!' }))
    await waitFor(() => expect(screen.getByText(/password updated/i)).toBeInTheDocument())
  })

  it('surfaces an expired-token error from the backend', async () => {
    mockReset.mockRejectedValue(new ApiError(400, { error: { code: 'RESET_TOKEN_EXPIRED' } }))
    render(<ResetPasswordPage />)
    fill('ValidPass1!', 'ValidPass1!')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/invalid or has expired/i))
  })
})
