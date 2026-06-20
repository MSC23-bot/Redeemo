import { render } from '@testing-library/react'
import { AuthedRedirect } from '@/components/auth/AuthedRedirect'

const mockReplace = jest.fn()
let mockNext: string | null = null
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({ get: (k: string) => (k === 'next' ? mockNext : null) }),
}))
let mockSession: { ready: boolean; isAuthenticated: boolean }
jest.mock('@/lib/auth/session', () => ({ useSession: () => mockSession }))

describe('AuthedRedirect (M1 Slice 5 already-authed guard)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockNext = null
  })

  it('does not redirect before the session is ready (no flash)', () => {
    mockSession = { ready: false, isAuthenticated: false }
    render(<AuthedRedirect />)
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('does not redirect an unauthenticated visitor', () => {
    mockSession = { ready: true, isAuthenticated: false }
    render(<AuthedRedirect />)
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('redirects an authenticated merchant to the home by default', () => {
    mockSession = { ready: true, isAuthenticated: true }
    render(<AuthedRedirect />)
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('honours a safe ?next when authenticated', () => {
    mockSession = { ready: true, isAuthenticated: true }
    mockNext = '/vouchers'
    render(<AuthedRedirect />)
    expect(mockReplace).toHaveBeenCalledWith('/vouchers')
  })

  it('rejects an unsafe ?next (open-redirect) and falls back to home', () => {
    mockSession = { ready: true, isAuthenticated: true }
    mockNext = 'https://evil.example.com'
    render(<AuthedRedirect />)
    expect(mockReplace).toHaveBeenCalledWith('/')
  })
})
