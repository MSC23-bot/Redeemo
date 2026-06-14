/**
 * MerchantLifecycleCard — status-map affordances:
 *   ACTIVE           -> Suspend affordance only (no Reactivate)
 *   SUSPENDED        -> Reactivate affordance only (no Suspend)
 *   INACTIVE         -> neutral no-action state (no Suspend / no Reactivate)
 *   PENDING_APPROVAL -> neutral no-action state (no Suspend / no Reactivate)
 *
 * Pure presentational component: rendered directly with the live status +
 * onSuspend / onReactivate callbacks (no hooks to mock).
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { MerchantLifecycleCard } from '../MerchantLifecycleCard'

function renderCard(status: string) {
  return render(
    <MerchantLifecycleCard
      status={status}
      onSuspend={jest.fn()}
      onReactivate={jest.fn()}
    />
  )
}

describe('MerchantLifecycleCard status map', () => {
  it('ACTIVE -> Suspend affordance only (no Reactivate)', () => {
    renderCard('ACTIVE')
    expect(screen.getByTestId('lifecycle-suspend-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('lifecycle-reactivate-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('lifecycle-no-action')).not.toBeInTheDocument()
  })

  it('SUSPENDED -> Reactivate affordance only (no Suspend)', () => {
    renderCard('SUSPENDED')
    expect(screen.getByTestId('lifecycle-reactivate-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('lifecycle-suspend-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('lifecycle-no-action')).not.toBeInTheDocument()
  })

  it('INACTIVE -> neutral no-action state (no Suspend / no Reactivate)', () => {
    renderCard('INACTIVE')
    expect(screen.getByTestId('lifecycle-no-action')).toBeInTheDocument()
    expect(screen.queryByTestId('lifecycle-suspend-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('lifecycle-reactivate-btn')).not.toBeInTheDocument()
  })

  it('PENDING_APPROVAL -> neutral no-action state (no Suspend / no Reactivate)', () => {
    renderCard('PENDING_APPROVAL')
    expect(screen.getByTestId('lifecycle-no-action')).toBeInTheDocument()
    expect(screen.queryByTestId('lifecycle-suspend-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('lifecycle-reactivate-btn')).not.toBeInTheDocument()
  })
})
