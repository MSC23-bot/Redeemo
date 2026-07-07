import {
  listCustomVouchers,
  listFlagshipVouchers,
  getVoucher,
  requestFlagshipVoucherChange,
  requestVoucherEnd,
  withdrawVoucherSubmission,
  withdrawVoucherPendingEdit,
} from '@/lib/api/voucher'

// Voucher governed flows (2026-07-07, D1-D4): the client for the three
// governed lanes (PR #411 backend contracts; unmerged, built against its
// contracts). apiFetch is mocked.
//
//   POST /api/v1/merchant/vouchers/rmv/:id/request-change  -> flagship CHANGE
//   POST /api/v1/merchant/vouchers/:id/request-end          -> custom END
//   POST /api/v1/merchant/vouchers/:id/withdraw              -> D2 instant self-service
//   POST /api/v1/merchant/vouchers/pending-edits/:id/withdraw -> withdraw an open request
//   GET  /vouchers, /vouchers/:id, /vouchers/rmv now ALSO carry `pendingEdit`.

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
  apiFetch.mockReset()
})

describe('pendingEdit on reads', () => {
  it('parses a null pendingEdit on the list row', async () => {
    apiFetch.mockResolvedValueOnce([{ ...CUSTOM_ROW, pendingEdit: null }])
    const rows = await listCustomVouchers()
    expect(rows[0].pendingEdit).toBeNull()
  })

  it('omitting pendingEdit entirely also parses (nullish, not required)', async () => {
    apiFetch.mockResolvedValueOnce([CUSTOM_ROW])
    const rows = await listCustomVouchers()
    expect(rows[0].pendingEdit).toBeUndefined()
  })

  it('parses a populated PENDING CHANGE pendingEdit on the detail read', async () => {
    apiFetch.mockResolvedValueOnce({
      ...CUSTOM_ROW,
      pendingEdit: {
        id: 'pe1',
        kind: 'CHANGE',
        status: 'PENDING',
        reason: 'Update the wording',
        createdAt: '2026-07-07T09:00:00.000Z',
        proposedChanges: { title: 'A sharper title', estimatedSaving: 6 },
      },
    })
    const v = await getVoucher('v1')
    expect(v.pendingEdit?.kind).toBe('CHANGE')
    expect(v.pendingEdit?.status).toBe('PENDING')
    expect((v.pendingEdit?.proposedChanges as Record<string, unknown>).title).toBe('A sharper title')
  })

  it('parses a populated PENDING END pendingEdit (no proposedChanges) on the flagship list', async () => {
    apiFetch.mockResolvedValueOnce([
      {
        ...CUSTOM_ROW,
        id: 'rmv1',
        isRmv: true,
        pendingEdit: {
          id: 'pe2',
          kind: 'END',
          status: 'PENDING',
          reason: 'Closing this offer',
          createdAt: '2026-07-07T09:00:00.000Z',
          proposedChanges: null,
        },
      },
    ])
    const rows = await listFlagshipVouchers()
    expect(rows[0].pendingEdit?.kind).toBe('END')
    expect(rows[0].pendingEdit?.proposedChanges).toBeNull()
  })
})

describe('requestFlagshipVoucherChange', () => {
  it('POSTs only the changed fields + the mandatory reason to the rmv request-change route', async () => {
    apiFetch.mockResolvedValueOnce({
      id: 'pe1',
      kind: 'CHANGE',
      status: 'PENDING',
      reason: 'Raise the saving',
      createdAt: '2026-07-07T09:00:00.000Z',
      proposedChanges: { estimatedSaving: 6 },
    })
    const res = await requestFlagshipVoucherChange('rmv1', { reason: 'Raise the saving', estimatedSaving: 6 })
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers/rmv/rmv1/request-change', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reason: 'Raise the saving', estimatedSaving: 6 }),
    })
    expect(res.kind).toBe('CHANGE')
    expect(res.status).toBe('PENDING')
  })
})

describe('requestVoucherEnd', () => {
  it('POSTs the reason to the request-end route', async () => {
    apiFetch.mockResolvedValueOnce({
      id: 'pe2',
      kind: 'END',
      status: 'PENDING',
      reason: 'Closing this offer',
      createdAt: '2026-07-07T09:00:00.000Z',
      proposedChanges: null,
    })
    const res = await requestVoucherEnd('v1', 'Closing this offer')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers/v1/request-end', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ reason: 'Closing this offer' }),
    })
    expect(res.kind).toBe('END')
  })
})

describe('withdrawVoucherSubmission', () => {
  it('POSTs with no body to the withdraw route', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'v1', status: 'DRAFT' })
    const res = await withdrawVoucherSubmission('v1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers/v1/withdraw', { method: 'POST', auth: true })
    expect(res.status).toBe('DRAFT')
  })
})

describe('withdrawVoucherPendingEdit', () => {
  it('POSTs with no body to the pending-edits withdraw route', async () => {
    apiFetch.mockResolvedValueOnce({
      id: 'pe1',
      kind: 'CHANGE',
      status: 'WITHDRAWN',
      reason: 'Raise the saving',
      createdAt: '2026-07-07T09:00:00.000Z',
      proposedChanges: { estimatedSaving: 6 },
    })
    const res = await withdrawVoucherPendingEdit('pe1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers/pending-edits/pe1/withdraw', {
      method: 'POST',
      auth: true,
    })
    expect(res.status).toBe('WITHDRAWN')
  })
})
