/**
 * ErrorState: the shared fetch-failure component (honesty-copy sweep,
 * 2026-07-13). Locks the honesty contract from approval-queue-spec.md §A.1
 * (qError): error copy must state what failed, reassure that no items were
 * changed, and offer a retry; it must never read like an empty result set.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorState } from '../ErrorState'

describe('ErrorState', () => {
  it('names what failed and reassures nothing was changed', () => {
    const onRetry = jest.fn()
    render(<ErrorState subject="the approval queue" onRetry={onRetry} testId="queue-error" />)
    const el = screen.getByTestId('queue-error')
    expect(el).toHaveTextContent('Could not load the approval queue.')
    expect(el).toHaveTextContent(/no items were changed/i)
  })

  it('calls onRetry when Retry is clicked', () => {
    const onRetry = jest.fn()
    render(<ErrorState subject="this review" onRetry={onRetry} />)
    fireEvent.click(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('carries no em-dash', () => {
    render(<ErrorState subject="the team roster" onRetry={jest.fn()} testId="team-error" />)
    const text = screen.getByTestId('team-error').textContent ?? ''
    expect(text).not.toMatch(/\u2014/)
  })
})

describe('ErrorState vs an empty-result message: never confusable', () => {
  it('uses destructive/red styling, unlike a muted empty-state message', () => {
    render(<ErrorState subject="redemptions" onRetry={jest.fn()} testId="redemptions-error" />)
    const el = screen.getByTestId('redemptions-error')
    expect(el.className).toMatch(/destructive/)
  })
})
