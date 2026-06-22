import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VoucherDetailPage from '@/app/(app)/vouchers/[id]/page'

// Day-2 Vouchers B5: the detail-page actions. DRAFT vouchers expose Edit / Submit /
// Delete; any voucher exposes Duplicate (client-orchestrated). Non-DRAFT vouchers
// HIDE Edit / Submit / Delete (the server also enforces). The UI never sends
// status/approvalStatus.

const getVoucher = jest.fn()
const submitVoucher = jest.fn()
const deleteVoucher = jest.fn()
const createVoucher = jest.fn()
jest.mock('@/lib/api/voucher', () => {
  const actual = jest.requireActual('@/lib/api/voucher')
  return {
    ...actual,
    getVoucher: (id: string) => getVoucher(id),
    submitVoucher: (id: string) => submitVoucher(id),
    deleteVoucher: (id: string) => deleteVoucher(id),
    createVoucher: (b: unknown) => createVoucher(b),
  }
})

const push = jest.fn()
const back = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, back }),
  useParams: () => ({ id: 'v1' }),
}))

jest.mock('@/lib/voucher/useVoucherCategoryName', () => ({
  useVoucherCategoryName: () => 'Food & Drink',
}))

// Use the REAL builder so the Edit/Duplicate prefill + the save path are exercised
// end-to-end (it renders the type fields + the Save/Submit buttons).
function voucher(over: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    title: 'Free coffee with breakfast',
    type: 'FREEBIE',
    status: 'DRAFT',
    approvalStatus: 'PENDING',
    estimatedSaving: 4,
    description: 'Enjoy a free coffee on us.',
    terms: 'One per visit',
    isRmv: false,
    createdAt: '2026-06-19T10:00:00.000Z',
    redemptionCount: 0,
    merchantFields: { builderType: 'freebie', draftFields: { type: 'freebie', freeItem: 'A coffee', freeWorth: 4 } },
    ...over,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <VoucherDetailPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  push.mockReset()
  back.mockReset()
  getVoucher.mockReset().mockResolvedValue(voucher())
  submitVoucher.mockReset().mockResolvedValue(voucher({ status: 'PENDING_APPROVAL' }))
  deleteVoucher.mockReset().mockResolvedValue({ deleted: true })
  createVoucher.mockReset().mockResolvedValue(voucher({ id: 'copy1' }))
})

describe('VoucherDetail actions (DRAFT)', () => {
  it('a DRAFT voucher exposes Edit / Submit / Delete / Duplicate', async () => {
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^duplicate$/i })).toBeInTheDocument()
  })

  it('Submit calls submitVoucher then refetches/back-navigates', async () => {
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    await waitFor(() => expect(submitVoucher).toHaveBeenCalledWith('v1'))
  })

  it('Delete asks for confirmation, then calls deleteVoucher and routes to /vouchers', async () => {
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    // A confirm dialog appears.
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /delete voucher/i }))
    await waitFor(() => expect(deleteVoucher).toHaveBeenCalledWith('v1'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/vouchers'))
  })

  it('Edit opens the builder prefilled (Save as draft visible)', async () => {
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(await screen.findByRole('button', { name: /save as draft/i })).toBeInTheDocument()
  })
})

describe('VoucherDetail actions (non-DRAFT)', () => {
  it('a LIVE voucher hides Edit / Submit / Delete but keeps Duplicate', async () => {
    getVoucher.mockResolvedValue(voucher({ status: 'ACTIVE', approvalStatus: 'APPROVED' }))
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /submit for review/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^duplicate$/i })).toBeInTheDocument()
  })

  it('an IN-REVIEW voucher hides Edit / Submit / Delete', async () => {
    getVoucher.mockResolvedValue(voucher({ status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' }))
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /submit for review/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull()
  })
})

describe('VoucherDetail Duplicate (client-orchestrated)', () => {
  it('Duplicate opens the builder; saving creates a new DRAFT titled "<title> (copy)"', async () => {
    getVoucher.mockResolvedValue(voucher({ status: 'ACTIVE', approvalStatus: 'APPROVED' }))
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    fireEvent.click(screen.getByRole('button', { name: /^duplicate$/i }))
    // The builder opens in create mode (Save as draft visible).
    const saveBtn = await screen.findByRole('button', { name: /save as draft/i })
    fireEvent.click(saveBtn)
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    const payload = createVoucher.mock.calls[0][0]
    expect(payload.title).toBe('Free coffee with breakfast (copy)')
    // Duplicate creates (never updates) and never sends status/approvalStatus.
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('approvalStatus')
  })
})
