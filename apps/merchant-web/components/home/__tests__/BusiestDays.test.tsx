import { render, screen } from '@testing-library/react'
import { BusiestDays } from '../BusiestDays'
import type { InsightsBusyTimes } from '@/lib/api/insights'

// Staging-acceptance A3: the Home "Busiest days" card. Two pinned regressions:
//   1. Bars are PIXEL-sized against a fixed bar area: the previous
//      percentage-height bars resolved against an auto-height flex column and
//      collapsed to 0px, so a merchant with real activity saw a BLANK BOX with
//      only the day labels.
//   2. An available-but-all-zero intensity grid (and the unavailable payload)
//      renders the in-chart empty state, never a blank box.

function grid(cells: Array<{ day: number; daypart: number; intensity: number }>): InsightsBusyTimes {
  return {
    mode: 'intensity',
    grid: cells,
    busiest: null,
  } as InsightsBusyTimes
}

describe('BusiestDays (home-1 low-data chart)', () => {
  it('renders pixel-height bars for a low-count week (never 0px / percentage-of-auto collapse)', () => {
    const data = grid([
      { day: 2, daypart: 3, intensity: 1 },
      { day: 5, daypart: 4, intensity: 2 },
    ])
    render(<BusiestDays data={data} />)
    expect(screen.getByTestId('home-busiest-bars')).toBeInTheDocument()

    // The busiest day (Sat=5, summed intensity 2) fills the whole bar area.
    const sat = screen.getByTestId('home-busiest-bar-5')
    expect(sat.style.height).toBe('132px')
    // A quieter active day (Wed=2, summed intensity 1) is proportional: 66px.
    const wed = screen.getByTestId('home-busiest-bar-2')
    expect(wed.style.height).toBe('66px')
    // A zero day renders a small stub, not an invisible 0px bar.
    const mon = screen.getByTestId('home-busiest-bar-0')
    expect(mon.style.height).toBe('4px')
    // No bar is ever unset/0px (the blank-box regression).
    for (let day = 0; day < 7; day++) {
      const h = screen.getByTestId(`home-busiest-bar-${day}`).style.height
      expect(h).not.toBe('')
      expect(h).not.toBe('0px')
    }
  })

  it('enforces a visible floor for a tiny active day', () => {
    const data = grid([
      { day: 0, daypart: 1, intensity: 1 },
      { day: 6, daypart: 5, intensity: 30 },
    ])
    render(<BusiestDays data={data} />)
    // Mon's proportional height (1/30 of 132 = ~4px) is floored to 8px.
    expect(screen.getByTestId('home-busiest-bar-0').style.height).toBe('8px')
  })

  it('renders the in-chart empty state (not a blank box) when the grid is all-zero intensity', () => {
    const cells = []
    for (let day = 0; day < 7; day++) {
      for (let daypart = 0; daypart < 6; daypart++) cells.push({ day, daypart, intensity: 0 })
    }
    render(<BusiestDays data={grid(cells)} />)
    expect(screen.queryByTestId('home-busiest-bars')).not.toBeInTheDocument()
    const empty = screen.getByTestId('home-busiest-empty')
    expect(empty).toHaveTextContent('Your first redemptions will show here.')
  })

  it('renders the same empty state for the unavailable payload', () => {
    render(<BusiestDays data={{ available: false } as InsightsBusyTimes} />)
    expect(screen.getByTestId('home-busiest-empty')).toBeInTheDocument()
  })

  it('highlights the server-provided busiest day with the badge', () => {
    const data = {
      mode: 'intensity',
      grid: [{ day: 5, daypart: 4, intensity: 3 }],
      busiest: { day: 5, daypart: 4 },
    } as InsightsBusyTimes
    render(<BusiestDays data={data} />)
    expect(screen.getByTestId('home-busiest-badge')).toHaveTextContent(/saturday leads/i)
  })
})
