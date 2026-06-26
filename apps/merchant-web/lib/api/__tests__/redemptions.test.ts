/**
 * F1 client tests for lib/api/redemptions.ts.
 *
 * Mocks apiFetch and asserts: listRedemptions builds the querystring + parses the
 * zod row shape; lookupRedemptionByCode parses a single row; validateRedemptionCode
 * POSTs to /api/v1/redemption/verify with { code, method: 'MANUAL' };
 * exportRedemptionsCsvPath builds the export URL and drops pagination params.
 */
import {
  listRedemptions,
  lookupRedemptionByCode,
  validateRedemptionCode,
  exportRedemptionsCsvPath,
} from '../redemptions'

const apiFetch = jest.fn()
jest.mock('../client', () => ({
  apiFetch: (path: string, opts: unknown) => apiFetch(path, opts),
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

beforeEach(() => {
  apiFetch.mockReset()
})

describe('listRedemptions', () => {
  it('calls the merchant list endpoint with no query when no filters', async () => {
    apiFetch.mockResolvedValueOnce({ items: [ROW], total: 1, limit: 25, offset: 0 })
    const res = await listRedemptions()
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/merchant/redemptions', {
      method: 'GET',
      auth: true,
    })
    expect(res.items).toHaveLength(1)
    expect(res.total).toBe(1)
    expect(res.items[0].customerName).toBe('Sarah K.')
  })

  it('coerces a STRING estimatedSaving (Prisma Decimal on the wire) to a number', async () => {
    // estimatedSaving is a Prisma Decimal, so the real backend serializes it as a
    // STRING (e.g. "5.00"). A plain z.number() would throw on it, breaking the whole
    // Redemptions list parse (same class of bug as branch latitude/longitude).
    apiFetch.mockResolvedValueOnce({
      items: [{ ...ROW, estimatedSaving: '5.00' }],
      total: 1,
      limit: 25,
      offset: 0,
    })
    const res = await listRedemptions()
    expect(res.items[0].estimatedSaving).toBe(5)
    expect(typeof res.items[0].estimatedSaving).toBe('number')
  })

  it('builds a querystring from the provided filters (skips empty/undefined)', async () => {
    apiFetch.mockResolvedValueOnce({ items: [], total: 0, limit: 25, offset: 0 })
    await listRedemptions({
      branchId: 'b1',
      status: 'validated',
      voucherType: 'FREEBIE',
      code: '',
      from: undefined,
      offset: 25,
    })
    const path = apiFetch.mock.calls[0][0] as string
    expect(path).toContain('/api/v1/merchant/redemptions?')
    expect(path).toContain('branchId=b1')
    expect(path).toContain('status=validated')
    expect(path).toContain('voucherType=FREEBIE')
    expect(path).toContain('offset=25')
    expect(path).not.toContain('code=')
    expect(path).not.toContain('from=')
  })

  it('rejects when the row shape is invalid (zod)', async () => {
    apiFetch.mockResolvedValueOnce({ items: [{ id: 'x' }], total: 1, limit: 25, offset: 0 })
    await expect(listRedemptions()).rejects.toBeDefined()
  })

  it('includes voucherId in the querystring (B-2 deep-link filter)', async () => {
    apiFetch.mockResolvedValueOnce({ items: [], total: 0, limit: 25, offset: 0 })
    await listRedemptions({ voucherId: 'v1' })
    const path = apiFetch.mock.calls[0][0] as string
    expect(path).toContain('voucherId=v1')
  })
})

describe('lookupRedemptionByCode', () => {
  it('GETs the lookup endpoint with the code and parses the row', async () => {
    apiFetch.mockResolvedValueOnce(ROW)
    const row = await lookupRedemptionByCode('A7K2P9X4')
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/v1/merchant/redemptions/lookup?code=A7K2P9X4',
      { method: 'GET', auth: true },
    )
    expect(row.redemptionCode).toBe('A7K2P9X4')
    expect(row.status).toBe('AWAITING_VALIDATION')
  })

  it('parses an already-validated row with validation details', async () => {
    apiFetch.mockResolvedValueOnce({
      ...ROW,
      status: 'VALIDATED',
      validatedAt: '2026-06-21T11:00:00.000Z',
      validationMethod: 'MANUAL',
      validatedByLabel: 'Validated in the portal',
    })
    const row = await lookupRedemptionByCode('a7k2 p9x4')
    expect(row.status).toBe('VALIDATED')
    expect(row.validatedByLabel).toBe('Validated in the portal')
    expect(row.validationMethod).toBe('MANUAL')
  })
})

describe('validateRedemptionCode', () => {
  it('POSTs to /api/v1/redemption/verify with method MANUAL', async () => {
    apiFetch.mockResolvedValueOnce({ id: 'r1', isValidated: true })
    await validateRedemptionCode('A7K2P9X4')
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/redemption/verify', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ code: 'A7K2P9X4', method: 'MANUAL' }),
    })
  })
})

describe('exportRedemptionsCsvPath', () => {
  it('builds the export URL with filters and without pagination params', () => {
    const path = exportRedemptionsCsvPath({
      branchId: 'b1',
      status: 'validated',
      limit: 25,
      offset: 50,
    })
    expect(path).toContain('/api/v1/merchant/redemptions/export.csv?')
    expect(path).toContain('branchId=b1')
    expect(path).toContain('status=validated')
    expect(path).not.toContain('limit=')
    expect(path).not.toContain('offset=')
  })

  it('returns the bare path when there are no filters', () => {
    expect(exportRedemptionsCsvPath()).toBe('/api/v1/merchant/redemptions/export.csv')
  })
})
