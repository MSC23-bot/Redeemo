/**
 * D-BM1 (merged spec §5): useBranchCapability is REWRITTEN to derive the
 * owner-vs-Branch-Manager signal from the profile's viewerCapabilities.role
 * (the SAME source Quick-Actions and the shell nav use), retiring the PR-1
 * stopgap that probed the owner-gated GET /staff for a 403/200. Mirrors the
 * useVoucherCapability test pattern. `ready` settles once the profile query
 * has settled either way (success OR error); `isOwner` is fail-closed (only
 * true for an explicit OWNER role).
 */
import { renderHook } from '@testing-library/react'
import { useBranchCapability } from '../useBranchCapability'

jest.mock('@/lib/auth/session', () => ({
  useSession: () => ({ isAuthenticated: true }),
}))

const mockProfile = jest.fn()
jest.mock('@/lib/auth/useMerchantProfile', () => ({
  useMerchantProfile: (enabled: boolean) => mockProfile(enabled),
}))

// The retired PR-1 probe: proves useBranchCapability makes NO call to the
// owner-gated staff endpoint anymore.
const listStaff = jest.fn()
jest.mock('@/lib/api/staff', () => ({
  listStaff: (...a: unknown[]) => listStaff(...a),
}))

beforeEach(() => {
  mockProfile.mockReset()
  listStaff.mockReset()
})

describe('useBranchCapability', () => {
  it('isOwner=true + role="OWNER" + ready=true when the profile role is OWNER', () => {
    mockProfile.mockReturnValue({
      data: { viewerCapabilities: { role: 'OWNER' } },
      isSuccess: true,
      isError: false,
    })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(result.current).toEqual({ isOwner: true, ready: true, role: 'OWNER' })
  })

  it('isOwner=false + role="BRANCH_MANAGER" for a Branch Manager', () => {
    mockProfile.mockReturnValue({
      data: { viewerCapabilities: { role: 'BRANCH_MANAGER' } },
      isSuccess: true,
      isError: false,
    })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: 'BRANCH_MANAGER' })
  })

  it('isOwner=false + role="STAFF" for STAFF', () => {
    mockProfile.mockReturnValue({
      data: { viewerCapabilities: { role: 'STAFF' } },
      isSuccess: true,
      isError: false,
    })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: 'STAFF' })
  })

  it('FAILS CLOSED (role=null) while the profile is loading (no data yet)', () => {
    mockProfile.mockReturnValue({ data: undefined, isSuccess: false, isError: false })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })
  })

  it('FAILS CLOSED (role=null) on an older backend without viewerCapabilities.role', () => {
    mockProfile.mockReturnValue({
      data: { viewerCapabilities: { canManageVouchers: true } },
      isSuccess: true,
      isError: false,
    })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: null })
  })

  it('ready=true (still not-owner) when the profile fetch errors', () => {
    mockProfile.mockReturnValue({ data: undefined, isSuccess: false, isError: true })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: null })
  })

  it('threads the enabled flag through to useMerchantProfile', () => {
    mockProfile.mockReturnValue({ data: undefined, isSuccess: false, isError: false })
    renderHook(() => useBranchCapability(false))
    expect(mockProfile).toHaveBeenCalledWith(false)
  })

  it('never calls the retired GET /merchant/staff probe', () => {
    mockProfile.mockReturnValue({
      data: { viewerCapabilities: { role: 'OWNER' } },
      isSuccess: true,
      isError: false,
    })
    renderHook(() => useBranchCapability(true))
    expect(listStaff).not.toHaveBeenCalled()
  })
})
