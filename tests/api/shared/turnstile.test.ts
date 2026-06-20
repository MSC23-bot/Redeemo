import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { verifyTurnstile, isCaptchaEnabled } from '../../../src/api/shared/turnstile'

// M1 Slice R — Turnstile verify helper. Feature-gated by CAPTCHA_ENABLED. Tests
// NEVER hit the real Cloudflare endpoint: global fetch is mocked, and the disabled
// path asserts no fetch happens at all.
const TEST_SECRET = '1x0000000000000000000000000000000AA' // Cloudflare always-pass test secret

let savedFlag: string | undefined
let savedSecret: string | undefined
beforeEach(() => {
  savedFlag = process.env.CAPTCHA_ENABLED
  savedSecret = process.env.TURNSTILE_SECRET_KEY
})
afterEach(() => {
  if (savedFlag === undefined) delete process.env.CAPTCHA_ENABLED
  else process.env.CAPTCHA_ENABLED = savedFlag
  if (savedSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY
  else process.env.TURNSTILE_SECRET_KEY = savedSecret
  vi.restoreAllMocks()
})

describe('isCaptchaEnabled', () => {
  it('is true only for the exact string "true"', () => {
    process.env.CAPTCHA_ENABLED = 'true'
    expect(isCaptchaEnabled()).toBe(true)
    process.env.CAPTCHA_ENABLED = 'TRUE'
    expect(isCaptchaEnabled()).toBe(false)
    delete process.env.CAPTCHA_ENABLED
    expect(isCaptchaEnabled()).toBe(false)
  })
})

describe('verifyTurnstile', () => {
  it('returns true WITHOUT any network call when CAPTCHA_ENABLED is off', async () => {
    delete process.env.CAPTCHA_ENABLED
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const ok = await verifyTurnstile('any-token', '1.2.3.4')
    expect(ok).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('POSTs to Cloudflare siteverify and returns the provider success boolean when enabled', async () => {
    process.env.CAPTCHA_ENABLED = 'true'
    process.env.TURNSTILE_SECRET_KEY = TEST_SECRET
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )
    const ok = await verifyTurnstile('good-token', '1.2.3.4')
    expect(ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0][0])).toContain('challenges.cloudflare.com/turnstile/v0/siteverify')
  })

  it('returns false when the provider reports success:false', async () => {
    process.env.CAPTCHA_ENABLED = 'true'
    process.env.TURNSTILE_SECRET_KEY = TEST_SECRET
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    )
    expect(await verifyTurnstile('bad-token', null)).toBe(false)
  })

  it('returns false (fail-closed) when the network throws', async () => {
    process.env.CAPTCHA_ENABLED = 'true'
    process.env.TURNSTILE_SECRET_KEY = TEST_SECRET
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    expect(await verifyTurnstile('tok', null)).toBe(false)
  })
})
