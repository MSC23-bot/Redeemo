import { render, screen } from '@testing-library/react'
import { PasswordRequirements } from '@/components/auth/PasswordRequirements'

// The met/unmet state must be conveyed by a text equivalent, not colour alone
// (WCAG 1.4.1). Each row carries a visually-hidden "Met." / "Not met." prefix.
describe('PasswordRequirements (a11y: non-colour met state)', () => {
  it('marks every satisfied rule as Met for a compliant password', () => {
    render(<PasswordRequirements password="Abcdefg1!" />)
    expect(screen.getAllByText('Met.')).toHaveLength(5)
    expect(screen.queryByText('Not met.')).not.toBeInTheDocument()
  })

  it('marks every rule as Not met for an empty password', () => {
    render(<PasswordRequirements password="" />)
    expect(screen.getAllByText('Not met.')).toHaveLength(5)
    expect(screen.queryByText('Met.')).not.toBeInTheDocument()
  })
})
