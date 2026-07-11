/**
 * SelfApprovedFilter — Team & Roles S4 (spec §5.3). Pure presentational
 * toggle; SUPER_ADMIN-only VISIBILITY is enforced by the caller (QueuePage),
 * pinned separately in app/(app)/queue/__tests__/page.test.tsx. These tests
 * cover the control's own rendering/toggle behaviour in isolation.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { SelfApprovedFilter } from '../SelfApprovedFilter'

describe('SelfApprovedFilter', () => {
  it('renders the "Self-approved only" label', () => {
    render(<SelfApprovedFilter active={false} onChange={jest.fn()} />)
    expect(screen.getByText('Self-approved only')).toBeInTheDocument()
  })

  it('reflects the active state via aria-checked', () => {
    const { rerender } = render(<SelfApprovedFilter active={false} onChange={jest.fn()} />)
    expect(screen.getByTestId('self-approved-filter')).toHaveAttribute('aria-checked', 'false')

    rerender(<SelfApprovedFilter active={true} onChange={jest.fn()} />)
    expect(screen.getByTestId('self-approved-filter')).toHaveAttribute('aria-checked', 'true')
  })

  it('calls onChange with the flipped value on click', () => {
    const onChange = jest.fn()
    render(<SelfApprovedFilter active={false} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('self-approved-filter'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onChange(false) when clicked while active', () => {
    const onChange = jest.fn()
    render(<SelfApprovedFilter active={true} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('self-approved-filter'))
    expect(onChange).toHaveBeenCalledWith(false)
  })
})
