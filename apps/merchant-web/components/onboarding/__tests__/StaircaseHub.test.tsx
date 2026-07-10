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

// Backend 3-gate satisfied (branch+contract+rmv => all_complete) but the staircase
// profile step is NOT done (empty description). The prototype gates Submit on ALL 6
// steps, so the header must read "5 of 6" and Submit must stay disabled.
const BACKEND_COMPLETE_PROFILE_INCOMPLETE: OnboardingInputs = {
  profile: { status: 'REGISTERED', onboardingStep: 'REGISTERED', primaryCategoryId: 'c1', description: null },
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

  it('keeps Submit disabled and the header at "5 of 6" when the backend reports all_complete but a staircase step is not done', () => {
    // header + footer + Submit button must AGREE: 5 of 6 done -> not submittable
    render(<StaircaseHub {...baseProps()} staircase={deriveStepStates(BACKEND_COMPLETE_PROFILE_INCOMPLETE)} />)
    expect(screen.getByText(/5 of 6/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeDisabled()
  })

  it('enables Submit for review when all 6 steps are done, and opens the confirm modal on click', () => {
    render(<StaircaseHub {...baseProps()} staircase={deriveStepStates(ALL_DONE)} />)
    expect(screen.getByText(/6 of 6/i)).toBeInTheDocument()
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

  it('renders resubmission-appropriate headline/intro in the changes state, not the first-time welcome', () => {
    render(
      <StaircaseHub
        {...baseProps()}
        state="changes"
        status={{ status: 'CHANGES_REQUESTED', comment: 'Add the dessert menu to the terms.', actionedAt: null }}
      />,
    )
    expect(screen.getByText(/welcome back, roe cafe/i)).toBeInTheDocument()
    expect(screen.getByText(/needs a few updates before it can go live/i)).toBeInTheDocument()
    expect(screen.queryByText(/welcome to redeemo/i)).not.toBeInTheDocument()
    // The side-column reassurance reflects review-in-progress, not first-time framing.
    expect(screen.getByText(/still under review/i)).toBeInTheDocument()
  })

  it('keeps the setup-state headline/intro and reassurance card byte-identical (first-time copy)', () => {
    render(<StaircaseHub {...baseProps()} />)
    expect(screen.getByText(/welcome to redeemo, roe cafe/i)).toBeInTheDocument()
    expect(
      screen.getByText(/list your business for free and start bringing new customers through the door/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/nothing is public yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/welcome back/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/still under review/i)).not.toBeInTheDocument()
  })
})
