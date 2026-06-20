import { getOnboardingChecklist, getOnboardingStatus, countActiveRmvVouchers, submitOnboarding } from '@/lib/api/onboarding'
import * as client from '@/lib/api/client'

jest.mock('@/lib/api/client')
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
