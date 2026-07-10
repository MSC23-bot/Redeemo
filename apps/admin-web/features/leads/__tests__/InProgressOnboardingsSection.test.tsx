import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { InProgressOnboardingsSection } from '../InProgressOnboardingsSection'
import type { MerchantSummary } from '@/lib/api/merchants'

jest.mock('next/link', () => {
  return function MockLink({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  }
})

function makeMerchant(overrides: Partial<MerchantSummary> & { id: string }): MerchantSummary {
  return {
    businessName: 'Southville Sourdough',
    tradingName: null,
    status: 'REGISTERED',
    verificationStatus: 'NOT_SUBMITTED',
    onboardingStep: 'BRANCH_ADDED',
    logoUrl: null,
    createdAt: '2026-07-01T10:00:00.000Z',
    category: null,
    branchCount: 1,
    ...overrides,
  }
}

describe('InProgressOnboardingsSection', () => {
  it('shows a loading state', () => {
    render(
      <InProgressOnboardingsSection
        items={[]}
        total={undefined}
        isLoading
        isError={false}
        onRetry={jest.fn()}
        displayCap={10}
      />
    )
    expect(screen.getByLabelText(/loading in-progress onboardings/i)).toBeInTheDocument()
  })

  it('shows an error state with a working retry', () => {
    const onRetry = jest.fn()
    render(
      <InProgressOnboardingsSection
        items={[]}
        total={undefined}
        isLoading={false}
        isError
        onRetry={onRetry}
        displayCap={10}
      />
    )
    expect(screen.getByTestId('leads-in-progress-error')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows an honest empty state', () => {
    render(
      <InProgressOnboardingsSection
        items={[]}
        total={0}
        isLoading={false}
        isError={false}
        onRetry={jest.fn()}
        displayCap={10}
      />
    )
    expect(screen.getByTestId('leads-in-progress-empty')).toHaveTextContent(/no draft or in-review/i)
  })

  it('renders each row with name, status, onboarding step, created date, and a Continue link', () => {
    const merchant = makeMerchant({ id: 'm-1', businessName: 'Southville Sourdough' })
    render(
      <InProgressOnboardingsSection
        items={[merchant]}
        total={1}
        isLoading={false}
        isError={false}
        onRetry={jest.fn()}
        displayCap={10}
      />
    )

    const row = screen.getByTestId('leads-in-progress-row-m-1')
    expect(row).toHaveTextContent('Southville Sourdough')
    expect(row).toHaveTextContent('Registered')
    expect(row).toHaveTextContent('Branch added')
    expect(row).toHaveTextContent('Created 01 Jul 2026')

    const continueLink = screen.getByTestId('leads-continue-m-1')
    expect(continueLink).toHaveAttribute('href', '/merchants/m-1')
  })

  it('shows the count in the section heading when total is known', () => {
    render(
      <InProgressOnboardingsSection
        items={[makeMerchant({ id: 'm-1' })]}
        total={3}
        isLoading={false}
        isError={false}
        onRetry={jest.fn()}
        displayCap={10}
      />
    )
    expect(screen.getByText('In-progress onboardings · 3')).toBeInTheDocument()
  })

  it('shows a "view all" note only when the real total exceeds the display cap', () => {
    const items = [makeMerchant({ id: 'm-1' }), makeMerchant({ id: 'm-2' })]
    const { rerender } = render(
      <InProgressOnboardingsSection
        items={items}
        total={2}
        isLoading={false}
        isError={false}
        onRetry={jest.fn()}
        displayCap={2}
      />
    )
    expect(screen.queryByTestId('leads-in-progress-more')).not.toBeInTheDocument()

    rerender(
      <InProgressOnboardingsSection
        items={items}
        total={5}
        isLoading={false}
        isError={false}
        onRetry={jest.fn()}
        displayCap={2}
      />
    )
    expect(screen.getByTestId('leads-in-progress-more')).toHaveTextContent('Showing the 2 most recent of 5')
    expect(screen.getByText('View all in Merchants')).toHaveAttribute('href', '/merchants')
  })
})
