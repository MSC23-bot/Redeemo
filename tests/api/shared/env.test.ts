import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import {
  requireSecret,
  requireSecretWhenEnabled,
  validateRequiredEnv,
  REQUIRED_SECRETS,
} from '../../../src/api/shared/env'

// CodeRabbit (Minor, test hermeticity): validateRequiredEnv() now also runs the
// R1 keyring boot validation. The suites below that are NOT about the keyring
// must clear any ambient keyring map/active/legacy-kid vars first — otherwise a
// stray ENCRYPTION_KEY_ACTIVE / ENCRYPTION_KEYS leaked into the worker (another
// suite, or a developer's shell) would flip those tests into explicit-keyring
// mode and fail spuriously. The dedicated keyring suite manages these itself.
const KEYRING_PERTURB_VARS = [
  'ENCRYPTION_KEYS',
  'ENCRYPTION_KEY_ACTIVE',
  'ENCRYPTION_LEGACY_KID',
  'DECOMMISSIONED_KIDS',
  'OTP_HMAC_KEYS',
  'OTP_HMAC_KEY_ACTIVE',
] as const

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
    for (const k of [...REQUIRED_SECRETS, ...KEYRING_PERTURB_VARS]) saved[k] = process.env[k]
    // bridge path only: drop any ambient keyring map/active vars
    for (const k of KEYRING_PERTURB_VARS) delete process.env[k]
  })
  afterEach(() => {
    for (const k of [...REQUIRED_SECRETS, ...KEYRING_PERTURB_VARS]) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('passes when every required secret is set to a real value', () => {
    for (const k of REQUIRED_SECRETS) process.env[k] = `real-${k}-value`
    // ENCRYPTION_KEY must be a valid 64-hex value: the keyring boot validation
    // (R1) is now part of validateRequiredEnv() and fail-closes on a non-hex key.
    process.env.ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
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
    for (const k of [...REQUIRED_SECRETS, 'EMAIL_ENABLED', 'RESEND_API_KEY', ...KEYRING_PERTURB_VARS]) saved[k] = process.env[k]
    // satisfy the hard required set so only the email gate is under test
    for (const k of REQUIRED_SECRETS) process.env[k] = `real-${k}-value`
    process.env.ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
    for (const k of KEYRING_PERTURB_VARS) delete process.env[k] // bridge path only
  })
  afterEach(() => {
    for (const k of [...REQUIRED_SECRETS, 'EMAIL_ENABLED', 'RESEND_API_KEY', ...KEYRING_PERTURB_VARS]) {
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

describe('validateRequiredEnv — STORAGE_ENABLED gate (PR-0.5; two-bucket split 2026-07-09)', () => {
  const R2_SECRETS = [
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_ENDPOINT',
    'R2_BUCKET',
    'R2_PUBLIC_BUCKET',
    'R2_PUBLIC_BASE_URL',
  ]
  let saved: Record<string, string | undefined>
  beforeEach(() => {
    saved = {}
    for (const k of [...REQUIRED_SECRETS, 'STORAGE_ENABLED', ...R2_SECRETS, ...KEYRING_PERTURB_VARS]) saved[k] = process.env[k]
    for (const k of REQUIRED_SECRETS) process.env[k] = `real-${k}-value`
    process.env.ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
    for (const k of R2_SECRETS) delete process.env[k]
    for (const k of KEYRING_PERTURB_VARS) delete process.env[k] // bridge path only
  })
  afterEach(() => {
    for (const k of [...REQUIRED_SECRETS, 'STORAGE_ENABLED', ...R2_SECRETS, ...KEYRING_PERTURB_VARS]) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('does NOT require the R2 secrets when STORAGE_ENABLED is off (dark deploy boots)', () => {
    delete process.env.STORAGE_ENABLED
    expect(() => validateRequiredEnv()).not.toThrow()
  })

  it('requires EVERY R2 secret (aggregated) when STORAGE_ENABLED=true', () => {
    process.env.STORAGE_ENABLED = 'true'
    let message = ''
    try {
      validateRequiredEnv()
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/Refusing to start/)
    for (const k of R2_SECRETS) {
      expect(message).toContain(k)
    }
    expect(message).toContain('required when STORAGE_ENABLED=true')
  })

  it('passes when STORAGE_ENABLED=true and all R2 secrets are set', () => {
    process.env.STORAGE_ENABLED = 'true'
    for (const k of R2_SECRETS) process.env[k] = `real-${k}`
    expect(() => validateRequiredEnv()).not.toThrow()
  })
})

describe('validateRequiredEnv — keyring boot validation (R1)', () => {
  const VALID = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
  const PIN_KEY = '1111111111111111111111111111111111111111111111111111111111111111'
  const KEYRING_VARS = [
    'ENCRYPTION_KEYS',
    'ENCRYPTION_KEY_ACTIVE',
    'ENCRYPTION_LEGACY_KID',
    'DECOMMISSIONED_KIDS',
    'OTP_HMAC_KEYS',
    'OTP_HMAC_KEY_ACTIVE',
  ]
  let saved: Record<string, string | undefined>
  beforeEach(() => {
    saved = {}
    for (const k of [...REQUIRED_SECRETS, ...KEYRING_VARS]) saved[k] = process.env[k]
    for (const k of REQUIRED_SECRETS) process.env[k] = `real-${k}-value`
    process.env.ENCRYPTION_KEY = VALID
    for (const k of KEYRING_VARS) delete process.env[k]
  })
  afterEach(() => {
    for (const k of [...REQUIRED_SECRETS, ...KEYRING_VARS]) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('passes for the current single-var bridge env (legacy-only ring)', () => {
    expect(() => validateRequiredEnv()).not.toThrow()
  })

  it('passes for a valid explicit PIN ring', () => {
    process.env.ENCRYPTION_KEYS = JSON.stringify({ legacy: VALID, 'pin-2026-06': PIN_KEY })
    process.env.ENCRYPTION_KEY_ACTIVE = 'pin-2026-06'
    expect(() => validateRequiredEnv()).not.toThrow()
  })

  it('fail-closes on malformed ENCRYPTION_KEYS JSON (problem appended to the aggregated error)', () => {
    process.env.ENCRYPTION_KEYS = '{not json'
    process.env.ENCRYPTION_KEY_ACTIVE = 'pin-2026-06'
    let message = ''
    try {
      validateRequiredEnv()
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/Refusing to start/)
    expect(message).toMatch(/ENCRYPTION_KEYS/)
  })

  it('fail-closes when ACTIVE is in DECOMMISSIONED_KIDS', () => {
    process.env.ENCRYPTION_KEYS = JSON.stringify({ legacy: VALID, 'pin-2026-06': PIN_KEY })
    process.env.ENCRYPTION_KEY_ACTIVE = 'pin-2026-06'
    process.env.DECOMMISSIONED_KIDS = 'pin-2026-06'
    expect(() => validateRequiredEnv()).toThrow(/Refusing to start/)
  })
})
