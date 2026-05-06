import { api } from '@/lib/api'
import { voucherApi, _voucherDetailSchemaForTests as schema } from '@/lib/api/voucher'

jest.spyOn(api, 'get')

const validVoucherResponse = {
  id: 'v1',
  title: 'Buy one, get one free coffee',
  type: 'BOGO',
  description: 'A friendly description.',
  terms: 'Some terms.',
  imageUrl: null,
  estimatedSaving: 4.5,                          // already a number on this endpoint
  expiryDate: '2027-12-31T23:59:59.000Z',
  code: 'RMV-001',
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  merchant: {
    id: 'm1',
    businessName: 'The Coffee House',
    tradingName: 'The Coffee House',
    logoUrl: null,
    status: 'ACTIVE',
  },
  isRedeemedThisCycle: false,
  isFavourited: false,
}

describe('voucherApi.getById', () => {
  beforeEach(() => { (api.get as jest.Mock).mockReset() })

  it('parses a typical ACTIVE voucher response', async () => {
    (api.get as jest.Mock).mockResolvedValue(validVoucherResponse)
    const v = await voucherApi.getById('v1')
    expect(v).not.toBeNull()
    expect(v!.id).toBe('v1')
    expect(v!.type).toBe('BOGO')
    expect(v!.estimatedSaving).toBe(4.5)
    expect(v!.merchant.businessName).toBe('The Coffee House')
    expect(v!.isRedeemedThisCycle).toBe(false)
    expect(v!.isFavourited).toBe(false)
  })

  it('coerces estimatedSaving when backend returns a Decimal STRING (defensive)', async () => {
    // Mirrors the PR #39 lesson — Prisma Decimals serialise as strings.
    // The voucher endpoint already calls Number() server-side so this
    // shouldn't happen today, but the schema must coerce defensively
    // so a future serialisation change doesn't silently null out the
    // voucher.
    (api.get as jest.Mock).mockResolvedValue({
      ...validVoucherResponse,
      estimatedSaving: '4.5',
    })
    const v = await voucherApi.getById('v1')
    expect(v).not.toBeNull()
    expect(v!.estimatedSaving).toBe(4.5)
    expect(typeof v!.estimatedSaving).toBe('number')
  })

  it('returns null on null response (404 / voucher not found)', async () => {
    (api.get as jest.Mock).mockResolvedValue(null)
    const v = await voucherApi.getById('v1')
    expect(v).toBeNull()
  })

  it('returns null on a malformed payload (defensive — graceful fallback)', async () => {
    (api.get as jest.Mock).mockResolvedValue({ id: 'v1', title: 42 /* should be string */ })
    const v = await voucherApi.getById('v1')
    expect(v).toBeNull()
  })

  it('URL-encodes the voucher id (defensive against unusual ids)', async () => {
    (api.get as jest.Mock).mockResolvedValue(null)
    await voucherApi.getById('with spaces & ampersands')
    const call = (api.get as jest.Mock).mock.calls[0][0] as string
    expect(call).toContain('with%20spaces%20%26%20ampersands')
  })
})

describe('voucher detail schema — pin contract directly', () => {
  it('accepts isRedeemedThisCycle: true (state-3 driver)', () => {
    const result = schema.safeParse({ ...validVoucherResponse, isRedeemedThisCycle: true })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.isRedeemedThisCycle).toBe(true)
  })

  it('accepts isFavourited: true', () => {
    const result = schema.safeParse({ ...validVoucherResponse, isFavourited: true })
    expect(result.success).toBe(true)
  })

  it('rejects unknown VoucherType to prevent silent UI fallback to a "Voucher" label', () => {
    const result = schema.safeParse({ ...validVoucherResponse, type: 'NOT_A_REAL_TYPE' })
    expect(result.success).toBe(false)
  })
})
