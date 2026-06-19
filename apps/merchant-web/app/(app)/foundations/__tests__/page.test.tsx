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
})
