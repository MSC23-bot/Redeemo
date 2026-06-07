import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { requireSecret, validateRequiredEnv, REQUIRED_SECRETS } from '../../../src/api/shared/env'

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
