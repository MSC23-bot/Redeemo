import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import {
  requireSecret,
  requireSecretWhenEnabled,
  validateRequiredEnv,
  REQUIRED_SECRETS,
} from '../../../src/api/shared/env'

describe('requireSecret', () => {
  const KEY = 'TEST_ONLY_SECRET_FOR_ENV_SPEC'
  afterEach(() => {
    delete process.env[KEY]
  })

  it('returns the value when set to a real value', () => {
    process.env[KEY] = 'a-real-secret-value'
    expect(requireSecret(KEY)).toBe('a-real-secret-value')
  })

  it('throws when the secret is missing', () => {
    delete process.env[KEY]
    expect(() => requireSecret(KEY)).toThrow(/not set/)
  })

  it('throws when the secret is empty / whitespace', () => {
    process.env[KEY] = '   '
    expect(() => requireSecret(KEY)).toThrow(/not set/)
  })

  it.each([
    'sk_test_placeholder',
    'whsec_placeholder',
    'dev-customer-secret',
    'REPLACE_ME-now',
    'your-64-char-hex-key-here',
  ])('throws on placeholder value %s', (val) => {
    process.env[KEY] = val
    expect(() => requireSecret(KEY)).toThrow(/placeholder/)
  })
})

describe('validateRequiredEnv', () => {
  // Snapshot + restore the full required set so this suite is hermetic and
  // does not leak into other tests (some required secrets are set by tests/setup.ts).
  let saved: Record<string, string | undefined>
  beforeEach(() => {
    saved = {}
    for (const k of REQUIRED_SECRETS) saved[k] = process.env[k]
  })
  afterEach(() => {
    for (const k of REQUIRED_SECRETS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('passes when every required secret is set to a real value', () => {
    for (const k of REQUIRED_SECRETS) process.env[k] = `real-${k}-value`
    expect(() => validateRequiredEnv()).not.toThrow()
  })

  it('collects ALL missing secrets into one error', () => {
    for (const k of REQUIRED_SECRETS) delete process.env[k]
    let message = ''
    try {
      validateRequiredEnv()
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/Refusing to start/)
    // every required secret name appears in the single aggregated error
    for (const k of REQUIRED_SECRETS) expect(message).toContain(k)
  })
})

describe('requireSecretWhenEnabled (PR-0.3 feature-gated secret)', () => {
  afterEach(() => {
    delete process.env.EMAIL_ENABLED
    delete process.env.RESEND_API_KEY
  })

  it('is a no-op when the flag is off — even if the secret is missing', () => {
    delete process.env.EMAIL_ENABLED
    delete process.env.RESEND_API_KEY
    expect(() => requireSecretWhenEnabled('EMAIL_ENABLED', 'true', 'RESEND_API_KEY')).not.toThrow()
    process.env.EMAIL_ENABLED = 'false'
    expect(() => requireSecretWhenEnabled('EMAIL_ENABLED', 'true', 'RESEND_API_KEY')).not.toThrow()
  })

  it('throws when the flag is on but the secret is missing', () => {
    process.env.EMAIL_ENABLED = 'true'
    delete process.env.RESEND_API_KEY
    expect(() => requireSecretWhenEnabled('EMAIL_ENABLED', 'true', 'RESEND_API_KEY')).toThrow(/RESEND_API_KEY/)
  })

  it('passes when the flag is on and the secret is a real value', () => {
    process.env.EMAIL_ENABLED = 'true'
    process.env.RESEND_API_KEY = 're_a_real_key'
    expect(() => requireSecretWhenEnabled('EMAIL_ENABLED', 'true', 'RESEND_API_KEY')).not.toThrow()
  })
})

describe('validateRequiredEnv — EMAIL_ENABLED gate', () => {
  let saved: Record<string, string | undefined>
  beforeEach(() => {
    saved = {}
    for (const k of [...REQUIRED_SECRETS, 'EMAIL_ENABLED', 'RESEND_API_KEY']) saved[k] = process.env[k]
    // satisfy the hard required set so only the email gate is under test
    for (const k of REQUIRED_SECRETS) process.env[k] = `real-${k}-value`
  })
  afterEach(() => {
    for (const k of [...REQUIRED_SECRETS, 'EMAIL_ENABLED', 'RESEND_API_KEY']) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('does NOT require RESEND_API_KEY when EMAIL_ENABLED is off', () => {
    delete process.env.EMAIL_ENABLED
    delete process.env.RESEND_API_KEY
    expect(() => validateRequiredEnv()).not.toThrow() // dark deploy boots without the key
  })

  it('requires RESEND_API_KEY (with a helpful suffix) when EMAIL_ENABLED=true', () => {
    process.env.EMAIL_ENABLED = 'true'
    delete process.env.RESEND_API_KEY
    let message = ''
    try {
      validateRequiredEnv()
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/Refusing to start/)
    expect(message).toContain('RESEND_API_KEY')
    expect(message).toContain('required when EMAIL_ENABLED=true')
  })

  it('passes when EMAIL_ENABLED=true and RESEND_API_KEY is set', () => {
    process.env.EMAIL_ENABLED = 'true'
    process.env.RESEND_API_KEY = 're_a_real_key'
    expect(() => validateRequiredEnv()).not.toThrow()
  })
})
