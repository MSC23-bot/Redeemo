import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RegisterPage from '@/app/(auth)/register/page'
import { ApiError } from '@/lib/api/client'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
const mockRegister = jest.fn()
jest.mock('@/lib/api/auth', () => ({ authApi: { register: (...a: unknown[]) => mockRegister(...a) } }))
jest.mock('@/lib/auth/deviceId', () => ({ getOrCreateDeviceId: () => 'dev-uuid' }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))
// Turnstile stub: a button that supplies a token on click (no hooks/require).
jest.mock('@/components/auth/TurnstileWidget', () => ({
  TurnstileWidget: ({ onToken }: { onToken: (t: string) => void }) => (
    <button type="button" data-testid="turnstile-stub" onClick={() => onToken('captcha-token')}>
      solve captcha
    </button>
  ),
}))

function fillValid() {
  fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Jane' } })
  fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Roe' } })
  fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: 'Roe Cafe' } })
  fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'new@merchant.test' } })
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'ValidPass1!' } })
}

describe('RegisterPage (M1 Slice 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.sessionStorage.clear()
  })

  it('blocks submit until the platform terms are accepted (no API call)', async () => {
    render(<RegisterPage />)
    fillValid()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/platform terms/i))
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('blocks a weak password client-side (terms accepted)', async () => {
    render(<RegisterPage />)
    fillValid()
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'weak' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/requirements/i))
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('shows a single inline validation message for a non-empty, invalid password', () => {
    render(<RegisterPage />)
    // Pristine/empty: no nagging.
    expect(screen.queryByText(/at least 8 characters/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'weak' } })
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
  })

  it('hides the inline validation message once the password meets the policy', () => {
    render(<RegisterPage />)
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'weak' } })
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'ValidPass1!' } })
    expect(screen.queryByText(/at least 8 characters/i)).not.toBeInTheDocument()
  })

  it('registers (with terms + captcha token) and routes to /register/verify, stashing the challenge', async () => {
    mockRegister.mockResolvedValue({ status: 'VERIFY_EMAIL_SENT', sessionChallenge: 'vch-1' })
    render(<RegisterPage />)
    fillValid()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByTestId('turnstile-stub'))
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Jane',
          lastName: 'Roe',
          businessName: 'Roe Cafe',
          email: 'new@merchant.test',
          termsAccepted: true,
          turnstileToken: 'captcha-token',
          deviceType: 'web',
        }),
      ),
    )
    expect(window.sessionStorage.getItem('redeemo_merchant_verify_challenge')).toBe('vch-1')
    expect(mockPush).toHaveBeenCalledWith('/register/verify')
  })

  it('normalizes before submit: email trimmed + lowercased; names and business name trimmed (case preserved)', async () => {
    mockRegister.mockResolvedValue({ status: 'VERIFY_EMAIL_SENT', sessionChallenge: 'vch-1' })
    render(<RegisterPage />)
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: '  Jane ' } })
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: ' Roe  ' } })
    fireEvent.change(screen.getByLabelText(/business name/i), { target: { value: '  Roe Cafe ' } })
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: '  New@Merchant.TEST ' } })
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'ValidPass1!' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByTestId('turnstile-stub'))
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Jane',
          lastName: 'Roe',
          businessName: 'Roe Cafe',
          email: 'new@merchant.test',
        }),
      ),
    )
  })

  it('surfaces a captcha-failed error', async () => {
    mockRegister.mockRejectedValue(new ApiError(400, { error: { code: 'CAPTCHA_FAILED' } }))
    render(<RegisterPage />)
    fillValid()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByTestId('turnstile-stub'))
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/verify that you are human/i))
  })
})
