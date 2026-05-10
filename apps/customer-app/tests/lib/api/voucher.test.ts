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
  availableAgainAt: '2026-06-04T00:00:00.000Z',
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

describe('voucher detail schema — lastRedemption (M3 §P2 persisted return-visit)', () => {
  // Mirrors the backend contract from Task 5 / src/api/customer/discovery/service.ts.
  // Payload shape:
  //   lastRedemption?: {
  //     code:        string
  //     redeemedAt:  string                    // ISO
  //     branch:      { id: string; name: string }
  //     isValidated: boolean
  //     validatedAt: string | null              // ISO
  //   } | null

  const lastRedemptionFixture = {
    code:        'A7K2P9X4',
    redeemedAt:  '2026-05-12T18:30:00.000Z',
    branch:      { id: 'b1', name: 'High Street' },
    isValidated: false,
    validatedAt: null,
  }

  it('accepts lastRedemption present (current-cycle redeemed state)', () => {
    const result = schema.safeParse({
      ...validVoucherResponse,
      isRedeemedThisCycle: true,
      lastRedemption: lastRedemptionFixture,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lastRedemption?.code).toBe('A7K2P9X4')
      expect(result.data.lastRedemption?.branch.name).toBe('High Street')
      expect(result.data.lastRedemption?.isValidated).toBe(false)
      expect(result.data.lastRedemption?.validatedAt).toBeNull()
    }
  })

  it('accepts lastRedemption null (free user / rolled-over / not redeemed)', () => {
    const result = schema.safeParse({ ...validVoucherResponse, lastRedemption: null })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.lastRedemption).toBeNull()
  })

  it('accepts lastRedemption absent — backward compatibility / cache safety', () => {
    // A response cached before the M3 backend rolled out won't have
    // the field at all. Schema must accept its absence so existing
    // React Query caches don't silently null out vouchers post-update.
    // (validVoucherResponse intentionally omits lastRedemption — this
    // is the pre-M3 wire shape we need to keep parsing.)
    const result = schema.safeParse(validVoucherResponse)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.lastRedemption).toBeUndefined()
  })

  it('accepts validated lastRedemption — isValidated:true with ISO validatedAt', () => {
    const result = schema.safeParse({
      ...validVoucherResponse,
      isRedeemedThisCycle: true,
      lastRedemption: {
        ...lastRedemptionFixture,
        isValidated: true,
        validatedAt: '2026-05-12T18:31:15.000Z',
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lastRedemption?.isValidated).toBe(true)
      expect(result.data.lastRedemption?.validatedAt).toBe('2026-05-12T18:31:15.000Z')
    }
  })

  it('rejects lastRedemption with missing required fields', () => {
    // Defensive: the inner shape is { code, redeemedAt, branch{id,name},
    // isValidated, validatedAt:nullable }. A backend drift that drops
    // `branch` should null the voucher rather than render a broken
    // RedemptionDetailsCard.
    const result = schema.safeParse({
      ...validVoucherResponse,
      lastRedemption: {
        code:        'A7K2P9X4',
        redeemedAt:  '2026-05-12T18:30:00.000Z',
        // branch:    missing
        isValidated: false,
        validatedAt: null,
      },
    })
    expect(result.success).toBe(false)
  })
})

// ── M4a-8: TIME_LIMITED schema fields ───────────────────────────────────────
//
// The backend voucher-detail payload for a TIME_LIMITED voucher carries
// four extra fields shaped per spec §3.6.1/§3.6.2/§3.6.4:
//
//   availabilityWindows: { dayOfWeek, openTime, closeTime }[]
//   currentWindow:       { startsAt, endsAt } | null      (ISO timestamps)
//   nextWindow:          { startsAt, endsAt } | null      (ISO timestamps)
//   redeemedWindow:      { startsAt, endsAt } | null      (NOT a boolean)
//
// All four are `.optional()` for forward-compat with cached responses
// from before M4 ships. `availableAgainAt: null` is the locked TIME_LIMITED
// shape because the cycle-rollover concept doesn't apply — entitlement is
// per-window, not per-cycle (spec §3.6.4).
describe('voucherDetailSchema — TIME_LIMITED fields (M4a-8)', () => {
  const baseVoucher = {
    id: 'v1', title: 'Test', type: 'TIME_LIMITED',
    description: null, terms: null, imageUrl: null,
    estimatedSaving: 5, expiryDate: null, code: null,
    status: 'ACTIVE', approvalStatus: 'APPROVED',
    merchant: { id: 'm1', businessName: 'X', tradingName: null, logoUrl: null, status: 'ACTIVE' },
    isRedeemedThisCycle: false, isFavourited: false,
    availableAgainAt: null, lastRedemption: null,
  }

  it('parses availabilityWindows array', () => {
    const result = schema.safeParse({
      ...baseVoucher,
      availabilityWindows: [
        { dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' },
      ],
      currentWindow: null,
      nextWindow: null,
      redeemedWindow: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.availabilityWindows).toHaveLength(1)
      expect(result.data.availabilityWindows[0]!.dayOfWeek).toBe(1)
      expect(result.data.availabilityWindows[0]!.openTime).toBe('11:00')
      expect(result.data.availabilityWindows[0]!.closeTime).toBe('15:00')
    }
  })

  it('parses currentWindow / nextWindow as { startsAt, endsAt } | null', () => {
    const result = schema.safeParse({
      ...baseVoucher,
      availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T14:00:00Z' },
      nextWindow: { startsAt: '2026-05-12T10:00:00Z', endsAt: '2026-05-12T14:00:00Z' },
      redeemedWindow: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.currentWindow?.startsAt).toBe('2026-05-11T10:00:00Z')
      expect(result.data.currentWindow?.endsAt).toBe('2026-05-11T14:00:00Z')
      expect(result.data.nextWindow?.startsAt).toBe('2026-05-12T10:00:00Z')
    }
  })

  it('parses redeemedWindow as { startsAt, endsAt } | null (NOT a boolean)', () => {
    const result = schema.safeParse({
      ...baseVoucher,
      availabilityWindows: [],
      currentWindow: null,
      nextWindow: null,
      redeemedWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T14:00:00Z' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.redeemedWindow?.startsAt).toBe('2026-05-11T10:00:00Z')
    }

    // Negative pin: a boolean must be rejected.
    const rejected = schema.safeParse({
      ...baseVoucher,
      availabilityWindows: [],
      currentWindow: null, nextWindow: null,
      redeemedWindow: true,
    })
    expect(rejected.success).toBe(false)
  })

  it('all new TIME_LIMITED fields are optional with safe defaults (forward-compat for cached responses)', () => {
    // Old cached payload without the new fields should still parse.
    const result = schema.safeParse(baseVoucher)
    expect(result.success).toBe(true)
    if (result.success) {
      // Defaults: availabilityWindows → [], windows → null
      expect(result.data.availabilityWindows).toEqual([])
      expect(result.data.currentWindow).toBeNull()
      expect(result.data.nextWindow).toBeNull()
      expect(result.data.redeemedWindow).toBeNull()
    }
  })

  it('availableAgainAt: null is accepted for TIME_LIMITED (locked in spec §3.6.4)', () => {
    const result = schema.safeParse({
      ...baseVoucher,
      availabilityWindows: [{ dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' }],
      currentWindow: null, nextWindow: null, redeemedWindow: null,
      availableAgainAt: null,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.availableAgainAt).toBeNull()
  })
})
