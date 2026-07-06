import { render, screen } from '@testing-library/react'
import { NotificationPreferencesCard } from '@/components/account/NotificationPreferencesCard'

// §BP-ACC staged-honesty pin: there is no notification-preference backend, so
// every toggle here must be inert (disabled + unchecked) and the card must never
// import or call any API client.
describe('NotificationPreferencesCard (staged, no backend)', () => {
  it('shows the honest "being switched on" note', () => {
    render(<NotificationPreferencesCard />)
    expect(screen.getByText(/being switched on/i)).toBeInTheDocument()
    expect(screen.getByText(/nothing below sends an email yet/i)).toBeInTheDocument()
  })

  it('renders Security alerts as an "Always on" badge, not a toggle', () => {
    render(<NotificationPreferencesCard />)
    expect(screen.getByText('Security alerts')).toBeInTheDocument()
    expect(screen.getByText('Always on')).toBeInTheDocument()
  })

  it('renders every preference switch disabled and unchecked', () => {
    render(<NotificationPreferencesCard />)
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBeGreaterThan(0)
    switches.forEach((el) => {
      expect(el).toBeDisabled()
      expect(el).toHaveAttribute('aria-checked', 'false')
    })
  })

  it('lists all 5 prototype rows', () => {
    render(<NotificationPreferencesCard />)
    expect(screen.getByText('Approval outcomes')).toBeInTheDocument()
    expect(screen.getByText('Voucher review results')).toBeInTheDocument()
    expect(screen.getByText('Redemption milestones')).toBeInTheDocument()
    expect(screen.getByText('Document requests')).toBeInTheDocument()
    expect(screen.getByText('News and offers from Redeemo')).toBeInTheDocument()
  })
})
