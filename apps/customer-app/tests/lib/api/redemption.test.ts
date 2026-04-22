import { redemptionApi, type VoucherDetail, type RedemptionResponse, type RedemptionDetail } from '@/lib/api/redemption'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    del: jest.fn(),
  },
}))

const mockApi = api as jest.Mocked<typeof api>

describe('redemptionApi', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('getVoucherDetail', () => {
    it('calls GET /api/v1/customer/vouchers/:id', async () => {
      const voucher: VoucherDetail = {
        id: 'v1',
        title: 'Buy One Get One Free',
        type: 'BOGO',
        description: 'Get a free pizza',
        terms: 'Valid Mon–Fri',
        imageUrl: null,
        estimatedSaving: 12.99,
        expiryDate: null,
        code: 'RMV-001',
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        isRedeemedThisCycle: false,
        isFavourited: false,
        merchant: {
          id: 'm1',
          businessName: 'Pizza Palace',
          tradingName: null,
          logoUrl: null,
          status: 'ACTIVE',
        },
      }
      mockApi.get.mockResolvedValue(voucher)

      const result = await redemptionApi.getVoucherDetail('v1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/v1/customer/vouchers/v1')
      expect(result).toEqual(voucher)
    })
  })

  describe('redeem', () => {
    it('calls POST /api/v1/redemption with voucherId, branchId, pin', async () => {
      const response: RedemptionResponse = {
        id: 'r1',
        userId: 'u1',
        voucherId: 'v1',
        branchId: 'b1',
        redemptionCode: 'ABC1234567',
        estimatedSaving: 12.99,
        isValidated: false,
        redeemedAt: '2026-04-17T10:00:00Z',
      }
      mockApi.post.mockResolvedValue(response)

      const result = await redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
      expect(mockApi.post).toHaveBeenCalledWith('/api/v1/redemption', { voucherId: 'v1', branchId: 'b1', pin: '1234' })
      expect(result).toEqual(response)
    })
  })

  describe('getMyRedemption', () => {
    it('calls GET /api/v1/redemption/my/:id', async () => {
      const detail: RedemptionDetail = {
        id: 'r1',
        userId: 'u1',
        voucherId: 'v1',
        branchId: 'b1',
        redemptionCode: 'ABC1234567',
        isValidated: true,
        validatedAt: '2026-04-17T10:05:00Z',
        validationMethod: 'QR_SCAN',
        estimatedSaving: 12.99,
        redeemedAt: '2026-04-17T10:00:00Z',
        validatedById: 'staff1',
        voucher: { id: 'v1', title: 'BOGO Pizza', terms: 'Valid Mon-Fri', merchant: { businessName: 'Pizza Palace' } },
        branch: { id: 'b1', name: 'High Street', addressLine1: '123 High St', city: 'London', postcode: 'SW1A 1AA' },
      }
      mockApi.get.mockResolvedValue(detail)

      const result = await redemptionApi.getMyRedemption('r1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/v1/redemption/my/r1')
      expect(result).toEqual(detail)
    })
  })

  describe('getMyRedemptionByCode', () => {
    it('calls GET /api/v1/redemption/me/:code', async () => {
      mockApi.get.mockResolvedValue({
        code: 'K3F9P7', isValidated: false, validatedAt: null,
        validationMethod: null, voucherId: 'v1',
        merchantName: 'Acme', branchName: 'Shoreditch',
      })
      await redemptionApi.getMyRedemptionByCode('K3F9P7')
      expect(mockApi.get).toHaveBeenCalledWith('/api/v1/redemption/me/K3F9P7')
    })
  })

  describe('postScreenshotFlag', () => {
    it('posts to /api/v1/redemption/:code/screenshot-flag', async () => {
      mockApi.post.mockResolvedValue({ logged: true })
      await redemptionApi.postScreenshotFlag('K3F9P7', 'ios')
      expect(mockApi.post).toHaveBeenCalledWith(
        '/api/v1/redemption/K3F9P7/screenshot-flag',
        { platform: 'ios' }
      )
    })
  })
})
