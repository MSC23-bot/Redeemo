/**
 * VoucherEditReviewDiff (Voucher governed-flows PR-B): voucher identity header,
 * flagship badge, mandatory reason, CHANGE field diff, END treatment,
 * WITHDRAWN (no actions), and approval:apply-edit capability gating.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoucherEditReviewDiff } from '../VoucherEditReviewDiff'
import type { VoucherEditReviewContext } from '@/lib/api/editReview'

function changeContext(over: Partial<VoucherEditReviewContext> = {}): VoucherEditReviewContext {
  return {
    kind: 'voucher',
    voucherId: 'v-1',
    voucherEditKind: 'CHANGE',
    reason: 'Our supplier costs increased, so the saving needs to change.',
    status: 'PENDING',
    fields: [
      { key: 'estimatedSaving', label: 'Estimated saving', current: 5, proposed: 7.5 },
      { key: 'terms', label: 'Terms', current: 'Dine-in only.', proposed: 'Dine-in or takeaway.' },
    ],
    voucher: {
      id: 'v-1',
      code: 'RCV-004',
      title: '20% off all mains',
      type: 'DISCOUNT',
      status: 'ACTIVE',
      isRmv: false,
      estimatedSaving: 5,
    },
    ...over,
  }
}

function endContext(over: Partial<VoucherEditReviewContext> = {}): VoucherEditReviewContext {
  return changeContext({
    voucherEditKind: 'END',
    reason: 'We are discontinuing this offer.',
    fields: [],
    ...over,
  })
}

function renderDiff(context: VoucherEditReviewContext, opts: { canApplyEdit?: boolean } = {}) {
  const onApprove = jest.fn()
  const onReject = jest.fn()
  render(
    <VoucherEditReviewDiff
      context={context}
      canApplyEdit={opts.canApplyEdit ?? true}
      onApprove={onApprove}
      onReject={onReject}
    />
  )
  return { onApprove, onReject }
}

describe('VoucherEditReviewDiff — header + reason', () => {
  it('shows the voucher title, code, and type chip', () => {
    renderDiff(changeContext())
    expect(screen.getByTestId('voucher-edit-review-diff')).toHaveTextContent('20% off all mains')
    expect(screen.getByTestId('voucher-edit-code')).toHaveTextContent('RCV-004')
    expect(screen.getByTestId('voucher-edit-review-diff')).toHaveTextContent('Discount')
  })

  it('shows the merchant reason prominently', () => {
    renderDiff(changeContext())
    expect(screen.getByTestId('voucher-edit-reason')).toHaveTextContent(
      'Our supplier costs increased, so the saving needs to change.'
    )
  })

  it('shows the flagship badge when the voucher isRmv', () => {
    renderDiff(changeContext({ voucher: { ...changeContext().voucher, isRmv: true } }))
    expect(screen.getByTestId('voucher-edit-flagship-badge')).toBeInTheDocument()
  })

  it('does NOT show the flagship badge for a non-RMV voucher', () => {
    renderDiff(changeContext())
    expect(screen.queryByTestId('voucher-edit-flagship-badge')).not.toBeInTheDocument()
  })
})

describe('VoucherEditReviewDiff — CHANGE kind', () => {
  it('renders the field diff table with current/proposed values', () => {
    renderDiff(changeContext())
    expect(screen.getByTestId('voucher-edit-field-table')).toBeInTheDocument()
    expect(screen.getByTestId('voucher-edit-field-current-estimatedSaving')).toHaveTextContent('5')
    expect(screen.getByTestId('voucher-edit-field-proposed-estimatedSaving')).toHaveTextContent('7.5')
  })

  it('does NOT render the END notice for a CHANGE request', () => {
    renderDiff(changeContext())
    expect(screen.queryByTestId('voucher-edit-end-notice')).not.toBeInTheDocument()
  })

  it('shows the approve/reject actions when the admin holds approval:apply-edit', () => {
    renderDiff(changeContext(), { canApplyEdit: true })
    expect(screen.getByTestId('voucher-edit-review-actions')).toBeInTheDocument()
    expect(screen.getByTestId('voucher-edit-approve-btn')).toBeEnabled()
    expect(screen.getByTestId('voucher-edit-reject-btn')).toBeEnabled()
  })

  it('hides the actions when the admin lacks approval:apply-edit (read-only)', () => {
    renderDiff(changeContext(), { canApplyEdit: false })
    expect(screen.queryByTestId('voucher-edit-review-actions')).not.toBeInTheDocument()
    expect(screen.queryByTestId('voucher-edit-approve-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('voucher-edit-reject-btn')).not.toBeInTheDocument()
  })

  it('fires onApprove / onReject when clicked', () => {
    const { onApprove, onReject } = renderDiff(changeContext())
    fireEvent.click(screen.getByTestId('voucher-edit-approve-btn'))
    expect(onApprove).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('voucher-edit-reject-btn'))
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('disables both actions when the request is no longer PENDING', () => {
    renderDiff(changeContext({ status: 'APPROVED' }))
    expect(screen.getByTestId('voucher-edit-approve-btn')).toBeDisabled()
    expect(screen.getByTestId('voucher-edit-reject-btn')).toBeDisabled()
  })
})

describe('VoucherEditReviewDiff — END kind', () => {
  it('renders the end-treatment notice with the consequence copy', () => {
    renderDiff(endContext())
    const notice = screen.getByTestId('voucher-edit-end-notice')
    expect(notice).toHaveTextContent('Requests to end this voucher')
    expect(notice).toHaveTextContent('becomes inactive and is no longer available to customers')
  })

  it('does NOT render a field diff table for an END request', () => {
    renderDiff(endContext())
    expect(screen.queryByTestId('voucher-edit-field-table')).not.toBeInTheDocument()
  })

  it('still shows the reason for an END request', () => {
    renderDiff(endContext())
    expect(screen.getByTestId('voucher-edit-reason')).toHaveTextContent('We are discontinuing this offer.')
  })

  it('labels the approve button "End voucher" for an END request', () => {
    renderDiff(endContext())
    expect(screen.getByTestId('voucher-edit-approve-btn')).toHaveTextContent('End voucher')
  })
})

describe('VoucherEditReviewDiff — WITHDRAWN', () => {
  it('renders the neutral "Withdrawn" label', () => {
    renderDiff(changeContext({ status: 'WITHDRAWN' }))
    expect(screen.getByTestId('voucher-edit-review-diff')).toHaveTextContent('Withdrawn')
  })

  it('renders NO action buttons at all, even when the admin holds approval:apply-edit', () => {
    renderDiff(changeContext({ status: 'WITHDRAWN' }), { canApplyEdit: true })
    expect(screen.queryByTestId('voucher-edit-review-actions')).not.toBeInTheDocument()
    expect(screen.queryByTestId('voucher-edit-approve-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('voucher-edit-reject-btn')).not.toBeInTheDocument()
  })

  it('renders no action buttons for a WITHDRAWN END request either', () => {
    renderDiff(endContext({ status: 'WITHDRAWN' }), { canApplyEdit: true })
    expect(screen.queryByTestId('voucher-edit-review-actions')).not.toBeInTheDocument()
  })
})
