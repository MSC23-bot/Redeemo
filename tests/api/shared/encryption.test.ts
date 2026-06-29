import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import {
  encrypt,
  decrypt,
  encryptWith,
  decryptWith,
  parseEnvelope,
  decryptEnvelope,
} from '../../../src/api/shared/encryption'
import {
  __resetKeyProviderForTests,
  KeyNotAvailableError,
  EnvelopeParseError,
} from '../../../src/api/shared/keyring'

// Deterministic 64-hex TEST keys (NOT real secrets — locally generated).
// LEGACY_KEY matches tests/setup.ts so the default bridge env is the live shape.
const LEGACY_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const PIN_KEY_A = '1111111111111111111111111111111111111111111111111111111111111111'

// Snapshot + restore the keyring env vars so each test runs in a known state and
// the boot-once provider singleton is re-parsed per test.
const KEYRING_VARS = [
  'ENCRYPTION_KEYS',
  'ENCRYPTION_KEY_ACTIVE',
  'ENCRYPTION_LEGACY_KID',
  'DECOMMISSIONED_KIDS',
  'OTP_HMAC_KEYS',
  'OTP_HMAC_KEY_ACTIVE',
  'ENCRYPTION_V2_WRITES_ENABLED',
]
let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = {}
  for (const v of [...KEYRING_VARS, 'ENCRYPTION_KEY']) saved[v] = process.env[v]
  // Default state: single-var bridge env (the current production shape).
  for (const v of KEYRING_VARS) delete process.env[v]
  process.env.ENCRYPTION_KEY = LEGACY_KEY
  __resetKeyProviderForTests()
})

afterEach(() => {
  for (const v of [...KEYRING_VARS, 'ENCRYPTION_KEY']) {
    if (saved[v] === undefined) delete process.env[v]
    else process.env[v] = saved[v]
  }
  __resetKeyProviderForTests()
})

function setExplicitRing(active = 'pin-2026-06') {
  process.env.ENCRYPTION_KEYS = JSON.stringify({ legacy: LEGACY_KEY, 'pin-2026-06': PIN_KEY_A })
  process.env.ENCRYPTION_KEY_ACTIVE = active
  __resetKeyProviderForTests()
}

// ── Existing baseline coverage (preserved through the keyring re-route) ───────
describe('encryption (baseline)', () => {
  it('encrypt then decrypt returns the original value', () => {
    const original = '1234'
    expect(decrypt(encrypt(original))).toBe(original)
  })

  it('two encrypt calls on the same input produce different ciphertexts (random IV)', () => {
    const a = encrypt('1234')
    const b = encrypt('1234')
    expect(a).not.toBe(b)
  })

  it('decrypt throws when ciphertext is tampered (GCM auth tag fails)', () => {
    const stored = encrypt('1234')
    const [iv, authTag] = stored.split(':')
    const tampered = [iv, authTag, 'deadbeef'].join(':')
    expect(() => decrypt(tampered)).toThrow()
  })

  it('decrypt throws when auth tag is tampered', () => {
    const stored = encrypt('1234')
    const parts = stored.split(':')
    parts[1] = 'ff'.repeat(16)
    expect(() => decrypt(parts.join(':'))).toThrow()
  })
})

describe('encryptWith / decryptWith primitives', () => {
  it('roundtrips a value with an explicit key (3-part legacy format)', () => {
    const stored = encryptWith('1234', LEGACY_KEY)
    expect(stored.split(':').length).toBe(3)
    expect(decryptWith(stored, LEGACY_KEY)).toBe('1234')
  })

  it('takes no IV parameter — IV is generated internally (RISK-4 structural guard)', () => {
    // encryptWith(plaintext, keyHex) has arity 2; an IV cannot be injected.
    expect(encryptWith.length).toBe(2)
  })

  it('never reproduces an identical ciphertext for the same plaintext+key (IV uniqueness)', () => {
    const a = encryptWith('1234', LEGACY_KEY)
    const b = encryptWith('1234', LEGACY_KEY)
    expect(a).not.toBe(b)
    expect(decryptWith(a, LEGACY_KEY)).toBe('1234')
    expect(decryptWith(b, LEGACY_KEY)).toBe('1234')
  })

  it('validates the key is 64-hex', () => {
    expect(() => encryptWith('x', 'deadbeef')).toThrow()
    expect(() => decryptWith('a:b:c', 'deadbeef')).toThrow()
  })

  it('a tampered GCM tag throws (not a parse/key error)', () => {
    const stored = encryptWith('1234', LEGACY_KEY)
    const [iv, , ct] = stored.split(':')
    const badTag = '0'.repeat(32)
    expect(() => decryptWith(`${iv}:${badTag}:${ct}`, LEGACY_KEY)).toThrow()
  })
})

describe('parseEnvelope', () => {
  it('parses a legacy 3-part value with kid = legacy', () => {
    const stored = encryptWith('1234', LEGACY_KEY)
    const env = parseEnvelope(stored)
    expect(env.kid).toBe('legacy')
    const [iv, tag, ct] = stored.split(':')
    expect(env.ivHex).toBe(iv)
    expect(env.tagHex).toBe(tag)
    expect(env.ctHex).toBe(ct)
  })

  it('parses a v2 5-part value with the embedded kid', () => {
    const [iv, tag, ct] = encryptWith('1234', PIN_KEY_A).split(':')
    const v2 = `v2:pin-2026-06:${iv}:${tag}:${ct}`
    const env = parseEnvelope(v2)
    expect(env.kid).toBe('pin-2026-06')
    expect(env.ivHex).toBe(iv)
    expect(env.tagHex).toBe(tag)
    expect(env.ctHex).toBe(ct)
  })

  it('throws EnvelopeParseError on a 4-part (extra-colon) value', () => {
    expect(() => parseEnvelope('a:b:c:d')).toThrow(EnvelopeParseError)
  })

  it('throws EnvelopeParseError on a v2 value with an underscore in the kid (SQL LIKE hazard)', () => {
    const [iv, tag, ct] = encryptWith('1234', PIN_KEY_A).split(':')
    expect(() => parseEnvelope(`v2:pin_2026_06:${iv}:${tag}:${ct}`)).toThrow(EnvelopeParseError)
  })

  it('throws EnvelopeParseError on an injected uppercase/colon kid (no boundary shift)', () => {
    const [iv, tag, ct] = encryptWith('1234', PIN_KEY_A).split(':')
    // A kid with disallowed chars must be rejected, not silently shift iv/tag/ct.
    expect(() => parseEnvelope(`v2:PIN-2026-06:${iv}:${tag}:${ct}`)).toThrow(EnvelopeParseError)
  })

  it('throws EnvelopeParseError on a non-hex iv', () => {
    const [, tag, ct] = encryptWith('1234', LEGACY_KEY).split(':')
    expect(() => parseEnvelope(`zzzz:${tag}:${ct}`)).toThrow(EnvelopeParseError)
  })

  it('throws EnvelopeParseError on an odd-length (truncatable) hex tag', () => {
    const [iv, , ct] = encryptWith('1234', LEGACY_KEY).split(':')
    expect(() => parseEnvelope(`${iv}:abc:${ct}`)).toThrow(EnvelopeParseError)
  })

  it('throws EnvelopeParseError on an empty ciphertext', () => {
    const [iv, tag] = encryptWith('1234', LEGACY_KEY).split(':')
    expect(() => parseEnvelope(`${iv}:${tag}:`)).toThrow(EnvelopeParseError)
  })

  it('NEVER includes the stored value in the EnvelopeParseError message', () => {
    const secret = 'aabbccddeeff00112233445566778899:deadbeef:supersecretciphertexthex'
    try {
      parseEnvelope(secret + ':extra')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(EnvelopeParseError)
      expect((err as Error).message).not.toContain('supersecretciphertexthex')
      expect((err as Error).message).not.toContain('deadbeef')
    }
  })
})

describe('decryptEnvelope', () => {
  it('decrypts a legacy 3-part value via the legacy kid', () => {
    const stored = encryptWith('1234', LEGACY_KEY)
    expect(decryptEnvelope(stored)).toBe('1234')
  })

  it('decrypts a v2 value via a pin-* kid in the ring', () => {
    setExplicitRing()
    const [iv, tag, ct] = encryptWith('1234', PIN_KEY_A).split(':')
    const v2 = `v2:pin-2026-06:${iv}:${tag}:${ct}`
    expect(decryptEnvelope(v2)).toBe('1234')
  })

  it('throws KeyNotAvailableError for an unknown kid', () => {
    const [iv, tag, ct] = encryptWith('1234', PIN_KEY_A).split(':')
    expect(() => decryptEnvelope(`v2:pin-unknown:${iv}:${tag}:${ct}`)).toThrow(KeyNotAvailableError)
  })

  it('a tampered GCM tag throws a non-parse, non-key error', () => {
    const stored = encryptWith('1234', LEGACY_KEY)
    const [iv, , ct] = stored.split(':')
    const corrupted = `${iv}:${'0'.repeat(32)}:${ct}`
    let thrown: unknown
    try {
      decryptEnvelope(corrupted)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).not.toBeInstanceOf(EnvelopeParseError)
    expect(thrown).not.toBeInstanceOf(KeyNotAvailableError)
  })
})

describe('encrypt() ENCODE LOCK (R4-#1, foundation build has NO v2 flag)', () => {
  it('(a) explicit ring + fresh non-legacy ACTIVE ⇒ 3-part value decryptable with LEGACY, NOT with ACTIVE', () => {
    setExplicitRing('pin-2026-06')
    const stored = encrypt('1234')
    // Foundation build emits 3-part (never v2) even with a non-legacy ACTIVE.
    expect(stored.split(':').length).toBe(3)
    // It is encrypted under the LEGACY key (3-part resolves via the legacy kid).
    expect(decryptWith(stored, LEGACY_KEY)).toBe('1234')
    // It is NOT encrypted under the ACTIVE (pin-2026-06) key.
    expect(() => decryptWith(stored, PIN_KEY_A)).toThrow()
  })

  it('(b) the R1 build can NEVER emit a v2 value even with a non-legacy ACTIVE + the flag set', () => {
    setExplicitRing('pin-2026-06')
    process.env.ENCRYPTION_V2_WRITES_ENABLED = 'true'
    __resetKeyProviderForTests()
    const stored = encrypt('1234')
    expect(stored.startsWith('v2:')).toBe(false)
    expect(stored.split(':').length).toBe(3)
    expect(decryptWith(stored, LEGACY_KEY)).toBe('1234')
  })

  it('(c) legacy key absent ⇒ encrypt() fails closed (never silently picks ACTIVE)', () => {
    // An explicit ring WITHOUT a legacy entry fails boot validation, so the
    // fail-closed path is exercised at provider-build time via encrypt().
    process.env.ENCRYPTION_KEYS = JSON.stringify({ 'pin-2026-06': PIN_KEY_A })
    process.env.ENCRYPTION_KEY_ACTIVE = 'pin-2026-06'
    __resetKeyProviderForTests()
    expect(() => encrypt('1234')).toThrow()
  })
})

describe('encrypt()/decrypt() wrapper — round-trips + forward-compat reader', () => {
  it('round-trips under the single-var bridge env (3-part, legacy key)', () => {
    const stored = encrypt('1234')
    expect(stored.split(':').length).toBe(3)
    expect(decrypt(stored)).toBe('1234')
  })

  it('decrypt() reads BOTH a legacy 3-part value AND a v2 value (forward-compat)', () => {
    setExplicitRing()
    const legacy = encryptWith('1234', LEGACY_KEY)
    const [iv, tag, ct] = encryptWith('5678', PIN_KEY_A).split(':')
    const v2 = `v2:pin-2026-06:${iv}:${tag}:${ct}`
    expect(decrypt(legacy)).toBe('1234')
    expect(decrypt(v2)).toBe('5678')
  })

  it('two encrypt() calls of the same plaintext differ (IV uniqueness through the wrapper)', () => {
    expect(encrypt('1234')).not.toBe(encrypt('1234'))
  })
})

describe('seed/helper compatibility — single-var bridge byte-format identity', () => {
  it('encrypt() under the single-var env yields a 3-part value the legacy key decrypts (seeds keep working)', () => {
    // No ENCRYPTION_KEYS set → bridge mode → 3-part under legacy, exactly as the
    // pre-keyring encrypt() behaved. Proves seed.ts / seed-demo.ts /
    // reset-covelum-pins.ts / get-branch-pin.ts need NO modification.
    delete process.env.ENCRYPTION_KEYS
    delete process.env.ENCRYPTION_KEY_ACTIVE
    process.env.ENCRYPTION_KEY = LEGACY_KEY
    __resetKeyProviderForTests()
    const stored = encrypt('1234')
    expect(stored.split(':').length).toBe(3)
    expect(decryptWith(stored, LEGACY_KEY)).toBe('1234')
    expect(decrypt(stored)).toBe('1234')
  })
})

// ── Adversarial-review regression pins (R1 round-2) ───────────────────────────

describe('parseEnvelope byte-length validation (CRYPTO-1 — wrong-length must be LOUD)', () => {
  // Even-hex but wrong BYTE length must throw EnvelopeParseError from parseEnvelope
  // (→ Guard-10 loud bucket b), NOT fall through to gcmDecrypt's plain-Error asserts
  // (→ silent wrong-PIN bucket c). Pre-fix these passed parseEnvelope.
  const tag32 = '00'.repeat(16) // 16-byte tag (valid)
  const iv24 = '00'.repeat(12) // 12-byte iv (valid)

  it('rejects an even-hex but 4-byte IV (legacy 3-part)', () => {
    expect(() => parseEnvelope(`aabbccdd:${tag32}:deadbeef`)).toThrow(EnvelopeParseError)
  })
  it('rejects an even-hex but 4-byte authTag (legacy 3-part)', () => {
    expect(() => parseEnvelope(`${iv24}:deadbeef:cafebabe`)).toThrow(EnvelopeParseError)
  })
  it('rejects an even-hex but wrong-byte-length IV in a v2 value', () => {
    expect(() => parseEnvelope(`v2:pin-2026-06:aabbccdd:${tag32}:deadbeef`)).toThrow(EnvelopeParseError)
  })
  it('a wrong-byte-length value is NOT a plain Error (so Guard-10 classifies it loud)', () => {
    let thrown: unknown
    try {
      parseEnvelope(`aabbccdd:${tag32}:deadbeef`)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(EnvelopeParseError)
  })
})

describe('custom ENCRYPTION_LEGACY_KID round-trip (BV-1 — must not brick reads)', () => {
  it('bridge mode: a non-default ENCRYPTION_LEGACY_KID still encrypts + decrypts 3-part', () => {
    process.env.ENCRYPTION_LEGACY_KID = 'pin-old'
    process.env.ENCRYPTION_KEY = LEGACY_KEY
    delete process.env.ENCRYPTION_KEYS
    delete process.env.ENCRYPTION_KEY_ACTIVE
    __resetKeyProviderForTests()
    const stored = encrypt('1234')
    expect(stored.split(':').length).toBe(3)
    // Pre-fix this threw KeyNotAvailableError('pin', 'legacy') — the reader
    // hardcoded 'legacy' instead of resolving the configured legacy kid.
    expect(decrypt(stored)).toBe('1234')
  })

  it('explicit mode: legacy key under a non-default legacy kid still round-trips', () => {
    process.env.ENCRYPTION_KEYS = JSON.stringify({ 'pin-old': LEGACY_KEY, 'pin-2026-06': PIN_KEY_A })
    process.env.ENCRYPTION_KEY_ACTIVE = 'pin-2026-06'
    process.env.ENCRYPTION_LEGACY_KID = 'pin-old'
    process.env.ENCRYPTION_KEY = LEGACY_KEY
    __resetKeyProviderForTests()
    const stored = encrypt('1234')
    expect(stored.split(':').length).toBe(3) // R1 always emits 3-part (encode lock)
    expect(decrypt(stored)).toBe('1234') // resolves via getLegacyKid()='pin-old'
  })
})
