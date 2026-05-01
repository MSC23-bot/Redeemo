import Constants from 'expo-constants'

const BASE_URL: string = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://localhost:3000'

type Tokens = { access: string | null; refresh: string | null }

let tokens: Tokens = { access: null, refresh: null }
let onSessionExpiredCb: (() => void) | null = null
let refreshing: Promise<void> | null = null

export class ApiClientError extends Error {
  readonly code: string
  readonly status: number
  readonly field?: string
  constructor(message: string, code: string, status: number, field?: string) {
    super(message); this.code = code; this.status = status; if (field !== undefined) this.field = field
  }
}

async function doFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (tokens.access) headers['Authorization'] = `Bearer ${tokens.access}` as string
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers })

  if (res.status === 401 && retry && tokens.refresh && !path.endsWith('/auth/refresh')) {
    try {
      await refreshTokens()
      return doFetch<T>(path, init, false)
    } catch {
      tokens = { access: null, refresh: null }
      onSessionExpiredCb?.()
      throw new ApiClientError('Session expired', 'SESSION_EXPIRED', 401)
    }
  }

  const text = await res.text()
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  if (!res.ok) {
    // Backend serialises errors as `{ error: { code, message, statusCode, field? } }`
    // (see src/api/app.ts setErrorHandler + AppError.toJSON()). Unwrap the
    // envelope so `code` / `message` / `field` are read from the inner object.
    // Falls back to top-level fields for backwards compatibility with anything
    // that doesn't wrap.
    const nested =
      json.error && typeof json.error === 'object' && !Array.isArray(json.error)
        ? (json.error as Record<string, unknown>)
        : null
    const errorBody = nested ?? json
    throw new ApiClientError(
      (errorBody.message as string | undefined) ?? res.statusText,
      (errorBody.code as string | undefined) ?? 'UNKNOWN',
      res.status,
      errorBody.field as string | undefined,
    )
  }
  return json as T
}

async function refreshTokens(): Promise<void> {
  if (!tokens.refresh) throw new Error('no refresh token')
  if (refreshing) return refreshing
  refreshing = (async () => {
    const r = await fetch(`${BASE_URL}/api/v1/customer/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refresh }),
    })
    if (!r.ok) throw new Error('refresh failed')
    const body = (await r.json()) as { accessToken: string; refreshToken: string }
    tokens = { access: body.accessToken, refresh: body.refreshToken }
  })()
  try { await refreshing } finally { refreshing = null }
}

export function setTokens({ accessToken, refreshToken }: { accessToken: string | null; refreshToken: string | null }) {
  tokens = { access: accessToken, refresh: refreshToken }
}

export const api = {
  get:   <T>(path: string) => doFetch<T>(path, { method: 'GET' }),
  post:  <T>(path: string, body: unknown) => doFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => doFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put:   <T>(path: string, body: unknown) => doFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del:   <T>(path: string) => doFetch<T>(path, { method: 'DELETE' }),
  setTokens(access: string | null, refresh: string | null) { tokens = { access, refresh } },
  onSessionExpired(cb: () => void) { onSessionExpiredCb = cb },
  __setTokensForTests(a: string | null, r: string | null) { tokens = { access: a, refresh: r } },
}
