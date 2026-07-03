/**
 * Shell wave: the voucher-management capability seam now consumes the
 * server-derived viewerCapabilities.canManageVouchers (fail closed while
 * loading / on an older backend). DISPLAY-ONLY invariant B-13 unchanged.
 */
import { renderHook } from '@testing-library/react'
import { useVoucherCapability } from '../useVoucherCapability'

jest.mock('@/lib/auth/session', () => ({
  useSession: () => ({ isAuthenticated: true }),
}))

const mockProfile = jest.fn()
jest.mock('@/lib/auth/useMerchantProfile', () => ({
  useMerchantProfile: (enabled: boolean) => mockProfile(enabled),
}))

describe('useVoucherCapability', () => {
  it('canManage=true when viewerCapabilities.canManageVouchers is true', () => {
    mockProfile.mockReturnValue({
      data: { viewerCapabilities: { canViewInsights: true, canManageVouchers: true } },
      isSuccess: true,
      isError: false,
    })
    const { result } = renderHook(() => useVoucherCapability())
    expect(result.current).toEqual({ canManage: true, ready: true })
  })

  it('FAILS CLOSED while loading (no data yet)', () => {
    mockProfile.mockReturnValue({ data: undefined, isSuccess: false, isError: false })
    const { result } = renderHook(() => useVoucherCapability())
    expect(result.current).toEqual({ canManage: false, ready: false })
  })

  it('FAILS CLOSED on an older backend without the field', () => {
    mockProfile.mockReturnValue({
      data: { viewerCapabilities: { canViewInsights: true } },
      isSuccess: true,
      isError: false,
    })
    const { result } = renderHook(() => useVoucherCapability())
    expect(result.current).toEqual({ canManage: false, ready: true })
  })

  it('ready=true (still denied) when the profile fetch errors', () => {
    mockProfile.mockReturnValue({ data: undefined, isSuccess: false, isError: true })
    const { result } = renderHook(() => useVoucherCapability())
    expect(result.current).toEqual({ canManage: false, ready: true })
  })
})
