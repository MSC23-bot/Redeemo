/**
 * StatusFilter — chip counts, click behaviour, active chip styling.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatusFilter } from '../StatusFilter'
import type { StatusFilterValue } from '../StatusFilter'
import type { QueueCounts } from '@/lib/queue/useQueue'

const COUNTS: QueueCounts = {
  all: 10,
  submitted: 4,
  underReview: 3,
  changesRequested: 3,
}

describe('StatusFilter', () => {
  it('renders all four chips with their counts', () => {
    render(
      <StatusFilter active="all" counts={COUNTS} onChange={() => {}} />
    )

    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Submitted')).toBeInTheDocument()
    expect(screen.getByText('Under review')).toBeInTheDocument()
    expect(screen.getByText('Changes requested')).toBeInTheDocument()

    // Counts appear inside the chips (as sibling span text nodes).
    expect(screen.getAllByText('10')).toHaveLength(1)
    expect(screen.getAllByText('4')).toHaveLength(1)
    expect(screen.getAllByText('3')).toHaveLength(2) // underReview + changesRequested both = 3
  })

  it('calls onChange with the chip value when a chip is clicked', () => {
    const onChange = jest.fn<void, [StatusFilterValue]>()
    render(<StatusFilter active="all" counts={COUNTS} onChange={onChange} />)

    fireEvent.click(screen.getByRole('tab', { name: /submitted/i }))
    expect(onChange).toHaveBeenCalledWith('submitted')

    fireEvent.click(screen.getByRole('tab', { name: /under review/i }))
    expect(onChange).toHaveBeenCalledWith('underReview')

    fireEvent.click(screen.getByRole('tab', { name: /changes requested/i }))
    expect(onChange).toHaveBeenCalledWith('changesRequested')

    fireEvent.click(screen.getByRole('tab', { name: /^all/i }))
    expect(onChange).toHaveBeenCalledWith('all')
  })

  it('marks the active chip with aria-selected=true', () => {
    render(
      <StatusFilter active="submitted" counts={COUNTS} onChange={() => {}} />
    )

    const submittedTab = screen.getByRole('tab', { name: /submitted/i })
    const allTab = screen.getByRole('tab', { name: /^all/i })

    expect(submittedTab).toHaveAttribute('aria-selected', 'true')
    expect(allTab).toHaveAttribute('aria-selected', 'false')
  })

  it('shows zero counts correctly', () => {
    const zeroCounts: QueueCounts = { all: 0, submitted: 0, underReview: 0, changesRequested: 0 }
    render(<StatusFilter active="all" counts={zeroCounts} onChange={() => {}} />)
    // Four "0" count labels.
    const zeros = screen.getAllByText('0')
    expect(zeros).toHaveLength(4)
  })

  it('renders the chips but no count numbers while loading (counts undefined)', () => {
    render(<StatusFilter active="all" counts={undefined} onChange={() => {}} />)

    // Chip labels still render so the tabs are usable while loading.
    expect(screen.getByRole('tab', { name: /^all/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /submitted/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /under review/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /changes requested/i })).toBeInTheDocument()

    // No flashing 0/0/0/0 — there are no numeric count labels at all.
    expect(screen.queryByText('0')).toBeNull()
  })
})
