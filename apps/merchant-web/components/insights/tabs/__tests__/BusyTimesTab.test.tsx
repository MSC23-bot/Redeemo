/**
 * PR-B Task B6b: the Insights Busy-times tab (spec 8 / 1.7, screenshot 09).
 *
 * Driven by /busy-times (intensity mode): a 7-day x 6-daypart grid of ordinal
 * intensity bands (0..3) ONLY, plus a server-provided busiest LOCATION (day+daypart,
 * never a count) or null.
 *
 * Locked deltas vs the prototype (spec 2.4):
 *   - SIX daypart columns covering 24h: Overnight / Morning / Lunch / Afternoon /
 *     Evening / Late. The prototype's FOUR columns + "Late morning" label are BANNED.
 *   - Intensity bands only: NO raw counts are rendered or reconstructable.
 *   - "Busiest: <day> <daypart>" badge from the server busiest LOCATION; omitted when
 *     busiest is null.
 */
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react'
import { BusyTimesTab } from '../BusyTimesTab'
import type { InsightsBusyTimes, InsightsFilters } from '@/lib/api/insights'

jest.mock('@/lib/api/insights', () => ({
  __esModule: true,
  getInsightsBusyTimes: jest.fn(),
}))

import { getInsightsBusyTimes } from '@/lib/api/insights'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockGet = getInsightsBusyTimes as jest.MockedFunction<typeof getInsightsBusyTimes>

/** A full 7x6 = 42-cell grid (Mon=0..Sun=6 rows, daypart 0..5 cols). */
function fullGrid(): InsightsBusyTimes {
  const grid: { day: number; daypart: number; intensity: number }[] = []
  for (let day = 0; day < 7; day += 1) {
    for (let daypart = 0; daypart < 6; daypart += 1) {
      grid.push({ day, daypart, intensity: (day + daypart) % 4 })
    }
  }
  return { mode: 'intensity', grid, busiest: { day: 5, daypart: 4 } } // Sat Evening
}

/** The D6-gated exact-mode payload: each cell adds a logged COUNT. */
function fullExactGrid(): InsightsBusyTimes {
  const grid: { day: number; daypart: number; logged: number; intensity: number }[] = []
  for (let day = 0; day < 7; day += 1) {
    for (let daypart = 0; daypart < 6; daypart += 1) {
      grid.push({ day, daypart, logged: day * 6 + daypart, intensity: (day + daypart) % 4 })
    }
  }
  return { mode: 'exact', grid, busiest: { day: 6, daypart: 5 } }
}

function renderTab(filters: InsightsFilters = { period: 'this_month' }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BusyTimesTab filters={filters} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockGet.mockReset()
  mockGet.mockResolvedValue(fullGrid())
})
afterEach(cleanup)

describe('BusyTimesTab', () => {
  it('renders all 42 intensity cells (7 days x 6 dayparts)', async () => {
    const { container } = renderTab()
    await screen.findByTestId('busy-times-card')
    const cells = container.querySelectorAll('[data-cell="true"]')
    expect(cells.length).toBe(42)
  })

  it('renders the SIX locked daypart labels (Overnight..Late)', async () => {
    renderTab()
    const card = await screen.findByTestId('busy-times-card')
    for (const label of ['Overnight', 'Morning', 'Lunch', 'Afternoon', 'Evening', 'Late']) {
      // Column header text appears in the SVG and the sr-only table; at least one each.
      expect(within(card).getAllByText(label).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('does NOT use the banned "Late morning" label / four-column model', async () => {
    const { container } = renderTab()
    await screen.findByTestId('busy-times-card')
    expect(container.textContent ?? '').not.toMatch(/late morning/i)
  })

  it('shows the busiest badge from the server location', async () => {
    renderTab()
    const badge = await screen.findByTestId('busy-times-busiest')
    // busiest { day:5, daypart:4 } -> Sat Evening
    expect(badge.textContent ?? '').toMatch(/Sat/)
    expect(badge.textContent ?? '').toMatch(/Evening/)
  })

  it('OMITS the busiest badge when busiest is null', async () => {
    mockGet.mockResolvedValue({ ...fullGrid(), busiest: null })
    renderTab()
    await screen.findByTestId('busy-times-card')
    expect(screen.queryByTestId('busy-times-busiest')).not.toBeInTheDocument()
  })

  it('renders an ALWAYS-VISIBLE legend of the four intensity bands (not colour-only)', async () => {
    renderTab()
    const legend = await screen.findByTestId('busy-times-legend')
    // The four band labels render as visible swatch + text pairs.
    for (const label of ['No redemptions', 'Quiet', 'Steady', 'Busy']) {
      expect(within(legend).getByText(label)).toBeInTheDocument()
    }
    // The legend is NOT inside the sr-only equivalent table (it is sighted-visible).
    expect(legend.closest('table')).toBeNull()
    expect(legend.closest('.sr-only')).toBeNull()
  })

  it('omits the legend when busy-times is gated (no grid to read)', async () => {
    mockGet.mockResolvedValue({ available: false })
    renderTab()
    await screen.findByTestId('busy-times-card')
    expect(screen.queryByTestId('busy-times-legend')).not.toBeInTheDocument()
  })

  it('exposes NO raw count (bands only; counts never rendered)', async () => {
    const { container } = renderTab()
    await screen.findByTestId('busy-times-card')
    const text = container.textContent ?? ''
    // The qualitative band words are allowed; raw integer counts are not. The grid is
    // built from intensities 0..3, so a stray "1"/"2"/"3" digit token would indicate a
    // count leak. Assert no digit-only token appears in the rendered text.
    expect(text).not.toMatch(/\b\d+\b/)
  })

  it('does NOT render the prototype "validated redemptions" figures caption (banned)', async () => {
    const { container } = renderTab()
    await screen.findByTestId('busy-times-card')
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/figures are validated redemptions/i)
  })

  it('wires a MetricInfo explainer on the busy-times card', async () => {
    renderTab()
    await screen.findByTestId('busy-times-card')
    const infoTriggers = screen
      .getAllByRole('button')
      .filter((b) => /about|how|what/i.test(b.getAttribute('aria-label') ?? ''))
    expect(infoTriggers.length).toBeGreaterThanOrEqual(1)
  })

  it('renders a calm "Not available" state when busy-times is gated', async () => {
    mockGet.mockResolvedValue({ available: false })
    renderTab()
    await screen.findByTestId('busy-times-card')
    expect(screen.getByText(/Not available/i)).toBeInTheDocument()
  })

  it('renders a loading state', () => {
    mockGet.mockReturnValue(new Promise(() => {}))
    renderTab()
    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })

  it('does NOT render exact counts in intensity mode (default; bands only)', async () => {
    renderTab()
    await screen.findByTestId('busy-times-card')
    expect(screen.queryByTestId('busy-times-exact-counts')).not.toBeInTheDocument()
  })

  it('renders exact counts ONLY in exact mode (the D6-gated payload)', async () => {
    mockGet.mockResolvedValue(fullExactGrid())
    renderTab()
    const exact = await screen.findByTestId('busy-times-exact-counts')
    // The Sat (day 6) Late (daypart 5) cell logged = 6*6 + 5 = 41.
    expect(within(exact).getByText('41')).toBeInTheDocument()
  })

  it('uses accurate exclusion copy in the explainer (no "removed records")', async () => {
    renderTab()
    const card = await screen.findByTestId('busy-times-card')
    const trigger = within(card)
      .getAllByRole('button')
      .find((b) => /about|how|what/i.test(b.getAttribute('aria-label') ?? ''))
    expect(trigger).toBeDefined()
    fireEvent.click(trigger as HTMLElement)
    const tip = await screen.findByRole('tooltip')
    expect(tip.textContent ?? '').toMatch(/deleted customers/i)
    expect(tip.textContent ?? '').not.toMatch(/removed records/i)
  })

  it('tooltip (intensity mode) shows the bands / no-exact-count explanation', async () => {
    renderTab() // default fixture is intensity mode
    const card = await screen.findByTestId('busy-times-card')
    const trigger = within(card)
      .getAllByRole('button')
      .find((b) => /about|how|what/i.test(b.getAttribute('aria-label') ?? ''))
    fireEvent.click(trigger as HTMLElement)
    const tip = await screen.findByRole('tooltip')
    expect(tip.textContent ?? '').toMatch(/not exact\s+counts/i)
    expect(tip.textContent ?? '').toMatch(/rather than exact numbers/i)
  })

  it('tooltip (exact mode) NEVER shows the intensity-only claim', async () => {
    mockGet.mockResolvedValue(fullExactGrid())
    renderTab()
    const card = await screen.findByTestId('busy-times-card')
    const trigger = within(card)
      .getAllByRole('button')
      .find((b) => /about|how|what/i.test(b.getAttribute('aria-label') ?? ''))
    fireEvent.click(trigger as HTMLElement)
    const tip = await screen.findByRole('tooltip')
    // Exact mode explains exact counts ARE shown...
    expect(tip.textContent ?? '').toMatch(/exact number of logged redemptions/i)
    // ...and never repeats the intensity-only (bands, not exact) claim.
    expect(tip.textContent ?? '').not.toMatch(/not exact\s+counts/i)
    expect(tip.textContent ?? '').not.toMatch(/rather than exact/i)
  })
})
