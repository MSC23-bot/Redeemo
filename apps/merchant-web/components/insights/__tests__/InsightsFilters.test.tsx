/**
 * PR-B Task B3: the Insights global filter bar.
 *
 * Covers: the six period presets (screenshot 03); the custom From/To MONTH picker
 * (screenshot 04) that ALLOWS the current incomplete month (marked in progress, no
 * comparison chip); a scope-aware branch filter; the seven voucher types incl.
 * DISCOUNT; and that a filter change produces the correct serialised query object.
 *
 * The branch filter is scope-aware: a Branch Manager NEVER sees the owner "All
 * branches" label. One authorised branch -> "Viewing: <Branch>"; several -> "All my
 * branches". The owner sees "All branches".
 */
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { InsightsFilters } from '../InsightsFilters'
import { DEFAULT_FILTERS, type InsightsFilterState } from '@/lib/insights/filters'

const branches = [
  { id: 'b1', name: 'Old Foundry' },
  { id: 'b2', name: 'Riverside' },
  { id: 'b3', name: 'High Street' },
]

// A fixed "now" inside the current month under test so the in-progress assertions are
// deterministic regardless of when the suite runs.
const NOW = new Date('2026-06-15T12:00:00Z') // London current month 2026-06

function renderFilters(
  overrides: Partial<React.ComponentProps<typeof InsightsFilters>> = {},
) {
  const onChange = jest.fn()
  const props: React.ComponentProps<typeof InsightsFilters> = {
    state: DEFAULT_FILTERS,
    onChange,
    branches,
    isOwner: true,
    now: NOW,
    ...overrides,
  }
  render(<InsightsFilters {...props} />)
  return { onChange }
}

describe('period presets (screenshot 03)', () => {
  it('renders all six preset options in the menu', () => {
    renderFilters()
    fireEvent.click(screen.getByRole('button', { name: /this month/i }))
    const menu = screen.getByRole('menu', { name: /period/i })
    expect(within(menu).getByRole('menuitemradio', { name: 'This month' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Last month' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Last 3 months' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Last 6 months' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'All time' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Custom range' })).toBeInTheDocument()
  })

  it('selecting "Last month" emits the last_month period', () => {
    const { onChange } = renderFilters()
    fireEvent.click(screen.getByRole('button', { name: /this month/i }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Last month' }))
    expect(onChange).toHaveBeenCalledWith({ period: 'last_month' })
  })

  it('selecting each of the other presets emits its period value', () => {
    const cases: Array<[string, InsightsFilterState['period']]> = [
      ['Last 3 months', 'last_3m'],
      ['Last 6 months', 'last_6m'],
      ['All time', 'all'],
    ]
    for (const [label, period] of cases) {
      const { onChange } = renderFilters()
      fireEvent.click(screen.getByRole('button', { name: /this month/i }))
      fireEvent.click(screen.getByRole('menuitemradio', { name: label }))
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ period }))
      // Clean up between loop iterations so the next render is the only one in the DOM.
      cleanup()
    }
  })

  it('marks the active preset as checked', () => {
    renderFilters({ state: { period: 'last_3m' } })
    fireEvent.click(screen.getByRole('button', { name: /last 3 months/i }))
    expect(
      screen.getByRole('menuitemradio', { name: 'Last 3 months' }),
    ).toHaveAttribute('aria-checked', 'true')
  })
})

describe('comparison chip', () => {
  it('shows a "Compared with" chip on a completed preset (last month)', () => {
    renderFilters({ state: { period: 'last_month' } })
    expect(screen.getByText(/compared with/i)).toBeInTheDocument()
  })

  it('shows no comparison chip on this_month (in progress)', () => {
    renderFilters({ state: { period: 'this_month' } })
    expect(screen.queryByText(/compared with/i)).not.toBeInTheDocument()
    expect(screen.getByText(/in progress/i)).toBeInTheDocument()
  })

  it('shows no comparison chip on all time', () => {
    renderFilters({ state: { period: 'all' } })
    expect(screen.queryByText(/compared with/i)).not.toBeInTheDocument()
  })
})

describe('custom month range (screenshot 04)', () => {
  it('shows From and To MONTH inputs when custom is selected', () => {
    renderFilters({ state: { period: 'custom', from: '2025-11', to: '2026-05' } })
    const from = screen.getByLabelText(/from/i) as HTMLInputElement
    const to = screen.getByLabelText(/to/i) as HTMLInputElement
    expect(from.type).toBe('month')
    expect(to.type).toBe('month')
    expect(from.value).toBe('2025-11')
    expect(to.value).toBe('2026-05')
  })

  it('a custom range ending in a completed past month shows a comparison chip', () => {
    renderFilters({ state: { period: 'custom', from: '2025-11', to: '2026-05' } })
    expect(screen.getByText(/compared with/i)).toBeInTheDocument()
    expect(screen.queryByText(/in progress/i)).not.toBeInTheDocument()
  })

  it('ALLOWS a custom range ending in the current incomplete month: in progress, no chip', () => {
    renderFilters({ state: { period: 'custom', from: '2025-11', to: '2026-06' } })
    // The current month is selectable and accepted (no validation block).
    const to = screen.getByLabelText(/to/i) as HTMLInputElement
    expect(to.value).toBe('2026-06')
    expect(screen.getByText(/in progress/i)).toBeInTheDocument()
    expect(screen.queryByText(/compared with/i)).not.toBeInTheDocument()
  })

  it('the To input max is the current London month (current month allowed, future blocked)', () => {
    renderFilters({ state: { period: 'custom', from: '2025-11', to: '2026-06' } })
    const to = screen.getByLabelText(/to/i) as HTMLInputElement
    expect(to.max).toBe('2026-06')
  })

  it('changing the From month emits the custom state with the new from', () => {
    const { onChange } = renderFilters({
      state: { period: 'custom', from: '2025-11', to: '2026-05' },
    })
    fireEvent.change(screen.getByLabelText(/from/i), { target: { value: '2025-12' } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'custom', from: '2025-12', to: '2026-05' }),
    )
  })
})

describe('branch filter (scope-aware)', () => {
  it('owner sees the "All branches" option', () => {
    renderFilters({ isOwner: true })
    fireEvent.click(screen.getByRole('button', { name: /all branches/i }))
    const menu = screen.getByRole('menu', { name: /branch/i })
    expect(within(menu).getByRole('menuitemradio', { name: 'All branches' })).toBeInTheDocument()
  })

  it('owner: every branch is selectable in the menu', () => {
    renderFilters({ isOwner: true })
    fireEvent.click(screen.getByRole('button', { name: /all branches/i }))
    const menu = screen.getByRole('menu', { name: /branch/i })
    expect(within(menu).getByRole('menuitemradio', { name: 'Old Foundry' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Riverside' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'High Street' })).toBeInTheDocument()
  })

  it('selecting a branch emits its branchId', () => {
    const { onChange } = renderFilters({ isOwner: true })
    fireEvent.click(screen.getByRole('button', { name: /all branches/i }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Riverside' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'b2' }))
  })

  it('Branch Manager with several authorised branches: label is "All my branches", NOT "All branches"', () => {
    renderFilters({ isOwner: false, branches })
    expect(screen.getByRole('button', { name: /all my branches/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'All branches' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /all my branches/i }))
    const menu = screen.getByRole('menu', { name: /branch/i })
    expect(within(menu).getByRole('menuitemradio', { name: 'All my branches' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitemradio', { name: 'All branches' })).not.toBeInTheDocument()
  })

  it('Branch Manager with one authorised branch: label is "Viewing: <Branch>", no all-branches option', () => {
    renderFilters({ isOwner: false, branches: [{ id: 'b1', name: 'Old Foundry' }] })
    expect(screen.getByRole('button', { name: /viewing: old foundry/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /all branches/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /all my branches/i })).not.toBeInTheDocument()
  })
})

describe('voucher type filter (7 types incl. DISCOUNT)', () => {
  it('renders all seven voucher types plus an all-types option', () => {
    renderFilters()
    fireEvent.click(screen.getByRole('button', { name: /all voucher types/i }))
    const menu = screen.getByRole('menu', { name: /voucher type/i })
    // The LOCKED merchant-facing labels (spec 1.16): "Buy one, get one free",
    // "Spend & save" etc. NOT the sentence-cased shared-display labels.
    expect(within(menu).getByRole('menuitemradio', { name: 'All voucher types' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Buy one, get one free' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Spend & save' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Discount' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Freebie' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Package deal' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Time limited' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: 'Reusable' })).toBeInTheDocument()
  })

  it('selecting DISCOUNT emits voucherType DISCOUNT', () => {
    const { onChange } = renderFilters()
    fireEvent.click(screen.getByRole('button', { name: /all voucher types/i }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Discount' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ voucherType: 'DISCOUNT' }))
  })

  it('selecting "All voucher types" clears the voucherType from the state', () => {
    const { onChange } = renderFilters({ state: { period: 'this_month', voucherType: 'BOGO' } })
    // The trigger reads the locked BOGO label "Buy one, get one free".
    fireEvent.click(screen.getByRole('button', { name: /buy one, get one free/i }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'All voucher types' }))
    const arg = onChange.mock.calls.at(-1)?.[0] as InsightsFilterState
    expect(arg.voucherType).toBeUndefined()
  })
})

describe('preset change resets a stale custom range', () => {
  it('switching from custom to last_month drops from/to', () => {
    const { onChange } = renderFilters({
      state: { period: 'custom', from: '2025-11', to: '2026-05' },
    })
    fireEvent.click(screen.getByRole('button', { name: /custom range/i }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Last month' }))
    const arg = onChange.mock.calls.at(-1)?.[0] as InsightsFilterState
    expect(arg.period).toBe('last_month')
    expect(arg.from).toBeUndefined()
    expect(arg.to).toBeUndefined()
  })
})
