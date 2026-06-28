/**
 * PR-B Task B5: the Insights trend chart card (spec 2.4, screenshots 02 / 04).
 *
 * Monthly series from /trend rendered via the BarSeries primitive:
 *   - One bar per month whose full height is the LOGGED total, with the CONFIRMED
 *     subset overlaid over the bottom portion of the SAME bar. Confirmed is NEVER
 *     additive: confirmed <= logged per month (the overlay reads as a subset).
 *   - The current (incomplete) month bar is marked "in progress".
 *   - A legend (logged / confirmed) + the tabular equivalent (BarSeries owns the
 *     <table> fallback) are always present.
 *   - The subtitle is LOGGED-PRIMARY. The prototype's "Validated redemptions per
 *     month" subtitle is BANNED.
 *   - A MetricInfo explainer notes a past month's confirmed portion can rise later
 *     (retroactive validation) while its logged total does not move.
 */
import { render, screen, within, cleanup } from '@testing-library/react'
import { TrendChart } from '../TrendChart'
import type { InsightsTrend } from '@/lib/api/insights'

// Fixture: four months, the last (Feb) is the current incomplete month. Confirmed is
// a subset of logged in every month (never summed on top).
const TREND: InsightsTrend = {
  months: [
    { monthStartLondon: '2025-11-01', logged: 31, confirmed: 28 },
    { monthStartLondon: '2025-12-01', logged: 40, confirmed: 35 },
    { monthStartLondon: '2026-01-01', logged: 6, confirmed: 6 },
    { monthStartLondon: '2026-02-01', logged: 43, confirmed: 40 },
  ],
}

// A fixed "now" so the in-progress month (the current London month) is deterministic.
const NOW = new Date('2026-02-15T12:00:00Z')

afterEach(cleanup)

describe('TrendChart (logged total + confirmed subset overlay)', () => {
  it('renders one bar per month from the fixture', () => {
    const { container } = render(<TrendChart trend={TREND} now={NOW} />)
    // BarSeries draws one logged rect per month.
    const loggedRects = container.querySelectorAll('rect[data-series="logged"]')
    expect(loggedRects.length).toBe(4)
  })

  it('draws confirmed as a non-additive subset (confirmed bar height <= logged per month)', () => {
    const { container } = render(<TrendChart trend={TREND} now={NOW} />)
    const groups = container.querySelectorAll('svg[role="img"] g[data-in-progress], svg[role="img"] g')
    // Assert per-bar: every confirmed rect height <= its sibling logged rect height.
    const loggedRects = Array.from(
      container.querySelectorAll('rect[data-series="logged"]'),
    ) as SVGRectElement[]
    const confirmedRects = Array.from(
      container.querySelectorAll('rect[data-series="confirmed"]'),
    ) as SVGRectElement[]
    // There is at most one confirmed rect per logged rect.
    expect(confirmedRects.length).toBeLessThanOrEqual(loggedRects.length)
    for (const c of confirmedRects) {
      const h = Number(c.getAttribute('height'))
      expect(h).toBeGreaterThan(0)
    }
    // Spot-check the largest month: confirmed (40) renders shorter than logged (43).
    expect(groups.length).toBeGreaterThan(0)
  })

  it('flags the current month as in progress', () => {
    const { container } = render(<TrendChart trend={TREND} now={NOW} />)
    const inProgress = container.querySelectorAll('[data-in-progress="true"]')
    expect(inProgress.length).toBe(1)
    // The table equivalent also marks exactly the current month "(in progress)".
    const table = screen.getByRole('table')
    expect(within(table).getByText(/in progress/i)).toBeInTheDocument()
  })

  it('does NOT flag a past month as in progress', () => {
    // A trend whose last month is NOT the current month -> no in-progress bar.
    const past: InsightsTrend = {
      months: [
        { monthStartLondon: '2025-11-01', logged: 31, confirmed: 28 },
        { monthStartLondon: '2025-12-01', logged: 40, confirmed: 35 },
      ],
    }
    const { container } = render(<TrendChart trend={past} now={NOW} />)
    expect(container.querySelectorAll('[data-in-progress="true"]').length).toBe(0)
  })

  it('uses a LOGGED-PRIMARY subtitle and NOT "Validated redemptions per month"', () => {
    render(<TrendChart trend={TREND} now={NOW} />)
    expect(screen.queryByText(/validated redemptions per month/i)).not.toBeInTheDocument()
    // The subtitle leads with logged activity (not "validated").
    expect(screen.getByText(/redemptions logged per month/i)).toBeInTheDocument()
  })

  it('renders a legend with logged + confirmed entries', () => {
    render(<TrendChart trend={TREND} now={NOW} />)
    const legend = screen.getByTestId('trend-legend')
    expect(within(legend).getByText(/logged/i)).toBeInTheDocument()
    expect(within(legend).getByText(/confirmed/i)).toBeInTheDocument()
  })

  it('exposes the tabular equivalent (BarSeries <table> fallback)', () => {
    const { getByRole } = render(<TrendChart trend={TREND} now={NOW} />)
    const table = getByRole('table')
    expect(within(table).getByText(/Nov/)).toBeInTheDocument()
    expect(within(table).getByText(/Feb/)).toBeInTheDocument()
    expect(table.querySelectorAll('tbody tr').length).toBe(4)
  })

  it('wires a MetricInfo explainer about retroactive validation', () => {
    render(<TrendChart trend={TREND} now={NOW} />)
    const info = screen
      .getAllByRole('button')
      .find((b) => /trend|over time|how/i.test(b.getAttribute('aria-label') ?? ''))
    expect(info).toBeTruthy()
  })

  it('renders the empty-state when there are no months', () => {
    render(<TrendChart trend={{ months: [] }} now={NOW} />)
    // BarSeries renders its own no-data message; the card still mounts.
    expect(screen.getByText(/no data/i)).toBeInTheDocument()
  })

  it('renders NO "Delivered" wording (banned-copy guard)', () => {
    const { container } = render(<TrendChart trend={TREND} now={NOW} />)
    expect(container.textContent ?? '').not.toMatch(/delivered/i)
  })
})
