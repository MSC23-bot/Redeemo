/**
 * vouchers.ts: typed client for the admin RMV co-build routes (Merchant 360 A3).
 *
 * apiFetch is mocked to verify URL, method, auth option, body, and Zod parsing of
 * the list read. Mirrors lib/api/__tests__/redemptions.test.ts's style.
 */
import { adminVouchersApi, listAdminRmvResponseSchema } from '../vouchers'
import { apiFetch } from '../client'

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
}))

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

afterEach(() => jest.clearAllMocks())

const RMV = {
  id: 'v-rmv-1',
  code: 'RMV-001',
  title: 'Buy one, get one free',
  type: 'BOGO',
  estimatedSaving: 12,
  status: 'DRAFT',
  approvalStatus: 'PENDING',
  merchantFields: { title: 'Staged title' },
  allowedFields: ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl', 'merchantFields'],
}

describe('adminVouchersApi.listRmv', () => {
  it('GET /admin/merchants/:id/vouchers/rmv with auth:true and parses the response', async () => {
    mockedApiFetch.mockResolvedValueOnce({ vouchers: [RMV] })
    const result = await adminVouchersApi.listRmv('m-1')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/vouchers/rmv', {
      auth: true,
    })
    expect(result.vouchers[0].allowedFields).toContain('title')
    expect(result.vouchers[0].merchantFields.title).toBe('Staged title')
  })

  it('throws when the response shape drifts (Zod)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ vouchers: [{ id: 'x' }] })
    await expect(adminVouchersApi.listRmv('m-1')).rejects.toThrow()
  })

  it('the schema accepts an empty merchantFields blob', () => {
    const parsed = listAdminRmvResponseSchema.parse({ vouchers: [{ ...RMV, merchantFields: {} }] })
    expect(parsed.vouchers[0].merchantFields).toEqual({})
  })
})

// ── A4: custom (RCV) voucher roster ──────────────────────────────────────────────

const RCV = {
  id: 'rcv-1',
  code: 'RCV-001',
  title: 'Free coffee Friday',
  type: 'FREEBIE',
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  estimatedSaving: 3.5,
  expiryDate: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  pendingEdit: null,
}

describe('adminVouchersApi.listCustom (A4)', () => {
  it('GET /admin/merchants/:id/vouchers with auth:true and parses the response', async () => {
    mockedApiFetch.mockResolvedValueOnce({ vouchers: [RCV] })
    const result = await adminVouchersApi.listCustom('m-1')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/vouchers', { auth: true })
    expect(result.vouchers[0].code).toBe('RCV-001')
    expect(result.vouchers[0].estimatedSaving).toBe(3.5)
    expect(result.vouchers[0].pendingEdit).toBeNull()
  })

  it('parses a pending-edit summary when present', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      vouchers: [{ ...RCV, pendingEdit: { id: 'pe-1', kind: 'CHANGE', status: 'PENDING' } }],
    })
    const result = await adminVouchersApi.listCustom('m-1')
    expect(result.vouchers[0].pendingEdit).toEqual({ id: 'pe-1', kind: 'CHANGE', status: 'PENDING' })
  })

  it('throws when the response shape drifts (Zod)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ vouchers: [{ id: 'x' }] })
    await expect(adminVouchersApi.listCustom('m-1')).rejects.toThrow()
  })
})

describe('adminVouchersApi.editRmv', () => {
  it('PATCHes the rmv route with { fields, reason } and auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'v-rmv-1' })
    await adminVouchersApi.editRmv('m-1', 'v-rmv-1', {
      fields: { title: 'New title' },
      reason: 'Fixed a typo.',
    })
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/merchants/m-1/vouchers/v-rmv-1/rmv',
      { method: 'PATCH', auth: true, body: JSON.stringify({ fields: { title: 'New title' }, reason: 'Fixed a typo.' }) }
    )
  })
})

describe('adminVouchersApi.submitRmv', () => {
  it('POSTs the rmv/submit route with { reason } and auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'v-rmv-1' })
    await adminVouchersApi.submitRmv('m-1', 'v-rmv-1', { reason: 'Ready for review.' })
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/merchants/m-1/vouchers/v-rmv-1/rmv/submit',
      { method: 'POST', auth: true, body: JSON.stringify({ reason: 'Ready for review.' }) }
    )
  })
})
