/**
 * timeline.ts — typed client for GET /admin/merchants/:id/timeline.
 *
 * apiFetch is mocked to verify URL, auth option, and Zod parsing. Team & Roles
 * S4 adds `selfOnboarded` to action rows (true only on a self-approved
 * MERCHANT_GO_LIVE row); these tests wire-pin that it parses and round-trips,
 * and that legacy payloads without the field still parse.
 */
import { timelineApi } from '../timeline'
import { apiFetch } from '../client'

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
}))

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

const ACTION = {
  kind: 'action',
  id: 'action-1',
  at: '2026-06-12T10:00:00.000Z',
  event: 'MERCHANT_GO_LIVE',
  actorType: 'ADMIN',
  actorName: 'Shebin C.',
  reason: null,
}

const EMAIL = {
  kind: 'email',
  id: 'email-1',
  at: '2026-06-12T10:01:00.000Z',
  type: 'merchant_live',
  subject: 'You are live',
  status: 'QUEUED',
  channel: 'EMAIL',
}

const RESPONSE = {
  items: [ACTION, EMAIL],
  state: { status: 'ACTIVE', onboardingStep: null, verificationStatus: 'VERIFIED' },
  emailsResolvedViaOwner: false,
}

describe('timelineApi.get', () => {
  beforeEach(() => mockedApiFetch.mockReset())

  it('calls the correct URL with auth: true and parses the payload', async () => {
    mockedApiFetch.mockResolvedValueOnce(RESPONSE)

    const result = await timelineApi.get('merchant-1')

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/merchants/merchant-1/timeline',
      { auth: true }
    )
    expect(result.items).toHaveLength(2)
  })

  it('parses selfOnboarded on a self-approved go-live action row (S4)', async () => {
    const selfGoLive = { ...ACTION, selfOnboarded: true }
    mockedApiFetch.mockResolvedValueOnce({ ...RESPONSE, items: [selfGoLive] })

    const result = await timelineApi.get('merchant-1')

    const action = result.items[0]
    expect(action.kind).toBe('action')
    if (action.kind === 'action') expect(action.selfOnboarded).toBe(true)
  })

  it('parses a non-self-approved action row (selfOnboarded false)', async () => {
    const notSelf = { ...ACTION, selfOnboarded: false }
    mockedApiFetch.mockResolvedValueOnce({ ...RESPONSE, items: [notSelf] })

    const result = await timelineApi.get('merchant-1')

    const action = result.items[0]
    if (action.kind === 'action') expect(action.selfOnboarded).toBe(false)
  })

  it('parses a legacy action row with no selfOnboarded field (undefined)', async () => {
    // Back-compat: the schema is .optional(), so pre-S4 payloads parse.
    mockedApiFetch.mockResolvedValueOnce({ ...RESPONSE, items: [ACTION] })

    const result = await timelineApi.get('merchant-1')

    const action = result.items[0]
    if (action.kind === 'action') expect(action.selfOnboarded).toBeUndefined()
  })
})
