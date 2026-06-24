import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { OpeningHoursCard } from '@/components/branches/sections/OpeningHoursCard'
import type { Branch } from '@/lib/api/branch'

// Branches PR-1 F10 + PR-4: the Opening hours card (prototype 03/08). It renders the
// CURRENT LIVE day/time table read-only (including "Closed" days), with the Today row
// highlighted.
//
// PR-4 makes the cool-off behaviour live:
//   - The Edit control is now a LIVE editor (was a disabled LockedAffordance). Save
//     STAGES via useStageBranchHours; it does not go live for 2 hours.
//   - The "2 hour customer cool off" chip RENDERS (was asserted ABSENT in PR-1).
//   - A pending-hours banner shows the proposed change + "go live at <time>" + an
//     owner Cancel wired to useCancelPendingHours.
//   - Edit + Cancel are OWNER-only client-side; STAFF / non-owner see read-only.
//   - "Add a second window" STAYS a disabled affordance (multi-window = PR-8).

// --- the PR-4 mutation hooks ------------------------------------------------
const stageMutateAsync = jest.fn()
const cancelMutateAsync = jest.fn()
let stagePending = false
let cancelPending = false
jest.mock('@/lib/branches/useBranches', () => ({
  useStageBranchHours: () => ({ mutateAsync: stageMutateAsync, isPending: stagePending }),
  useCancelPendingHours: () => ({ mutateAsync: cancelMutateAsync, isPending: cancelPending }),
}))

// --- toast ------------------------------------------------------------------
const toast = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))

// --- defensive: the card must NEVER hit the API client to render ------------
const apiFetch = jest.fn()
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual('@/lib/api/client')
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) }
})

const LIVE_HOURS = [
  { dayOfWeek: 1, openTime: '11:00', closeTime: '23:00', isClosed: false },
  { dayOfWeek: 2, openTime: '11:00', closeTime: '23:00', isClosed: false },
  { dayOfWeek: 0, openTime: null, closeTime: null, isClosed: true },
]

function branch(over: Record<string, unknown> = {}): Branch {
  return {
    id: 'b1',
    name: 'High Street',
    isActive: true,
    openingHours: LIVE_HOURS,
    ...over,
  } as Branch
}

// A staged pending change (proposed weekly hours + go-live time).
function pendingHours(over: Record<string, unknown> = {}) {
  return {
    id: 'ph1',
    proposedHours: [
      { dayOfWeek: 1, openTime: '10:00', closeTime: '18:00', isClosed: false },
      { dayOfWeek: 0, openTime: null, closeTime: null, isClosed: true },
    ],
    effectiveAt: '2026-06-24T16:30:00.000Z',
    status: 'PENDING' as const,
    ...over,
  }
}

beforeEach(() => {
  stageMutateAsync.mockReset().mockResolvedValue({ id: 'ph1', status: 'PENDING' })
  cancelMutateAsync.mockReset().mockResolvedValue({ ok: true })
  toast.mockReset()
  apiFetch.mockReset()
  stagePending = false
  cancelPending = false
})

describe('OpeningHoursCard read-only live table', () => {
  it('renders all seven weekdays with their open/close times', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    expect(screen.getByText('Monday')).toBeInTheDocument()
    expect(screen.getByText('Tuesday')).toBeInTheDocument()
    expect(screen.getByText('Sunday')).toBeInTheDocument()
    expect(screen.getAllByText(/11am to 11pm/i).length).toBeGreaterThan(0)
  })

  it('renders "Closed" for closed days', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    expect(screen.getAllByText(/closed/i).length).toBeGreaterThan(0)
  })

  it('makes no network call to render', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('OpeningHoursCard PR-4 cool-off chip + live Edit', () => {
  it('renders the "2 hour customer cool off" chip (was OMITTED in PR-1)', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    expect(screen.getByTestId('cool-off-chip')).toBeInTheDocument()
    expect(screen.getByText(/2 hour customer cool off/i)).toBeInTheDocument()
  })

  it('the Edit control is now a LIVE enabled button (was a disabled LockedAffordance)', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    const editBtn = screen.getByTestId('hours-edit')
    expect(editBtn).toBeEnabled()
  })

  it('opens the hours editor when Edit is clicked', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    fireEvent.click(screen.getByTestId('hours-edit'))
    expect(screen.getByTestId('hours-editor-modal')).toBeInTheDocument()
  })

  it('still shows the multi-window "Add a second window" affordance disabled (PR-8)', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    const multi = screen.getByRole('button', { name: /second window/i })
    expect(multi).toBeDisabled()
  })
})

describe('OpeningHoursCard owner gating', () => {
  it('OWNER sees the Edit control', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    expect(screen.getByTestId('hours-edit')).toBeInTheDocument()
  })

  it('STAFF / non-owner do NOT see Edit (read-only table only)', () => {
    render(<OpeningHoursCard branch={branch()} isOwner={false} />)
    expect(screen.queryByTestId('hours-edit')).not.toBeInTheDocument()
    // The live table still renders for everyone.
    expect(screen.getByText('Monday')).toBeInTheDocument()
    // The cool-off chip is informational, shown to everyone.
    expect(screen.getByTestId('cool-off-chip')).toBeInTheDocument()
  })

  it('STAFF / non-owner do NOT see the Cancel control even when a change is pending', () => {
    render(<OpeningHoursCard branch={branch({ pendingHours: [pendingHours()] })} isOwner={false} />)
    expect(screen.getByTestId('pending-hours-banner')).toBeInTheDocument()
    expect(screen.queryByTestId('pending-hours-cancel')).not.toBeInTheDocument()
  })
})

describe('OpeningHoursCard pending-hours banner', () => {
  it('does NOT render the banner when there is no pending change', () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    expect(screen.queryByTestId('pending-hours-banner')).not.toBeInTheDocument()
  })

  it('renders the banner with the proposed change + a "goes live at" time when pending', () => {
    render(<OpeningHoursCard branch={branch({ pendingHours: [pendingHours()] })} isOwner />)
    const banner = screen.getByTestId('pending-hours-banner')
    expect(banner).toBeInTheDocument()
    // The go-live time is rendered (Europe/London friendly format). The 16:30Z stages
    // at 17:30 BST on 24 Jun 2026; assert the date + the "go live" line is present.
    const golive = screen.getByTestId('pending-hours-golive')
    expect(golive.textContent).toMatch(/24 Jun 2026/)
    expect(within(banner).getByText(/go live at/i)).toBeInTheDocument()
    // The proposed Monday window (10am to 6pm) is shown inside the banner.
    expect(within(banner).getByText(/10am to 6pm/i)).toBeInTheDocument()
  })

  it('the LIVE table keeps showing the CURRENT live hours, not the pending', () => {
    render(<OpeningHoursCard branch={branch({ pendingHours: [pendingHours()] })} isOwner />)
    // The live Monday row still reads 11am to 11pm (the live hours), not 10am to 6pm.
    const liveMonday = screen.getByTestId('hours-row-1')
    expect(within(liveMonday).getByText(/11am to 11pm/i)).toBeInTheDocument()
  })
})

describe('OpeningHoursCard stage flow', () => {
  it('saving in the editor calls useStageBranchHours and shows the success toast', async () => {
    render(<OpeningHoursCard branch={branch()} isOwner />)
    fireEvent.click(screen.getByTestId('hours-edit'))
    fireEvent.click(screen.getByTestId('hours-editor-save'))
    await waitFor(() => expect(stageMutateAsync).toHaveBeenCalledTimes(1))
    // Staged with the branch id + a payload array (prefilled from the live hours).
    expect(stageMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b1', hours: expect.any(Array) }),
    )
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }))
  })

  it('the banner appears once the branch payload carries the staged pending row', () => {
    // Stage success invalidates ['branch', id]; the refetched branch carries
    // pendingHours, which is what drives the banner. Re-render with the pending row.
    const { rerender } = render(<OpeningHoursCard branch={branch()} isOwner />)
    expect(screen.queryByTestId('pending-hours-banner')).not.toBeInTheDocument()
    rerender(<OpeningHoursCard branch={branch({ pendingHours: [pendingHours()] })} isOwner />)
    expect(screen.getByTestId('pending-hours-banner')).toBeInTheDocument()
  })
})

describe('OpeningHoursCard cancel flow', () => {
  it('Cancel calls useCancelPendingHours and shows the success toast', async () => {
    render(<OpeningHoursCard branch={branch({ pendingHours: [pendingHours()] })} isOwner />)
    fireEvent.click(screen.getByTestId('pending-hours-cancel'))
    await waitFor(() => expect(cancelMutateAsync).toHaveBeenCalledWith('b1'))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }))
  })

  it('a stale / missing pending surfaces a calm error, not a crash', async () => {
    cancelMutateAsync.mockRejectedValueOnce(new Error('PENDING_HOURS_NOT_FOUND'))
    render(<OpeningHoursCard branch={branch({ pendingHours: [pendingHours()] })} isOwner />)
    fireEvent.click(screen.getByTestId('pending-hours-cancel'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert').textContent).toMatch(/could not cancel|already gone live/i)
    // No success toast on the error path.
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }))
  })
})
