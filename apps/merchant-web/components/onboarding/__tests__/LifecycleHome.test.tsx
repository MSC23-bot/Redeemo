import { render, screen } from '@testing-library/react'
import { LifecycleHome } from '@/components/onboarding/LifecycleHome'

describe('LifecycleHome', () => {
  it('renders the submitted (read-only "we are reviewing") home', () => {
    render(<LifecycleHome state="submitted" businessName="Roe Cafe" status={null} />)
    expect(screen.getByText(/we are reviewing/i)).toBeInTheDocument()
  })

  it('renders the in-review (read-only) home', () => {
    render(<LifecycleHome state="in_review" businessName="Roe Cafe" status={null} />)
    expect(screen.getByText(/in review/i)).toBeInTheDocument()
  })

  it('does NOT render the onboarding comment on the submitted/in_review homes', () => {
    // A fresh-submit comment is a system placeholder, NOT an admin reason.
    render(
      <LifecycleHome
        state="submitted"
        businessName="Roe Cafe"
        status={{ status: 'PENDING', comment: 'Merchant submitted for onboarding approval', actionedAt: null }}
      />,
    )
    expect(screen.queryByText(/Merchant submitted for onboarding approval/i)).not.toBeInTheDocument()
  })

  it('renders the suspended read-only home with a Contact Redeemo affordance', () => {
    render(<LifecycleHome state="suspended" businessName="Roe Cafe" status={null} />)
    expect(screen.getByText(/your account is suspended/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /contact redeemo/i })).toBeInTheDocument()
  })

  it('renders the rejected read-only home with the admin reason and a Contact Redeemo affordance', () => {
    render(
      <LifecycleHome
        state="rejected"
        businessName="Roe Cafe"
        status={{ status: 'REJECTED', comment: 'We could not verify the business at the address given.', actionedAt: null }}
      />,
    )
    // a calm, factual not-approved heading + the reason + the contact affordance
    expect(screen.getByText(/not approved/i)).toBeInTheDocument()
    expect(screen.getByText(/could not verify the business at the address given/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /contact redeemo/i })).toBeInTheDocument()
  })

  it('renders the rejected home with no reason line when the comment is empty', () => {
    render(<LifecycleHome state="rejected" businessName="Roe Cafe" status={{ status: 'REJECTED', comment: null, actionedAt: null }} />)
    expect(screen.getByText(/not approved/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /contact redeemo/i })).toBeInTheDocument()
  })

  it('renders the live celebratory placeholder home', () => {
    render(<LifecycleHome state="live" businessName="Roe Cafe" status={null} />)
    expect(screen.getByText(/your business is live/i)).toBeInTheDocument()
  })

  // Polish batch: the Contact Redeemo affordance was previously an inert <button>
  // with no onClick/href. It is now a real mailto link (role="button" preserves
  // the getByRole('button', ...) queries above, since only the element and its
  // functionality changed - not the visual treatment or surrounding copy).
  it('gives the suspended-home Contact Redeemo affordance a working mailto href', () => {
    render(<LifecycleHome state="suspended" businessName="Roe Cafe" status={null} />)
    expect(screen.getByRole('button', { name: /contact redeemo/i })).toHaveAttribute(
      'href',
      'mailto:merchants@redeemo.co.uk',
    )
  })

  it('gives the rejected-home Contact Redeemo affordance a working mailto href', () => {
    render(
      <LifecycleHome
        state="rejected"
        businessName="Roe Cafe"
        status={{ status: 'REJECTED', comment: null, actionedAt: null }}
      />,
    )
    expect(screen.getByRole('button', { name: /contact redeemo/i })).toHaveAttribute(
      'href',
      'mailto:merchants@redeemo.co.uk',
    )
  })
})
