import { renderHook } from '@testing-library/react-native'
import { useTimeLimited } from '@/features/voucher/hooks/useTimeLimited'
import type { VoucherDetail } from '@/lib/api/voucher'

// Minimal voucher fixture — only the fields useTimeLimited reads.
const baseVoucher = (overrides: Partial<VoucherDetail> = {}): VoucherDetail => ({
  id: 'v1',
  title: 'Test',
  type: 'BOGO',
  description: null,
  terms: null,
  imageUrl: null,
  estimatedSaving: 5,
  expiryDate: null,
  code: null,
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  merchant: { id: 'm1', businessName: 'X', tradingName: null, logoUrl: null, status: 'ACTIVE' },
  isRedeemedThisCycle: false,
  isFavourited: false,
  availableAgainAt: null,
  ...overrides,
})

describe('useTimeLimited', () => {
  it('returns isTimeLimited:false for non-TIME_LIMITED vouchers', () => {
    const { result } = renderHook(() => useTimeLimited(baseVoucher({ type: 'BOGO' })))
    expect(result.current.isTimeLimited).toBe(false)
    expect(result.current.isCurrentlyAvailable).toBe(true)
    expect(result.current.isUrgent).toBe(false)
    expect(result.current.minutesRemaining).toBeNull()
  })

  it('returns isTimeLimited:true for TIME_LIMITED vouchers (M1 stub: always available)', () => {
    const { result } = renderHook(() => useTimeLimited(baseVoucher({ type: 'TIME_LIMITED' })))
    expect(result.current.isTimeLimited).toBe(true)
    // M1 limitation: backend doesn't expose availableFrom/until yet,
    // so TIME_LIMITED collapses to "always available" with the type
    // badge surfaced. When the backend additive field lands, this
    // test will need to verify the real time-window math.
    expect(result.current.isCurrentlyAvailable).toBe(true)
    expect(result.current.isUrgent).toBe(false)
  })

  it('handles null voucher safely', () => {
    const { result } = renderHook(() => useTimeLimited(null))
    expect(result.current.isTimeLimited).toBe(false)
    expect(result.current.isCurrentlyAvailable).toBe(true)
  })
})
