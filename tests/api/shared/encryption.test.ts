import { describe, it, expect, beforeAll } from 'vitest'
import { encrypt, decrypt } from '../../../src/api/shared/encryption'

describe('encryption', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  })

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
    // Replace auth tag (index 1) with a different valid-length hex string
    parts[1] = 'ff'.repeat(16)
    expect(() => decrypt(parts.join(':'))).toThrow()
  })
})
