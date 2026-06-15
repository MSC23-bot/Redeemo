/**
 * EditReviewDiff (Option B B1): field-diff render, photo display, capability
 * gating of the Approve / Reject actions, and the photo-apply-disabled path.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditReviewDiff } from '../EditReviewDiff'
import type { EditReviewContext } from '@/lib/api/editReview'

function merchantContext(over: Partial<EditReviewContext> = {}): EditReviewContext {
  return {
    kind: 'merchant',
    merchantId: 'm-1',
    pendingEditId: 'pe-1',
    status: 'PENDING',
    includesPhotos: false,
    fields: [
      { field: 'businessName', current: 'Old Name', proposed: 'New Name', isCustomerVisible: true },
    ],
    ...over,
  }
}

function branchPhotoContext(over: Partial<EditReviewContext> = {}): EditReviewContext {
  return {
    kind: 'branch',
    merchantId: 'm-1',
    branchId: 'b-1',
    pendingEditId: 'bpe-1',
    status: 'PENDING',
    includesPhotos: true,
    fields: [],
    photoChanges: { add: ['https://example.com/a.jpg'], remove: ['https://example.com/old.jpg'] },
    ...over,
  }
}

function renderDiff(context: EditReviewContext, opts: { canApplyEdit?: boolean } = {}) {
  const onApprove = jest.fn()
  const onReject = jest.fn()
  render(
    <EditReviewDiff
      context={context}
      canApplyEdit={opts.canApplyEdit ?? true}
      onApprove={onApprove}
      onReject={onReject}
    />
  )
  return { onApprove, onReject }
}

describe('EditReviewDiff field diff', () => {
  it('renders the current and proposed values for each field', () => {
    renderDiff(merchantContext())
    expect(screen.getByTestId('edit-field-current-businessName')).toHaveTextContent('Old Name')
    expect(screen.getByTestId('edit-field-proposed-businessName')).toHaveTextContent('New Name')
  })

  it('marks a customer-visible field with a badge', () => {
    renderDiff(merchantContext())
    expect(screen.getByText('Customer-visible')).toBeInTheDocument()
  })

  it('renders (empty) for a null current value', () => {
    renderDiff(merchantContext({ fields: [{ field: 'description', current: null, proposed: 'Now set', isCustomerVisible: true }] }))
    expect(screen.getByTestId('edit-field-current-description')).toHaveTextContent('(empty)')
  })
})

describe('EditReviewDiff capability gating', () => {
  it('hides the Approve / Reject actions when the admin lacks approval:apply-edit', () => {
    renderDiff(merchantContext(), { canApplyEdit: false })
    expect(screen.queryByTestId('edit-review-actions')).not.toBeInTheDocument()
    expect(screen.queryByTestId('edit-approve-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('edit-reject-btn')).not.toBeInTheDocument()
  })

  it('shows the actions when the admin holds approval:apply-edit', () => {
    renderDiff(merchantContext(), { canApplyEdit: true })
    expect(screen.getByTestId('edit-review-actions')).toBeInTheDocument()
    expect(screen.getByTestId('edit-approve-btn')).toBeEnabled()
    expect(screen.getByTestId('edit-reject-btn')).toBeEnabled()
  })

  it('fires onApprove / onReject when the buttons are clicked', () => {
    const { onApprove, onReject } = renderDiff(merchantContext())
    fireEvent.click(screen.getByTestId('edit-approve-btn'))
    expect(onApprove).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('edit-reject-btn'))
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('disables both actions when the edit is no longer PENDING', () => {
    renderDiff(merchantContext({ status: 'APPROVED' }))
    expect(screen.getByTestId('edit-approve-btn')).toBeDisabled()
    expect(screen.getByTestId('edit-reject-btn')).toBeDisabled()
  })
})

describe('EditReviewDiff photo edits', () => {
  it('shows the proposed add / remove photos (not silently ignored)', () => {
    renderDiff(branchPhotoContext())
    expect(screen.getByTestId('edit-photo-changes')).toBeInTheDocument()
    expect(screen.getByTestId('edit-photo-add-list')).toHaveTextContent('https://example.com/a.jpg')
    expect(screen.getByTestId('edit-photo-remove-list')).toHaveTextContent('https://example.com/old.jpg')
  })

  it('disables Approve-edit with a follow-up message but keeps Reject-edit enabled', () => {
    renderDiff(branchPhotoContext())
    expect(screen.getByTestId('edit-approve-btn')).toBeDisabled()
    expect(screen.getByTestId('edit-reject-btn')).toBeEnabled()
    expect(screen.getByTestId('edit-photo-apply-note')).toHaveTextContent('Photo edits will be actionable in a follow-up')
  })
})
