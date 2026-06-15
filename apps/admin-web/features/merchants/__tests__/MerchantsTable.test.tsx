/**
 * MerchantsTable — renders status/verification badges and the lifecycle action
 * column. The Suspend action shows ONLY for ACTIVE rows AND ONLY when the parent
 * passes canSuspend=true (mirror of the backend `merchant:suspend` gate); the
 * Reactivate action shows ONLY for SUSPENDED rows. A canSuspend=false viewer
 * sees no lifecycle buttons.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MerchantsTable } from '../MerchantsTable'
import type { MerchantSummary } from '@/lib/api/merchants'

function row(overrides: Partial<MerchantSummary>): MerchantSummary {
  return {
    id: 'm-1',
    businessName: 'Alpha Diner',
    tradingName: 'Alpha',
    status: 'ACTIVE',
    verificationStatus: 'VERIFIED',
    onboardingStep: 'LIVE',
    logoUrl: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    category: 'Restaurants',
    branchCount: 2,
    ...overrides,
  }
}

const noop = () => {}

describe('MerchantsTable rendering', () => {
  it('renders the business name, trading name, status and verification badges', () => {
    render(
      <MerchantsTable
        items={[row({ id: 'm-1', businessName: 'Alpha Diner', tradingName: 'Alpha' })]}
        canSuspend={false}
        onSuspend={noop}
        onReactivate={noop}
      />
    )
    expect(screen.getByText('Alpha Diner')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Verified')).toBeInTheDocument()
  })

  it('renders an empty state when there are no merchants', () => {
    render(<MerchantsTable items={[]} canSuspend onSuspend={noop} onReactivate={noop} />)
    expect(screen.getByText(/no merchants match this search/i)).toBeInTheDocument()
  })
})

describe('MerchantsTable lifecycle actions (capability + status gating)', () => {
  it('shows Suspend for an ACTIVE row when canSuspend is true', () => {
    render(
      <MerchantsTable
        items={[row({ id: 'm-active', status: 'ACTIVE' })]}
        canSuspend
        onSuspend={noop}
        onReactivate={noop}
      />
    )
    expect(screen.getByTestId('merchant-suspend-m-active')).toBeInTheDocument()
    expect(screen.queryByTestId('merchant-reactivate-m-active')).not.toBeInTheDocument()
  })

  it('does NOT show Suspend for an ACTIVE row when canSuspend is false', () => {
    render(
      <MerchantsTable
        items={[row({ id: 'm-active', status: 'ACTIVE' })]}
        canSuspend={false}
        onSuspend={noop}
        onReactivate={noop}
      />
    )
    expect(screen.queryByTestId('merchant-suspend-m-active')).not.toBeInTheDocument()
  })

  it('shows Reactivate for a SUSPENDED row when canSuspend is true', () => {
    render(
      <MerchantsTable
        items={[row({ id: 'm-susp', status: 'SUSPENDED' })]}
        canSuspend
        onSuspend={noop}
        onReactivate={noop}
      />
    )
    expect(screen.getByTestId('merchant-reactivate-m-susp')).toBeInTheDocument()
    expect(screen.queryByTestId('merchant-suspend-m-susp')).not.toBeInTheDocument()
  })

  it('shows no lifecycle action for a non-ACTIVE / non-SUSPENDED row even when canSuspend', () => {
    render(
      <MerchantsTable
        items={[row({ id: 'm-pend', status: 'PENDING_APPROVAL' })]}
        canSuspend
        onSuspend={noop}
        onReactivate={noop}
      />
    )
    expect(screen.queryByTestId('merchant-suspend-m-pend')).not.toBeInTheDocument()
    expect(screen.queryByTestId('merchant-reactivate-m-pend')).not.toBeInTheDocument()
  })

  it('fires onSuspend / onReactivate with the row when clicked', () => {
    const onSuspend = jest.fn()
    const onReactivate = jest.fn()
    render(
      <MerchantsTable
        items={[
          row({ id: 'm-active', status: 'ACTIVE' }),
          row({ id: 'm-susp', status: 'SUSPENDED', businessName: 'Beta Cafe', tradingName: null }),
        ]}
        canSuspend
        onSuspend={onSuspend}
        onReactivate={onReactivate}
      />
    )
    fireEvent.click(screen.getByTestId('merchant-suspend-m-active'))
    expect(onSuspend).toHaveBeenCalledTimes(1)
    expect(onSuspend.mock.calls[0][0].id).toBe('m-active')

    fireEvent.click(screen.getByTestId('merchant-reactivate-m-susp'))
    expect(onReactivate).toHaveBeenCalledTimes(1)
    expect(onReactivate.mock.calls[0][0].id).toBe('m-susp')
  })
})
