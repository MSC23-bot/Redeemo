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
const updateVoucher = jest.fn()
jest.mock('@/lib/api/voucher', () => {
  const actual = jest.requireActual('@/lib/api/voucher')
  return {
    ...actual,
    getVoucher: (id: string) => getVoucher(id),
    submitVoucher: (id: string) => submitVoucher(id),
    deleteVoucher: (id: string) => deleteVoucher(id),
    createVoucher: (b: unknown) => createVoucher(b),
    updateVoucher: (id: string, b: unknown) => updateVoucher(id, b),
  }
})

const push = jest.fn()
const back = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, back }),
  useParams: () => ({ id: 'v1' }),
}))

// Shell wave: the capability seam now reads the session profile; these tests pin
// action behaviour, not the seam (covered by useVoucherCapability.test.ts).
jest.mock('@/lib/voucher/useVoucherCapability', () => ({
  useVoucherCapability: () => ({ canManage: true, ready: true }),
}))

jest.mock('@/lib/voucher/useVoucherCategoryName', () => ({
  useVoucherCategoryName: () => 'Food & Drink',
}))

// Slice E: the per-voucher analytics section is gated on canViewInsights and is not
// under test here; keep it hidden so it never fires its own analytics fetch.
jest.mock('@/lib/insights/useInsightsCapability', () => ({
  useInsightsCapability: () => ({ canViewInsights: false, ready: true }),
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

// A TIME_LIMITED draft that carries availability windows (PR-A getVoucher now
// returns them). Used to pin the B-1 window round-trip on edit + duplicate.
const TL_WINDOW = { dayOfWeek: 1, openTime: '14:00', closeTime: '17:00' }
function timeLimitedVoucher(over: Record<string, unknown> = {}) {
  return voucher({
    title: 'Happy hour',
    type: 'TIME_LIMITED',
    status: 'DRAFT',
    approvalStatus: 'PENDING',
    merchantFields: { builderType: 'time' },
    availabilityWindows: [TL_WINDOW],
    ...over,
  })
}

beforeEach(() => {
  push.mockReset()
  back.mockReset()
  getVoucher.mockReset().mockResolvedValue(voucher())
  submitVoucher.mockReset().mockResolvedValue(voucher({ status: 'PENDING_APPROVAL' }))
  deleteVoucher.mockReset().mockResolvedValue({ deleted: true })
  createVoucher.mockReset().mockResolvedValue(voucher({ id: 'copy1' }))
  updateVoucher.mockReset().mockResolvedValue(voucher({ id: 'v1' }))
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

  it('Submit calls submitVoucher then routes back to /vouchers', async () => {
    renderPage()
    await screen.findAllByText('Free coffee with breakfast')
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    await waitFor(() => expect(submitVoucher).toHaveBeenCalledWith('v1'))
    // B-9: the detail-page Submit routes back to the list on success.
    await waitFor(() => expect(push).toHaveBeenCalledWith('/vouchers'))
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

describe('VoucherDetail TIME_LIMITED window round-trip (B-1)', () => {
  it('editing a TIME_LIMITED voucher and saving a description-only change preserves the windows', async () => {
    getVoucher.mockResolvedValue(timeLimitedVoucher())
    renderPage()
    await screen.findAllByText('Happy hour')
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    // The builder opens prefilled. Change ONLY the description, then save the draft.
    const desc = await screen.findByPlaceholderText(/why they will love this offer/i)
    fireEvent.change(desc, { target: { value: 'A fresh new description for happy hour.' } })
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(updateVoucher).toHaveBeenCalledTimes(1))
    const [calledId, payload] = updateVoucher.mock.calls[0]
    expect(calledId).toBe('v1')
    // The PATCH carries the same windows (loaded), never [] (which would wipe them).
    expect(payload.availabilityWindows).toEqual([TL_WINDOW])
  })

  it('editing a TIME_LIMITED voucher whose windows were NOT loaded omits availabilityWindows on save', async () => {
    // The detail payload did NOT carry windows (null) - the PATCH must omit the key.
    getVoucher.mockResolvedValue(timeLimitedVoucher({ availabilityWindows: null }))
    renderPage()
    await screen.findAllByText('Happy hour')
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    const desc = await screen.findByPlaceholderText(/why they will love this offer/i)
    fireEvent.change(desc, { target: { value: 'A fresh new description.' } })
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(updateVoucher).toHaveBeenCalledTimes(1))
    const payload = updateVoucher.mock.calls[0][1]
    expect(payload).not.toHaveProperty('availabilityWindows')
  })

  it('duplicating a TIME_LIMITED voucher carries its windows into the new DRAFT', async () => {
    getVoucher.mockResolvedValue(timeLimitedVoucher({ status: 'ACTIVE', approvalStatus: 'APPROVED' }))
    renderPage()
    await screen.findAllByText('Happy hour')
    fireEvent.click(screen.getByRole('button', { name: /^duplicate$/i }))
    const saveBtn = await screen.findByRole('button', { name: /save as draft/i })
    fireEvent.click(saveBtn)
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    const payload = createVoucher.mock.calls[0][0]
    expect(payload.type).toBe('TIME_LIMITED')
    expect(payload.title).toBe('Happy hour (copy)')
    // The duplicate is submittable because it carries the windows the backend requires.
    expect(payload.availabilityWindows).toEqual([TL_WINDOW])
  })
})

describe('VoucherDetail Duplicate (client-orchestrated)', () => {
  it('Duplicate opens the builder; saving creates a new DRAFT titled "<title> (copy)" with the source type + fields', async () => {
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
    // B-8: the duplicate preserves the source TYPE (not just the copied title)...
    expect(payload.type).toBe('FREEBIE')
    // ...and a structured field round-trips through the persisted draftFields bag.
    expect(payload.merchantFields.builderType).toBe('freebie')
    expect(payload.merchantFields.draftFields).toMatchObject({ type: 'freebie', freeItem: 'A coffee' })
    // Duplicate creates (never updates) and never sends status/approvalStatus.
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('approvalStatus')
    expect(createVoucher).toHaveBeenCalledTimes(1)
    expect(updateVoucher).not.toHaveBeenCalled()
  })
})
