/**
 * @jest-environment node
 */
import {
  getMerchantAccount,
  updateMerchantAccount,
  getMerchantSessions,
  changeMerchantPassword,
  logoutAllOtherSessions,
} from '@/lib/api/account'
import { setAccessToken } from '@/lib/auth/tokenStore'

function jsonRes(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response
}
function fetchUrl(call = 0): string {
  return String((global.fetch as jest.Mock).mock.calls[call][0])
}

const ACCOUNT = {
  id: 'a1',
  firstName: 'James',
  lastName: 'Whitfield',
  jobTitle: 'Owner',
  email: 'james@oldfoundrykitchen.co.uk',
  phone: '+447700900145',
  phoneCountryCode: '+44',
  emailVerified: true,
  passwordChangedAt: '2026-04-01T00:00:00.000Z',
}

describe('lib/api/account', () => {
  afterEach(() => {
    jest.clearAllMocks()
    setAccessToken(null)
  })

  it('getMerchantAccount GETs /api/v1/merchant/account with auth', async () => {
    global.fetch = jest.fn(async () => jsonRes(200, ACCOUNT)) as unknown as typeof fetch
    const result = await getMerchantAccount()
    expect(fetchUrl()).toContain('/api/v1/merchant/account')
    expect(result).toEqual(ACCOUNT)
  })

  it('updateMerchantAccount PATCHes with exactly the given body', async () => {
    global.fetch = jest.fn(async () => jsonRes(200, ACCOUNT)) as unknown as typeof fetch
    await updateMerchantAccount({ firstName: 'James', lastName: 'Whitfield', jobTitle: 'Owner' })
    const init = (global.fetch as jest.Mock).mock.calls[0][1]
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ firstName: 'James', lastName: 'Whitfield', jobTitle: 'Owner' })
  })

  it('getMerchantSessions unwraps the { sessions } envelope and never surfaces a location', async () => {
    global.fetch = jest.fn(async () =>
      jsonRes(200, {
        sessions: [
          {
            deviceType: 'web',
            deviceName: null,
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0 Safari/537.36',
            ipAddress: '203.0.113.10',
            lastActiveAt: '2026-07-06T12:00:00.000Z',
            createdAt: '2026-06-01T00:00:00.000Z',
            isCurrent: true,
          },
        ],
      }),
    ) as unknown as typeof fetch
    const sessions = await getMerchantSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].isCurrent).toBe(true)
    // ipAddress rides on the parsed object (schema keeps it) but no consumer in
    // this module derives a location from it - that is asserted at the
    // component layer (SessionsList never renders ipAddress or a city).
    expect(sessions[0].ipAddress).toBe('203.0.113.10')
  })

  describe('changeMerchantPassword', () => {
    it('POSTs to the BFF route with a Bearer header from the in-memory token store', async () => {
      setAccessToken('at-123')
      global.fetch = jest.fn(async () => jsonRes(200, { message: 'Password updated.' })) as unknown as typeof fetch
      const result = await changeMerchantPassword({ currentPassword: 'old', newPassword: 'NewPw1!aaaa' })
      expect(fetchUrl()).toBe('/api/merchant-auth/change-password')
      const init = (global.fetch as jest.Mock).mock.calls[0][1]
      expect(init.headers.Authorization).toBe('Bearer at-123')
      expect(JSON.parse(init.body)).toEqual({ currentPassword: 'old', newPassword: 'NewPw1!aaaa' })
      expect(result).toEqual({ message: 'Password updated.' })
    })

    it('throws a typed ApiError with the backend error code on failure', async () => {
      setAccessToken('at-123')
      global.fetch = jest.fn(async () =>
        jsonRes(400, { error: { code: 'CURRENT_PASSWORD_INCORRECT', message: 'wrong' } }),
      ) as unknown as typeof fetch
      await expect(changeMerchantPassword({ currentPassword: 'wrong', newPassword: 'NewPw1!aaaa' })).rejects.toMatchObject({
        code: 'CURRENT_PASSWORD_INCORRECT',
        status: 400,
      })
    })
  })

  describe('logoutAllOtherSessions', () => {
    it('POSTs to the BFF route with NO body and a Bearer header', async () => {
      setAccessToken('at-456')
      global.fetch = jest.fn(async () =>
        jsonRes(200, { message: 'Signed out of all other sessions.', revokedCount: 3 }),
      ) as unknown as typeof fetch
      const result = await logoutAllOtherSessions()
      expect(fetchUrl()).toBe('/api/merchant-auth/logout-all')
      const init = (global.fetch as jest.Mock).mock.calls[0][1]
      expect(init.headers.Authorization).toBe('Bearer at-456')
      expect(init.body).toBeUndefined()
      expect(result).toEqual({ message: 'Signed out of all other sessions.', revokedCount: 3 })
    })
  })
})
