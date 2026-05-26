import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { SubscriptionManagementSheet } from '../components/SubscriptionManagementSheet'

jest.mock('../hooks/useCancelSubscription', () => ({
  useCancelSubscription: () => ({ mutate: jest.fn(), isPending: false }),
}))

const mockSub = {
  id: 'sub_1',
  status: 'ACTIVE',
  currentPeriodStart: '2026-04-12T00:00:00.000Z',
  currentPeriodEnd: '2026-05-12T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  plan: {
    id: 'plan_monthly',
    name: 'Monthly',
    billingInterval: 'MONTHLY',
    priceGbp: 6.99,
  },
  promoCodeId: null,
}

describe('SubscriptionManagementSheet', () => {
  it('shows plan name and renewal date', () => {
    render(
      <SubscriptionManagementSheet
        visible={true}
        onDismiss={jest.fn()}
        subscription={mockSub as any}
      />,
    )
    expect(screen.getByText(/Monthly/)).toBeTruthy()
    expect(screen.getAllByText(/12 May 2026/).length).toBeGreaterThan(0)
  })

  it('shows cancel subscription button when not already cancelling', () => {
    render(
      <SubscriptionManagementSheet
        visible={true}
        onDismiss={jest.fn()}
        subscription={mockSub as any}
      />,
    )
    expect(screen.getByText(/cancel subscription/i)).toBeTruthy()
  })

  it('shows "already cancelled" message when cancelAtPeriodEnd is true', () => {
    const cancelled = { ...mockSub, cancelAtPeriodEnd: true }
    render(
      <SubscriptionManagementSheet
        visible={true}
        onDismiss={jest.fn()}
        subscription={cancelled as any}
      />,
    )
    expect(screen.getByText(/cancellation scheduled/i)).toBeTruthy()
  })

  it('shows subscribe CTA when there is no subscription', () => {
    render(
      <SubscriptionManagementSheet
        visible={true}
        onDismiss={jest.fn()}
        subscription={null}
      />,
    )
    expect(screen.getByText(/no active plan/i)).toBeTruthy()
  })
})
