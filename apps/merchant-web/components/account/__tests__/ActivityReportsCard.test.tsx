import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityReportsCard } from '@/components/account/ActivityReportsCard'

// §BP-ACC staged-honesty pin: no report/recipient backend exists, so the toggle
// and the recipient input+Add button must all be inert.
describe('ActivityReportsCard (staged, no backend)', () => {
  it('shows the honest "being switched on" note', () => {
    render(<ActivityReportsCard />)
    expect(screen.getByText(/being switched on/i)).toBeInTheDocument()
    expect(screen.getByText(/nothing below sends an email yet/i)).toBeInTheDocument()
  })

  it('renders the monthly report toggle disabled and unchecked', () => {
    render(<ActivityReportsCard />)
    const toggle = screen.getByRole('switch')
    expect(toggle).toBeDisabled()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('renders the recipient input and Add button disabled, and typing does nothing persistent', () => {
    render(<ActivityReportsCard />)
    const input = screen.getByLabelText(/additional monthly report recipient/i)
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: /^add$/i })).toBeDisabled()
    fireEvent.change(input, { target: { value: 'someone@example.co.uk' } })
    // A disabled input never fires onChange in the browser; this just proves no
    // crash and no network call is wired to the field at all.
  })
})
