import { describe, it, expect, beforeAll } from 'vitest'
import { encrypt, decrypt, encryptWith, decryptWith } from '../../../src/api/shared/encryption'

// TEST-ONLY keys generated locally (NEVER a real/staging key). Two distinct
// 64-hex (32-byte) values so cross-key isolation can be proven.
const K1 = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const K2 = 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100'

describe('encryption', () => {
  beforeAll(() => {
    // The default-key path (encrypt/decrypt) reads process.env.ENCRYPTION_KEY.
    process.env.ENCRYPTION_KEY = K1
  })

  // ── existing behaviour preserved (regression) ──────────────────────────

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

  // ── (b) ciphertext-format compatibility: a value the OLD encrypt() shape
  //        produced must still decrypt. The format is iv(12B):authTag(16B):ct.
  it('decrypt accepts the established 3-part ivHex:authTagHex:ciphertextHex format', () => {
    const stored = encrypt('9999')
    const parts = stored.split(':')
    expect(parts).toHaveLength(3)
    // IV = 12 bytes = 24 hex chars; authTag = 16 bytes = 32 hex chars.
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/)
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/)
    // Round-trips back through decrypt unchanged.
    expect(decrypt(stored)).toBe('9999')
  })

  // ── (a) cross-wrapper compatibility: a value produced by the default-key
  //        encrypt() decrypts via decryptWith() using the same key, proving the
  //        wrappers delegate to identical primitives (byte-identical format).
  it('encrypt() output decrypts via decryptWith() with the same key', () => {
    process.env.ENCRYPTION_KEY = K1
    const stored = encrypt('4321')
    expect(decryptWith(stored, K1)).toBe('4321')
  })

  it('encryptWith() output decrypts via decrypt() when env key matches', () => {
    process.env.ENCRYPTION_KEY = K1
    const stored = encryptWith('5678', K1)
    expect(decrypt(stored)).toBe('5678')
  })

  // ── (c) explicit-key round-trip ────────────────────────────────────────
  it('encryptWith then decryptWith with an explicit key round-trips', () => {
    const stored = encryptWith('0000', K2)
    expect(decryptWith(stored, K2)).toBe('0000')
  })

  it('encryptWith produces the same 3-part format as encrypt', () => {
    const stored = encryptWith('1111', K2)
    const parts = stored.split(':')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/)
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/)
  })

  // ── (d) cross-key: encryptWith(p, K1) FAILS decryptWith(s, K2) ─────────
  it('a value encrypted under K1 cannot be decrypted under K2 (GCM auth fails)', () => {
    const stored = encryptWith('2468', K1)
    expect(() => decryptWith(stored, K2)).toThrow()
  })

  // ── (e) malformed key throws the SAME error as getKey did ──────────────
  it('encryptWith throws the canonical malformed-key error', () => {
    expect(() => encryptWith('x', 'not-hex')).toThrow(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
    )
  })

  it('decryptWith throws the canonical malformed-key error', () => {
    const stored = encryptWith('3', K1)
    expect(() => decryptWith(stored, 'abc')).toThrow(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
    )
  })

  it('encrypt throws the canonical malformed-key error when env key is bad', () => {
    const saved = process.env.ENCRYPTION_KEY
    process.env.ENCRYPTION_KEY = 'too-short'
    try {
      expect(() => encrypt('1')).toThrow(
        'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
      )
    } finally {
      process.env.ENCRYPTION_KEY = saved
    }
  })

  // ── (f) tampered ciphertext throws under explicit-key path ─────────────
  it('decryptWith throws when ciphertext is tampered', () => {
    const stored = encryptWith('1234', K1)
    const parts = stored.split(':')
    parts[2] = 'deadbeef'
    expect(() => decryptWith(parts.join(':'), K1)).toThrow()
  })

  it('decryptWith throws on a non-3-part value', () => {
    expect(() => decryptWith('only:two', K1)).toThrow('Invalid encrypted value format')
  })
})
