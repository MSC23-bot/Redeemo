import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ClaimPage from '@/app/(auth)/claim/page'
import { ApiError } from '@/lib/api/client'

const mockClaim = jest.fn()
jest.mock('@/lib/api/auth', () => ({ authApi: { claim: (...a: unknown[]) => mockClaim(...a) } }))
let mockToken: string | null = 'claim-tok'
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
  fireEvent.click(screen.getByRole('button', { name: /set password/i }))
}

describe('ClaimPage (M1 Slice 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockToken = 'claim-tok'
  })

  it('shows the invalid-link state when there is no token', () => {
    mockToken = null
    render(<ClaimPage />)
    expect(screen.getByText(/link not valid/i)).toBeInTheDocument()
  })

  it('claims with a valid password and shows the account-ready state (routes to sign-in, no auto-login)', async () => {
    mockClaim.mockResolvedValue({ message: 'ok' })
    render(<ClaimPage />)
    fill('ValidPass1!', 'ValidPass1!')
    await waitFor(() => expect(mockClaim).toHaveBeenCalledWith({ token: 'claim-tok', newPassword: 'ValidPass1!' }))
    await waitFor(() => expect(screen.getByText(/account ready/i)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /go to sign in/i })).toBeInTheDocument()
  })

  it('surfaces an expired claim-token error', async () => {
    mockClaim.mockRejectedValue(new ApiError(400, { error: { code: 'CLAIM_TOKEN_EXPIRED' } }))
    render(<ClaimPage />)
    fill('ValidPass1!', 'ValidPass1!')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/invalid or has expired/i))
  })
})
