/**
 * TypeChips — chip labels/counts, click behaviour, active styling, loading skeleton.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { TypeChips } from '../TypeChips'
import type { TypeChipCounts, TypeFilterValue } from '../TypeChips'

const COUNTS: TypeChipCounts = {
  all: 10,
  onboarding: 2,
  voucher: 2,
  merchantEdit: 3,
  branchLifecycle: 3,
}

describe('TypeChips', () => {
  it('renders "All" plus the four spec type-group chips', () => {
    render(<TypeChips active="all" counts={COUNTS} onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: /^all/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^onboarding/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^voucher/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^merchant edit/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^branch lifecycle/i })).toBeInTheDocument()
  })

  it('renders each chip count, summing to the "All" total', () => {
    render(<TypeChips active="all" counts={COUNTS} onChange={() => {}} />)
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getAllByText('2')).toHaveLength(2) // onboarding + voucher
    expect(screen.getAllByText('3')).toHaveLength(2) // merchantEdit + branchLifecycle
  })

  it('calls onChange with the group key when a chip is clicked', () => {
    const onChange = jest.fn<void, [TypeFilterValue]>()
    render(<TypeChips active="all" counts={COUNTS} onChange={onChange} />)

    fireEvent.click(screen.getByRole('tab', { name: /^voucher/i }))
    expect(onChange).toHaveBeenCalledWith('voucher')

    fireEvent.click(screen.getByRole('tab', { name: /^branch lifecycle/i }))
    expect(onChange).toHaveBeenCalledWith('branchLifecycle')

    fireEvent.click(screen.getByRole('tab', { name: /^all/i }))
    expect(onChange).toHaveBeenCalledWith('all')
  })

  it('marks the active chip with aria-selected=true', () => {
    render(<TypeChips active="merchantEdit" counts={COUNTS} onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: /^merchant edit/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tab', { name: /^all/i })).toHaveAttribute('aria-selected', 'false')
  })

  it('renders chips but no count numbers while counts is undefined (loading)', () => {
    render(<TypeChips active="all" counts={undefined} onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: /^all/i })).toBeInTheDocument()
    expect(screen.queryByText(/^\d+$/)).toBeNull()
  })

  it('scopes counts to the active court: different counts render for the same chip set', () => {
    const { rerender } = render(<TypeChips active="all" counts={COUNTS} onChange={() => {}} />)
    expect(screen.getByText('10')).toBeInTheDocument()

    const merchantCourtCounts: TypeChipCounts = {
      all: 3,
      onboarding: 1,
      voucher: 2,
      merchantEdit: 0,
      branchLifecycle: 0,
    }
    rerender(<TypeChips active="all" counts={merchantCourtCounts} onChange={() => {}} />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByText('10')).toBeNull()
  })
})
