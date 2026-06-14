/**
 * VoucherList — empty state, mandatory/custom grouping, approval badges, saving format.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { VoucherList } from '../VoucherList'
import type { ReviewVoucher } from '@/lib/api/review'

function makeVoucher(overrides: Partial<ReviewVoucher> = {}): ReviewVoucher {
  return {
    id: 'v-1',
    title: 'Free coffee',
    type: 'FREEBIE',
    isRmv: true,
    rmvTemplateId: 'RMV-001',
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    approvalComment: null,
    estimatedSaving: 5.0,
    terms: null,
    description: null,
    expiryDate: null,
    ...overrides,
  }
}

describe('VoucherList', () => {
  it('renders empty state when no vouchers', () => {
    render(<VoucherList vouchers={[]} />)
    expect(screen.getByText('No vouchers configured yet.')).toBeInTheDocument()
  })

  it('renders a row per voucher', () => {
    const vouchers = [
      makeVoucher({ id: 'v-1', title: 'Free coffee' }),
      makeVoucher({ id: 'v-2', title: 'Buy one get one', isRmv: false }),
    ]
    render(<VoucherList vouchers={vouchers} />)
    expect(screen.getByTestId('voucher-row-v-1')).toBeInTheDocument()
    expect(screen.getByTestId('voucher-row-v-2')).toBeInTheDocument()
  })

  it('shows "Mandatory" badge on isRmv vouchers', () => {
    render(<VoucherList vouchers={[makeVoucher({ isRmv: true })]} />)
    expect(screen.getByText('Mandatory')).toBeInTheDocument()
  })

  it('does not show "Mandatory" badge on custom vouchers', () => {
    render(<VoucherList vouchers={[makeVoucher({ isRmv: false })]} />)
    expect(screen.queryByText('Mandatory')).not.toBeInTheDocument()
  })

  it('renders "Mandatory vouchers" section when RMV vouchers exist', () => {
    render(<VoucherList vouchers={[makeVoucher({ isRmv: true })]} />)
    expect(screen.getByText(/mandatory vouchers/i)).toBeInTheDocument()
  })

  it('renders "Custom vouchers" section when custom vouchers exist', () => {
    render(<VoucherList vouchers={[makeVoucher({ isRmv: false })]} />)
    expect(screen.getByText(/custom vouchers/i)).toBeInTheDocument()
  })

  it('shows "Approved" badge for approved voucher', () => {
    render(<VoucherList vouchers={[makeVoucher({ approvalStatus: 'APPROVED' })]} />)
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('shows "Pending approval" badge for pending voucher', () => {
    render(<VoucherList vouchers={[makeVoucher({ approvalStatus: 'PENDING' })]} />)
    expect(screen.getByText('Pending approval')).toBeInTheDocument()
  })

  it('formats estimated saving to 2 decimal places with £ prefix', () => {
    render(<VoucherList vouchers={[makeVoucher({ estimatedSaving: 7.5 })]} />)
    expect(screen.getByText('£7.50')).toBeInTheDocument()
  })

  it('formats whole-number saving correctly', () => {
    render(<VoucherList vouchers={[makeVoucher({ estimatedSaving: 10 })]} />)
    expect(screen.getByText('£10.00')).toBeInTheDocument()
  })

  it('shows approval comment when present', () => {
    render(<VoucherList vouchers={[makeVoucher({ approvalComment: 'Terms too vague' })]} />)
    expect(screen.getByText(/terms too vague/i)).toBeInTheDocument()
  })

  it('shows the count in the heading', () => {
    render(
      <VoucherList
        vouchers={[
          makeVoucher({ id: 'v-1' }),
          makeVoucher({ id: 'v-2', isRmv: false }),
        ]}
      />
    )
    expect(screen.getByText('Vouchers (2)')).toBeInTheDocument()
  })
})
