/**
 * @jest-environment node
 */
import { authApi } from '@/lib/api/auth'

function jsonRes(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response
}
function fetchUrl(call = 0): string {
  return String((global.fetch as jest.Mock).mock.calls[call][0])
}

describe('authApi (M1 Slice 1)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('login routes through the BFF and parses the OTP-required branch', async () => {
    global.fetch = jest.fn(async () => jsonRes(200, { status: 'OTP_REQUIRED', sessionChallenge: 'ch' })) as unknown as typeof fetch
    const r = await authApi.login({ email: 'a', password: 'b', deviceId: 'd', deviceType: 'web' })
    expect(r).toEqual({ status: 'OTP_REQUIRED', sessionChallenge: 'ch' })
    expect(fetchUrl()).toBe('/api/merchant-auth/login')
  })

  it('login parses the tokens branch', async () => {
    global.fetch = jest.fn(async () => jsonRes(200, { accessToken: 'at', merchant: { id: 'm', businessName: 'C', approvalStatus: 'ACTIVE' } })) as unknown as typeof fetch
    const r = await authApi.login({ email: 'a', password: 'b', deviceId: 'd', deviceType: 'web' })
    expect('accessToken' in r && r.accessToken).toBe('at')
  })

  it('login throws a typed ApiError on a backend error', async () => {
    global.fetch = jest.fn(async () => jsonRes(401, { error: { code: 'INVALID_CREDENTIALS', message: 'nope' } })) as unknown as typeof fetch
    await expect(authApi.login({ email: 'a', password: 'b', deviceId: 'd', deviceType: 'web' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      status: 401,
    })
  })

  it('register routes through the BFF and parses VERIFY_EMAIL_SENT', async () => {
    global.fetch = jest.fn(async () => jsonRes(200, { status: 'VERIFY_EMAIL_SENT', sessionChallenge: 'ch' })) as unknown as typeof fetch
    const r = await authApi.register({
      firstName: 'a', lastName: 'b', email: 'e', password: 'ValidPass1!', businessName: 'C',
      termsAccepted: true, turnstileToken: 't', deviceId: 'd', deviceType: 'web',
    })
    expect(r.status).toBe('VERIFY_EMAIL_SENT')
    expect(fetchUrl()).toBe('/api/merchant-auth/register')
  })

  it('resendVerification + forgotPassword hit the DIRECT backend routes (not the BFF)', async () => {
    global.fetch = jest.fn(async () => jsonRes(200, { message: 'ok' })) as unknown as typeof fetch
    await authApi.resendVerification({ sessionChallenge: 'ch' })
    expect(fetchUrl()).toContain('/api/v1/merchant/auth/register/resend')

    jest.clearAllMocks()
    global.fetch = jest.fn(async () => jsonRes(200, { message: 'ok' })) as unknown as typeof fetch
    await authApi.forgotPassword({ email: 'e' })
    expect(fetchUrl()).toContain('/api/v1/merchant/auth/forgot-password')
  })

  // Logout-durability design §4.5 — authApi.logout no longer swallows errors
  // and returns a LogoutResult (ok/status/remoteRevoke) instead of throwing,
  // so signOut can distinguish confirmed cookie clearance from UNCONFIRMED.
  describe('logout', () => {
    it('forwards the token as a Bearer header and parses the confirmed remoteRevoke discriminator', async () => {
      global.fetch = jest.fn(async () => jsonRes(200, { ok: true, remoteRevoke: 'confirmed' })) as unknown as typeof fetch
      const result = await authApi.logout('the-token')
      expect(fetchUrl()).toBe('/api/merchant-auth/logout')
      const headers = (global.fetch as jest.Mock).mock.calls[0][1]?.headers
      expect(headers).toEqual({ Authorization: 'Bearer the-token' })
      expect(result).toEqual({ ok: true, status: 200, remoteRevoke: 'confirmed' })
    })

    it('omits the Authorization header when no token is held', async () => {
      global.fetch = jest.fn(async () => jsonRes(200, { ok: true, remoteRevoke: 'confirmed' })) as unknown as typeof fetch
      await authApi.logout(null)
      const headers = (global.fetch as jest.Mock).mock.calls[0][1]?.headers
      expect(headers).toBeUndefined()
    })

    it('surfaces a non-2xx response as ok:false without throwing', async () => {
      global.fetch = jest.fn(async () => jsonRes(500, { ok: false })) as unknown as typeof fetch
      const result = await authApi.logout('t')
      expect(result.ok).toBe(false)
      expect(result.status).toBe(500)
      expect(result.remoteRevoke).toBe('unavailable')
    })

    it('surfaces a network failure / abort as ok:false without throwing (does NOT swallow silently)', async () => {
      global.fetch = jest.fn(async () => { throw new Error('network down') }) as unknown as typeof fetch
      const result = await authApi.logout('t')
      expect(result.ok).toBe(false)
      expect(result.status).toBe(0)
      expect(result.remoteRevoke).toBe('unavailable')
      expect(result.error).toBeInstanceOf(Error)
    })

    it('defaults remoteRevoke to unavailable when the body is missing/malformed', async () => {
      global.fetch = jest.fn(async () => jsonRes(200, {})) as unknown as typeof fetch
      const result = await authApi.logout('t')
      expect(result.ok).toBe(true)
      expect(result.remoteRevoke).toBe('unavailable')
    })

    it('passes the provided AbortSignal through to fetch', async () => {
      global.fetch = jest.fn(async () => jsonRes(200, { ok: true, remoteRevoke: 'pending' })) as unknown as typeof fetch
      const controller = new AbortController()
      await authApi.logout('t', controller.signal)
      const opts = (global.fetch as jest.Mock).mock.calls[0][1]
      expect(opts.signal).toBe(controller.signal)
    })
  })
})
