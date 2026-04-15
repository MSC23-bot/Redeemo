const ACCESS_KEY = 'redeemo_access_token'
const REFRESH_KEY = 'redeemo_refresh_token'
const USER_KEY = 'redeemo_user'
const SESSION_KEY = 'redeemo_session'
const DEVICE_KEY = 'redeemo_device_id'
const FLAG_COOKIE = 'redeemo_auth'

export function saveTokens(accessToken: string, refreshToken: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ACCESS_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
  document.cookie = `${FLAG_COOKIE}=1; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`
}

export function clearTokens() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  document.cookie = `${FLAG_COOKIE}=; path=/; max-age=0`
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REFRESH_KEY)
}

export function saveUser(user: { id: string; name: string; email: string; profileImageUrl?: string | null }) {
  if (typeof window === 'undefined') return
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getUser(): { id: string; name: string; email: string; profileImageUrl?: string | null } | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(USER_KEY)
  if (!stored) return null
  try { return JSON.parse(stored) } catch { return null }
}

export function patchStoredUser(partial: Partial<{ id: string; name: string; email: string; profileImageUrl: string | null }>) {
  const current = getUser()
  if (!current) return
  saveUser({ ...current, ...partial })
}

export function clearUser() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(USER_KEY)
}

export function saveSession(entityId: string, sessionId: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_KEY, JSON.stringify({ entityId, sessionId }))
}

export function getSession(): { entityId: string; sessionId: string } | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(SESSION_KEY)
  if (!stored) return null
  try { return JSON.parse(stored) } catch { return null }
}

export function clearSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_KEY)
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return crypto.randomUUID()
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}
