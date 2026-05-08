import { api } from '@/lib/api'
import { authApi } from '@/lib/api/auth'

jest.spyOn(api, 'post')

describe('authApi', () => {
  beforeEach(() => { (api.post as jest.Mock).mockReset() })
  it('register posts the expected payload', async () => {
    (api.post as jest.Mock).mockResolvedValue({ user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', lastName: null, phone: '+44', emailVerifiedAt: null, phoneVerifiedAt: null }, accessToken: 'a', refreshToken: 'r', sessionId: 'sess_a' })
    const r = await authApi.register({ firstName: 'Ada', lastName: 'Lovelace', email: 'a@x.com', password: 'P@ssw0rd!aaa', phone: '+447700900000' })
    expect(api.post).toHaveBeenCalledWith('/api/v1/customer/auth/register', expect.objectContaining({ email: 'a@x.com' }))
    expect(r.user.id).toBe('u1')
    // Forward-pin: sessionId must round-trip from the response into
    // the parsed AuthResponse so `useLoginFlow` / `useRegisterFlow`
    // can pass it into `auth.setTokens(...)`. PR #51 P1 fix.
    expect(r.sessionId).toBe('sess_a')
  })

  // Negative pin: a backend response missing `sessionId` is the EXACT
  // failure mode that PR #51 P1 closes. Pre-fix, `loginCustomer` /
  // `registerCustomer` stripped `sessionId` from the JSON envelope;
  // the customer-app's `authResponseSchema` would throw on parse and
  // fresh sign-in/register would 500 client-side. This test pins the
  // schema's intolerance so a regression on either side surfaces
  // immediately. Locked 2026-05-08, PR #51 P1 fix.
  it('register parse FAILS when backend omits sessionId (regression guard for the PR #51 P1 contract)', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', lastName: null, phone: '+44', emailVerifiedAt: null, phoneVerifiedAt: null },
      accessToken: 'a',
      refreshToken: 'r',
      // sessionId DELIBERATELY missing — pre-fix backend shape.
    })
    await expect(authApi.register({
      firstName: 'Ada', lastName: 'Lovelace', email: 'a@x.com',
      password: 'P@ssw0rd!aaa', phone: '+447700900000',
    })).rejects.toThrow()
  })

  it('login parse FAILS when backend omits sessionId (regression guard for the PR #51 P1 contract)', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', lastName: null, phone: '+44', emailVerifiedAt: null, phoneVerifiedAt: null },
      accessToken: 'a',
      refreshToken: 'r',
      // sessionId DELIBERATELY missing.
    })
    await expect(authApi.login({ email: 'a@x.com', password: 'P@ssw0rd!aaa' })).rejects.toThrow()
  })

  it('login parse SUCCEEDS when backend includes sessionId', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', lastName: null, phone: '+44', emailVerifiedAt: null, phoneVerifiedAt: null },
      accessToken: 'a',
      refreshToken: 'r',
      sessionId: 'sess_a',
    })
    const r = await authApi.login({ email: 'a@x.com', password: 'P@ssw0rd!aaa' })
    expect(r.sessionId).toBe('sess_a')
    expect(r.user.id).toBe('u1')
  })
})
