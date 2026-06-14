/**
 * BranchTable — empty state, branch rows, location confidence badges, PIN footer.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { BranchTable } from '../BranchTable'
import type { ReviewBranch } from '@/lib/api/review'

function makeBranch(overrides: Partial<ReviewBranch> = {}): ReviewBranch {
  return {
    id: 'br-1',
    name: 'Main Branch',
    isMainBranch: true,
    isActive: true,
    addressLine1: '1 High Street',
    addressLine2: null,
    city: 'Huddersfield',
    postcode: 'HD1 1AA',
    localityName: null,
    locationConfidence: 'ADDRESS_GEOCODED',
    ...overrides,
  }
}

describe('BranchTable', () => {
  it('renders empty state when no branches', () => {
    render(<BranchTable branches={[]} />)
    expect(screen.getByText('No branches added yet.')).toBeInTheDocument()
  })

  it('renders a row per branch', () => {
    const branches = [
      makeBranch({ id: 'br-1', name: 'Main Branch' }),
      makeBranch({ id: 'br-2', name: 'City Centre', isMainBranch: false }),
    ]
    render(<BranchTable branches={branches} />)
    expect(screen.getByText('Main Branch')).toBeInTheDocument()
    expect(screen.getByText('City Centre')).toBeInTheDocument()
  })

  it('shows "Main" badge on the main branch', () => {
    render(<BranchTable branches={[makeBranch({ isMainBranch: true })]} />)
    expect(screen.getByText('Main')).toBeInTheDocument()
  })

  it('does not show "Main" badge on non-main branches', () => {
    render(<BranchTable branches={[makeBranch({ isMainBranch: false })]} />)
    expect(screen.queryByText('Main')).not.toBeInTheDocument()
  })

  it('shows "Confirmed" badge for MANUALLY_CONFIRMED location', () => {
    render(<BranchTable branches={[makeBranch({ locationConfidence: 'MANUALLY_CONFIRMED' })]} />)
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
  })

  it('shows "Geocoded" badge for ADDRESS_GEOCODED location', () => {
    render(<BranchTable branches={[makeBranch({ locationConfidence: 'ADDRESS_GEOCODED' })]} />)
    expect(screen.getByText('Geocoded')).toBeInTheDocument()
  })

  it('shows "Postcode centroid" badge for POSTCODE_CENTROID location', () => {
    render(<BranchTable branches={[makeBranch({ locationConfidence: 'POSTCODE_CENTROID' })]} />)
    expect(screen.getByText('Postcode centroid')).toBeInTheDocument()
  })

  it('shows "Active" / "Inactive" status badge', () => {
    render(
      <BranchTable
        branches={[
          makeBranch({ id: 'br-a', isActive: true }),
          makeBranch({ id: 'br-b', isActive: false, isMainBranch: false }),
        ]}
      />
    )
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })

  it('displays PIN footer note', () => {
    render(<BranchTable branches={[makeBranch()]} />)
    expect(screen.getByText('Branch PINs are never shown here.')).toBeInTheDocument()
  })

  it('shows the count in the heading', () => {
    render(
      <BranchTable
        branches={[
          makeBranch({ id: 'br-1' }),
          makeBranch({ id: 'br-2', isMainBranch: false }),
        ]}
      />
    )
    expect(screen.getByText('Branches (2)')).toBeInTheDocument()
  })
})
