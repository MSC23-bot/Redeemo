/**
 * lib/api/editReview — Zod schema parsing for the union of edit-review shapes:
 * the original identity-edit (kind 'merchant' | 'branch') and the Voucher
 * governed-flows PR-B addition (kind 'voucher', sibling backend PR #411).
 */
import { editReviewApi, editReviewContextSchema } from '../editReview'

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
}))

import { apiFetch } from '../client'

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

afterEach(() => {
  jest.clearAllMocks()
})

describe('editReviewContextSchema — identity edit (unchanged)', () => {
  it('parses a merchant identity-edit context', () => {
    const raw = {
      kind: 'merchant',
      merchantId: 'm-1',
      pendingEditId: 'pe-1',
      status: 'PENDING',
      includesPhotos: false,
      fields: [{ field: 'businessName', current: 'Old', proposed: 'New', isCustomerVisible: true }],
    }
    expect(() => editReviewContextSchema.parse(raw)).not.toThrow()
  })

  it('parses a branch photo-edit context', () => {
    const raw = {
      kind: 'branch',
      merchantId: 'm-1',
      branchId: 'b-1',
      pendingEditId: 'pe-2',
      status: 'PENDING',
      includesPhotos: true,
      fields: [],
      photoChanges: { add: ['https://x/a.jpg'], remove: [] },
    }
    expect(() => editReviewContextSchema.parse(raw)).not.toThrow()
  })
})

describe('editReviewContextSchema — voucher edit (PR-B / sibling backend PR #411)', () => {
  function voucherRaw(over: Record<string, unknown> = {}) {
    return {
      kind: 'voucher',
      voucherId: 'v-1',
      voucherEditKind: 'CHANGE',
      reason: 'The price of ingredients has changed.',
      status: 'PENDING',
      fields: [{ key: 'estimatedSaving', label: 'Estimated saving', current: 5, proposed: 7.5 }],
      voucher: {
        id: 'v-1',
        code: 'RCV-001',
        title: '20% off mains',
        type: 'DISCOUNT',
        status: 'ACTIVE',
        isRmv: false,
        estimatedSaving: 5,
      },
      ...over,
    }
  }

  it('parses a CHANGE voucher-edit context', () => {
    expect(() => editReviewContextSchema.parse(voucherRaw())).not.toThrow()
  })

  it('parses an END voucher-edit context with no fields', () => {
    const raw = voucherRaw({ voucherEditKind: 'END', fields: [] })
    expect(() => editReviewContextSchema.parse(raw)).not.toThrow()
  })

  it('parses a WITHDRAWN voucher-edit context', () => {
    const raw = voucherRaw({ status: 'WITHDRAWN' })
    const parsed = editReviewContextSchema.parse(raw)
    expect(parsed.status).toBe('WITHDRAWN')
  })

  it('parses the flagship (isRmv) voucher flag through', () => {
    const raw = voucherRaw({ voucher: { ...voucherRaw().voucher as object, isRmv: true } })
    const parsed = editReviewContextSchema.parse(raw) as { voucher: { isRmv: boolean } }
    expect(parsed.voucher.isRmv).toBe(true)
  })

  it('rejects a voucher-edit context missing the mandatory reason', () => {
    const raw = voucherRaw()
    delete (raw as Record<string, unknown>).reason
    expect(() => editReviewContextSchema.parse(raw)).toThrow()
  })

  it('rejects an unknown voucherEditKind', () => {
    const raw = voucherRaw({ voucherEditKind: 'DELETE' })
    expect(() => editReviewContextSchema.parse(raw)).toThrow()
  })
})

describe('editReviewApi.get — wires through apiFetch and validates', () => {
  it('fetches and parses a voucher edit-review context', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      kind: 'voucher',
      voucherId: 'v-1',
      voucherEditKind: 'END',
      reason: 'Closing this offer early.',
      status: 'PENDING',
      fields: [],
      voucher: {
        id: 'v-1',
        code: 'RCV-002',
        title: 'Free coffee',
        type: 'FREEBIE',
        status: 'ACTIVE',
        isRmv: false,
        estimatedSaving: 3,
      },
    })
    const result = await editReviewApi.get('apr-1')
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/approvals/apr-1/edit-review',
      { auth: true }
    )
    expect(result.kind).toBe('voucher')
  })
})
