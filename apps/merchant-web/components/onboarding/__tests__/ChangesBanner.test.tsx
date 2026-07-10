import { render, screen } from '@testing-library/react'
import { ChangesBanner } from '@/components/onboarding/ChangesBanner'

describe('ChangesBanner', () => {
  it('renders the dynamic admin comment when present', () => {
    render(<ChangesBanner comment="Please confirm the exact branch location and add the dessert menu to the terms." />)
    expect(
      screen.getByText(/please confirm the exact branch location and add the dessert menu/i),
    ).toBeInTheDocument()
  })

  it('shows a generic fallback (not invented specifics) when the comment is empty', () => {
    render(<ChangesBanner comment={null} />)
    // The fallback must NOT imply specific items; it just points the merchant to act.
    expect(screen.getByText(/asked for a few changes/i)).toBeInTheDocument()
  })

  it('shows the generic fallback when the comment is whitespace-only', () => {
    render(<ChangesBanner comment="   " />)
    expect(screen.getByText(/asked for a few changes/i)).toBeInTheDocument()
  })

  it('does NOT hardcode the prototype demo reason items', () => {
    render(<ChangesBanner comment="Real admin reason here." />)
    expect(screen.queryByText(/Mill Road branch/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Free dessert voucher/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Proof of address/i)).not.toBeInTheDocument()
  })

  it('always shows a "Manage your documents" link routing to /profile, even when the comment does not mention documents', () => {
    render(<ChangesBanner comment="Please update your opening hours." />)
    const link = screen.getByRole('link', { name: /manage your documents/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/profile')
  })

  it('shows the documents link on the generic fallback too', () => {
    render(<ChangesBanner comment={null} />)
    expect(screen.getByRole('link', { name: /manage your documents/i })).toHaveAttribute('href', '/profile')
  })
})
