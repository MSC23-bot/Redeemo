/**
 * Shell wave: MobileTabBar tests (prototype narrow-viewport bottom bar).
 * Curated subset Home / Vouchers / Redemptions / Insights with the same
 * role/capability filtering as the sidebar.
 */
import { render, screen } from '@testing-library/react'
import { MobileTabBar } from '../MobileTabBar'
import { mobileTabItems } from '../navItems'

let mockPathname = '/'
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }))

describe('MobileTabBar', () => {
  beforeEach(() => {
    mockPathname = '/'
  })

  it('renders Home / Vouchers / Redemptions and gates Insights on capability', () => {
    const { rerender } = render(<MobileTabBar role="OWNER" canViewInsights={false} />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Vouchers')).toBeInTheDocument()
    expect(screen.getByText('Redemptions')).toBeInTheDocument()
    expect(screen.queryByText('Insights')).not.toBeInTheDocument()
    rerender(<MobileTabBar role="OWNER" canViewInsights={true} />)
    expect(screen.getByText('Insights')).toBeInTheDocument()
  })

  it('drops Vouchers + Insights for STAFF', () => {
    render(<MobileTabBar role="STAFF" canViewInsights={false} />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Redemptions')).toBeInTheDocument()
    expect(screen.queryByText('Vouchers')).not.toBeInTheDocument()
    expect(screen.queryByText('Insights')).not.toBeInTheDocument()
  })

  it('marks the active tab with aria-current', () => {
    mockPathname = '/redemptions'
    render(<MobileTabBar role="OWNER" canViewInsights={true} />)
    expect(screen.getByText('Redemptions').closest('a')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Home').closest('a')).not.toHaveAttribute('aria-current')
  })
})

describe('mobileTabItems', () => {
  it('returns the full curated set for OWNER with insights', () => {
    expect(mobileTabItems('OWNER', true).map((t) => t.href)).toEqual(['/', '/vouchers', '/redemptions', '/insights'])
  })
  it('fails closed on unknown role for insights only', () => {
    expect(mobileTabItems(null, false).map((t) => t.href)).toEqual(['/', '/vouchers', '/redemptions'])
  })
})
