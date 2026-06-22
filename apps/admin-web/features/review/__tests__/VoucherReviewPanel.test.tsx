/**
 * VoucherReviewPanel (Day-2 Vouchers PR-C): self-contained VOUCHER review surface.
 *
 * Mocks useVoucherReview + the three mutation hooks so there is no network call;
 * the panel + its dialogs render unmocked. Tests cover: loading/error, voucher
 * display (title/type/status/description/saving/terms/customer-preview), the
 * askHelp flag, availability windows (TIME_LIMITED) + cooldown (REUSABLE), the
 * existing adminProposed diff, the capability-gated action bar, the Model 1
 * approve hint (go-live-now vs waiting), and the request-changes proposal form.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VoucherReviewPanel } from '../VoucherReviewPanel'
import type { VoucherReviewContext } from '@/lib/api/voucherReview'

// ── Mock the data hook + the three mutation hooks ─────────────────────────────

const mockedUseVoucherReview = jest.fn()
const mockApprove = { mutateAsync: jest.fn(), isPending: false, error: null }
const mockReject = { mutateAsync: jest.fn(), isPending: false, error: null }
const mockRequestChanges = { mutateAsync: jest.fn(), isPending: false, error: null }

jest.mock('@/lib/review/useVoucherReview', () => ({
  useVoucherReview: (...args: unknown[]) => mockedUseVoucherReview(...args),
  useApproveVoucher: jest.fn(() => mockApprove),
  useRejectVoucher: jest.fn(() => mockReject),
  useRequestVoucherChanges: jest.fn(() => mockRequestChanges),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<VoucherReviewContext> = {}): VoucherReviewContext {
  return {
    voucher: {
      id: 'v-1',
      title: '20% off all mains',
      type: 'DISCOUNT',
      status: 'PENDING_APPROVAL',
      approvalStatus: 'PENDING',
      description: 'Enjoy 20% off your main course.',
      terms: 'One per customer.',
      estimatedSaving: 6.5,
      expiryDate: null,
      cooldownSeconds: null,
      merchantFields: null,
      availabilityWindows: [],
      ...(overrides.voucher ?? {}),
    },
    merchant: overrides.merchant !== undefined ? overrides.merchant : { id: 'm-1', businessName: 'Acme Coffee', status: 'ACTIVE' },
    goLive: overrides.goLive ?? true,
  }
}

function mockReview(opts: {
  data?: VoucherReviewContext
  isLoading?: boolean
  isError?: boolean
  refetch?: () => void
} = {}) {
  mockedUseVoucherReview.mockReturnValue({
    data: opts.data,
    isLoading: opts.isLoading ?? false,
    isError: opts.isError ?? false,
    refetch: opts.refetch ?? jest.fn(),
  })
}

function renderPanel(props: { canRead?: boolean; canAction?: boolean } = {}) {
  return render(
    <VoucherReviewPanel
      approvalId="apr-1"
      canRead={props.canRead ?? true}
      canAction={props.canAction ?? true}
    />,
  )
}

afterEach(() => jest.clearAllMocks())

// ── Loading / error ─────────────────────────────────────────────────────────

describe('VoucherReviewPanel loading/error', () => {
  it('shows the loading state', () => {
    mockReview({ isLoading: true })
    renderPanel()
    expect(screen.getByTestId('voucher-review-loading')).toBeInTheDocument()
  })

  it('shows the error state and retries', () => {
    const refetch = jest.fn()
    mockReview({ isError: true, refetch })
    renderPanel()
    expect(screen.getByTestId('voucher-review-error')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('gates the fetch on canRead (passes enabled through to useVoucherReview)', () => {
    mockReview({ data: makeContext() })
    renderPanel({ canRead: false })
    expect(mockedUseVoucherReview).toHaveBeenCalledWith('apr-1', false)
  })
})

// ── Voucher display ───────────────────────────────────────────────────────────

describe('VoucherReviewPanel voucher display', () => {
  it('renders title, type, description, saving and terms', () => {
    mockReview({ data: makeContext() })
    renderPanel()
    const panel = screen.getByTestId('voucher-review-panel')
    expect(panel).toHaveTextContent('20% off all mains')
    expect(panel).toHaveTextContent('Discount')
    expect(panel).toHaveTextContent('Enjoy 20% off your main course.')
    expect(panel).toHaveTextContent('£6.50')
    expect(panel).toHaveTextContent('One per customer.')
  })

  it('renders the merchant business name', () => {
    mockReview({ data: makeContext() })
    renderPanel()
    expect(screen.getByTestId('voucher-review-panel')).toHaveTextContent('Acme Coffee')
  })

  it('renders a customer-preview card', () => {
    mockReview({ data: makeContext() })
    renderPanel()
    expect(screen.getByTestId('voucher-customer-preview')).toBeInTheDocument()
  })

  it('shows the askHelp flag when merchantFields.askHelp is true', () => {
    mockReview({
      data: makeContext({
        voucher: { ...makeContext().voucher, merchantFields: { askHelp: true } },
      }),
    })
    renderPanel()
    expect(screen.getByTestId('voucher-ask-help')).toBeInTheDocument()
  })

  it('does NOT show the askHelp flag when not set', () => {
    mockReview({ data: makeContext() })
    renderPanel()
    expect(screen.queryByTestId('voucher-ask-help')).not.toBeInTheDocument()
  })

  it('renders availability windows for a TIME_LIMITED voucher', () => {
    mockReview({
      data: makeContext({
        voucher: {
          ...makeContext().voucher,
          type: 'TIME_LIMITED',
          availabilityWindows: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00' }],
        },
      }),
    })
    renderPanel()
    const windows = screen.getByTestId('voucher-availability-windows')
    expect(windows).toBeInTheDocument()
    expect(windows).toHaveTextContent('09:00')
    expect(windows).toHaveTextContent('17:00')
  })

  it('renders the cooldown for a REUSABLE voucher', () => {
    mockReview({
      data: makeContext({
        voucher: { ...makeContext().voucher, type: 'REUSABLE', cooldownSeconds: 86400 },
      }),
    })
    renderPanel()
    expect(screen.getByTestId('voucher-cooldown')).toBeInTheDocument()
  })

  it('renders the existing adminProposed diff when present in merchantFields', () => {
    mockReview({
      data: makeContext({
        voucher: {
          ...makeContext().voucher,
          approvalStatus: 'CHANGES_REQUESTED',
          merchantFields: {
            adminProposed: { title: 'Sharper title', estimatedSaving: 7 },
            adminNote: 'Tightened the wording.',
          },
        },
      }),
    })
    renderPanel()
    const diff = screen.getByTestId('voucher-admin-proposed')
    expect(diff).toBeInTheDocument()
    expect(diff).toHaveTextContent('Sharper title')
  })
})

// ── Action bar gating ─────────────────────────────────────────────────────────

describe('VoucherReviewPanel action bar gating', () => {
  it('shows Approve / Reject / Request changes when canAction is true', () => {
    mockReview({ data: makeContext() })
    renderPanel({ canAction: true })
    expect(screen.getByTestId('voucher-review-actions')).toBeInTheDocument()
    expect(screen.getByTestId('voucher-approve-btn')).toBeInTheDocument()
    expect(screen.getByTestId('voucher-reject-btn')).toBeInTheDocument()
    expect(screen.getByTestId('voucher-request-changes-btn')).toBeInTheDocument()
  })

  it('hides the action bar entirely when canAction is false', () => {
    mockReview({ data: makeContext() })
    renderPanel({ canAction: false })
    expect(screen.queryByTestId('voucher-review-actions')).not.toBeInTheDocument()
  })
})

// ── Approve dialog + Model 1 hint ─────────────────────────────────────────────

describe('VoucherReviewPanel approve dialog', () => {
  it('opens the approve dialog with the go-live-now hint when goLive is true', () => {
    mockReview({ data: makeContext({ goLive: true }) })
    renderPanel()
    fireEvent.click(screen.getByTestId('voucher-approve-btn'))
    const dialog = screen.getByTestId('voucher-approve-dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveTextContent(/go live now/i)
  })

  it('opens the approve dialog with the waiting hint when goLive is false', () => {
    mockReview({ data: makeContext({ goLive: false, merchant: { id: 'm-1', businessName: 'Acme', status: 'PENDING_APPROVAL' } }) })
    renderPanel()
    fireEvent.click(screen.getByTestId('voucher-approve-btn'))
    const dialog = screen.getByTestId('voucher-approve-dialog')
    expect(dialog).toHaveTextContent(/go live when the merchant is live/i)
  })

  it('calls the approve mutation when confirmed, then closes the dialog and refetches', async () => {
    mockApprove.mutateAsync.mockResolvedValueOnce({ approved: true, goLive: true })
    const refetch = jest.fn()
    mockReview({ data: makeContext(), refetch })
    renderPanel()
    fireEvent.click(screen.getByTestId('voucher-approve-btn'))
    fireEvent.click(screen.getByTestId('voucher-approve-confirm'))
    // The approve hook fires; the other two mutation hooks must NOT.
    expect(mockApprove.mutateAsync).toHaveBeenCalledTimes(1)
    expect(mockReject.mutateAsync).not.toHaveBeenCalled()
    expect(mockRequestChanges.mutateAsync).not.toHaveBeenCalled()
    // On success: handleDialogSuccess closes the dialog (state update captured in
    // act via waitFor) and refetches the review context.
    await waitFor(() =>
      expect(screen.queryByTestId('voucher-approve-dialog')).not.toBeInTheDocument(),
    )
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

// ── Reject dialog ─────────────────────────────────────────────────────────────

describe('VoucherReviewPanel reject dialog', () => {
  it('opens the reject dialog, submits the reason, then closes the dialog and refetches', async () => {
    mockReject.mutateAsync.mockResolvedValueOnce({ rejected: true })
    const refetch = jest.fn()
    mockReview({ data: makeContext(), refetch })
    renderPanel()
    fireEvent.click(screen.getByTestId('voucher-reject-btn'))
    expect(screen.getByTestId('voucher-reject-dialog')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('voucher-reject-reason'), {
      target: { value: 'The saving claim is not accurate for this offer.' },
    })
    fireEvent.click(screen.getByTestId('voucher-reject-submit'))
    // The reject hook fires; the other two mutation hooks must NOT.
    expect(mockReject.mutateAsync).toHaveBeenCalledWith(
      'The saving claim is not accurate for this offer.',
    )
    expect(mockApprove.mutateAsync).not.toHaveBeenCalled()
    expect(mockRequestChanges.mutateAsync).not.toHaveBeenCalled()
    // On success: dialog closes (state update captured in act) and the context refetches.
    await waitFor(() =>
      expect(screen.queryByTestId('voucher-reject-dialog')).not.toBeInTheDocument(),
    )
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('disables reject submit until a sufficiently long reason is entered', () => {
    mockReview({ data: makeContext() })
    renderPanel()
    fireEvent.click(screen.getByTestId('voucher-reject-btn'))
    const submit = screen.getByTestId('voucher-reject-submit') as HTMLButtonElement
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByTestId('voucher-reject-reason'), {
      target: { value: 'Inaccurate saving claim.' },
    })
    expect(submit).not.toBeDisabled()
  })
})

// ── Request-changes (concierge) dialog ────────────────────────────────────────

describe('VoucherReviewPanel request-changes dialog', () => {
  it('sends a note-only request when no fields are edited, then closes and refetches', async () => {
    mockRequestChanges.mutateAsync.mockResolvedValueOnce({ changesRequested: true })
    const refetch = jest.fn()
    mockReview({ data: makeContext(), refetch })
    renderPanel()
    fireEvent.click(screen.getByTestId('voucher-request-changes-btn'))
    expect(screen.getByTestId('voucher-request-changes-dialog')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('voucher-rc-note'), {
      target: { value: 'Please add clearer terms before resubmitting.' },
    })
    fireEvent.click(screen.getByTestId('voucher-rc-submit'))
    // The request-changes hook fires; the other two mutation hooks must NOT.
    expect(mockRequestChanges.mutateAsync).toHaveBeenCalledWith({
      note: 'Please add clearer terms before resubmitting.',
    })
    expect(mockApprove.mutateAsync).not.toHaveBeenCalled()
    expect(mockReject.mutateAsync).not.toHaveBeenCalled()
    // On success: dialog closes (state update captured in act) and the context refetches.
    await waitFor(() =>
      expect(screen.queryByTestId('voucher-request-changes-dialog')).not.toBeInTheDocument(),
    )
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('sends only the edited allow-listed fields as proposed', async () => {
    mockRequestChanges.mutateAsync.mockResolvedValueOnce({ changesRequested: true })
    const refetch = jest.fn()
    mockReview({ data: makeContext(), refetch })
    renderPanel()
    fireEvent.click(screen.getByTestId('voucher-request-changes-btn'))
    // Edit the title + the saving; leave description/terms unchanged.
    fireEvent.change(screen.getByTestId('voucher-rc-title'), {
      target: { value: 'A sharper title' },
    })
    fireEvent.change(screen.getByTestId('voucher-rc-saving'), {
      target: { value: '7.5' },
    })
    fireEvent.change(screen.getByTestId('voucher-rc-note'), {
      target: { value: 'Suggested a sharper title and a more accurate saving.' },
    })
    fireEvent.click(screen.getByTestId('voucher-rc-submit'))
    expect(mockRequestChanges.mutateAsync).toHaveBeenCalledWith({
      proposed: { title: 'A sharper title', estimatedSaving: 7.5 },
      note: 'Suggested a sharper title and a more accurate saving.',
    })
    // On success: dialog closes (state update captured in act) and the context refetches.
    await waitFor(() =>
      expect(screen.queryByTestId('voucher-request-changes-dialog')).not.toBeInTheDocument(),
    )
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('disables the request-changes submit until a note is entered', () => {
    mockReview({ data: makeContext() })
    renderPanel()
    fireEvent.click(screen.getByTestId('voucher-request-changes-btn'))
    const submit = screen.getByTestId('voucher-rc-submit') as HTMLButtonElement
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByTestId('voucher-rc-note'), {
      target: { value: 'A note long enough.' },
    })
    expect(submit).not.toBeDisabled()
  })
})
