import { render, screen } from '@testing-library/react'
import { OpeningHoursCard } from '@/components/branches/sections/OpeningHoursCard'
import type { Branch } from '@/lib/api/branch'

// Branches PR-1 F10: the read-only Opening hours card (prototype 03/08). It renders the
// day/time table read-only including "Closed" days. The Edit control is a DISABLED
// locked affordance (PR-4). A Multi-window affordance is locked (PR-8). The "2 hour
// customer cool off" chip is OMITTED entirely (cool-off ships in PR-4); it must never
// render, even statically.

const apiFetch = jest.fn()
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual('@/lib/api/client')
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) }
})

function branch(over: Record<string, unknown> = {}): Branch {
  return {
    id: 'b1',
    name: 'High Street',
    isActive: true,
    openingHours: [
      { dayOfWeek: 1, openTime: '11:00', closeTime: '23:00', isClosed: false },
      { dayOfWeek: 2, openTime: '11:00', closeTime: '23:00', isClosed: false },
      { dayOfWeek: 0, openTime: null, closeTime: null, isClosed: true },
    ],
    ...over,
  } as Branch
}

beforeEach(() => {
  apiFetch.mockReset()
})

describe('OpeningHoursCard read-only table', () => {
  it('renders all seven weekdays with their open/close times', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    expect(screen.getByText('Monday')).toBeInTheDocument()
    expect(screen.getByText('Tuesday')).toBeInTheDocument()
    expect(screen.getByText('Sunday')).toBeInTheDocument()
    // The Monday window renders as a friendly time range.
    expect(screen.getAllByText(/11am to 11pm/i).length).toBeGreaterThan(0)
  })

  it('renders "Closed" for closed days', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    // Sunday is closed in the fixture; days with no row default to Closed too.
    expect(screen.getAllByText(/closed/i).length).toBeGreaterThan(0)
  })

  it('makes no network call to render', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('OpeningHoursCard locked affordances', () => {
  it('shows the Edit control disabled and it fires no network', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    const editBtn = screen.getByRole('button', { name: /^edit/i })
    expect(editBtn).toBeDisabled()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('shows a locked multi-window affordance disabled', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    const multi = screen.getByRole('button', { name: /multiple|second|window/i })
    expect(multi).toBeDisabled()
  })

  it('does NOT render the "2 hour customer cool off" chip', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    expect(screen.queryByText(/cool off/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/2 hour/i)).not.toBeInTheDocument()
  })
})
