import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BranchesPage from '@/app/(app)/branches/page'

// Branches PR-1 F2: the Branches overview page. Three summary cards (Locations /
// Open right now / With Redeemo) derived from the single useBranches list payload
// (no per-branch fetch), a branch table (Branch / Today / Setup / Status), a
// locked "Add branch" affordance, and the loading / error / empty states. The
// With-Redeemo count is gated by the merchant-lifecycle guard: it is the true
// active + MANUALLY_CONFIRMED total only when the merchant is Live
// (profile.status === 'ACTIVE'), otherwise 0.

// --- branch list (useBranches) ---------------------------------------------
const listBranches = jest.fn()
jest.mock('@/lib/api/branch', () => {
  const actual = jest.requireActual('@/lib/api/branch')
  return {
    ...actual,
    listBranches: () => listBranches(),
  }
})

// --- merchant profile (lifecycle guard) -------------------------------------
let profileStatus = 'ACTIVE'
jest.mock('@/lib/auth/useMerchantProfile', () => ({
  useMerchantProfile: () => ({ data: { status: profileStatus, onboardingStep: 'LIVE' } }),
}))

// --- session (enabled flag for the profile query) ---------------------------
jest.mock('@/lib/auth/session', () => ({
  useSession: () => ({ isAuthenticated: true }),
}))

// --- owner capability (PR-5: gates the live Add-branch CTA) ------------------
let isOwner = true
jest.mock('@/lib/branches/useBranchCapability', () => ({
  useBranchCapability: () => ({ isOwner, ready: true }),
}))

// --- router -----------------------------------------------------------------
const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

// Open all week 09:00 -> 23:00 so openNow is deterministic at the fixed test clock.
function allDayHours() {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    openTime: '09:00',
    closeTime: '23:00',
    isClosed: false,
  }))
}

// A closed-every-day branch so the Open-now count excludes it.
function closedHours() {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, isClosed: true }))
}

function branch(over: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    name: 'High Street',
    isMainBranch: true,
    addressLine1: '12 High Street',
    city: 'Cambridge',
    postcode: 'CB2 1AB',
    isActive: true,
    locationConfidence: 'MANUALLY_CONFIRMED',
    openingHours: allDayHours(),
    amenities: [{ amenity: { id: 'a1', name: 'Wifi' } }],
    photos: [],
    redemptionPin: 'ENCRYPTED::aes::4821',
    ...over,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BranchesPage />
    </QueryClientProvider>,
  )
}

const FIXED_NOW = new Date('2026-06-23T12:00:00.000Z') // noon UTC, a Tuesday

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(FIXED_NOW)
  push.mockReset()
  profileStatus = 'ACTIVE'
  isOwner = true
  listBranches.mockReset().mockResolvedValue([])
})

afterEach(() => {
  jest.useRealTimers()
})

describe('BranchesPage states', () => {
  it('renders a loading state while the list is in flight', () => {
    listBranches.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders an error state with a Try again control', async () => {
    listBranches.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('refetches when Try again is pressed', async () => {
    listBranches.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([branch()])
    renderPage()
    await screen.findByRole('alert')
    listBranches.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(listBranches).toHaveBeenCalled())
  })

  it('renders the empty state with a (disabled) Add branch affordance', async () => {
    listBranches.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/no branches yet/i)).toBeInTheDocument()
  })
})

describe('BranchesPage summary cards', () => {
  it('Locations = branches.length', async () => {
    listBranches.mockResolvedValue([branch(), branch({ id: 'b2', name: 'Mill Road', isMainBranch: false })])
    renderPage()
    await screen.findByText('High Street')
    const card = screen.getByTestId('summary-locations')
    expect(within(card).getByText('2')).toBeInTheDocument()
  })

  it('Open right now counts only branches open at the current London time', async () => {
    listBranches.mockResolvedValue([
      branch({ id: 'b1', name: 'Open one', openingHours: allDayHours() }),
      branch({ id: 'b2', name: 'Closed one', isMainBranch: false, openingHours: closedHours() }),
    ])
    renderPage()
    await screen.findByText('Open one')
    const card = screen.getByTestId('summary-open-now')
    expect(within(card).getByText('1')).toBeInTheDocument()
  })

  it('Open right now excludes an inactive branch even with current/all-day hours (matches its Closed row)', async () => {
    listBranches.mockResolvedValue([
      branch({ id: 'b1', name: 'Inactive open-hours', isActive: false, openingHours: allDayHours() }),
    ])
    renderPage()
    const row = (await screen.findByText('Inactive open-hours')).closest('tr')!
    expect(within(row).getByText(/closed/i)).toBeInTheDocument()
    const card = screen.getByTestId('summary-open-now')
    expect(within(card).getByText('0')).toBeInTheDocument()
  })

  it('With Redeemo = active + MANUALLY_CONFIRMED count when the merchant is Live (ACTIVE)', async () => {
    profileStatus = 'ACTIVE'
    listBranches.mockResolvedValue([
      branch({ id: 'b1', name: 'Confirmed', isActive: true, locationConfidence: 'MANUALLY_CONFIRMED' }),
      branch({
        id: 'b2',
        name: 'Awaiting',
        isMainBranch: false,
        isActive: true,
        locationConfidence: 'POSTCODE_CENTROID',
      }),
    ])
    renderPage()
    await screen.findByText('Confirmed')
    const card = screen.getByTestId('summary-with-redeemo')
    expect(within(card).getByText('1')).toBeInTheDocument()
  })

  it('With Redeemo = 0 when the merchant is NOT Live (e.g. PENDING_APPROVAL)', async () => {
    profileStatus = 'PENDING_APPROVAL'
    listBranches.mockResolvedValue([
      branch({ id: 'b1', name: 'Confirmed', isActive: true, locationConfidence: 'MANUALLY_CONFIRMED' }),
    ])
    renderPage()
    await screen.findByText('Confirmed')
    const card = screen.getByTestId('summary-with-redeemo')
    expect(within(card).getByText('0')).toBeInTheDocument()
  })

  it('With Redeemo = 0 when the merchant is SUSPENDED', async () => {
    profileStatus = 'SUSPENDED'
    listBranches.mockResolvedValue([
      branch({ id: 'b1', name: 'Confirmed', isActive: true, locationConfidence: 'MANUALLY_CONFIRMED' }),
    ])
    renderPage()
    await screen.findByText('Confirmed')
    const card = screen.getByTestId('summary-with-redeemo')
    expect(within(card).getByText('0')).toBeInTheDocument()
  })
})

describe('BranchesPage rows', () => {
  it('renders a row with name, locality and a main-branch indicator', async () => {
    listBranches.mockResolvedValue([branch()])
    renderPage()
    const row = (await screen.findByText('High Street')).closest('tr')!
    expect(within(row).getByText(/cambridge/i)).toBeInTheDocument()
    expect(within(row).getByText(/main/i)).toBeInTheDocument()
  })

  it('shows the Setup PIN set indicator WITHOUT exposing the encrypted pin value', async () => {
    listBranches.mockResolvedValue([branch({ redemptionPin: 'ENCRYPTED::aes::4821' })])
    const { container } = renderPage()
    const row = (await screen.findByText('High Street')).closest('tr')!
    // The setup cell announces PIN is set, but never the value/ciphertext.
    expect(within(row).getByText(/^pin$/i)).toBeInTheDocument()
    const text = container.textContent ?? ''
    expect(text).not.toContain('ENCRYPTED::aes::4821')
    expect(text).not.toContain('4821')
    expect(text).not.toMatch(/redemptionPin/i)
  })

  it('shows a PIN not-set indicator when the branch has no pin', async () => {
    listBranches.mockResolvedValue([branch({ redemptionPin: null })])
    renderPage()
    const row = (await screen.findByText('High Street')).closest('tr')!
    expect(within(row).getByText(/no pin/i)).toBeInTheDocument()
  })

  it('shows the amenity count in the Setup cell', async () => {
    listBranches.mockResolvedValue([
      branch({ amenities: [{ amenity: { id: 'a1', name: 'Wifi' } }, { amenity: { id: 'a2', name: 'Parking' } }] }),
    ])
    renderPage()
    const row = (await screen.findByText('High Street')).closest('tr')!
    expect(within(row).getByText('2')).toBeInTheDocument()
  })

  it('renders the closed status for an inactive branch', async () => {
    listBranches.mockResolvedValue([branch({ isActive: false, openingHours: allDayHours() })])
    renderPage()
    const row = (await screen.findByText('High Street')).closest('tr')!
    expect(within(row).getByText(/closed/i)).toBeInTheDocument()
  })

  it('a row click navigates to the branch detail page', async () => {
    listBranches.mockResolvedValue([branch({ id: 'b9', name: 'Tappable branch' })])
    renderPage()
    const row = (await screen.findByText('Tappable branch')).closest('tr')!
    fireEvent.click(row)
    expect(push).toHaveBeenCalledWith('/branches/b9')
  })
})

describe('BranchesPage Add branch (PR-5 live owner-only CTA)', () => {
  it('renders a LIVE (enabled) Add branch CTA for the owner and opens the create modal', async () => {
    listBranches.mockResolvedValue([branch()])
    renderPage()
    await screen.findByText('High Street')
    const add = screen.getByTestId('add-branch-button')
    expect(add).toBeEnabled()
    fireEvent.click(add)
    expect(await screen.findByTestId('add-branch-modal')).toBeInTheDocument()
  })

  it('does NOT render the Add branch CTA for a non-owner (create is owner-only)', async () => {
    isOwner = false
    listBranches.mockResolvedValue([branch()])
    renderPage()
    await screen.findByText('High Street')
    expect(screen.queryByTestId('add-branch-button')).not.toBeInTheDocument()
  })

  it('does NOT render the Add branch CTA in the empty state for a non-owner', async () => {
    isOwner = false
    listBranches.mockResolvedValue([])
    renderPage()
    await screen.findByText(/no branches yet/i)
    expect(screen.queryByTestId('add-branch-button')).not.toBeInTheDocument()
  })
})

// F14 QA: prototype-fidelity copy, keyboard operability, and the narrow-viewport
// horizontal-scroll wrapper on the branch table.
describe('BranchesPage F14 (fidelity + a11y + responsive)', () => {
  it('renders the prototype subtitle copy verbatim ("save instantly")', () => {
    renderPage()
    // Prototype 01/12 reads "Hours, amenities, contact and PIN save instantly. ...".
    expect(screen.getByText(/PIN save instantly/i)).toBeInTheDocument()
  })

  it('navigates on Enter and Space when a row is keyboard-focused', async () => {
    listBranches.mockResolvedValue([branch({ id: 'b9', name: 'Keyboard branch' })])
    renderPage()
    const row = (await screen.findByText('Keyboard branch')).closest('tr')!
    expect(row).toHaveAttribute('role', 'button')
    expect(row).toHaveAttribute('tabIndex', '0')
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(push).toHaveBeenLastCalledWith('/branches/b9')
    push.mockClear()
    fireEvent.keyDown(row, { key: ' ' })
    expect(push).toHaveBeenLastCalledWith('/branches/b9')
  })

  it('wraps the branch table in a horizontal-scroll container for narrow viewports', async () => {
    listBranches.mockResolvedValue([branch()])
    const { container } = renderPage()
    await screen.findByText('High Street')
    const table = container.querySelector('table')!
    // The table sits inside an overflow-x-auto wrapper so a narrow viewport scrolls
    // it horizontally instead of clipping it under the Card's overflow-hidden.
    expect(table.closest('.overflow-x-auto')).not.toBeNull()
  })
})
