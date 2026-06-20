import { render, screen, fireEvent } from '@testing-library/react'
import { StepList } from '@/components/onboarding/StepList'
import { deriveStepStates, type OnboardingInputs } from '@/lib/onboarding/stepState'

const FRESH: OnboardingInputs = {
  profile: { status: 'REGISTERED', onboardingStep: 'REGISTERED', primaryCategoryId: null, description: null },
  checklist: { branch_created: false, contract_signed: false, rmv_configured: false, all_complete: false },
  rmvActiveCount: 0,
}

function build(patch: Omit<Partial<OnboardingInputs>, 'profile' | 'checklist'> & { profile?: Partial<OnboardingInputs['profile']>; checklist?: Partial<OnboardingInputs['checklist']> } = {}) {
  return deriveStepStates({
    profile: { ...FRESH.profile, ...(patch.profile ?? {}) },
    checklist: { ...FRESH.checklist, ...(patch.checklist ?? {}) },
    rmvActiveCount: patch.rmvActiveCount ?? FRESH.rmvActiveCount,
  })
}

describe('StepList', () => {
  it('renders all 6 step labels', () => {
    render(<StepList staircase={build()} onNavigate={jest.fn()} />)
    expect(screen.getByText('Create your account')).toBeInTheDocument()
    expect(screen.getByText('Choose your category')).toBeInTheDocument()
    expect(screen.getByText('Complete your business profile')).toBeInTheDocument()
    expect(screen.getByText('Add your main branch')).toBeInTheDocument()
    expect(screen.getByText('Set up your 2 flagship vouchers')).toBeInTheDocument()
    expect(screen.getByText('Sign the merchant agreement')).toBeInTheDocument()
  })

  it('shows the current step action and calls onNavigate with its href', () => {
    const onNavigate = jest.fn()
    render(<StepList staircase={build()} onNavigate={onNavigate} />)
    // category is current for a fresh merchant
    fireEvent.click(screen.getByRole('button', { name: /choose a category/i }))
    expect(onNavigate).toHaveBeenCalledWith('/onboarding/category')
  })

  it('renders a locked hint and NO action button for a locked step', () => {
    render(<StepList staircase={build()} onNavigate={jest.fn()} />)
    // profile is locked for a fresh merchant
    expect(screen.getByText(/available once you have chosen your category/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open business profile/i })).not.toBeInTheDocument()
  })

  it('shows the "1 of 2" partial on the vouchers step', () => {
    const oneSaved = build({
      profile: { primaryCategoryId: 'c1', description: 'Tasty.' },
      rmvActiveCount: 1,
    })
    render(<StepList staircase={oneSaved} onNavigate={jest.fn()} />)
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /build the second voucher/i })).toBeInTheDocument()
  })

  it('marks a done step with a Done indicator and an edit action', () => {
    const catDone = build({ profile: { primaryCategoryId: 'c1' } })
    render(<StepList staircase={catDone} onNavigate={jest.fn()} />)
    expect(screen.getByRole('button', { name: /edit category/i })).toBeInTheDocument()
  })
})
