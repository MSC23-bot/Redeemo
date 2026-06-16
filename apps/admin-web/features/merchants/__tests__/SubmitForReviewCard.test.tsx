/**
 * SubmitForReviewCard (B3-web) - the live submit checklist (branch + contract +
 * RMV only), non-colour-only met/unmet state, disabled button until all gates
 * pass, and Submit / Resubmit copy by onboardingStep.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { SubmitForReviewCard } from '../SubmitForReviewCard'
import type { SubmitChecklist } from '@/lib/api/merchants'

const ALL_MET: SubmitChecklist = { branch_created: true, contract_signed: true, rmv_configured: true, all_complete: true }
const PARTIAL: SubmitChecklist = { branch_created: true, contract_signed: false, rmv_configured: false, all_complete: false }
const NONE_MET: SubmitChecklist = { branch_created: false, contract_signed: false, rmv_configured: false, all_complete: false }

function renderCard(
  opts: { onboardingStep?: string; checklist?: SubmitChecklist; onSubmit?: () => void } = {}
) {
  return render(
    <SubmitForReviewCard
      onboardingStep={opts.onboardingStep ?? 'REGISTERED'}
      submitChecklist={opts.checklist ?? ALL_MET}
      onSubmit={opts.onSubmit ?? jest.fn()}
    />
  )
}

describe('SubmitForReviewCard checklist', () => {
  it('renders exactly the three live gates (no docs-uploaded / branch-user gate)', () => {
    renderCard({ checklist: PARTIAL })
    expect(screen.getByTestId('submit-gate-branch_created')).toHaveTextContent('At least one branch')
    expect(screen.getByTestId('submit-gate-contract_signed')).toHaveTextContent('A signed contract')
    expect(screen.getByTestId('submit-gate-rmv_configured')).toHaveTextContent('2 mandatory RMV vouchers')
    expect(screen.getByTestId('merchant-submit-checklist').querySelectorAll('li')).toHaveLength(3)
  })

  it('marks met/unmet without relying on colour (data-met + sr-only label)', () => {
    renderCard({ checklist: PARTIAL })
    const met = screen.getByTestId('submit-gate-branch_created')
    const unmet = screen.getByTestId('submit-gate-contract_signed')
    expect(met).toHaveAttribute('data-met', 'true')
    expect(unmet).toHaveAttribute('data-met', 'false')
    // Non-colour-only: an sr-only textual indicator accompanies each row.
    expect(met).toHaveTextContent('Met:')
    expect(unmet).toHaveTextContent('Not met:')
  })
})

describe('SubmitForReviewCard submit button gating', () => {
  it('disables the button + shows the incomplete note when gates are not all complete', () => {
    renderCard({ checklist: PARTIAL })
    expect(screen.getByTestId('merchant-submit-button')).toBeDisabled()
    expect(screen.getByTestId('merchant-submit-incomplete-note')).toBeInTheDocument()
  })

  it('keeps unmet rows visible while the button is disabled', () => {
    renderCard({ checklist: NONE_MET })
    expect(screen.getByTestId('merchant-submit-button')).toBeDisabled()
    expect(screen.getByTestId('submit-gate-branch_created')).toHaveAttribute('data-met', 'false')
    expect(screen.getByTestId('submit-gate-contract_signed')).toHaveAttribute('data-met', 'false')
    expect(screen.getByTestId('submit-gate-rmv_configured')).toHaveAttribute('data-met', 'false')
  })

  it('enables the button + hides the incomplete note when all gates pass', () => {
    renderCard({ checklist: ALL_MET })
    expect(screen.getByTestId('merchant-submit-button')).not.toBeDisabled()
    expect(screen.queryByTestId('merchant-submit-incomplete-note')).not.toBeInTheDocument()
  })

  it('calls onSubmit when the enabled button is clicked', () => {
    const onSubmit = jest.fn()
    renderCard({ checklist: ALL_MET, onSubmit })
    fireEvent.click(screen.getByTestId('merchant-submit-button'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onSubmit when the disabled button is clicked', () => {
    const onSubmit = jest.fn()
    renderCard({ checklist: PARTIAL, onSubmit })
    fireEvent.click(screen.getByTestId('merchant-submit-button'))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('SubmitForReviewCard Submit / Resubmit copy', () => {
  it('uses "Submit for review" by default (first submit)', () => {
    renderCard({ onboardingStep: 'REGISTERED' })
    expect(screen.getByTestId('merchant-submit-card')).toHaveTextContent('Submit for review')
    expect(screen.getByTestId('merchant-submit-card')).not.toHaveTextContent('Resubmit for review')
  })

  it('uses "Resubmit for review" when onboardingStep is NEEDS_CHANGES', () => {
    renderCard({ onboardingStep: 'NEEDS_CHANGES' })
    expect(screen.getByTestId('merchant-submit-button')).toHaveTextContent('Resubmit for review')
  })
})
