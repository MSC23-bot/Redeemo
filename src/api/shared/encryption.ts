import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

/**
 * Validate a 64-character hex (32-byte) key and return it as a Buffer. Throws
 * the canonical error on malformation — identical message/format to the
 * original `getKey()` so callers (and tests) see no behavioural change.
 */
function keyBufferFromHex(hex: string): Buffer {
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Read + validate the process-level ENCRYPTION_KEY exactly as the original
 * `getKey()` did. Used by the default-key wrappers `encrypt` / `decrypt`.
 */
function requiredKeyHex(): string {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return hex
}

/**
 * Encrypts plaintext with AES-256-GCM using the EXPLICIT 64-hex key argument.
 * Returns a colon-delimited string: "iv_hex:authTag_hex:ciphertext_hex".
 * Byte-identical format to `encrypt`; only the key source differs.
 */
export function encryptWith(plaintext: string, keyHex: string): string {
  const key = keyBufferFromHex(keyHex)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':')
}

/**
 * Decrypts a value produced by `encryptWith`/`encrypt` using the EXPLICIT
 * 64-hex key argument. Throws if the ciphertext has been tampered with (GCM
 * auth tag verification) or the format/key is invalid. Byte-identical
 * validation to `decrypt`; only the key source differs.
 */
export function decryptWith(stored: string, keyHex: string): string {
  const key = keyBufferFromHex(keyHex)
  const parts = stored.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted value format')
  const [ivHex, authTagHex, ciphertextHex] = parts
  const iv         = Buffer.from(ivHex, 'hex')
  const authTag    = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  if (iv.length !== 12) throw new Error('Invalid encrypted value: IV must be 12 bytes')
  if (authTag.length !== 16) throw new Error('Invalid encrypted value: auth tag must be 16 bytes')
  const decipher   = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/**
 * Encrypts plaintext with AES-256-GCM using the process-level ENCRYPTION_KEY.
 * Returns a colon-delimited string: "iv_hex:authTag_hex:ciphertext_hex"
 */
export function encrypt(plaintext: string): string {
  return encryptWith(plaintext, requiredKeyHex())
}

/**
 * Decrypts a value produced by `encrypt`, using the process-level ENCRYPTION_KEY.
 * Throws if the ciphertext has been tampered with (GCM auth tag verification).
 */
export function decrypt(stored: string): string {
  return decryptWith(stored, requiredKeyHex())
}
