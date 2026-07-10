/**
 * CourtTabs — tab labels/counts, click behaviour, active styling, loading skeleton.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { CourtTabs } from '../CourtTabs'
import type { CourtTabCounts } from '../CourtTabs'
import type { CourtTabKey } from '@/lib/ui/adminTones'

const COUNTS: CourtTabCounts = { needs: 10, merchant: 3, history: 25 }

describe('CourtTabs', () => {
  it('renders all three tabs with labels', () => {
    render(<CourtTabs active="needs" counts={COUNTS} onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: /needs you/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /awaiting merchant/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument()
  })

  it('renders each tab count', () => {
    render(<CourtTabs active="needs" counts={COUNTS} onChange={() => {}} />)
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('25')).toBeInTheDocument()
  })

  it('calls onChange with the tab key when clicked', () => {
    const onChange = jest.fn<void, [CourtTabKey]>()
    render(<CourtTabs active="needs" counts={COUNTS} onChange={onChange} />)

    fireEvent.click(screen.getByRole('tab', { name: /awaiting merchant/i }))
    expect(onChange).toHaveBeenCalledWith('merchant')

    fireEvent.click(screen.getByRole('tab', { name: /history/i }))
    expect(onChange).toHaveBeenCalledWith('history')
  })

  it('marks the active tab with aria-selected=true, others false', () => {
    render(<CourtTabs active="merchant" counts={COUNTS} onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: /awaiting merchant/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tab', { name: /needs you/i })).toHaveAttribute(
      'aria-selected',
      'false'
    )
  })

  it('renders a loading placeholder (no digits) for an undefined count', () => {
    const loadingCounts: CourtTabCounts = { needs: undefined, merchant: undefined, history: undefined }
    render(<CourtTabs active="needs" counts={loadingCounts} onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: /needs you/i })).toBeInTheDocument()
    expect(screen.queryByText(/^\d+$/)).toBeNull()
  })

  it('History renders with no count while it has not been loaded yet (undefined, not 0)', () => {
    const partialCounts: CourtTabCounts = { needs: 10, merchant: 3, history: undefined }
    render(<CourtTabs active="needs" counts={partialCounts} onChange={() => {}} />)
    const historyTab = screen.getByRole('tab', { name: /history/i })
    expect(historyTab).not.toHaveTextContent('0')
  })
})
