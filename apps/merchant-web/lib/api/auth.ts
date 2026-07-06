import { z } from 'zod'
import { apiFetch, ApiError } from './client'

// M1 Slice 1: typed merchant-auth clients. The token-issuing flows go through the
// same-origin BFF route handlers (/api/merchant-auth/*) which set the httpOnly
// cookie; the public flows (forgot/reset/claim/resend) go DIRECT to the backend
// (they issue no tokens, so there is no cookie to manage) via apiFetch.

const merchantSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  approvalStatus: z.string(),
})
export type SessionMerchant = z.infer<typeof merchantSchema>

const loginResultSchema = z.union([
  z.object({ status: z.literal('OTP_REQUIRED'), sessionChallenge: z.string() }),
  z.object({ accessToken: z.string(), merchant: merchantSchema }),
])
export type LoginResult = z.infer<typeof loginResultSchema>

const tokensResultSchema = z.object({ accessToken: z.string(), merchant: merchantSchema })
export type TokensResult = z.infer<typeof tokensResultSchema>

const verifySentSchema = z.object({ status: z.literal('VERIFY_EMAIL_SENT'), sessionChallenge: z.string() })
export type VerifySentResult = z.infer<typeof verifySentSchema>

const messageSchema = z.object({ message: z.string() })

export interface DeviceFields {
  deviceId: string
  deviceType: 'web'
  deviceName?: string
}

/** POST to a same-origin BFF route handler; throws ApiError on a non-2xx. */
async function bffPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`/api/merchant-auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

export const authApi = {
  async login(body: { email: string; password: string } & DeviceFields): Promise<LoginResult> {
    return loginResultSchema.parse(await bffPost('login', body))
  },

  async verifyOtp(body: { sessionChallenge: string; code: string }): Promise<TokensResult> {
    return tokensResultSchema.parse(await bffPost('otp-verify', body))
  },

  async register(
    body: {
      firstName: string
      lastName: string
      email: string
      mobile?: string
      mobileCountryCode?: string
      password: string
      businessName: string
      termsAccepted: true
      turnstileToken: string
    } & DeviceFields,
  ): Promise<VerifySentResult> {
    return verifySentSchema.parse(await bffPost('register', body))
  },

  async verifyEmail(body: { sessionChallenge: string; code: string }): Promise<TokensResult> {
    return tokensResultSchema.parse(await bffPost('register-verify', body))
  },

  async resendVerification(body: { sessionChallenge: string }): Promise<{ message: string }> {
    return messageSchema.parse(
      await apiFetch('/api/v1/merchant/auth/register/resend', { method: 'POST', body: JSON.stringify(body) }),
    )
  },

  async forgotPassword(body: { email: string }): Promise<{ message: string }> {
    return messageSchema.parse(
      await apiFetch('/api/v1/merchant/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }),
    )
  },

  async resetPassword(body: { token: string; newPassword: string }): Promise<{ message: string }> {
    return messageSchema.parse(
      await apiFetch('/api/v1/merchant/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),
    )
  },

  async claim(body: { token: string; newPassword: string }): Promise<{ message: string }> {
    return messageSchema.parse(
      await apiFetch('/api/v1/merchant/auth/claim', { method: 'POST', body: JSON.stringify(body) }),
    )
  },

  /**
   * Forward the captured access token (§4.5 point 0 — captured by the caller
   * BEFORE its own state reset) so the BFF/backend can revoke the session.
   * Unlike the old best-effort version, this does NOT swallow errors/aborts:
   * the caller (signOut) needs to distinguish a confirmed 2xx from a
   * timeout/failure (logout-durability design §4.5). Accepts an AbortSignal so
   * the caller can bound the wait.
   *
   * The result reports TWO INDEPENDENT axes — do not collapse them:
   *   - `ok`          → COOKIE-CLEARANCE confirmation. `res.ok` (a 2xx) means
   *                     the BFF ran to completion and its Set-Cookie clearing
   *                     the httpOnly session cookie reached the browser. This
   *                     is the axis signOut branches on to label local cookie
   *                     clearance confirmed vs UNCONFIRMED.
   *   - `remoteRevoke`→ SERVER-SIDE REVOKE DURABILITY, forwarded verbatim from
   *                     the backend ('confirmed' | 'pending' | 'unavailable').
   *                     Redis may be degraded ('pending'/'unavailable') while
   *                     the cookie was still cleared cleanly (`ok === true`).
   *
   * These are orthogonal by design: a `pending` revoke on a successful 2xx is a
   * real, expected state (cookie gone, server revoke durably queued). That is
   * why `ok` is `res.ok` and NOT `remoteRevoke === 'confirmed'` — the latter
   * (CodeRabbit #390 Finding 1's suggestion, DECLINED) would mislabel that valid
   * degraded-but-cleared outcome as an unconfirmed cookie clearance and push the
   * user into a false failure path.
   */
  async logout(token: string | null, signal?: AbortSignal): Promise<LogoutResult> {
    try {
      const res = await fetch('/api/merchant-auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal,
      })
      const data = (await res.json().catch(() => null)) as { remoteRevoke?: string } | null
      const remoteRevoke =
        data?.remoteRevoke === 'confirmed' || data?.remoteRevoke === 'pending' || data?.remoteRevoke === 'unavailable'
          ? data.remoteRevoke
          : 'unavailable'
      return { ok: res.ok, status: res.status, remoteRevoke }
    } catch (err) {
      // Network failure, timeout, or abort — surface it, don't swallow. The
      // caller treats this identically to a non-2xx: cookie clearance is
      // UNCONFIRMED.
      return { ok: false, status: 0, remoteRevoke: 'unavailable', error: err }
    }
  },
}

export interface LogoutResult {
  ok: boolean
  status: number
  remoteRevoke: 'confirmed' | 'pending' | 'unavailable'
  error?: unknown
}
