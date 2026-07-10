import { getOnboardingChecklist, getOnboardingStatus, countActiveRmvVouchers, submitOnboarding } from '@/lib/api/onboarding'
import * as client from '@/lib/api/client'
import { ApiError } from '@/lib/api/client'

// WF8: only fake `apiFetch` - keep the REAL `ApiError` class. onboarding.ts's own
// `err instanceof ApiError` check (for the INSUFFICIENT_PERMISSIONS catch) compares
// against this same module's ApiError export, so a full automock (which replaces
// ApiError with a mock constructor that never runs the real constructor body,
// losing `.code`) would make that check always fail.
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: jest.fn(),
}))
const mockedFetch = client.apiFetch as jest.MockedFunction<typeof client.apiFetch>

describe('onboarding API reads', () => {
  beforeEach(() => mockedFetch.mockReset())

  it('getOnboardingChecklist parses the 4 gate booleans', async () => {
    mockedFetch.mockResolvedValueOnce({
      branch_created: true,
      contract_signed: false,
      rmv_configured: false,
      all_complete: false,
    })
    const c = await getOnboardingChecklist()
    expect(c).toEqual({
      branch_created: true,
      contract_signed: false,
      rmv_configured: false,
      all_complete: false,
    })
    expect(mockedFetch).toHaveBeenCalledWith('/api/v1/merchant/onboarding/checklist', {
      method: 'GET',
      auth: true,
    })
  })

  it('getOnboardingStatus parses { status, comment, actionedAt } and tolerates the empty (no-row) shape', async () => {
    mockedFetch.mockResolvedValueOnce({ status: 'CHANGES_REQUESTED', comment: 'Fix the pin.', actionedAt: '2026-06-21T09:00:00.000Z' })
    const s = await getOnboardingStatus()
    expect(s).toEqual({ status: 'CHANGES_REQUESTED', comment: 'Fix the pin.', actionedAt: '2026-06-21T09:00:00.000Z' })

    mockedFetch.mockResolvedValueOnce({ status: null, comment: null, actionedAt: null })
    const empty = await getOnboardingStatus()
    expect(empty).toEqual({ status: null, comment: null, actionedAt: null })
  })

  // WF8: this owner-only read 403s with INSUFFICIENT_PERMISSIONS for a valid
  // BRANCH_MANAGER/STAFF caller (src/api/merchant/shared.ts resolveAdminMerchant).
  // That must resolve to `null` here, not throw - so app/(app)/page.tsx can treat
  // "not applicable to this viewer" as data rather than an error (no react-query
  // retry storm, no error UI).
  it('getOnboardingChecklist resolves to null (not a throw) when denied INSUFFICIENT_PERMISSIONS', async () => {
    mockedFetch.mockRejectedValueOnce(new ApiError(403, { error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'nope' } }))
    await expect(getOnboardingChecklist()).resolves.toBeNull()
  })

  it('getOnboardingChecklist rethrows any OTHER failure unchanged (e.g. a real 500)', async () => {
    mockedFetch.mockRejectedValueOnce(new ApiError(500, { error: { code: 'SOME_OTHER_ERROR', message: 'boom' } }))
    await expect(getOnboardingChecklist()).rejects.toMatchObject({ code: 'SOME_OTHER_ERROR' })
  })

  it('getOnboardingStatus resolves to null (not a throw) when denied INSUFFICIENT_PERMISSIONS', async () => {
    mockedFetch.mockRejectedValueOnce(new ApiError(403, { error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'nope' } }))
    await expect(getOnboardingStatus()).resolves.toBeNull()
  })

  it('getOnboardingStatus rethrows any OTHER failure unchanged (e.g. a real 500)', async () => {
    mockedFetch.mockRejectedValueOnce(new ApiError(500, { error: { code: 'SOME_OTHER_ERROR', message: 'boom' } }))
    await expect(getOnboardingStatus()).rejects.toMatchObject({ code: 'SOME_OTHER_ERROR' })
  })

  it('countActiveRmvVouchers counts only PENDING_APPROVAL/ACTIVE rmv rows', async () => {
    mockedFetch.mockResolvedValueOnce([
      { id: 'v1', status: 'PENDING_APPROVAL' },
      { id: 'v2', status: 'DRAFT' },
      { id: 'v3', status: 'ACTIVE' },
    ])
    expect(await countActiveRmvVouchers()).toBe(2)
    expect(mockedFetch).toHaveBeenCalledWith('/api/v1/merchant/vouchers/rmv', { method: 'GET', auth: true })
  })

  it('countActiveRmvVouchers returns 0 for an empty list', async () => {
    mockedFetch.mockResolvedValueOnce([])
    expect(await countActiveRmvVouchers()).toBe(0)
  })

  it('submitOnboarding POSTs to /onboarding/submit', async () => {
    mockedFetch.mockResolvedValueOnce({ updated: { id: 'm1' } })
    await submitOnboarding()
    expect(mockedFetch).toHaveBeenCalledWith('/api/v1/merchant/onboarding/submit', {
      method: 'POST',
      auth: true,
    })
  })
})
