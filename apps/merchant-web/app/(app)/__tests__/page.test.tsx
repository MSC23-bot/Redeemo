import { render, screen } from '@testing-library/react'
import HomePage from '@/app/(app)/page'

jest.mock('@/lib/auth/session', () => ({ useSession: () => ({ isAuthenticated: true }) }))
interface ProfileQuery {
  data?: { status: string; onboardingStep: string; businessName: string }
  isLoading: boolean
}
let mockProfile: ProfileQuery
jest.mock('@/lib/auth/useMerchantProfile', () => ({ useMerchantProfile: () => mockProfile }))

describe('HomePage (M1 Slice 5 lifecycle home)', () => {
  it('renders the loading state while the profile is loading', () => {
    mockProfile = { data: undefined, isLoading: true }
    render(<HomePage />)
    expect(screen.getByText(/loading your account/i)).toBeInTheDocument()
  })

  it('renders the pre-live setup home for a fresh registered merchant', () => {
    mockProfile = { data: { status: 'REGISTERED', onboardingStep: 'REGISTERED', businessName: 'Roe Cafe' }, isLoading: false }
    render(<HomePage />)
    expect(screen.getByText(/welcome, roe cafe/i)).toBeInTheDocument()
    expect(screen.getByText(/finish setting up/i)).toBeInTheDocument()
  })

  it('renders the under-review pre-live home', () => {
    mockProfile = { data: { status: 'PENDING_APPROVAL', onboardingStep: 'UNDER_REVIEW', businessName: 'Roe Cafe' }, isLoading: false }
    render(<HomePage />)
    expect(screen.getByText(/under review/i)).toBeInTheDocument()
  })

  it('renders the live home for an active merchant', () => {
    mockProfile = { data: { status: 'ACTIVE', onboardingStep: 'LIVE', businessName: 'Roe Cafe' }, isLoading: false }
    render(<HomePage />)
    expect(screen.getByText(/welcome back, roe cafe/i)).toBeInTheDocument()
    expect(screen.getByText(/your business is live/i)).toBeInTheDocument()
  })
})
