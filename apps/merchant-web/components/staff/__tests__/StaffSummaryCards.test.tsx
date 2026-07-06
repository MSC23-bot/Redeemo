/**
 * Fidelity-polish RTL tests for the three Staff & Access summary cards.
 *
 * Covers the People-card headline bug fix (total, not active-only), its sub-line
 * (including the 0-deactivated case), and the new Portal-users / App-users
 * allowance progress bars (built from the existing PORTAL_CAP/APP_CAP data).
 */
import { render, screen } from '@testing-library/react'
import { StaffSummaryCards, type StaffCounts } from '@/components/staff/StaffSummaryCards'
import { PORTAL_CAP, APP_CAP } from '@/lib/staff/display'

function counts(over: Partial<StaffCounts> = {}): StaffCounts {
  return {
    peopleTotal: 8,
    peopleActive: 7,
    peopleDeactivated: 1,
    portalUsed: 4,
    appUsed: 6,
    ...over,
  }
}

describe('StaffSummaryCards People card (headline miscount fix)', () => {
  it('shows the TOTAL people count as the headline (active + deactivated), not active-only', () => {
    render(<StaffSummaryCards counts={counts({ peopleTotal: 8, peopleActive: 7, peopleDeactivated: 1 })} />)
    // Before the fix this would show "7" (active only); now it must show the total "8".
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.queryByText('7')).toBeNull()
  })

  it('reads "{active} active, {deactivated} deactivated" when there is at least one deactivated person', () => {
    render(<StaffSummaryCards counts={counts({ peopleTotal: 5, peopleActive: 3, peopleDeactivated: 2 })} />)
    expect(screen.getByText('3 active, 2 deactivated')).toBeInTheDocument()
  })

  it('reads just "{active} active" (never drops the active figure) when nobody is deactivated', () => {
    render(<StaffSummaryCards counts={counts({ peopleTotal: 4, peopleActive: 4, peopleDeactivated: 0 })} />)
    expect(screen.getByText('4 active')).toBeInTheDocument()
    expect(screen.queryByText(/deactivated/)).toBeNull()
  })
})

describe('StaffSummaryCards allowance progress bars', () => {
  it('renders a progress bar for Portal users using the used/PORTAL_CAP data, with "N places left"', () => {
    render(<StaffSummaryCards counts={counts({ portalUsed: 4 })} />)
    const bars = screen.getAllByRole('progressbar')
    const portalBar = bars.find((b) => b.getAttribute('aria-valuemax') === String(PORTAL_CAP))
    expect(portalBar).toBeDefined()
    expect(portalBar).toHaveAttribute('aria-valuenow', '4')
    expect(screen.getByText(`${PORTAL_CAP - 4} places left`)).toBeInTheDocument()
  })

  it('renders a progress bar for App users using the used/APP_CAP data, with "N places left"', () => {
    render(<StaffSummaryCards counts={counts({ appUsed: 6 })} />)
    const bars = screen.getAllByRole('progressbar')
    const appBar = bars.find((b) => b.getAttribute('aria-valuemax') === String(APP_CAP))
    expect(appBar).toBeDefined()
    expect(appBar).toHaveAttribute('aria-valuenow', '6')
    expect(screen.getByText(`${APP_CAP - 6} places left`)).toBeInTheDocument()
  })

  it('never renders a progress bar on the People card (only Portal/App users get one)', () => {
    render(<StaffSummaryCards counts={counts()} />)
    // Exactly two progress bars total: Portal users + App users.
    expect(screen.getAllByRole('progressbar')).toHaveLength(2)
  })

  it('caps the bar fill at 100% when used meets or exceeds the cap', () => {
    render(<StaffSummaryCards counts={counts({ portalUsed: PORTAL_CAP })} />)
    expect(screen.getByText('0 places left')).toBeInTheDocument()
  })
})

describe('StaffSummaryCards allowance banner (unchanged behavior)', () => {
  it('still shows the limit-reached banner when a cap is full', () => {
    render(<StaffSummaryCards counts={counts({ portalUsed: PORTAL_CAP })} />)
    expect(screen.getByRole('status')).toHaveTextContent(/reached your portal user limit/i)
  })
})
