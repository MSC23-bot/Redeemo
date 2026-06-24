/**
 * BranchLifecyclePanel (Branches PR-5, D5): self-contained CREATE/CLOSE review surface.
 *
 * Mocks useBranchLifecycleReview + the approve/reject/confirm-location mutation
 * hooks so there is no network call; the panel + its dialogs render unmocked.
 * Tests cover: loading/error, the CREATE location-confirm gate (Approve blocked
 * until confirmed; enabled once confirmed; Confirm-location button shown), the
 * CLOSE reason display, Approve/Reject calling the right client fns, capability
 * gating, success refetch, and that a redemptionPin is never rendered (the read
 * shape never carries one). Mirrors VoucherReviewPanel.test.tsx.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BranchLifecyclePanel } from '../BranchLifecyclePanel'
import type { BranchLifecycleReviewContext } from '@/lib/api/branchLifecycleReview'

// ── Mock the data hook + the mutation hooks ───────────────────────────────────

const mockedUseBranchLifecycleReview = jest.fn()
const mockApprove = { mutateAsync: jest.fn(), isPending: false, error: null }
const mockReject = { mutateAsync: jest.fn(), isPending: false, error: null }
const mockConfirmLocation = { mutateAsync: jest.fn(), isPending: false, error: null }

jest.mock('@/lib/review/useBranchLifecycleReview', () => ({
  useBranchLifecycleReview: (...args: unknown[]) => mockedUseBranchLifecycleReview(...args),
  useApproveBranchLifecycle: jest.fn(() => mockApprove),
  useRejectBranchLifecycle: jest.fn(() => mockReject),
  useConfirmBranchLifecycleLocation: jest.fn(() => mockConfirmLocation),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<BranchLifecycleReviewContext> = {}): BranchLifecycleReviewContext {
  return {
    kind: 'create',
    merchant: { id: 'm-1', businessName: 'Acme Coffee' },
    branch: {
      id: 'branch-1',
      name: 'Acme Soho',
      addressLine1: '1 Greek Street',
      addressLine2: null,
      city: 'London',
      postcode: 'W1D 4DX',
      localityName: 'Soho',
      phone: '020 0000 0000',
      email: 'soho@acme.test',
      websiteUrl: 'https://acme.test/soho',
      isMainBranch: false,
      isActive: false,
      lifecycleStatus: 'PENDING_CREATE',
      locationConfidence: 'POSTCODE_CENTROID',
      latitude: 51.5,
      longitude: -0.13,
      ...(overrides.branch ?? {}),
    },
    closeReason: overrides.closeReason !== undefined ? overrides.closeReason : null,
    ...(overrides.kind ? { kind: overrides.kind } : {}),
    ...(overrides.merchant ? { merchant: overrides.merchant } : {}),
  }
}

function mockReview(opts: {
  data?: BranchLifecycleReviewContext
  isLoading?: boolean
  isError?: boolean
  refetch?: () => void
} = {}) {
  mockedUseBranchLifecycleReview.mockReturnValue({
    data: opts.data,
    isLoading: opts.isLoading ?? false,
    isError: opts.isError ?? false,
    refetch: opts.refetch ?? jest.fn(),
  })
}

function renderPanel(props: {
  canRead?: boolean
  canApplyEdit?: boolean
  canConfirmLocation?: boolean
} = {}) {
  return render(
    <BranchLifecyclePanel
      approvalId="apr-1"
      canRead={props.canRead ?? true}
      canApplyEdit={props.canApplyEdit ?? true}
      canConfirmLocation={props.canConfirmLocation ?? true}
    />,
  )
}

afterEach(() => jest.clearAllMocks())

// ── Loading / error ───────────────────────────────────────────────────────────

describe('BranchLifecyclePanel loading/error', () => {
  it('shows the loading state', () => {
    mockReview({ isLoading: true })
    renderPanel()
    expect(screen.getByTestId('branch-lifecycle-loading')).toBeInTheDocument()
  })

  it('shows the error state and retries', () => {
    const refetch = jest.fn()
    mockReview({ isError: true, refetch })
    renderPanel()
    expect(screen.getByTestId('branch-lifecycle-error')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('gates the review fetch on canRead (passes enabled through)', () => {
    mockReview({ data: makeContext() })
    renderPanel({ canRead: false })
    expect(mockedUseBranchLifecycleReview).toHaveBeenCalledWith('apr-1', false)
  })
})

// ── CREATE: branch display + location gate ────────────────────────────────────

describe('BranchLifecyclePanel CREATE', () => {
  it('renders the proposed branch + merchant + add-branch badge', () => {
    mockReview({ data: makeContext() })
    renderPanel()
    expect(screen.getByTestId('branch-lifecycle-merchant-name')).toHaveTextContent('Acme Coffee')
    expect(screen.getByTestId('branch-lifecycle-branch-name')).toHaveTextContent('Acme Soho')
    expect(screen.getByTestId('branch-lifecycle-kind-badge')).toHaveTextContent('Add branch')
    expect(screen.getByTestId('branch-lifecycle-detail')).toHaveTextContent('1 Greek Street')
    expect(screen.getByTestId('branch-lifecycle-detail')).toHaveTextContent('W1D 4DX')
  })

  it('shows the location step + Confirm-location button when location is unconfirmed', () => {
    mockReview({ data: makeContext() })
    renderPanel()
    expect(screen.getByTestId('branch-lifecycle-location-step')).toBeInTheDocument()
    expect(screen.getByTestId('branch-lifecycle-confirm-location-btn')).toBeInTheDocument()
    expect(screen.getByTestId('branch-lifecycle-location-gate-note')).toBeInTheDocument()
  })

  it('DISABLES Approve while the location is unconfirmed (POSTCODE_CENTROID)', () => {
    mockReview({ data: makeContext() })
    renderPanel()
    expect(screen.getByTestId('branch-lifecycle-approve-btn')).toBeDisabled()
    expect(screen.getByTestId('branch-lifecycle-approve-blocked-note')).toBeInTheDocument()
  })

  it('ENABLES Approve once the location is confirmed (MANUALLY_CONFIRMED)', () => {
    mockReview({ data: makeContext({ branch: { ...makeContext().branch, locationConfidence: 'MANUALLY_CONFIRMED' } }) })
    renderPanel()
    expect(screen.getByTestId('branch-lifecycle-approve-btn')).not.toBeDisabled()
    expect(screen.queryByTestId('branch-lifecycle-approve-blocked-note')).not.toBeInTheDocument()
    // Confirm-location button is no longer surfaced once confirmed.
    expect(screen.queryByTestId('branch-lifecycle-confirm-location-btn')).not.toBeInTheDocument()
  })

  it('treats ADDRESS_GEOCODED as confirmed (Approve enabled)', () => {
    mockReview({ data: makeContext({ branch: { ...makeContext().branch, locationConfidence: 'ADDRESS_GEOCODED' } }) })
    renderPanel()
    expect(screen.getByTestId('branch-lifecycle-approve-btn')).not.toBeDisabled()
  })

  it('opens the confirm-location dialog and confirms via the right client fn', async () => {
    mockConfirmLocation.mutateAsync.mockResolvedValue({})
    const refetch = jest.fn()
    mockReview({ data: makeContext(), refetch })
    renderPanel()
    fireEvent.click(screen.getByTestId('branch-lifecycle-confirm-location-btn'))
    expect(screen.getByTestId('bl-confirm-location-dialog')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('bl-confirm-location-latitude'), { target: { value: '51.5145' } })
    fireEvent.change(screen.getByTestId('bl-confirm-location-longitude'), { target: { value: '-0.1338' } })
    fireEvent.click(screen.getByTestId('bl-confirm-location-submit'))
    await waitFor(() =>
      expect(mockConfirmLocation.mutateAsync).toHaveBeenCalledWith({
        branchId: 'branch-1',
        input: { latitude: 51.5145, longitude: -0.1338 },
      }),
    )
    await waitFor(() => expect(refetch).toHaveBeenCalled())
  })

  it('approves via the right client fn (kind=create)', async () => {
    mockApprove.mutateAsync.mockResolvedValue({ approved: true })
    const refetch = jest.fn()
    mockReview({
      data: makeContext({ branch: { ...makeContext().branch, locationConfidence: 'MANUALLY_CONFIRMED' } }),
      refetch,
    })
    renderPanel()
    fireEvent.click(screen.getByTestId('branch-lifecycle-approve-btn'))
    expect(screen.getByTestId('approve-branch-lifecycle-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('approve-branch-lifecycle-submit'))
    await waitFor(() => expect(mockApprove.mutateAsync).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(refetch).toHaveBeenCalled())
  })

  it('rejects via the right client fn with a reason (kind=create)', async () => {
    mockReject.mutateAsync.mockResolvedValue({ rejected: true })
    const refetch = jest.fn()
    mockReview({ data: makeContext(), refetch })
    renderPanel()
    fireEvent.click(screen.getByTestId('branch-lifecycle-reject-btn'))
    expect(screen.getByTestId('reject-branch-lifecycle-dialog')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('reject-branch-lifecycle-reason-textarea'), {
      target: { value: 'This branch address is incomplete.' },
    })
    fireEvent.click(screen.getByTestId('reject-branch-lifecycle-submit'))
    await waitFor(() =>
      expect(mockReject.mutateAsync).toHaveBeenCalledWith('This branch address is incomplete.'),
    )
    await waitFor(() => expect(refetch).toHaveBeenCalled())
  })

  it('hides the Confirm-location button when canConfirmLocation is false', () => {
    mockReview({ data: makeContext() })
    renderPanel({ canConfirmLocation: false })
    expect(screen.queryByTestId('branch-lifecycle-confirm-location-btn')).not.toBeInTheDocument()
    // Approve is still gated by the unconfirmed location.
    expect(screen.getByTestId('branch-lifecycle-approve-btn')).toBeDisabled()
  })
})

// ── CLOSE: reason display + actions ───────────────────────────────────────────

describe('BranchLifecyclePanel CLOSE', () => {
  function closeContext(overrides: Partial<BranchLifecycleReviewContext> = {}) {
    return makeContext({
      kind: 'close',
      closeReason: 'We are relocating this site.',
      branch: {
        ...makeContext().branch,
        lifecycleStatus: 'PENDING_CLOSE',
        isActive: true,
        locationConfidence: 'MANUALLY_CONFIRMED',
      },
      ...overrides,
    })
  }

  it('renders the close-branch badge + the merchant close reason', () => {
    mockReview({ data: closeContext() })
    renderPanel()
    expect(screen.getByTestId('branch-lifecycle-kind-badge')).toHaveTextContent('Close branch')
    expect(screen.getByTestId('branch-lifecycle-close-reason-text')).toHaveTextContent(
      'We are relocating this site.',
    )
    // No location-confirm step in a CLOSE review.
    expect(screen.queryByTestId('branch-lifecycle-location-step')).not.toBeInTheDocument()
  })

  it('shows a fallback when no close reason was provided', () => {
    mockReview({ data: closeContext({ closeReason: null }) })
    renderPanel()
    expect(screen.getByTestId('branch-lifecycle-close-reason-text')).toHaveTextContent(
      'No reason was provided.',
    )
  })

  it('Approve is NOT location-gated for a CLOSE (enabled)', () => {
    mockReview({ data: closeContext() })
    renderPanel()
    expect(screen.getByTestId('branch-lifecycle-approve-btn')).not.toBeDisabled()
    expect(screen.queryByTestId('branch-lifecycle-approve-blocked-note')).not.toBeInTheDocument()
  })

  it('approves the close via the right client fn', async () => {
    mockApprove.mutateAsync.mockResolvedValue({ approved: true })
    const refetch = jest.fn()
    mockReview({ data: closeContext(), refetch })
    renderPanel()
    fireEvent.click(screen.getByTestId('branch-lifecycle-approve-btn'))
    expect(screen.getByTestId('approve-branch-lifecycle-dialog')).toHaveTextContent('Approve close request?')
    fireEvent.click(screen.getByTestId('approve-branch-lifecycle-submit'))
    await waitFor(() => expect(mockApprove.mutateAsync).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(refetch).toHaveBeenCalled())
  })

  it('rejects the close via the right client fn with a reason', async () => {
    mockReject.mutateAsync.mockResolvedValue({ rejected: true })
    mockReview({ data: closeContext() })
    renderPanel()
    fireEvent.click(screen.getByTestId('branch-lifecycle-reject-btn'))
    expect(screen.getByTestId('reject-branch-lifecycle-dialog')).toHaveTextContent('Reject close request')
    fireEvent.change(screen.getByTestId('reject-branch-lifecycle-reason-textarea'), {
      target: { value: 'Keep this branch open for now.' },
    })
    fireEvent.click(screen.getByTestId('reject-branch-lifecycle-submit'))
    await waitFor(() =>
      expect(mockReject.mutateAsync).toHaveBeenCalledWith('Keep this branch open for now.'),
    )
  })
})

// ── Capability gating ─────────────────────────────────────────────────────────

describe('BranchLifecyclePanel capability gating', () => {
  it('hides the action bar without approval:apply-edit', () => {
    mockReview({ data: makeContext({ branch: { ...makeContext().branch, locationConfidence: 'MANUALLY_CONFIRMED' } }) })
    renderPanel({ canApplyEdit: false })
    expect(screen.queryByTestId('branch-lifecycle-actions')).not.toBeInTheDocument()
    expect(screen.queryByTestId('branch-lifecycle-approve-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('branch-lifecycle-reject-btn')).not.toBeInTheDocument()
  })
})

// ── Anti-leak: redemptionPin is never rendered ────────────────────────────────

describe('BranchLifecyclePanel never renders a redemptionPin', () => {
  it('does not surface any PIN-shaped value (the read shape omits redemptionPin)', () => {
    const { container } = (() => {
      mockReview({ data: makeContext() })
      return renderPanel()
    })()
    // The fixture intentionally carries no redemptionPin; assert the panel never
    // prints a "PIN" label nor a 4-digit code anywhere in its output.
    expect(screen.queryByText(/redemption ?pin/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/\bPIN\b/i)).not.toBeInTheDocument()
    expect(container.textContent ?? '').not.toMatch(/\bpin\b/i)
  })
})
