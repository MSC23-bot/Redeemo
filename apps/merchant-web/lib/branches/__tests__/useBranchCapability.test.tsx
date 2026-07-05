/**
 * D-BM1 correction round (see useBranchCapability.ts header comment): the
 * hook is authoritative on an explicit modern profile role (OWNER /
 * BRANCH_MANAGER / STAFF) and ONLY falls back to the legacy owner-gated
 * GET /merchant/staff probe when the profile request succeeded but carries
 * NO role at all (an old backend that predates #364). The probe can only
 * ever establish OWNER (200) or nothing (403 / network / server error,
 * fail-closed) - it can never manufacture BRANCH_MANAGER or STAFF.
 *
 * Both `useMerchantProfile` and `useStaff` are mocked at their module
 * boundaries (mirrors the useVoucherCapability test pattern). Because React
 * hooks must be called unconditionally, `useStaff` is invoked on every
 * render regardless of whether the probe is "needed" - so "no probe fired"
 * is asserted via the `enabled` argument the hook receives (which is what
 * actually gates the underlying react-query fetch in production), not via
 * whether the mock function was called at all.
 */
import { renderHook } from '@testing-library/react'
import { useBranchCapability } from '../useBranchCapability'
import { effectiveCanManage } from '../capability'

const mockSession = jest.fn()
jest.mock('@/lib/auth/session', () => ({
  useSession: () => mockSession(),
}))

const mockProfile = jest.fn()
jest.mock('@/lib/auth/useMerchantProfile', () => ({
  useMerchantProfile: (enabled: boolean) => mockProfile(enabled),
}))

const mockStaff = jest.fn()
jest.mock('@/lib/staff/useStaff', () => ({
  useStaff: (enabled: boolean) => mockStaff(enabled),
}))

function lastStaffEnabledArg(): boolean {
  const calls = mockStaff.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return calls[calls.length - 1][0]
}

beforeEach(() => {
  mockSession.mockReset()
  mockSession.mockReturnValue({ isAuthenticated: true })
  mockProfile.mockReset()
  mockStaff.mockReset()
  // Default "disabled query" shape: neither settled success nor error, so a
  // test that forgets to configure mockStaff still gets a sane react-query-like
  // shape rather than `undefined` property reads.
  mockStaff.mockReturnValue({ isSuccess: false, isError: false })
})

describe('useBranchCapability', () => {
  it('1. modern OWNER: no staff probe fired; isOwner true; ready true', () => {
    mockProfile.mockReturnValue({
      data: { viewerCapabilities: { role: 'OWNER' } },
      isSuccess: true,
      isError: false,
    })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(result.current).toEqual({ isOwner: true, ready: true, role: 'OWNER' })
    expect(lastStaffEnabledArg()).toBe(false)
  })

  it('2. modern BRANCH_MANAGER: no probe; isOwner false; role BRANCH_MANAGER; ready true', () => {
    mockProfile.mockReturnValue({
      data: { viewerCapabilities: { role: 'BRANCH_MANAGER' } },
      isSuccess: true,
      isError: false,
    })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: 'BRANCH_MANAGER' })
    expect(lastStaffEnabledArg()).toBe(false)
  })

  it('3. modern STAFF: no probe; role STAFF; ready true', () => {
    mockProfile.mockReturnValue({
      data: { viewerCapabilities: { role: 'STAFF' } },
      isSuccess: true,
      isError: false,
    })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: 'STAFF' })
    expect(lastStaffEnabledArg()).toBe(false)
  })

  it('4. old backend (profile success, role absent), staff 200 -> role OWNER, isOwner true, ready true [MUTATION PIN: deleting the fallback drops this to role=null]', () => {
    mockProfile.mockReturnValue({
      data: { viewerCapabilities: { canManageVouchers: true } },
      isSuccess: true,
      isError: false,
    })
    mockStaff.mockReturnValue({ isSuccess: true, isError: false })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(lastStaffEnabledArg()).toBe(true)
    expect(result.current).toEqual({ isOwner: true, ready: true, role: 'OWNER' })
  })

  it('5. old backend, staff 403 INSUFFICIENT_PERMISSIONS -> role null, isOwner false, ready true [MUTATION PIN: a 403 must never become BRANCH_MANAGER]', () => {
    mockProfile.mockReturnValue({
      data: { viewerCapabilities: {} },
      isSuccess: true,
      isError: false,
    })
    mockStaff.mockReturnValue({ isSuccess: false, isError: true })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(lastStaffEnabledArg()).toBe(true)
    expect(result.current.role).toBe(null)
    expect(result.current.isOwner).toBe(false)
    expect(result.current.ready).toBe(true)
    // BM-widening negative: even if a mutation smuggled a role value through,
    // the effective per-branch formula still denies management without an
    // explicit BM canManage grant on the branch.
    expect(effectiveCanManage(result.current.role, undefined)).toBe(false)
    expect(effectiveCanManage(result.current.role, { viewerCapabilities: { canManage: true } })).toBe(false)
  })

  it('6. old backend, staff 500/network error -> role null, isOwner false, ready true (fail closed)', () => {
    mockProfile.mockReturnValue({
      data: { viewerCapabilities: undefined },
      isSuccess: true,
      isError: false,
    })
    mockStaff.mockReturnValue({ isSuccess: false, isError: true })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(lastStaffEnabledArg()).toBe(true)
    expect(result.current).toEqual({ isOwner: false, ready: true, role: null })
  })

  it('7. profile loading: ready false; no premature probe', () => {
    mockProfile.mockReturnValue({ data: undefined, isSuccess: false, isError: false })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })
    expect(lastStaffEnabledArg()).toBe(false)
  })

  it('8. profile request ERROR: ready true, role null, NO probe fired (fail closed)', () => {
    mockProfile.mockReturnValue({ data: undefined, isSuccess: false, isError: true })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(result.current).toEqual({ isOwner: false, ready: true, role: null })
    expect(lastStaffEnabledArg()).toBe(false)
  })

  it('9a. disabled=false (even authenticated): NO profile request, NO staff request, ready false', () => {
    mockProfile.mockReturnValue({ data: undefined, isSuccess: false, isError: false })
    renderHook(() => useBranchCapability(false))
    expect(mockProfile).toHaveBeenCalledWith(false)
    expect(lastStaffEnabledArg()).toBe(false)
  })

  it('9b. unauthenticated (even enabled=true): NO profile request, NO staff request, ready false', () => {
    mockSession.mockReturnValue({ isAuthenticated: false })
    mockProfile.mockReturnValue({ data: undefined, isSuccess: false, isError: false })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(mockProfile).toHaveBeenCalledWith(false)
    expect(lastStaffEnabledArg()).toBe(false)
    expect(result.current).toEqual({ isOwner: false, ready: false, role: null })
  })

  it('10. precedence pin: an explicit modern role suppresses the probe even if the staff mock would resolve 200', () => {
    mockProfile.mockReturnValue({
      data: { viewerCapabilities: { role: 'BRANCH_MANAGER' } },
      isSuccess: true,
      isError: false,
    })
    // Deliberately configured as if the legacy probe would succeed, to prove
    // it is never consulted once a modern role is present.
    mockStaff.mockReturnValue({ isSuccess: true, isError: false })
    const { result } = renderHook(() => useBranchCapability(true))
    expect(lastStaffEnabledArg()).toBe(false)
    expect(result.current).toEqual({ isOwner: false, ready: true, role: 'BRANCH_MANAGER' })
  })
})
