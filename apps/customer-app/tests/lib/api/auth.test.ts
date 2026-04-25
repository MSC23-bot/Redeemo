import { api } from '@/lib/api'
import { authApi } from '@/lib/api/auth'

jest.spyOn(api, 'post')

describe('authApi', () => {
  beforeEach(() => { (api.post as jest.Mock).mockReset() })
  it('register posts the expected payload', async () => {
    (api.post as jest.Mock).mockResolvedValue({ user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', lastName: null, phone: '+44', emailVerifiedAt: null, phoneVerifiedAt: null }, accessToken: 'a', refreshToken: 'r' })
    const r = await authApi.register({ firstName: 'Ada', lastName: 'Lovelace', email: 'a@x.com', password: 'P@ssw0rd!aaa', phone: '+447700900000' })
    expect(api.post).toHaveBeenCalledWith('/api/v1/customer/auth/register', expect.objectContaining({ email: 'a@x.com' }))
    expect(r.user.id).toBe('u1')
  })
})
