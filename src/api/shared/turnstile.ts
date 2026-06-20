// src/api/shared/turnstile.ts
//
// M1 Slice R: Cloudflare Turnstile server-side verification for the merchant
// self-serve registration captcha. Feature-gated by CAPTCHA_ENABLED, mirroring
// the EMAIL_ENABLED pattern in email.ts: when disabled the verify SKIPS with NO
// network call and NO secret requirement, so dev / CI / test boot and run without
// a TURNSTILE_SECRET_KEY. When enabled it POSTs the token to Cloudflare siteverify
// and fails CLOSED (returns false) on any network / parse error so the caller
// rejects the request. The secret is validated at boot (FEATURE_GATED_SECRETS).
import { requireSecret } from './env'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** True only when CAPTCHA_ENABLED=true (project-wide boolean-flag idiom). */
export function isCaptchaEnabled(): boolean {
  return (process.env.CAPTCHA_ENABLED ?? '') === 'true'
}

/**
 * Verify a Turnstile token against Cloudflare siteverify. Returns true when the
 * captcha passes. When CAPTCHA_ENABLED is off this is a no-op returning true (no
 * fetch, no secret). A network / parse failure returns false (fail-closed).
 */
export async function verifyTurnstile(token: string, ip?: string | null): Promise<boolean> {
  if (!isCaptchaEnabled()) return true

  const secret = requireSecret('TURNSTILE_SECRET_KEY')
  const body = new URLSearchParams({ secret, response: token ?? '' })
  if (ip) body.set('remoteip', ip)

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}
