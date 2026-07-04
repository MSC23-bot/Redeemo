import { render, screen } from '@testing-library/react'
import { Sidebar, isNavItemActive } from '../Sidebar'

// Shell wave: the Sidebar reads the current route for active highlighting.
let mockPathname = '/'
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }))

const FULL_NAV = ['Vouchers', 'Redemptions', 'Branches', 'Staff & access', 'Business profile']
const BASELINE_ONLY_HIDDEN = ['Vouchers', 'Insights & reports', 'Branches', 'Staff & access', 'Business profile', 'Promote', 'Payments & billing']

describe('Sidebar', () => {
  beforeEach(() => {
    mockPathname = '/'
  })

  it('renders the brand lockup, Home, the standard nav groups, and pinned items (OWNER)', () => {
    render(<Sidebar role="OWNER" />)
    expect(screen.getByText('Redeemo')).toBeInTheDocument()
    expect(screen.getByText('for Business')).toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
    for (const label of ['Vouchers & customers', 'Locations & team', 'Business']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('My account')).toBeInTheDocument()
    expect(screen.getByText('Help & support')).toBeInTheDocument()
  })

  it('does NOT render the Documents nav item (folded into Business profile)', () => {
    render(<Sidebar role="OWNER" />)
    expect(screen.queryByText('Documents')).not.toBeInTheDocument()
  })

  it('wires the Branches nav entry to /branches (PR-1 F13)', () => {
    render(<Sidebar role="OWNER" />)
    const link = screen.getByText('Branches').closest('a')
    expect(link).toHaveAttribute('href', '/branches')
  })

  // Shell wave: the former '#' dead links now route to honest placeholder routes.
  it('routes Business profile, My account and Help & support to real routes (no dead links)', () => {
    render(<Sidebar role="OWNER" />)
    expect(screen.getByText('Business profile').closest('a')).toHaveAttribute('href', '/profile')
    expect(screen.getByText('My account').closest('a')).toHaveAttribute('href', '/account')
    expect(screen.getByText('Help & support').closest('a')).toHaveAttribute('href', '/help')
  })

  // Insights nav visibility (Staff & Access): only Owner + Branch Manager see Insights.
  it('shows Insights & reports when canViewInsights is true (Owner / Branch Manager)', () => {
    render(<Sidebar role="BRANCH_MANAGER" canViewInsights={true} />)
    const link = screen.getByText('Insights & reports').closest('a')
    expect(link).toHaveAttribute('href', '/insights')
    for (const label of FULL_NAV) expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('hides ONLY Insights & reports when canViewInsights is false on a full-nav role', () => {
    render(<Sidebar role="BRANCH_MANAGER" canViewInsights={false} />)
    expect(screen.queryByText('Insights & reports')).not.toBeInTheDocument()
    for (const label of FULL_NAV) expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('defaults to hiding Insights (fail closed) when no capability is passed', () => {
    render(<Sidebar role="OWNER" />)
    expect(screen.queryByText('Insights & reports')).not.toBeInTheDocument()
  })

  // Codex correction 3: role gating is a POSITIVE allowlist. Every non-full-nav
  // role state gets the least-privilege baseline: Home + Redemptions + pinned.
  describe('fail-closed role matrix', () => {
    function expectBaselineOnly() {
      expect(screen.getByText('Home')).toBeInTheDocument()
      expect(screen.getByText('Redemptions')).toBeInTheDocument()
      expect(screen.getByText('My account')).toBeInTheDocument()
      expect(screen.getByText('Help & support')).toBeInTheDocument()
      for (const hidden of BASELINE_ONLY_HIDDEN) {
        expect(screen.queryByText(hidden)).not.toBeInTheDocument()
      }
    }

    it('role null (loading / backend field not deployed) renders ONLY the baseline', () => {
      render(<Sidebar role={null} canViewInsights={false} />)
      expectBaselineOnly()
    })

    it('an unknown future role renders ONLY the baseline (never a wider view)', () => {
      render(<Sidebar role="AUDITOR" canViewInsights={false} />)
      expectBaselineOnly()
    })

    it('STAFF renders ONLY the baseline', () => {
      render(<Sidebar role="STAFF" canViewInsights={false} />)
      expectBaselineOnly()
    })

    it('an unknown role does not gain Insights even with canViewInsights=true (both gates required)', () => {
      render(<Sidebar role="AUDITOR" canViewInsights={true} />)
      expect(screen.queryByText('Insights & reports')).not.toBeInTheDocument()
    })

    it('BRANCH_MANAGER gets the full nav WITHOUT the Grow group', () => {
      render(<Sidebar role="BRANCH_MANAGER" canViewInsights={true} />)
      for (const label of FULL_NAV) expect(screen.getByText(label)).toBeInTheDocument()
      expect(screen.getByText('Insights & reports')).toBeInTheDocument()
      expect(screen.queryByText('Grow your business')).not.toBeInTheDocument()
    })

    it('OWNER gets everything, including the Grow group with Soon badges', () => {
      render(<Sidebar role="OWNER" canViewInsights={true} />)
      for (const label of FULL_NAV) expect(screen.getByText(label)).toBeInTheDocument()
      expect(screen.getByText('Grow your business')).toBeInTheDocument()
      expect(screen.getByText('Promote').closest('a')).toHaveAttribute('href', '/promote')
      expect(screen.getByText('Payments & billing').closest('a')).toHaveAttribute('href', '/billing')
      expect(screen.getAllByText('Soon').length).toBeGreaterThanOrEqual(2)
    })
  })

  // Shell wave: active-route highlighting via usePathname.
  it('marks the current route with aria-current="page" (subtree match)', () => {
    mockPathname = '/branches/b123'
    render(<Sidebar role="OWNER" />)
    expect(screen.getByText('Branches').closest('a')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Vouchers').closest('a')).not.toHaveAttribute('aria-current')
    expect(screen.getByText('Home').closest('a')).not.toHaveAttribute('aria-current')
  })

  it('Home is active ONLY on the exact root path', () => {
    mockPathname = '/'
    render(<Sidebar role="OWNER" />)
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('aria-current', 'page')
  })

  // Shell wave: 72px icon-only rail.
  it('collapsed mode hides labels, group titles and status text but keeps icon links + a11y names', () => {
    render(<Sidebar collapsed role="OWNER" />)
    expect(screen.queryByText('Vouchers & customers')).not.toBeInTheDocument()
    expect(screen.queryByText('Redeemo')).not.toBeInTheDocument()
    expect(screen.queryByText('Vouchers')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Vouchers' })).toHaveAttribute('href', '/vouchers')
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /business status/i })).toBeInTheDocument()
  })
})

describe('isNavItemActive', () => {
  it('matches root exactly and sections by subtree', () => {
    expect(isNavItemActive('/', '/')).toBe(true)
    expect(isNavItemActive('/vouchers', '/')).toBe(false)
    expect(isNavItemActive('/vouchers', '/vouchers')).toBe(true)
    expect(isNavItemActive('/vouchers/v1', '/vouchers')).toBe(true)
    expect(isNavItemActive('/vouchersx', '/vouchers')).toBe(false)
    expect(isNavItemActive(null, '/vouchers')).toBe(false)
  })
})
