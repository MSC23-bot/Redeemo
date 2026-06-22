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

  it('maps EMAIL_ALREADY_EXISTS correctly (M6)', () => {
    render(<NamedGateBanner error={makeApiError('EMAIL_ALREADY_EXISTS')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'An account with this email already exists. Use a different owner email.'
    )
  })

  it('maps MERCHANT_NOT_FOUND correctly (M6)', () => {
    render(<NamedGateBanner error={makeApiError('MERCHANT_NOT_FOUND')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('Merchant not found.')
  })

  it('maps MERCHANT_NOT_SUSPENDED correctly (M6)', () => {
    render(<NamedGateBanner error={makeApiError('MERCHANT_NOT_SUSPENDED')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'This merchant is not suspended, so it cannot be reactivated.'
    )
  })

  it('maps BRANCH_NOT_FOUND correctly (M6)', () => {
    render(<NamedGateBanner error={makeApiError('BRANCH_NOT_FOUND')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('Branch not found.')
  })

  it('maps PENDING_EDIT_NOT_ACTIONABLE correctly (B1)', () => {
    render(<NamedGateBanner error={makeApiError('PENDING_EDIT_NOT_ACTIONABLE')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'This edit request is no longer pending and cannot be actioned.'
    )
  })

  it('maps EDIT_PHOTO_APPLY_NOT_SUPPORTED correctly (B1)', () => {
    render(<NamedGateBanner error={makeApiError('EDIT_PHOTO_APPLY_NOT_SUPPORTED')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'Photo edits cannot be applied yet.'
    )
  })

  it('maps NO_SENSITIVE_FIELDS correctly (B2.5)', () => {
    render(<NamedGateBanner error={makeApiError('NO_SENSITIVE_FIELDS')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('No changes to propose')
  })

  it('maps PENDING_EDIT_EXISTS correctly (B2.5)', () => {
    render(<NamedGateBanner error={makeApiError('PENDING_EDIT_EXISTS')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'already has an identity edit awaiting review'
    )
  })

  it('maps ALREADY_SUBMITTED correctly (B3)', () => {
    render(<NamedGateBanner error={makeApiError('ALREADY_SUBMITTED')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'This merchant is not in a submittable state (already submitted, under review, or live). The page has refreshed.'
    )
  })

  it('maps STORAGE_NOT_ENABLED correctly (B4)', () => {
    render(<NamedGateBanner error={makeApiError('STORAGE_NOT_ENABLED')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('Document storage is not enabled yet')
  })

  it('maps UNSUPPORTED_FILE_TYPE correctly (B4)', () => {
    render(<NamedGateBanner error={makeApiError('UNSUPPORTED_FILE_TYPE')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('Upload a PDF, JPG, or PNG.')
  })

  it('maps FILE_TOO_LARGE correctly (B4)', () => {
    render(<NamedGateBanner error={makeApiError('FILE_TOO_LARGE')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('The maximum size is 10 MB.')
  })

  it('maps DOCUMENT_NOT_FOUND correctly (B4)', () => {
    render(<NamedGateBanner error={makeApiError('DOCUMENT_NOT_FOUND')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('This document no longer exists.')
  })

  it('maps VOUCHER_NOT_ACTIONABLE correctly (Day-2 Vouchers PR-C)', () => {
    render(<NamedGateBanner error={makeApiError('VOUCHER_NOT_ACTIONABLE')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'This voucher is not in a state that can be actioned. The page has refreshed.'
    )
  })

  it('maps VOUCHER_NOT_FOUND correctly (Day-2 Vouchers PR-C)', () => {
    render(<NamedGateBanner error={makeApiError('VOUCHER_NOT_FOUND')} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(
      'This voucher could not be found. The page has refreshed.'
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

describe('NamedGateBanner ONBOARDING_GATES_INCOMPLETE inline gate list', () => {
  function makeGatesError(checklist: {
    branch_created?: boolean
    contract_signed?: boolean
    rmv_configured?: boolean
  }): ApiError {
    return new ApiError(422, {
      error: {
        code: 'ONBOARDING_GATES_INCOMPLETE',
        message: 'Gates incomplete',
        checklist,
      },
    })
  }

  it('renders the "Still needed" list with labels for each false gate', () => {
    const err = makeGatesError({ branch_created: true, contract_signed: false, rmv_configured: false })
    render(<NamedGateBanner error={err} />)
    const list = screen.getByTestId('named-gate-banner-unmet-list')
    expect(list).toBeInTheDocument()
    expect(list).toHaveTextContent('A signed contract')
    expect(list).toHaveTextContent('2 mandatory RMV vouchers')
    expect(list).not.toHaveTextContent('At least one branch')
  })

  it('renders all three gate labels when all three are false', () => {
    const err = makeGatesError({ branch_created: false, contract_signed: false, rmv_configured: false })
    render(<NamedGateBanner error={err} />)
    const list = screen.getByTestId('named-gate-banner-unmet-list')
    expect(list).toHaveTextContent('At least one branch')
    expect(list).toHaveTextContent('A signed contract')
    expect(list).toHaveTextContent('2 mandatory RMV vouchers')
  })

  it('renders only the one unmet gate when two are met', () => {
    const err = makeGatesError({ branch_created: true, contract_signed: true, rmv_configured: false })
    render(<NamedGateBanner error={err} />)
    const list = screen.getByTestId('named-gate-banner-unmet-list')
    expect(list).toHaveTextContent('2 mandatory RMV vouchers')
    expect(list).not.toHaveTextContent('At least one branch')
    expect(list).not.toHaveTextContent('A signed contract')
  })

  it('does NOT render the "Still needed" list when all gates are true (fully met)', () => {
    const err = makeGatesError({ branch_created: true, contract_signed: true, rmv_configured: true })
    render(<NamedGateBanner error={err} />)
    expect(screen.queryByTestId('named-gate-banner-unmet-list')).not.toBeInTheDocument()
  })

  it('does NOT render the "Still needed" list for a different error code', () => {
    render(<NamedGateBanner error={makeApiError('APPROVAL_NOT_ACTIONABLE')} />)
    expect(screen.queryByTestId('named-gate-banner-unmet-list')).not.toBeInTheDocument()
  })

  it('still keeps the generic message as the first line', () => {
    const err = makeGatesError({ branch_created: false, contract_signed: true, rmv_configured: true })
    render(<NamedGateBanner error={err} />)
    const banner = screen.getByTestId('named-gate-banner')
    expect(banner).toHaveTextContent('Cannot go live: not all onboarding requirements are complete.')
  })

  it('includes "Still needed:" heading text when there are unmet gates', () => {
    const err = makeGatesError({ branch_created: false, contract_signed: true, rmv_configured: true })
    render(<NamedGateBanner error={err} />)
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('Still needed:')
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
