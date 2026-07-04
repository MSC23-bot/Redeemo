import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RedemptionsPage from '@/app/(app)/redemptions/page'

// --- API client mock --------------------------------------------------------
const listRedemptions = jest.fn()
const downloadRedemptionsCsv = jest.fn((_f?: unknown) => Promise.resolve())
jest.mock('@/lib/api/redemptions', () => ({
  listRedemptions: (f: unknown) => listRedemptions(f),
  downloadRedemptionsCsv: (f: unknown) => downloadRedemptionsCsv(f),
  lookupRedemptionByCode: jest.fn(),
  validateRedemptionCode: jest.fn(),
}))

// Branches feed the branch filter selector.
const listBranches = jest.fn()
const listCustomVouchers = jest.fn()
const listFlagshipVouchers = jest.fn()
jest.mock('@/lib/api/voucher', () => ({
  listCustomVouchers: () => listCustomVouchers(),
  listFlagshipVouchers: () => listFlagshipVouchers(),
}))

jest.mock('@/lib/api/branch', () => ({
  listBranches: () => listBranches(),
}))

// The shared Validate dialog opener.
const openValidate = jest.fn()
jest.mock('@/components/redemptions/validateDialogContext', () => ({
  useValidateDialog: () => ({ openValidate }),
}))

// B-2: the page reads ?voucherId=<id> from the URL to apply the deep-link filter.
let searchParams = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}))

const ROW = {
  id: 'r1',
  redemptionCode: 'A7K2P9X4',
  voucher: { id: 'v1', title: 'Free coffee', type: 'FREEBIE' },
  branch: { id: 'b1', name: 'High Street' },
  customerName: 'Sarah K.',
  redeemedAt: '2026-06-21T10:00:00.000Z',
  status: 'AWAITING_VALIDATION',
  validatedAt: null,
  validationMethod: null,
  validatedByLabel: null,
  estimatedSaving: 3.5,
}
const VALIDATED_ROW = {
  ...ROW,
  id: 'r2',
  redemptionCode: 'B8L3Q1Y5',
  voucher: { id: 'v2', title: 'Lunch deal', type: 'DISCOUNT_PERCENT' },
  customerName: 'Tom B.',
  status: 'VALIDATED',
  validatedAt: '2026-06-21T11:00:00.000Z',
  validationMethod: 'MANUAL',
  validatedByLabel: 'Validated in the portal',
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <RedemptionsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  listCustomVouchers.mockReset().mockResolvedValue([])
  listFlagshipVouchers.mockReset().mockResolvedValue([])
  listRedemptions.mockReset()
  downloadRedemptionsCsv.mockReset().mockResolvedValue(undefined)
  listBranches.mockReset().mockResolvedValue([{ id: 'b1', name: 'High Street' }])
  openValidate.mockReset()
  searchParams = new URLSearchParams()
})

describe('RedemptionsPage (F1 log + filters)', () => {
  it('renders a loading state while the list is in flight', () => {
    listRedemptions.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders the redemptions table with status pills and merchant-safe fields', async () => {
    listRedemptions.mockResolvedValue({ items: [ROW, VALIDATED_ROW], total: 2, limit: 25, offset: 0 })
    renderPage()
    expect(await screen.findByText('Free coffee')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('A7K2 P9X4')).toBeInTheDocument()
    expect(within(table).getByText('Sarah K.')).toBeInTheDocument()
    expect(within(table).getByText(/awaiting validation/i)).toBeInTheDocument()
    expect(within(table).getByText(/^validated$/i)).toBeInTheDocument()
    expect(within(table).getByText('Validated in the portal')).toBeInTheDocument()
  })

  it('NEVER renders a full surname, email or phone', async () => {
    listRedemptions.mockResolvedValue({ items: [ROW], total: 1, limit: 25, offset: 0 })
    const { container } = renderPage()
    await screen.findByText('Free coffee')
    const text = container.textContent ?? ''
    expect(text).toContain('Sarah K.')
    expect(text).not.toMatch(/Khan|Smith|@|07\d{9}|\+44/)
  })

  it('renders the empty state when there are no redemptions', async () => {
    listRedemptions.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 })
    renderPage()
    expect(await screen.findByText(/redemptions appear once customers start redeeming/i)).toBeInTheDocument()
  })

  it('renders an error state when the list fails', async () => {
    listRedemptions.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText(/could not load your redemptions/i)).toBeInTheDocument()
  })

  it('a status filter change drives a new query (refetch with the filter)', async () => {
    listRedemptions.mockResolvedValue({ items: [ROW], total: 1, limit: 25, offset: 0 })
    renderPage()
    await screen.findByText('Free coffee')
    listRedemptions.mockClear()
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'validated' } })
    await waitFor(() =>
      expect(listRedemptions).toHaveBeenCalledWith(expect.objectContaining({ status: 'validated' })),
    )
  })

  it('a branch filter change drives a new query', async () => {
    listRedemptions.mockResolvedValue({ items: [ROW], total: 1, limit: 25, offset: 0 })
    renderPage()
    await screen.findByText('Free coffee')
    await waitFor(() => expect(listBranches).toHaveBeenCalled())
    listRedemptions.mockClear()
    fireEvent.change(screen.getByLabelText(/branch/i), { target: { value: 'b1' } })
    await waitFor(() =>
      expect(listRedemptions).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'b1' })),
    )
  })

  it('the Export CSV button uses the current filters and triggers a download', async () => {
    listRedemptions.mockResolvedValue({ items: [ROW], total: 1, limit: 25, offset: 0 })
    renderPage()
    await screen.findByText('Free coffee')
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }))
    await waitFor(() => expect(downloadRedemptionsCsv).toHaveBeenCalledTimes(1))
  })

  it('the "Validate a code" action opens the shared dialog', async () => {
    listRedemptions.mockResolvedValue({ items: [ROW], total: 1, limit: 25, offset: 0 })
    renderPage()
    await screen.findByText('Free coffee')
    fireEvent.click(screen.getByRole('button', { name: /validate a code/i }))
    expect(openValidate).toHaveBeenCalledTimes(1)
  })

  it('a row click opens the merchant-safe detail (full voucher, no contact field)', async () => {
    listRedemptions.mockResolvedValue({ items: [ROW], total: 1, limit: 25, offset: 0 })
    renderPage()
    const titleCell = await screen.findByText('Free coffee')
    fireEvent.click(titleCell.closest('tr')!)
    const detail = await screen.findByRole('dialog')
    expect(within(detail).getByText('A7K2 P9X4')).toBeInTheDocument()
    expect(within(detail).getByText('Sarah K.')).toBeInTheDocument()
    expect(within(detail).getByText('High Street')).toBeInTheDocument()
    expect(detail.textContent ?? '').not.toMatch(/@|07\d{9}|\+44|Khan/)
  })

  it('the Export CSV button passes the active filters (not the pagination)', async () => {
    listRedemptions.mockResolvedValue({ items: [ROW], total: 1, limit: 25, offset: 0 })
    renderPage()
    await screen.findByText('Free coffee')
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'validated' } })
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }))
    await waitFor(() =>
      expect(downloadRedemptionsCsv).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'validated' }),
      ),
    )
  })
})

describe('RedemptionsPage range=today deep-link (shell wave Quick Action)', () => {
  it('SAME-PAGE Quick Action: an in-place transition to range=today REPLACES the filters and resets a non-zero offset', async () => {
    // Codex correction 2 (re-review hardening): firing the Quick Action while
    // already on /redemptions keeps the page mounted; the param-transition
    // effect must apply the today filter, replacing whatever was set before,
    // AND reset real pagination (offset proven non-zero first).
    //
    // Freeze ONLY the clock (every timer function stays real so React Query +
    // waitFor keep working) and assert a LITERAL timestamp - independent of the
    // production todayFromIso() implementation this test verifies. The frozen
    // instant is local noon, so the local calendar date is unambiguous in any
    // timezone the suite runs in.
    jest.useFakeTimers({
      doNotFake: [
        'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        'setImmediate', 'clearImmediate', 'queueMicrotask', 'nextTick',
        'hrtime', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
        'requestIdleCallback', 'cancelIdleCallback',
      ],
    })
    jest.setSystemTime(new Date(2026, 6, 15, 12, 0, 0)) // local 15 Jul 2026, noon
    try {
      searchParams = new URLSearchParams('voucherId=v1')
      // total 60 > 2 pages so the Next button is enabled.
      listRedemptions.mockResolvedValue({ items: [ROW], total: 60, limit: 25, offset: 0 })
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const pageUi = () => (
        <QueryClientProvider client={qc}>
          <RedemptionsPage />
        </QueryClientProvider>
      )
      const view = render(pageUi())
      await screen.findByText('Free coffee')
      await waitFor(() =>
        expect(listRedemptions).toHaveBeenCalledWith(
          expect.objectContaining({ voucherId: 'v1', offset: 0 }),
        ),
      )
      // Paginate: the request offset becomes non-zero.
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      await waitFor(() =>
        expect(listRedemptions).toHaveBeenCalledWith(
          expect.objectContaining({ voucherId: 'v1', offset: 25 }),
        ),
      )
      // Quick Action fires in place: the URL gains range=today (no remount).
      searchParams = new URLSearchParams('range=today')
      view.rerender(pageUi())
      await waitFor(() => {
        const last = listRedemptions.mock.calls.at(-1)![0] as Record<string, unknown>
        expect(last.from).toBe('2026-07-15T00:00:00.000Z') // literal, from the frozen clock
        expect(last.voucherId).toBeUndefined() // REPLACED, not merged
        expect(last.offset).toBe(0) // pagination reset from 25
      })
      // Repeated rerenders with the param unchanged do NOT re-apply the filter
      // (transition-based, so later user edits are never clobbered).
      const callsAfter = listRedemptions.mock.calls.length
      view.rerender(pageUi())
      view.rerender(pageUi())
      expect(listRedemptions.mock.calls.length).toBe(callsAfter)
    } finally {
      jest.useRealTimers()
    }
  })

  it("seeds the From filter to today's local calendar date at UTC midnight (matches a manual pick)", async () => {
    // Frozen clock + literal expectation (independent of the production
    // todayFromIso implementation); only Date is faked, all timers stay real.
    jest.useFakeTimers({
      doNotFake: [
        'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        'setImmediate', 'clearImmediate', 'queueMicrotask', 'nextTick',
        'hrtime', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
        'requestIdleCallback', 'cancelIdleCallback',
      ],
    })
    jest.setSystemTime(new Date(2026, 6, 15, 12, 0, 0)) // local 15 Jul 2026, noon
    try {
      searchParams = new URLSearchParams('range=today')
      listRedemptions.mockResolvedValue({ items: [ROW], total: 1, limit: 25, offset: 0 })
      renderPage()
      await screen.findByText('Free coffee')
      // Serialized exactly like RedemptionFilters serializes a hand-picked From
      // date, so the date INPUT displays today's date in every timezone.
      await waitFor(() =>
        expect(listRedemptions).toHaveBeenCalledWith(
          expect.objectContaining({ from: '2026-07-15T00:00:00.000Z' }),
        ),
      )
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('RedemptionsPage voucherId deep-link (B-2)', () => {
  it('applies the ?voucherId= filter on first load', async () => {
    searchParams = new URLSearchParams('voucherId=v1')
    listRedemptions.mockResolvedValue({ items: [ROW], total: 1, limit: 25, offset: 0 })
    renderPage()
    await screen.findByText('Free coffee')
    await waitFor(() =>
      expect(listRedemptions).toHaveBeenCalledWith(expect.objectContaining({ voucherId: 'v1' })),
    )
  })

  it('shows a removable "Filtered to this voucher" chip that clears the filter', async () => {
    searchParams = new URLSearchParams('voucherId=v1')
    listRedemptions.mockResolvedValue({ items: [ROW], total: 1, limit: 25, offset: 0 })
    renderPage()
    await screen.findByText('Free coffee')
    const chip = await screen.findByRole('button', { name: /filtered to this voucher/i })
    expect(chip).toBeInTheDocument()
    listRedemptions.mockClear()
    fireEvent.click(chip)
    // Clearing the chip drops the voucherId from the query.
    await waitFor(() => expect(listRedemptions).toHaveBeenCalled())
    const lastCall = listRedemptions.mock.calls[listRedemptions.mock.calls.length - 1][0]
    expect(lastCall).not.toHaveProperty('voucherId')
    expect(screen.queryByRole('button', { name: /filtered to this voucher/i })).toBeNull()
  })

  it('shows no voucher chip when there is no ?voucherId=', async () => {
    listRedemptions.mockResolvedValue({ items: [ROW], total: 1, limit: 25, offset: 0 })
    renderPage()
    await screen.findByText('Free coffee')
    expect(screen.queryByRole('button', { name: /filtered to this voucher/i })).toBeNull()
  })
})

describe('voucher options partial-source resilience (Codex round 2)', () => {
  async function renderWithSources() {
    listRedemptions.mockResolvedValue({ items: [ROW], total: 1, limit: 25, offset: 0 })
    renderPage()
    await screen.findByText('Free coffee')
  }

  it('custom fails: flagship options remain (no raw error surfaced)', async () => {
    listCustomVouchers.mockRejectedValue(new Error('custom 500'))
    listFlagshipVouchers.mockResolvedValue([{ id: 'f1', title: 'Always free coffee' }])
    await renderWithSources()
    const select = await screen.findByLabelText(/^voucher$/i)
    const labels = Array.from((select as HTMLSelectElement).options).map((o) => o.label)
    expect(labels).toEqual(['All vouchers', 'Always free coffee'])
    expect(screen.queryByText(/custom 500/)).not.toBeInTheDocument()
  })

  it('flagship fails: custom options remain', async () => {
    listCustomVouchers.mockResolvedValue([{ id: 'c1', title: 'Lunch deal' }])
    listFlagshipVouchers.mockRejectedValue(new Error('flagship 403'))
    await renderWithSources()
    const select = await screen.findByLabelText(/^voucher$/i)
    const labels = Array.from((select as HTMLSelectElement).options).map((o) => o.label)
    expect(labels).toEqual(['All vouchers', 'Lunch deal'])
  })

  it('both fail: empty options keep the select hidden and the page alive', async () => {
    listCustomVouchers.mockRejectedValue(new Error('a'))
    listFlagshipVouchers.mockRejectedValue(new Error('b'))
    await renderWithSources()
    expect(screen.getByText('Free coffee')).toBeInTheDocument() // page unaffected
    expect(screen.queryByLabelText(/^voucher$/i)).not.toBeInTheDocument()
  })
})

describe('voucher filter options wiring (fidelity slice)', () => {
  it('merges custom + flagship vouchers into the Voucher filter, title-sorted', async () => {
    listCustomVouchers.mockResolvedValue([{ id: 'v2', title: 'Zesty lunch' }])
    listFlagshipVouchers.mockResolvedValue([{ id: 'v1', title: 'Always free coffee' }])
    listRedemptions.mockResolvedValue({ items: [ROW], total: 1, limit: 25, offset: 0 })
    renderPage()
    await screen.findByText('Free coffee')
    const select = await screen.findByLabelText(/^voucher$/i)
    const labels = Array.from((select as HTMLSelectElement).options).map((o) => o.label)
    expect(labels).toEqual(['All vouchers', 'Always free coffee', 'Zesty lunch'])
    fireEvent.change(select, { target: { value: 'v1' } })
    await waitFor(() =>
      expect(listRedemptions).toHaveBeenCalledWith(expect.objectContaining({ voucherId: 'v1', offset: 0 })),
    )
  })
})
