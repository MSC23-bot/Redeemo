import { useEffect } from 'react'
import { api } from '@/lib/api'
import { secureStorage } from '@/lib/storage'
import { useAuthStore } from '@/stores/auth'

/**
 * Persists access+refresh tokens to `secureStorage` whenever the api
 * client rotates them inside its 401-retry path, and mirrors the new
 * pair into the zustand store so any consumer reading
 * `useAuthStore((s) => s.accessToken)` stays in sync.
 *
 * Without this bridge the api module's `tokens` object holds the new
 * pair in memory but the persistent store still has the old one — on
 * app relaunch, `bootstrap()` reads the old refresh token from
 * secureStorage, the backend's Redis row for it was deleted by the
 * rotation that issued the new pair, and the very next request gets
 * `REFRESH_TOKEN_INVALID` → forced sign-out.
 *
 * This is the M3 PR #50 P2 fix — one-time mount in the app shell,
 * single-subscriber registration, fire-and-forget persistence.
 */
export function TokensPersistenceBridge() {
  useEffect(() => {
    api.onTokensRefreshed(({ accessToken, refreshToken }) => {
      // Update zustand state synchronously so a `useAuthStore`
      // selector that reads `accessToken` returns the live token on
      // the next render — even before secureStorage finishes writing.
      useAuthStore.setState({ accessToken, refreshToken })
      // Persist asynchronously. If the write fails, the in-memory
      // rotation in `api.ts` still stands and the next 401 will
      // succeed; only an app relaunch in the failure window would
      // re-trigger the spurious sign-out — same risk profile as not
      // having the bridge at all, just narrower.
      void Promise.all([
        secureStorage.set('accessToken',  accessToken),
        secureStorage.set('refreshToken', refreshToken),
      ]).catch(() => {
        /* swallow — best-effort persistence */
      })
    })
  }, [])

  return null
}
