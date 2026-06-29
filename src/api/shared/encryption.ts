import crypto from 'crypto'
import {
  getKeyProvider,
  EnvelopeParseError,
  DEFAULT_LEGACY_KID,
} from './keyring'

const ALGORITHM = 'aes-256-gcm'

// Encryption key-rotation R1 (spec §3.1). The stored value is a self-describing
// envelope:
//   - legacy (3 parts):  ivHex:authTagHex:ciphertextHex          → kid = legacy
//   - v2     (5 parts):  v2:<kid>:ivHex:authTagHex:ciphertextHex → kid = <kid>
// AES-256-GCM verbatim; IV = randomBytes(12); authTag 16B.
//
// ENCODE LOCK (R4-#1): this foundation build is structurally INCAPABLE of emitting
// a v2 value — there is no `ENCRYPTION_V2_WRITES_ENABLED`-on code path here. encrypt()
// always emits a 3-part value encrypted under the LEGACY key (never a non-legacy
// ACTIVE), and fails closed if the legacy key is absent. decrypt() is a dual-format
// reader (reads BOTH 3-part legacy and v2 — forward-compat for when R4 turns writes on).

function validateKeyHex(keyHex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('Encryption key must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(keyHex, 'hex')
}

/**
 * Encrypt `plaintext` with AES-256-GCM under the explicit `keyHex` (64-hex).
 * Returns a 3-part `ivHex:authTagHex:ciphertextHex` value.
 *
 * IV is generated INTERNALLY via crypto.randomBytes(12) and there is NO `iv`
 * parameter — a structural guard (RISK-4) so no caller/provider can inject a
 * deterministic/counter IV (which would break both GCM nonce-uniqueness and the
 * migrator's ciphertext-as-CAS-token invariant).
 */
export function encryptWith(plaintext: string, keyHex: string): string {
  const key = validateKeyHex(keyHex)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':')
}

/**
 * Decrypt a 3-part `ivHex:authTagHex:ciphertextHex` value with the explicit
 * `keyHex` (64-hex). Throws on a tampered GCM tag. Used by the keyring-routed
 * `decryptEnvelope` after it resolves the per-kid key.
 */
export function decryptWith(stored: string, keyHex: string): string {
  const key = validateKeyHex(keyHex)
  const { ivHex, tagHex, ctHex } = parse3Part(stored)
  return gcmDecrypt(key, ivHex, tagHex, ctHex)
}

export interface ParsedEnvelope {
  kid: string
  ivHex: string
  tagHex: string
  ctHex: string
}

// kid charset — NO underscore (SQL LIKE single-char wildcard hazard, spec §3.1).
const KID_RE = /^[a-z0-9-]{1,32}$/
const HEX_EVEN = (h: string): boolean => /^[0-9a-fA-F]+$/.test(h) && h.length % 2 === 0

/**
 * Parse the self-describing envelope WITHOUT touching the keyring (pure string
 * work). NEVER logs or includes the `stored` value in the thrown error.
 * Strict charset + even-length-hex validation (Buffer.from('…','hex') is lenient:
 * it truncates at the first non-hex char and drops a trailing odd nibble, so
 * length asserts alone are insufficient — spec §3.1).
 */
export function parseEnvelope(stored: string): ParsedEnvelope {
  const parts = stored.split(':')
  let kid: string
  let ivHex: string
  let tagHex: string
  let ctHex: string
  if (parts.length === 3) {
    kid = DEFAULT_LEGACY_KID
    ;[ivHex, tagHex, ctHex] = parts
  } else if (parts.length === 5 && parts[0] === 'v2') {
    kid = parts[1]
    ivHex = parts[2]
    tagHex = parts[3]
    ctHex = parts[4]
  } else {
    throw new EnvelopeParseError()
  }
  if (!KID_RE.test(kid)) throw new EnvelopeParseError()
  for (const h of [ivHex, tagHex, ctHex]) {
    if (!HEX_EVEN(h)) throw new EnvelopeParseError()
  }
  if (ctHex.length === 0) throw new EnvelopeParseError()
  return { kid, ivHex, tagHex, ctHex }
}

// Internal 3-part split for the explicit-key primitive (no kid resolution).
function parse3Part(stored: string): { ivHex: string; tagHex: string; ctHex: string } {
  const env = parseEnvelope(stored)
  return { ivHex: env.ivHex, tagHex: env.tagHex, ctHex: env.ctHex }
}

function gcmDecrypt(key: Buffer, ivHex: string, tagHex: string, ctHex: string): string {
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(tagHex, 'hex')
  const ciphertext = Buffer.from(ctHex, 'hex')
  if (iv.length !== 12) throw new Error('Invalid encrypted value: IV must be 12 bytes')
  if (authTag.length !== 16) throw new Error('Invalid encrypted value: auth tag must be 16 bytes')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  // A GCM auth-tag mismatch throws here as a crypto error — NOT an EnvelopeParseError
  // / KeyNotAvailableError. Guard-10 relies on this distinction (spec §3.10).
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/**
 * Decrypt any self-describing stored value (legacy 3-part OR v2). Resolves the
 * per-kid PIN key via the keyring (throws KeyNotAvailableError if the kid is
 * absent/retired) and then AES-256-GCM decrypts.
 */
export function decryptEnvelope(stored: string): string {
  const env = parseEnvelope(stored)
  const keyBytes = getKeyProvider().getKey('pin', env.kid) // throws KeyNotAvailableError if absent
  return gcmDecrypt(keyBytes, env.ivHex, env.tagHex, env.ctHex)
}

/**
 * Encrypt a value for storage. ENCODE LOCK (spec §3.1 R4-#1): the foundation
 * build emits a 3-part value encrypted under the LEGACY key — ALWAYS, regardless
 * of the active kid. There is no v2-write path in this build (structurally
 * incapable of emitting v2). Fails closed if the legacy key is absent from the
 * ring (never silently picks a non-legacy key, which would be undecryptable by a
 * legacy-kid reader → a silently bricked PIN).
 */
export function encrypt(plaintext: string): string {
  const provider = getKeyProvider()
  // getKey('pin', legacyKid) throws KeyNotAvailableError if the legacy key is
  // absent → encrypt() fails closed (it never falls back to ACTIVE).
  const legacyKeyBytes = provider.getKey('pin', provider.getLegacyKid())
  return encryptWith(plaintext, legacyKeyBytes.toString('hex'))
}

/**
 * Decrypt a value produced by `encrypt` (or any legacy / v2 envelope). Dual-format
 * forward-compatible reader.
 */
export function decrypt(stored: string): string {
  return decryptEnvelope(stored)
}
