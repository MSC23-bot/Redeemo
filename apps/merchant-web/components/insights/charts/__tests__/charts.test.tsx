import { render, within } from '@testing-library/react'
import { BarSeries } from '../BarSeries'
import { Heatmap } from '../Heatmap'
import { ShareBar } from '../ShareBar'

// PR-B Task B2: the three hand-rolled SVG chart primitives. No charting dependency.
// Each chart must (a) render an <svg role="img"> with a summarising aria-label, and
// (b) expose a visually-hidden <table> equivalent for screen readers. The Heatmap
// must accept ONLY intensity bands (0..3), never a raw count, mirroring the PR-A
// busy-times privacy contract.

describe('BarSeries (trend: logged total + confirmed subset overlay)', () => {
  const data = [
    { label: 'Nov', logged: 31, confirmed: 28 },
    { label: 'Dec', logged: 40, confirmed: 35 },
    { label: 'Jan', logged: 6, confirmed: 6 },
    { label: 'Feb', logged: 43, confirmed: 40, inProgress: true },
  ]

  it('renders an accessible <svg role="img"> with an aria-label', () => {
    const { container } = render(<BarSeries data={data} />)
    const svg = container.querySelector('svg[role="img"]')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-label')
    expect(svg?.getAttribute('aria-label')?.length).toBeGreaterThan(0)
  })

  it('exposes a screen-reader <table> with a caption and one row per data point', () => {
    const { getByRole } = render(<BarSeries data={data} />)
    const table = getByRole('table')
    expect(within(table).getByText(/Nov/)).toBeInTheDocument()
    expect(within(table).getByText(/Feb/)).toBeInTheDocument()
    // logged + confirmed values are readable from the table
    expect(within(table).getByText('31')).toBeInTheDocument()
    expect(within(table).getByText('28')).toBeInTheDocument()
    // 4 data rows in the tbody
    const bodyRows = table.querySelectorAll('tbody tr')
    expect(bodyRows.length).toBe(4)
  })

  it('draws confirmed as a non-additive subset (confirmed bar height <= logged bar height)', () => {
    const { container } = render(<BarSeries data={[{ label: 'A', logged: 100, confirmed: 40 }]} />)
    const loggedRect = container.querySelector('rect[data-series="logged"]') as SVGRectElement
    const confirmedRect = container.querySelector('rect[data-series="confirmed"]') as SVGRectElement
    expect(loggedRect).toBeTruthy()
    expect(confirmedRect).toBeTruthy()
    const loggedH = Number(loggedRect.getAttribute('height'))
    const confirmedH = Number(confirmedRect.getAttribute('height'))
    expect(confirmedH).toBeLessThanOrEqual(loggedH)
    expect(confirmedH).toBeGreaterThan(0)
  })

  it('marks the in-progress bar via a data attribute (current month)', () => {
    const { container } = render(<BarSeries data={data} />)
    const inProgress = container.querySelectorAll('[data-in-progress="true"]')
    expect(inProgress.length).toBeGreaterThan(0)
  })

  it('renders an empty-state when there is no data (no svg, a message)', () => {
    const { container, getByText } = render(<BarSeries data={[]} />)
    expect(container.querySelector('svg')).toBeNull()
    expect(getByText(/no data/i)).toBeInTheDocument()
  })

  // Staging-acceptance A3 regression pin: a single-month low-count series must
  // render as a normal centered bar, never a near full-bleed solid block.
  it('caps the bar width for a tiny series (1 month, 3 redemptions): centered bar, visible baseline, not a full-bleed block', () => {
    const { container } = render(<BarSeries data={[{ label: 'Jun', logged: 3, confirmed: 1 }]} />)
    const loggedRect = container.querySelector('rect[data-series="logged"]') as SVGRectElement
    expect(loggedRect).toBeTruthy()
    const width = Number(loggedRect.getAttribute('width'))
    const x = Number(loggedRect.getAttribute('x'))
    // Capped width (64 logical units of the 720 viewBox), centered in the slot.
    expect(width).toBeLessThanOrEqual(64)
    expect(x).toBeCloseTo((720 - width) / 2, 5)
    // The baseline axis stays visible either side of the bar.
    const baseline = container.querySelector('line')
    expect(baseline).toBeTruthy()
    // And the value label ("3") still renders above the bar.
    expect(container.textContent).toContain('3')
  })

  it('leaves a typical 12-month series untouched by the width cap', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({ label: `M${i}`, logged: 10 + i, confirmed: 5 }))
    const { container } = render(<BarSeries data={twelve} />)
    const first = container.querySelector('rect[data-series="logged"]') as SVGRectElement
    // slot = 720/12 = 60; barW = 60 * 0.68 = 40.8 (< the 64 cap).
    expect(Number(first.getAttribute('width'))).toBeCloseTo(40.8, 5)
  })
})

describe('Heatmap (busy-times: 7 days x 6 dayparts, intensity bands only)', () => {
  // Mon=0..Sun=6 rows; daypart 0..5 cols. Every cell carries an intensity 0..3.
  function fullGrid(intensity = 0) {
    const grid: { day: number; daypart: number; intensity: number }[] = []
    for (let day = 0; day < 7; day++) {
      for (let daypart = 0; daypart < 6; daypart++) {
        grid.push({ day, daypart, intensity })
      }
    }
    return grid
  }

  it('renders 42 cells (7 days x 6 dayparts) as an accessible svg', () => {
    const { container } = render(<Heatmap grid={fullGrid(1)} />)
    const svg = container.querySelector('svg[role="img"]')
    expect(svg).toBeInTheDocument()
    const cells = container.querySelectorAll('rect[data-cell]')
    expect(cells.length).toBe(42)
  })

  it('exposes a <table> equivalent with the six locked owner-facing daypart labels', () => {
    const { getByRole } = render(<Heatmap grid={fullGrid(1)} />)
    const table = getByRole('table')
    // The six owner-facing labels (NOT the prototype four-column labels).
    for (const label of ['Overnight', 'Morning', 'Lunch', 'Afternoon', 'Evening', 'Late']) {
      expect(within(table).getByText(label)).toBeInTheDocument()
    }
    // Day rows Mon..Sun.
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(within(table).getByText(day)).toBeInTheDocument()
    }
  })

  it('colours cells by intensity band, NOT by a raw count', () => {
    const grid = fullGrid(0)
    // make one cell band 3
    grid[0] = { day: 0, daypart: 0, intensity: 3 }
    const { container } = render(<Heatmap grid={grid} />)
    const hot = container.querySelector('rect[data-cell][data-day="0"][data-daypart="0"]') as SVGRectElement
    const cold = container.querySelector('rect[data-cell][data-day="1"][data-daypart="0"]') as SVGRectElement
    expect(hot.getAttribute('data-intensity')).toBe('3')
    expect(cold.getAttribute('data-intensity')).toBe('0')
    // intensity drives the fill token, the two cells differ
    expect(hot.getAttribute('fill')).not.toBe(cold.getAttribute('fill'))
  })

  it('NEVER renders or exposes a raw count: the table cells carry band labels, not numbers', () => {
    const grid = fullGrid(2)
    const { getByRole } = render(<Heatmap grid={grid} />)
    const table = getByRole('table')
    // No data cell renders a bare integer count (the contract gives no counts).
    // The intensity is described qualitatively; assert no "logged"-style numeric leaks.
    const dataCells = table.querySelectorAll('tbody td')
    for (const td of Array.from(dataCells)) {
      // a band cell must not be a bare number like "2" (which would imply a count)
      expect(td.textContent).not.toMatch(/^\s*\d+\s*$/)
    }
  })

  it('highlights the busiest cell when given a busiest {day,daypart}', () => {
    const { container } = render(<Heatmap grid={fullGrid(1)} busiest={{ day: 5, daypart: 4 }} />)
    const cell = container.querySelector('rect[data-cell][data-day="5"][data-daypart="4"]') as SVGRectElement
    expect(cell.getAttribute('data-busiest')).toBe('true')
  })

  it('does not highlight any cell when busiest is null', () => {
    const { container } = render(<Heatmap grid={fullGrid(1)} busiest={null} />)
    expect(container.querySelector('rect[data-busiest="true"]')).toBeNull()
  })

  // Compile-time + runtime guard: the Heatmap props do not include a count.
  it('ignores any stray count-shaped field and renders by intensity only', () => {
    const grid = [
      // a malicious/forward-compat extra field must not change rendering
      { day: 0, daypart: 0, intensity: 1, logged: 9999 } as unknown as {
        day: number
        daypart: number
        intensity: number
      },
    ]
    const { container, queryByText } = render(<Heatmap grid={grid} />)
    const cell = container.querySelector('rect[data-cell][data-day="0"][data-daypart="0"]') as SVGRectElement
    expect(cell.getAttribute('data-intensity')).toBe('1')
    expect(queryByText('9999')).toBeNull()
  })
})

describe('ShareBar (by voucher type: single stacked bar + legend)', () => {
  const data = [
    { label: 'Buy one, get one free', value: 52 },
    { label: 'Freebie', value: 23 },
    { label: 'Reusable', value: 15 },
    { label: 'Spend & save', value: 10 },
  ]

  it('renders an accessible <svg role="img"> with an aria-label', () => {
    const { container } = render(<ShareBar segments={data} />)
    const svg = container.querySelector('svg[role="img"]')
    expect(svg).toBeInTheDocument()
    expect(svg?.getAttribute('aria-label')?.length).toBeGreaterThan(0)
  })

  it('renders one stacked segment per type whose widths are proportional to share', () => {
    const { container } = render(<ShareBar segments={data} />)
    const segs = container.querySelectorAll('rect[data-segment]')
    expect(segs.length).toBe(4)
    const first = Number((segs[0] as SVGRectElement).getAttribute('width'))
    const last = Number((segs[3] as SVGRectElement).getAttribute('width'))
    // 52 share segment is wider than the 10 share segment
    expect(first).toBeGreaterThan(last)
  })

  it('exposes a <table> equivalent and a legend with each type label and its share', () => {
    const { getByRole } = render(<ShareBar segments={data} />)
    const table = getByRole('table')
    expect(within(table).getByText('Freebie')).toBeInTheDocument()
    expect(within(table).getByText(/52%/)).toBeInTheDocument()
    const bodyRows = table.querySelectorAll('tbody tr')
    expect(bodyRows.length).toBe(4)
  })

  it('renders an empty-state when there are no segments', () => {
    const { container, getByText } = render(<ShareBar segments={[]} />)
    expect(container.querySelector('svg')).toBeNull()
    expect(getByText(/no data/i)).toBeInTheDocument()
  })
})

describe('reduced motion', () => {
  it('chart svgs do not declare an infinite/essential animation (no animate elements)', () => {
    const { container: a } = render(
      <BarSeries data={[{ label: 'A', logged: 1, confirmed: 1 }]} />,
    )
    const { container: b } = render(<Heatmap grid={[{ day: 0, daypart: 0, intensity: 1 }]} />)
    const { container: c } = render(<ShareBar segments={[{ label: 'A', value: 100 }]} />)
    expect(a.querySelector('animate')).toBeNull()
    expect(b.querySelector('animate')).toBeNull()
    expect(c.querySelector('animate')).toBeNull()
  })
})
