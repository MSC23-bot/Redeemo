import { api, ApiClientError } from '@/lib/api'

const originalFetch = global.fetch

describe('api client', () => {
  afterEach(() => { global.fetch = originalFetch })

  it('attaches Authorization bearer when access token is set', async () => {
    api.__setTokensForTests('ACCESS', 'REFRESH')
    const calls: RequestInit[] = []
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init!)
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    await api.get('/thing')
    expect((calls[0]!.headers as Record<string, string>)['Authorization']).toBe('Bearer ACCESS')
  })

  it('refreshes on 401 and retries once', async () => {
    api.__setTokensForTests('STALE', 'REFRESH')
    let calls = 0
    global.fetch = jest.fn(async (url: string) => {
      calls++
      if (calls === 1) return new Response('{}', { status: 401 })
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'NEW', refreshToken: 'NEW_R' }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch
    const res = await api.get<{ ok: boolean }>('/thing')
    expect(res.ok).toBe(true)
  })

  it('throws ApiClientError with code + status on non-2xx', async () => {
    api.__setTokensForTests('A', 'R')
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ code: 'EMAIL_TAKEN', message: 'x' }), { status: 400, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
    await expect(api.post('/x', {})).rejects.toMatchObject({ code: 'EMAIL_TAKEN', status: 400 })
  })
})
