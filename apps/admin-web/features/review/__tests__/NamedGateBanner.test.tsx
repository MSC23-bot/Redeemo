/**
 * NamedGateBanner — error code -> copy mapping + failedChecklistGates helper.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { NamedGateBanner, failedChecklistGates } from '../NamedGateBanner'
import { ApiError } from '@/lib/api/client'

function makeApiError(code: string, message = 'msg', body: unknown = null): ApiError {
  return new ApiError(422, body ?? { error: { code, message } })
}

describe('NamedGateBanner code mapping', () => {
  it('renders the banner with testid named-gate-banner', () => {
    render(<NamedGateBanner error={makeApiError('APPROVAL_NOT_FOUND')} />)
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })

  it('maps ONBOARDING_GATES_INCOMPLETE correctly', () => {
    render(<NamedGateBanner error={makeApiError('ONBOARDING_GATES_INCOMPLETE')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'Cannot go live: not all onboarding requirements are complete.'
    )
  })

  it('maps MAIN_BRANCH_LOCATION_UNCONFIRMED correctly', () => {
    render(<NamedGateBanner error={makeApiError('MAIN_BRANCH_LOCATION_UNCONFIRMED')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'Cannot go live: the main branch location is not confirmed.'
    )
  })

  it('maps APPROVAL_NOT_ACTIONABLE correctly', () => {
    render(<NamedGateBanner error={makeApiError('APPROVAL_NOT_ACTIONABLE')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'This approval can no longer be actioned'
    )
  })

  it('maps APPROVAL_ALREADY_CLAIMED correctly', () => {
    render(<NamedGateBanner error={makeApiError('APPROVAL_ALREADY_CLAIMED')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'This approval is already being reviewed by another admin.'
    )
  })

  it('maps APPROVAL_NOT_CLAIMER correctly', () => {
    render(<NamedGateBanner error={makeApiError('APPROVAL_NOT_CLAIMER')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'Only the admin who claimed this'
    )
  })

  it('maps APPROVAL_NOT_FOUND correctly', () => {
    render(<NamedGateBanner error={makeApiError('APPROVAL_NOT_FOUND')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'This approval no longer exists.'
    )
  })

  it('falls back to the ApiError.message for an unknown code', () => {
    const err = new ApiError(500, { error: { code: 'UNKNOWN_CODE', message: 'Something exotic happened' } })
    render(<NamedGateBanner error={err} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('Something exotic happened')
  })

  it('falls back to the generic message for a non-ApiError', () => {
    render(<NamedGateBanner error={new Error('network failure')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'Something went wrong. Please try again.'
    )
  })

  it('falls back to the generic message for null error', () => {
    render(<NamedGateBanner error={null} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'Something went wrong. Please try again.'
    )
  })
})

describe('failedChecklistGates', () => {
  it('returns the checklist for ONBOARDING_GATES_INCOMPLETE', () => {
    const checklist = { branch_created: true, contract_signed: false, rmv_configured: false }
    const err = new ApiError(422, {
      error: {
        code: 'ONBOARDING_GATES_INCOMPLETE',
        message: 'Gates',
        checklist,
      },
    })
    expect(failedChecklistGates(err)).toEqual(checklist)
  })

  it('returns null for a different code', () => {
    const err = makeApiError('APPROVAL_NOT_FOUND')
    expect(failedChecklistGates(err)).toBeNull()
  })

  it('returns null for a non-ApiError', () => {
    expect(failedChecklistGates(new Error('boom'))).toBeNull()
  })

  it('returns null for null', () => {
    expect(failedChecklistGates(null)).toBeNull()
  })
})
