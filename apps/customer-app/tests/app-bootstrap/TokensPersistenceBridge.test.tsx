/**
 * Pins the M3 PR #50 P2 fix wiring: when the api client rotates tokens
 * during a 401 retry, the bridge must persist the new pair to
 * secureStorage AND mirror them into the zustand store. Without this,
 * the next bootstrap reads the stale refresh token from storage,
 * posts it back, and gets REFRESH_TOKEN_INVALID (the old Redis row was
 * deleted by the rotation that issued the new pair) → forced sign-out.
 */
jest.mock('@/lib/storage', () => ({
  secureStorage: {
    get:    jest.fn(async () => null),
    set:    jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
  },
  prefsStorage: {
    get:    jest.fn(async () => null),
    set:    jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
  },
}))

import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { TokensPersistenceBridge } from '@/app-bootstrap/TokensPersistenceBridge'
import { api } from '@/lib/api'
import { secureStorage } from '@/lib/storage'
import { useAuthStore } from '@/stores/auth'

describe('TokensPersistenceBridge', () => {
  beforeEach(() => {
    ;(secureStorage.set as jest.Mock).mockClear()
    api.onTokensRefreshed(() => {})
  })

  afterEach(() => {
    api.onTokensRefreshed(() => {})
  })

  it('writes rotated access + refresh tokens to secureStorage', async () => {
    render(<TokensPersistenceBridge />)

    // Drive a real 401 → refresh → retry round-trip; the bridge picks
    // up the rotation event fired inside `refreshTokens()` and
    // persists the new pair.
    api.__setTokensForTests('STALE', 'OLD_REFRESH', 'sess_x', 'user_x')
    const originalFetch = global.fetch
    let calls = 0
    global.fetch = jest.fn(async (url: string) => {
      calls++
      if (calls === 1) return new Response('{}', { status: 401 })
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response(
          JSON.stringify({ accessToken: 'NEW_ACCESS', refreshToken: 'NEW_REFRESH' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    await api.get('/anything')

    await waitFor(() => {
      expect(secureStorage.set).toHaveBeenCalledWith('accessToken',  'NEW_ACCESS')
      expect(secureStorage.set).toHaveBeenCalledWith('refreshToken', 'NEW_REFRESH')
    })

    global.fetch = originalFetch
    api.__setTokensForTests(null, null, null, null)
  })

  it('mirrors rotated tokens into the zustand auth store', async () => {
    render(<TokensPersistenceBridge />)

    // Seed an authed-looking store snapshot so the assertion isn't
    // observing the bootstrap-default null state.
    useAuthStore.setState({ accessToken: 'OLD', refreshToken: 'OLD_R' })

    api.__setTokensForTests('STALE', 'OLD_REFRESH', 'sess_x', 'user_x')
    const originalFetch = global.fetch
    let calls = 0
    global.fetch = jest.fn(async (url: string) => {
      calls++
      if (calls === 1) return new Response('{}', { status: 401 })
      if (url.endsWith('/api/v1/customer/auth/refresh')) {
        return new Response(
          JSON.stringify({ accessToken: 'NEW_ACCESS', refreshToken: 'NEW_REFRESH' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    await api.get('/anything')

    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBe('NEW_ACCESS')
      expect(useAuthStore.getState().refreshToken).toBe('NEW_REFRESH')
    })

    global.fetch = originalFetch
    api.__setTokensForTests(null, null, null, null)
    useAuthStore.setState({ accessToken: null, refreshToken: null })
  })

  it('renders nothing (returns null)', () => {
    const { toJSON } = render(<TokensPersistenceBridge />)
    expect(toJSON()).toBeNull()
  })
})
