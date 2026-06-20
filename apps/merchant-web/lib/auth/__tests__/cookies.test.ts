/**
 * @jest-environment node
 */
import { setSessionCookie, readSessionCookie, clearSessionCookie } from '@/lib/auth/cookies'

const store = new Map<string, { value: string; options?: Record<string, unknown> }>()
const cookieStore = {
  set: jest.fn((name: string, value: string, options?: Record<string, unknown>) => {
    store.set(name, { value, options })
  }),
  get: jest.fn((name: string) => {
    const e = store.get(name)
    return e ? { name, value: e.value } : undefined
  }),
  delete: jest.fn((name: string) => {
    store.delete(name)
  }),
}

jest.mock('next/headers', () => ({ cookies: jest.fn(async () => cookieStore) }))

describe('merchant session cookie (M1 Slice 1)', () => {
  beforeEach(() => {
    store.clear()
    jest.clearAllMocks()
  })

  it('sets an httpOnly + SameSite=Lax cookie at path / holding the refresh material', async () => {
    await setSessionCookie({ refreshToken: 'rt', sessionId: 'sid', entityId: 'eid' })
    expect(cookieStore.set).toHaveBeenCalledTimes(1)
    const [name, value, options] = cookieStore.set.mock.calls[0]
    expect(name).toBe('redeemo_merchant_session')
    expect(JSON.parse(value)).toEqual({ refreshToken: 'rt', sessionId: 'sid', entityId: 'eid' })
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
  })

  it('reads back a valid session and returns null for malformed/incomplete JSON', async () => {
    await setSessionCookie({ refreshToken: 'rt', sessionId: 'sid', entityId: 'eid' })
    expect(await readSessionCookie()).toEqual({ refreshToken: 'rt', sessionId: 'sid', entityId: 'eid' })

    store.set('redeemo_merchant_session', { value: 'not json' })
    expect(await readSessionCookie()).toBeNull()

    store.set('redeemo_merchant_session', { value: JSON.stringify({ refreshToken: 'rt' }) }) // missing fields
    expect(await readSessionCookie()).toBeNull()
  })

  it('returns null when there is no cookie', async () => {
    expect(await readSessionCookie()).toBeNull()
  })

  it('clears the cookie', async () => {
    await setSessionCookie({ refreshToken: 'rt', sessionId: 'sid', entityId: 'eid' })
    await clearSessionCookie()
    expect(cookieStore.delete).toHaveBeenCalledWith('redeemo_merchant_session')
  })
})
