import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ForgotPasswordPage from '@/app/(auth)/forgot-password/page'
import { ApiError } from '@/lib/api/client'

const mockForgot = jest.fn()
jest.mock('@/lib/api/auth', () => ({ authApi: { forgotPassword: (...a: unknown[]) => mockForgot(...a) } }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))

function submitEmail() {
  fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'owner@merchant.test' } })
  fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
}

describe('ForgotPasswordPage (M1 Slice 3, anti-enumeration)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows the generic confirmation on success', async () => {
    mockForgot.mockResolvedValue({ message: 'ok' })
    render(<ForgotPasswordPage />)
    submitEmail()
    await waitFor(() => expect(screen.getByText(/if that email is registered/i)).toBeInTheDocument())
  })

  it('still shows the SAME generic confirmation on a non-429 failure (never reveals existence)', async () => {
    mockForgot.mockRejectedValue(new ApiError(500, { error: { code: 'BOOM' } }))
    render(<ForgotPasswordPage />)
    submitEmail()
    await waitFor(() => expect(screen.getByText(/if that email is registered/i)).toBeInTheDocument())
  })

  it('normalizes the email (trim + lowercase) before submit', async () => {
    mockForgot.mockResolvedValue({ message: 'ok' })
    render(<ForgotPasswordPage />)
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: '  Owner@Merchant.TEST ' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() => expect(mockForgot).toHaveBeenCalledWith({ email: 'owner@merchant.test' }))
  })

  it('surfaces a rate-limit (429) instead of the confirmation', async () => {
    mockForgot.mockRejectedValue(new ApiError(429, { statusCode: 429, error: 'Too Many Requests' }))
    render(<ForgotPasswordPage />)
    submitEmail()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/too many/i))
    expect(screen.queryByText(/if that email is registered/i)).not.toBeInTheDocument()
  })
})
