import { render, screen } from '@testing-library/react'
import { MerchantPortalShell } from '../MerchantPortalShell'

describe('MerchantPortalShell', () => {
  it('renders the sidebar nav, the top bar, and its children', () => {
    render(<MerchantPortalShell><p>page content</p></MerchantPortalShell>)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /validate a code/i })).toBeInTheDocument()
    expect(screen.getByText('page content')).toBeInTheDocument()
  })
})
