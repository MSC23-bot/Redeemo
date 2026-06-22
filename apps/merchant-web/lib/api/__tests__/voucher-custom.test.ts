import {
  listCustomVouchers,
  getVoucher,
  createVoucher,
  updateVoucher,
  submitVoucher,
  deleteVoucher,
  listFlagshipVouchers,
  type CreateVoucherPayload,
  type UpdateVoucherPayload,
} from '@/lib/api/voucher'

// Day-2 Vouchers B1: the RCV custom-voucher API client. Asserts the exact HTTP
// verbs/paths/bodies against the REAL merged PR-A backend
// (src/api/merchant/voucher/*). apiFetch is mocked.
//
// Backend contracts (read the real code, do not guess):
//   GET    /api/v1/merchant/vouchers          -> curated custom (RCV) rows incl
//          redemptionCount (NO merchantFields/code/availabilityWindows: detail-only).
//   GET    /api/v1/merchant/vouchers/:id       -> full custom voucher incl merchantFields.
//   POST   /api/v1/merchant/vouchers           -> create DRAFT.
//   PATCH  /api/v1/merchant/vouchers/:id        -> DRAFT-only partial update (merchantFields MERGES).
//   POST   /api/v1/merchant/vouchers/:id/submit -> DRAFT -> PENDING_APPROVAL.
//   DELETE /api/v1/merchant/vouchers/:id        -> DRAFT-only delete.
//   GET    /api/v1/merchant/vouchers/rmv        -> flagship rows incl redemptionCount.

const apiFetch = jest.fn()
jest.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}))

const CUSTOM_ROW = {
  id: 'v1',
  title: 'Free coffee with any breakfast',
  type: 'FREEBIE',
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  approvalComment: null,
  estimatedSaving: 4,
  description: 'Enjoy a free coffee on us.',
  terms: 'One per visit',
  isRmv: false,
  cooldownSeconds: null,
  publishedAt: '2026-06-20T10:00:00.000Z',
  expiryDate: null,
  approvedAt: '2026-06-20T11:00:00.000Z',
  createdAt: '2026-06-19T10:00:00.000Z',
  redemptionCount: 7,
}

beforeEach(() => {
  apiFetch.mockReset().mockResolvedValue(CUSTOM_ROW)
})

describe('listCustomVouchers', () => {
  it('GETs the curated custom rows with auth and maps redemptionCount', async () => {
    apiFetch.mockResolvedValueOnce([
      CUSTOM_ROW,
      { ...CUSTOM_ROW, id: 'v2', status: 'DRAFT', approvalStatus: 'PENDING', redemptionCount: 0 },
    ])
    const rows = await listCustomVouchers()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers', { method: 'GET', auth: true })
    expect(rows).toHaveLength(2)
    expect(rows[0].redemptionCount).toBe(7)
    expect(rows[0].approvalStatus).toBe('APPROVED')
    expect(rows[1].status).toBe('DRAFT')
  })

  it('coerces a Decimal-string estimatedSaving to a number', async () => {
    apiFetch.mockResolvedValueOnce([{ ...CUSTOM_ROW, estimatedSaving: '4.00' }])
    const rows = await listCustomVouchers()
    expect(rows[0].estimatedSaving).toBe(4)
  })

  it('tolerates a future passthrough field', async () => {
    apiFetch.mockResolvedValueOnce([{ ...CUSTOM_ROW, futureField: 'x' }])
    const rows = await listCustomVouchers()
    expect((rows[0] as Record<string, unknown>).futureField).toBe('x')
  })
})

describe('getVoucher', () => {
  it('GETs one custom voucher by id and parses merchantFields incl adminProposed/adminNote', async () => {
    apiFetch.mockResolvedValueOnce({
      ...CUSTOM_ROW,
      id: 'v9',
      status: 'DRAFT',
      approvalStatus: 'CHANGES_REQUESTED',
      merchantFields: {
        askHelp: true,
        builderType: 'freebie',
        adminProposed: { title: 'Better title', estimatedSaving: 6 },
        adminNote: 'Please raise the saving.',
      },
    })
    const v = await getVoucher('v9')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers/v9', { method: 'GET', auth: true })
    expect(v.approvalStatus).toBe('CHANGES_REQUESTED')
    const mf = v.merchantFields as Record<string, unknown>
    expect(mf.askHelp).toBe(true)
    expect((mf.adminProposed as Record<string, unknown>).title).toBe('Better title')
    expect(mf.adminNote).toBe('Please raise the saving.')
  })
})

describe('createVoucher', () => {
  it('POSTs the create body and NEVER sends status/approvalStatus/isRmv/merchantId', async () => {
    apiFetch.mockResolvedValueOnce({ ...CUSTOM_ROW, id: 'new1', status: 'DRAFT', approvalStatus: 'PENDING' })
    const payload: CreateVoucherPayload = {
      type: 'BOGO',
      title: 'Buy one main, get one free',
      estimatedSaving: 12,
      description: 'When you buy a main we give you a second one free.',
      terms: 'Both items in the same transaction',
      merchantFields: { builderType: 'bogo', bogoBuy: 'A main' },
    }
    const res = await createVoucher(payload)
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload),
    })
    const sent = JSON.parse((apiFetch.mock.calls[0][1] as { body: string }).body)
    expect(sent).not.toHaveProperty('status')
    expect(sent).not.toHaveProperty('approvalStatus')
    expect(sent).not.toHaveProperty('isRmv')
    expect(sent).not.toHaveProperty('merchantId')
    expect(res.id).toBe('new1')
  })

  it('carries TIME_LIMITED availabilityWindows and REUSABLE cooldownSeconds', async () => {
    await createVoucher({
      type: 'TIME_LIMITED',
      title: 'Quiet hour deal',
      estimatedSaving: 5,
      availabilityWindows: [{ dayOfWeek: 1, openTime: '14:00', closeTime: '17:00' }],
    })
    const sent = JSON.parse((apiFetch.mock.calls[0][1] as { body: string }).body)
    expect(sent.availabilityWindows[0].closeTime).toBe('17:00')

    apiFetch.mockClear()
    await createVoucher({ type: 'REUSABLE', title: 'Daily treat', estimatedSaving: 5, cooldownSeconds: 1800 })
    const sent2 = JSON.parse((apiFetch.mock.calls[0][1] as { body: string }).body)
    expect(sent2.cooldownSeconds).toBe(1800)
  })
})

describe('updateVoucher', () => {
  it('PATCHes a partial body (only the supplied keys)', async () => {
    apiFetch.mockResolvedValueOnce({ ...CUSTOM_ROW, id: 'v1', estimatedSaving: 8 })
    const payload: UpdateVoucherPayload = { estimatedSaving: 8 }
    await updateVoucher('v1', payload)
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers/v1', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(payload),
    })
    const sent = JSON.parse((apiFetch.mock.calls[0][1] as { body: string }).body)
    expect(sent).toEqual({ estimatedSaving: 8 })
    expect(sent).not.toHaveProperty('title')
  })

  it('sends a merchantFields bag (MERGED server-side)', async () => {
    await updateVoucher('v1', { merchantFields: { askHelp: false, builderType: 'bogo' } })
    const sent = JSON.parse((apiFetch.mock.calls[0][1] as { body: string }).body)
    expect(sent.merchantFields.askHelp).toBe(false)
  })
})

describe('submitVoucher', () => {
  it('POSTs the submit with no body and returns the flipped row', async () => {
    apiFetch.mockResolvedValueOnce({ ...CUSTOM_ROW, id: 'v1', status: 'PENDING_APPROVAL' })
    const res = await submitVoucher('v1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers/v1/submit', { method: 'POST', auth: true })
    expect(res.status).toBe('PENDING_APPROVAL')
  })
})

describe('deleteVoucher', () => {
  it('DELETEs the voucher by id', async () => {
    apiFetch.mockResolvedValueOnce({ deleted: true })
    const res = await deleteVoucher('v1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers/v1', { method: 'DELETE', auth: true })
    expect(res.deleted).toBe(true)
  })
})

describe('listFlagshipVouchers', () => {
  it('GETs the flagship RMV rows and maps redemptionCount', async () => {
    apiFetch.mockResolvedValueOnce([
      {
        id: 'rmv1',
        type: 'BOGO',
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        title: 'Flagship',
        estimatedSaving: 10,
        createdAt: '2026-06-19T10:00:00.000Z',
        redemptionCount: 3,
        rmvTemplate: { id: 'tmpl1' },
      },
    ])
    const rows = await listFlagshipVouchers()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers/rmv', { method: 'GET', auth: true })
    expect(rows[0].redemptionCount).toBe(3)
    expect(rows[0].isRmv).toBe(true)
  })
})
