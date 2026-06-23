import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
let capability = { isOwner: false, ready: true }
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
  capability = { isOwner: false, ready: true }
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
    expect(screen.getByText(/closed/i)).toBeInTheDocument()
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
    capability = { isOwner: false, ready: true }
    getBranch.mockResolvedValue(branch())
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    expect(screen.queryByText(/staff at this branch/i)).not.toBeInTheDocument()
  })

  it('renders the staff panel for an owner', async () => {
    capability = { isOwner: true, ready: true }
    getBranch.mockResolvedValue(branch())
    renderPage()
    await screen.findByRole('heading', { name: 'High Street' })
    await waitFor(() => expect(screen.getByText(/staff at this branch/i)).toBeInTheDocument())
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
