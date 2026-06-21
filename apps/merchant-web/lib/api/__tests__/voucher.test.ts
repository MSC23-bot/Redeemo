import {
  createFlagshipRmv,
  updateRmvVoucher,
  submitRmvVoucher,
  listRmvVouchers,
  type RmvUpdatePayload,
} from '@/lib/api/voucher'

// M2 F5: the flagship-voucher API client. Asserts the exact HTTP verbs/paths/bodies
// against the REAL merged backend (src/api/merchant/voucher/*). apiFetch is mocked.
//
// RECONCILIATION (read the backend): updateRmvVoucherCore validates the PATCH keys
// against the template allowedFields ([title, description, estimatedSaving, terms,
// imageUrl, merchantFields]) then MERGES the whole body into the merchantFields JSON
// column - it does NOT write the top-level title/estimatedSaving columns. So the
// client PATCHes top-level title/description/estimatedSaving/terms/imageUrl PLUS a
// nested merchantFields bag of the per-type structured fields. They all land inside
// merchantFields (allowed keys), which is exactly what the guided builder needs to
// rehydrate an edit. No top-level column write is required for the builder.

const apiFetch = jest.fn()
jest.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}))

beforeEach(() => {
  // Default a valid-enough RMV row so the schema parse passes; per-test mocks
  // override with the specific shape under assertion.
  apiFetch.mockReset().mockResolvedValue({ id: 'rmv-x', type: 'BOGO', status: 'DRAFT' })
})

describe('createFlagshipRmv', () => {
  it('POSTs the chosen voucher type and returns the created DRAFT RMV', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'rmv-1', type: 'BOGO', status: 'DRAFT' })
    const res = await createFlagshipRmv('BOGO')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers/rmv/create-flagship', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ voucherType: 'BOGO' }),
    })
    expect(res.id).toBe('rmv-1')
    expect(res.status).toBe('DRAFT')
  })
})

describe('updateRmvVoucher (allowedFields keys + merchantFields bag)', () => {
  it('PATCHes title/description/estimatedSaving/terms/imageUrl + merchantFields', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'rmv-1', type: 'BOGO', status: 'DRAFT' })
    const payload: RmvUpdatePayload = {
      title: 'Buy one main, get one free',
      description: 'When you buy a main, we will give you a second one free.',
      estimatedSaving: 12,
      terms: 'Both items must be in the same transaction',
      imageUrl: 'https://cdn.test/voucher.png',
      merchantFields: { builderType: 'bogo', bogoBuy: 'A main', bogoFree: 'A second item', bogoFreePrice: 12 },
    }
    await updateRmvVoucher('rmv-1', payload)
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers/rmv/rmv-1', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(payload),
    })
  })

  it('omits keys that are not provided (partial save)', async () => {
    await updateRmvVoucher('rmv-2', { estimatedSaving: 8 })
    const sentBody = JSON.parse((apiFetch.mock.calls[0][1] as { body: string }).body)
    expect(sentBody).toEqual({ estimatedSaving: 8 })
    expect(sentBody).not.toHaveProperty('title')
  })
})

describe('submitRmvVoucher', () => {
  it('POSTs the submit with no body', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'rmv-1', type: 'BOGO', status: 'PENDING_APPROVAL' })
    const res = await submitRmvVoucher('rmv-1')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers/rmv/rmv-1/submit', {
      method: 'POST',
      auth: true,
    })
    expect(res.status).toBe('PENDING_APPROVAL')
  })
})

describe('listRmvVouchers', () => {
  it('GETs the merchant RMV rows with auth and tolerates passthrough fields', async () => {
    apiFetch.mockResolvedValueOnce([
      { id: 'rmv-1', status: 'PENDING_APPROVAL', type: 'BOGO', merchantFields: { builderType: 'bogo' } },
      { id: 'rmv-2', status: 'DRAFT', type: 'FREEBIE' },
    ])
    const rows = await listRmvVouchers()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers/rmv', { method: 'GET', auth: true })
    expect(rows).toHaveLength(2)
    expect(rows[0].status).toBe('PENDING_APPROVAL')
    expect((rows[0].merchantFields as Record<string, unknown>).builderType).toBe('bogo')
  })
})
