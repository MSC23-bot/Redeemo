import { render, screen, fireEvent, within } from '@testing-library/react'
import { StaircaseHub } from '@/components/onboarding/StaircaseHub'
import { deriveStepStates, type OnboardingInputs } from '@/lib/onboarding/stepState'

const FRESH: OnboardingInputs = {
  profile: { status: 'REGISTERED', onboardingStep: 'REGISTERED', primaryCategoryId: null, description: null },
  checklist: { branch_created: false, contract_signed: false, rmv_configured: false, all_complete: false },
  rmvActiveCount: 0,
}

const ALL_DONE: OnboardingInputs = {
  profile: { status: 'REGISTERED', onboardingStep: 'REGISTERED', primaryCategoryId: 'c1', description: 'Tasty.' },
  checklist: { branch_created: true, contract_signed: true, rmv_configured: true, all_complete: true },
  rmvActiveCount: 2,
}

function baseProps() {
  return {
    businessName: 'Roe Cafe',
    staircase: deriveStepStates(FRESH),
    onNavigate: jest.fn(),
    onSubmit: jest.fn(),
    submitting: false,
    submitError: null as string | null,
    state: 'setup' as const,
    status: null,
  }
}

describe('StaircaseHub', () => {
  it('renders the "Get your business live" hub with the done/total header', () => {
    render(<StaircaseHub {...baseProps()} />)
    expect(screen.getByText(/get your business live/i)).toBeInTheDocument()
    // 1 of 6 done (account)
    expect(screen.getByText(/1 of 6/i)).toBeInTheDocument()
  })

  it('renders the "Nothing is public yet" reassurance', () => {
    render(<StaircaseHub {...baseProps()} />)
    expect(screen.getByText(/nothing is public yet/i)).toBeInTheDocument()
  })

  it('disables Submit for review until all steps are complete', () => {
    render(<StaircaseHub {...baseProps()} />)
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeDisabled()
  })

  it('enables Submit for review when all_complete, and opens the confirm modal on click', () => {
    render(<StaircaseHub {...baseProps()} staircase={deriveStepStates(ALL_DONE)} />)
    const submit = screen.getByRole('button', { name: /submit for review/i })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    // confirm modal now visible (its second-gate checkbox)
    expect(screen.getByRole('checkbox', { name: /confirm/i })).toBeInTheDocument()
  })

  it('confirming in the modal (after the checkbox) calls onSubmit', () => {
    const props = { ...baseProps(), staircase: deriveStepStates(ALL_DONE) }
    render(<StaircaseHub {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    const panel = screen.getByTestId('submit-confirm-panel')
    fireEvent.click(within(panel).getByRole('checkbox', { name: /confirm/i }))
    fireEvent.click(within(panel).getByRole('button', { name: /^submit for review$/i }))
    expect(props.onSubmit).toHaveBeenCalledTimes(1)
  })

  it('shows the changes banner ONLY in the changes state (with the dynamic comment)', () => {
    render(
      <StaircaseHub
        {...baseProps()}
        state="changes"
        status={{ status: 'CHANGES_REQUESTED', comment: 'Add the dessert menu to the terms.', actionedAt: null }}
      />,
    )
    expect(screen.getByText(/add the dessert menu to the terms/i)).toBeInTheDocument()
  })

  it('does NOT show the changes banner in the setup state', () => {
    render(
      <StaircaseHub
        {...baseProps()}
        state="setup"
        status={{ status: 'PENDING', comment: 'Merchant submitted for onboarding approval', actionedAt: null }}
      />,
    )
    expect(screen.queryByText(/merchant submitted for onboarding approval/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/a few changes are needed/i)).not.toBeInTheDocument()
  })
})
