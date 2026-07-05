import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/client'
import BranchDetailPage from '@/app/(app)/branches/[id]/page'

// Branches PR-1 F3: the branch detail shell. Header (banner + logo + name +
// sub-brand businessName + status pill + Main-branch badge), the two review-state
// banners (photos awaiting review when a pendingEdit includesPhotos; awaiting
// location check when locationConfidence !== MANUALLY_CONFIRMED), loading, error /
// BRANCH_NOT_FOUND, and back navigation. The section cards (F4-F11) mount via
// TODO-by-task placeholders, so this shell test asserts only the F3 + F12 surface.

// --- branch read (useBranch) ------------------------------------------------
const getBranch = jest.fn()
jest.mock('@/lib/api/branch', () => {
  const actual = jest.requireActual('@/lib/api/branch')
  return {
    ...actual,
    getBranch: (id: string) => getBranch(id),
  }
})

// --- sub-brand (businessName) ----------------------------------------------
jest.mock('@/lib/auth/session', () => ({
  useSession: () => ({ isAuthenticated: true, businessName: 'Redeemo for Business' }),
}))
jest.mock('@/lib/auth/useMerchantProfile', () => ({
  useMerchantProfile: () => ({ data: { businessName: 'Redeemo for Business', status: 'ACTIVE' } }),
}))

// --- owner capability + staff card (F12 is mounted by the detail) -----------
// D-BM1: the capability now also carries `role` (the profile-derived source
// effectiveCanManage composes with the branch payload). `isOwner` still
// drives owner-only surfaces (StaffAtBranchCard, CloseBranchSection, the
// lifecycle banner); `role` drives the D-BM1 canManage-gated sections.
let capability: { isOwner: boolean; ready: boolean; role: string | null } = {
  isOwner: false,
  ready: true,
  role: null,
}
jest.mock('@/lib/branches/useBranchCapability', () => ({
  useBranchCapability: () => capability,
}))
// The F12 staff feeds are owner-gated; stub them empty so the panel (when it
// renders for an owner) shows the empty state without network.
jest.mock('@/lib/staff/useStaff', () => ({
  useStaff: () => ({ data: [] }),
  useBranchAppUsers: () => ({ data: { branches: [] } }),
}))

// --- router -----------------------------------------------------------------
const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: 'b1' }),
}))

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
    logoUrl: 'https://img/logo.png',
    bannerUrl: 'https://img/banner.png',
    openingHours: [],
    amenities: [],
    photos: [],
    pendingEdits: [],
    ...over,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // The detail composes the section cards (F4-F6), which use the toast primitive
  // for instant-save feedback; the real (app) layout wraps the page in a
  // ToastProvider, so the test harness mirrors that.
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BranchDetailPage />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  push.mockReset()
  capability = { isOwner: false, ready: true, role: null }
  getBranch.mockReset().mockResolvedValue(branch())
})

describe('BranchDetailPage states', () => {
  it('renders a loading state while the branch is in flight', () => {
    getBranch.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders a "Branch not found" state on BRANCH_NOT_FOUND with a back link', async () => {
    getBranch.mockRejectedValue(new ApiError(404, { error: { code: 'BRANCH_NOT_FOUND', message: 'nope' } }))
    renderPage()
    expect(await screen.findByText(/branch not found/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /back to branches/i }))
    expect(push).toHaveBeenCalledWith('/branches')
  })

  it('renders a generic error + Try again on a non-404 failure', async () => {
    getBranch.mockRejectedValue(new ApiError(500, { error: { code: 'SERVER_ERROR', message: 'boom' } }))
    renderPage()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})

describe('BranchDetailPage header', () => {
  it('renders the branch name, the sub-brand businessName, and a status pill', async () => {
    getBranch.mockResolvedValue(branch())
    renderPage()
    expect(await screen.findByRole('heading', { name: 'High Street' })).toBeInTheDocument()
    expect(screen.getByText('Redeemo for Business')).toBeInTheDocument()
    // Active branch reads as Open now / Active in the status pill.
    expect(screen.getByTestId('branch-status-pill')).toBeInTheDocument()
  })

  it('renders the Main branch badge when isMainBranch is true', async () => {
    getBranch.mockResolvedValue(branch({ isMainBranch: true }))
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    expect(screen.getByText(/main branch/i)).toBeInTheDocument()
  })

  it('does NOT render the Main branch badge when isMainBranch is false', async () => {
    getBranch.mockResolvedValue(branch({ isMainBranch: false }))
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    expect(screen.queryByText(/main branch/i)).not.toBeInTheDocument()
  })

  it('shows a Closed status pill for an inactive branch', async () => {
    getBranch.mockResolvedValue(branch({ isActive: false }))
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    // Scope to the status pill: the read-only opening-hours table also renders
    // "Closed" day cells, so assert the pill itself rather than a global text match.
    expect(screen.getByTestId('branch-status-pill')).toHaveTextContent(/closed/i)
  })
})

describe('BranchDetailPage review-state banners', () => {
  it('shows neither banner for an approved + confirmed branch', async () => {
    getBranch.mockResolvedValue(branch({ locationConfidence: 'MANUALLY_CONFIRMED', pendingEdits: [] }))
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    expect(screen.queryByTestId('banner-photos-review')).not.toBeInTheDocument()
    expect(screen.queryByTestId('banner-awaiting-location')).not.toBeInTheDocument()
  })

  it('shows the photos-awaiting-review banner with the in-review count', async () => {
    getBranch.mockResolvedValue(
      branch({
        pendingEdits: [
          {
            id: 'e1',
            branchId: 'b1',
            merchantId: 'm1',
            proposedChanges: { add: ['url1'] },
            includesPhotos: true,
            status: 'PENDING',
            createdAt: '2026-06-20T10:00:00.000Z',
          },
        ],
      }),
    )
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    const banner = screen.getByTestId('banner-photos-review')
    expect(banner).toHaveTextContent(/photos awaiting review/i)
    expect(banner).toHaveTextContent('1')
  })

  it('does NOT show the photos banner when the only pending edit is not a photo edit', async () => {
    getBranch.mockResolvedValue(
      branch({
        pendingEdits: [
          {
            id: 'e2',
            branchId: 'b1',
            merchantId: 'm1',
            proposedChanges: { name: 'New name' },
            includesPhotos: false,
            status: 'PENDING',
            createdAt: '2026-06-20T10:00:00.000Z',
          },
        ],
      }),
    )
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    expect(screen.queryByTestId('banner-photos-review')).not.toBeInTheDocument()
  })

  it('shows the awaiting-location banner when locationConfidence is not MANUALLY_CONFIRMED', async () => {
    getBranch.mockResolvedValue(branch({ locationConfidence: 'POSTCODE_CENTROID' }))
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    const banner = screen.getByTestId('banner-awaiting-location')
    expect(banner).toHaveTextContent(/checking the exact spot/i)
    expect(banner).toHaveTextContent(/nothing for you to do/i)
  })
})

describe('BranchDetailPage staff panel (F12 wiring)', () => {
  it('does NOT render the staff panel for a non-owner', async () => {
    capability = { isOwner: false, ready: true, role: null }
    getBranch.mockResolvedValue(branch())
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    expect(screen.queryByText(/staff at this branch/i)).not.toBeInTheDocument()
  })

  it('renders the staff panel for an owner', async () => {
    capability = { isOwner: true, ready: true, role: 'OWNER' }
    getBranch.mockResolvedValue(branch())
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    await waitFor(() => expect(screen.getByText(/staff at this branch/i)).toBeInTheDocument())
  })
})

describe('BranchDetailPage locked affordances (F13 wiring)', () => {
  it('composes the read-only location, hours and branding cards', async () => {
    capability = { isOwner: true, ready: true, role: 'OWNER' }
    getBranch.mockResolvedValue(branch())
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    expect(screen.getByTestId('branch-location-card')).toBeInTheDocument()
    expect(screen.getByTestId('branch-hours-card')).toBeInTheDocument()
    expect(screen.getByTestId('branch-branding-card')).toBeInTheDocument()
  })

  it('renders the redemption-alerts card (visible) with a LIVE owner toggle (PR-7)', async () => {
    capability = { isOwner: true, ready: true, role: 'OWNER' }
    getBranch.mockResolvedValue(branch())
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    const alerts = screen.getByTestId('branch-alerts-card')
    expect(alerts).toBeInTheDocument()
    // PR-7: the card is now a live per-branch on/off switch (no longer a disabled
    // locked affordance). The owner sees an enabled switch control.
    const toggle = within(alerts).getByRole('switch', {
      name: /redemption alerts for this branch/i,
    })
    expect(toggle).toBeEnabled()
  })

  it('renders the close-branch section for an owner with a disabled close control', async () => {
    capability = { isOwner: true, ready: true, role: 'OWNER' }
    getBranch.mockResolvedValue(branch())
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    const close = screen.getByTestId('branch-close-section')
    expect(close).toBeInTheDocument()
    expect(within(close).getByRole('button')).toBeDisabled()
  })

  it('hides the close-branch section for a non-owner', async () => {
    capability = { isOwner: false, ready: true, role: null }
    getBranch.mockResolvedValue(branch())
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    expect(screen.queryByTestId('branch-close-section')).not.toBeInTheDocument()
  })
})

describe('BranchDetailPage back navigation', () => {
  it('the back link routes to /branches', async () => {
    getBranch.mockResolvedValue(branch())
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    fireEvent.click(screen.getByRole('button', { name: /back to branches/i }))
    expect(push).toHaveBeenCalledWith('/branches')
  })
})

// D-BM1 (merged spec §5/§6/§9): end-to-end page-level wiring of the per-branch
// viewerCapabilities hint through effectiveCanManage into the D-BM1-gated
// sections. The malformed-block pin proves the page never throws even when
// the backend sends a garbage block (the branchSchema .catch(undefined)
// contract at the parse layer).
describe('BranchDetailPage D-BM1 viewerCapabilities wiring', () => {
  it('an assigned BRANCH_MANAGER with viewerCapabilities.canManage=true sees the D-BM1-gated PIN section', async () => {
    capability = { isOwner: false, ready: true, role: 'BRANCH_MANAGER' }
    getBranch.mockResolvedValue(branch({ viewerCapabilities: { canManage: true }, redemptionPinSet: true }))
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    expect(screen.getByText(/redemption pin/i)).toBeInTheDocument()
  })

  it('an assigned BRANCH_MANAGER with viewerCapabilities.canManage=false (or absent) does NOT see the PIN section', async () => {
    capability = { isOwner: false, ready: true, role: 'BRANCH_MANAGER' }
    getBranch.mockResolvedValue(branch({ viewerCapabilities: { canManage: false }, redemptionPinSet: true }))
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    expect(screen.queryByText(/redemption pin/i)).not.toBeInTheDocument()
  })

  it('does NOT crash when the branch payload carries a malformed viewerCapabilities block', async () => {
    capability = { isOwner: false, ready: true, role: 'BRANCH_MANAGER' }
    // Simulates what a malformed-present block resolves to once branchSchema's
    // `.catch(undefined)` has already run at the parse layer (§6) - absent, not
    // a garbage shape. The page must render normally either way.
    getBranch.mockResolvedValue(branch({ viewerCapabilities: undefined }))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'High Street' })).toBeInTheDocument()
    expect(screen.queryByText(/redemption pin/i)).not.toBeInTheDocument()
  })

  it('an OWNER keeps the PIN section even when viewerCapabilities is absent (owner arm never consults the branch block)', async () => {
    capability = { isOwner: true, ready: true, role: 'OWNER' }
    getBranch.mockResolvedValue(branch({ viewerCapabilities: undefined, redemptionPinSet: true }))
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    expect(screen.getByText(/redemption pin/i)).toBeInTheDocument()
  })
})
