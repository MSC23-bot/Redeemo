import { render, screen } from '@testing-library/react'
import { Sidebar } from '../Sidebar'

describe('Sidebar', () => {
  it('renders the brand lockup, Home, the four nav groups, and pinned items', () => {
    render(<Sidebar />)
    expect(screen.getByText('Redeemo')).toBeInTheDocument()
    expect(screen.getByText('for Business')).toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
    for (const label of ['Vouchers & customers', 'Locations & team', 'Business', 'Grow your business']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('My account')).toBeInTheDocument()
    expect(screen.getByText('Help & support')).toBeInTheDocument()
  })

  it('shows the "Coming soon" tag + a Soon badge on the Grow group', () => {
    render(<Sidebar />)
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
    expect(screen.getAllByText('Soon').length).toBeGreaterThanOrEqual(2)
  })

  it('does NOT render the Documents nav item (folded into Business profile)', () => {
    render(<Sidebar />)
    expect(screen.queryByText('Documents')).not.toBeInTheDocument()
  })

  it('wires the Branches nav entry to /branches (PR-1 F13)', () => {
    render(<Sidebar />)
    const link = screen.getByText('Branches').closest('a')
    expect(link).toHaveAttribute('href', '/branches')
  })

  // Insights nav visibility (Staff & Access): only Owner + Branch Manager see Insights.
  it('shows Insights & reports when canViewInsights is true (Owner / Branch Manager)', () => {
    render(<Sidebar canViewInsights={true} />)
    const link = screen.getByText('Insights & reports').closest('a')
    expect(link).toHaveAttribute('href', '/insights')
    // The rest of the nav is unchanged.
    expect(screen.getByText('Vouchers')).toBeInTheDocument()
    expect(screen.getByText('Redemptions')).toBeInTheDocument()
    expect(screen.getByText('Branches')).toBeInTheDocument()
    expect(screen.getByText('Staff & access')).toBeInTheDocument()
  })

  it('hides ONLY Insights & reports when canViewInsights is false (Staff)', () => {
    render(<Sidebar canViewInsights={false} />)
    expect(screen.queryByText('Insights & reports')).not.toBeInTheDocument()
    // Sibling items in the same group, and all other nav, remain.
    expect(screen.getByText('Vouchers')).toBeInTheDocument()
    expect(screen.getByText('Redemptions')).toBeInTheDocument()
    expect(screen.getByText('Branches')).toBeInTheDocument()
    expect(screen.getByText('Staff & access')).toBeInTheDocument()
  })

  it('defaults to hiding Insights (fail closed) when no capability is passed', () => {
    render(<Sidebar />)
    expect(screen.queryByText('Insights & reports')).not.toBeInTheDocument()
  })
})
