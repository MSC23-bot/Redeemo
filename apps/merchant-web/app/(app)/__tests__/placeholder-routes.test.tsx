/**
 * Shell wave: the honest placeholder/teaser routes behind the former '#' dead
 * links (roadmap "generic coming-soon module shell"). Pins: each route renders
 * its title + an honest status badge, and never renders a dead CTA (no "Notify
 * me" - the interest CTA needs a backend and was deferred).
 *
 * Business Profile M2: /profile is NO LONGER one of these placeholders (it now
 * renders the real read shell, <BusinessProfileScreen>, driven by a live
 * useMerchantProfile fetch) - its pin moved to
 * app/(app)/profile/__tests__/page.test.tsx.
 */
import { render, screen } from '@testing-library/react'
import PromotePage from '../promote/page'
import BillingPage from '../billing/page'
import MyAccountPage from '../account/page'
import HelpPage from '../help/page'

describe('placeholder module routes', () => {
  it('/promote renders the teaser with preview cards and no interest CTA', () => {
    render(<PromotePage />)
    expect(screen.getByRole('heading', { name: 'Promote' })).toBeInTheDocument()
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
    expect(screen.getByText('Featured placement')).toBeInTheDocument()
    expect(screen.getByText('Location targeted campaigns')).toBeInTheDocument()
    expect(screen.getByText('Featured and trending status')).toBeInTheDocument()
    expect(screen.queryByText(/notify me/i)).not.toBeInTheDocument()
    expect(screen.getByText(/nothing here is live or chargeable yet/i)).toBeInTheDocument()
  })

  it('/billing renders the free-reassurance callout', () => {
    render(<BillingPage />)
    expect(screen.getByRole('heading', { name: 'Payments & billing' })).toBeInTheDocument()
    expect(screen.getByText('Being listed on Redeemo is free')).toBeInTheDocument()
    expect(screen.getByText(/nothing here is live or chargeable yet/i)).toBeInTheDocument()
  })

  it('/account is an honest being-built placeholder', () => {
    render(<MyAccountPage />)
    expect(screen.getByRole('heading', { name: 'My account' })).toBeInTheDocument()
    expect(screen.getByText('Being built')).toBeInTheDocument()
  })

  it('/help is honest and fabricates no contact channels', () => {
    render(<HelpPage />)
    expect(screen.getByRole('heading', { name: 'Help & support' })).toBeInTheDocument()
    expect(screen.getByText('Being built')).toBeInTheDocument()
    expect(screen.queryByText(/@redeemo/i)).not.toBeInTheDocument()
  })
})
