import { savingsApi } from '@/lib/api/savings'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn() },
}))

const mockApi = api as jest.Mocked<typeof api>

describe('savingsApi', () => {
  beforeEach(() => jest.clearAllMocks())

  it('getSummary calls GET /api/v1/customer/savings/summary', async () => {
    mockApi.get.mockResolvedValue({
      lifetimeSaving: 100,
      thisMonthSaving: 25,
      thisMonthRedemptionCount: 5,
      monthlyBreakdown: [],
      byMerchant: [],
      byCategory: [],
    })
    const result = await savingsApi.getSummary()
    expect(mockApi.get).toHaveBeenCalledWith('/api/v1/customer/savings/summary')
    expect(result.lifetimeSaving).toBe(100)
  })

  it('getRedemptions calls GET with pagination params', async () => {
    mockApi.get.mockResolvedValue({ redemptions: [], total: 0 })
    await savingsApi.getRedemptions({ limit: 20, offset: 40 })
    expect(mockApi.get).toHaveBeenCalledWith('/api/v1/customer/savings/redemptions?limit=20&offset=40')
  })

  it('getRedemptions omits params when not provided', async () => {
    mockApi.get.mockResolvedValue({ redemptions: [], total: 0 })
    await savingsApi.getRedemptions({})
    expect(mockApi.get).toHaveBeenCalledWith('/api/v1/customer/savings/redemptions')
  })

  it('getMonthlyDetail calls GET with month param', async () => {
    mockApi.get.mockResolvedValue({
      totalSaving: 20,
      redemptionCount: 4,
      byMerchant: [],
      byCategory: [],
    })
    const result = await savingsApi.getMonthlyDetail('2026-03')
    expect(mockApi.get).toHaveBeenCalledWith('/api/v1/customer/savings/monthly-detail?month=2026-03')
    expect(result.totalSaving).toBe(20)
  })
})
