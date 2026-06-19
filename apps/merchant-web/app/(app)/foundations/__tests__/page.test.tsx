import { render, screen } from '@testing-library/react'
import FoundationsPage from '../page'

describe('Foundations page', () => {
  it('renders all 7 status-pill states and the button variants', () => {
    render(<FoundationsPage />)
    expect(screen.getByRole('heading', { name: /foundations/i })).toBeInTheDocument()
    for (const label of ['Setting up', 'Submitted', 'In review', 'Changes needed', 'Live', 'Live, just started', 'Suspended']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /^save voucher$/i })).toBeInTheDocument()
  })

  it('previews the surface primitives: cream Card, Input + Label, and the Table shell with empty-state', () => {
    render(<FoundationsPage />)
    // Cards: both the default white card and the cream-surface variant.
    expect(screen.getByText('Default card')).toBeInTheDocument()
    expect(screen.getByText('Cream card')).toBeInTheDocument()
    // Input + Label, asserted via the label-for-control association (a11y pin).
    expect(screen.getByLabelText('Business name')).toBeInTheDocument()
    // Table shell (header) + the empty-state slot.
    expect(screen.getByText('Voucher')).toBeInTheDocument()
    expect(screen.getByText(/no redemptions to show yet/i)).toBeInTheDocument()
  })
})
