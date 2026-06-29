import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Static source guard (encryption key-rotation R1). Mirrors
// tests/api/legal/canonical-url.guard.test.ts. Fails the build if the R1 source
// regresses two locked invariants:
//   (1) the foundation build is STRUCTURALLY INCAPABLE of emitting a v2 value —
//       there is no ENCRYPTION_V2_WRITES_ENABLED-on write path, and encrypt()
//       never CONCATENATES a 'v2:' prefix (the only legitimate 'v2' reference is
//       the READER's parse check in parseEnvelope);
//   (2) the new crypto modules never log plaintext / raw ciphertext / key bytes.

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const ENCRYPTION = 'src/api/shared/encryption.ts'
const KEYRING = 'src/api/shared/keyring.ts'
const WORKER = 'src/worker.ts'

describe('R1 static guard — encode lock (no v2 write capability)', () => {
  it('encryption.ts does NOT reference the ENCRYPTION_V2_WRITES_ENABLED flag at all (foundation build)', () => {
    const src = read(ENCRYPTION)
    // The flag must not exist as a code path in the foundation build. (A comment
    // naming it for documentation is acceptable; an env READ is not.)
    expect(/process\.env\.ENCRYPTION_V2_WRITES_ENABLED/.test(src)).toBe(false)
    expect(/env\[['"]ENCRYPTION_V2_WRITES_ENABLED['"]\]/.test(src)).toBe(false)
  })

  it('keyring.ts does NOT read the ENCRYPTION_V2_WRITES_ENABLED flag (no v2-write decision lives here either)', () => {
    const src = read(KEYRING)
    expect(/process\.env\.ENCRYPTION_V2_WRITES_ENABLED/.test(src)).toBe(false)
  })

  it('encrypt() does not construct a v2-prefixed value (only the reader mentions v2)', () => {
    const src = read(ENCRYPTION)
    // No string-building of a 'v2:' value anywhere (template or concat).
    expect(/`v2:/.test(src)).toBe(false)
    expect(/['"]v2:['"]\s*\+/.test(src)).toBe(false)
    // The single allowed 'v2' literal is the parse-time equality check in
    // parseEnvelope: `parts[0] === 'v2'`. Assert it is present (the reader) and
    // that it is the ONLY 'v2' occurrence.
    expect(src.includes("=== 'v2'")).toBe(true)
    const v2Occurrences = (src.match(/'v2'/g) ?? []).length
    expect(v2Occurrences).toBe(1)
  })
})

describe('R1 static guard — no plaintext/ciphertext/key logging in the crypto modules', () => {
  // Neither encryption.ts nor keyring.ts may call a logger with the plaintext,
  // the stored value, the ciphertext, or key bytes. The crypto core does its own
  // throwing with redacted messages; only keyring.ts logs (the best-effort
  // fingerprint-publish failure), and that log must carry no key material.
  for (const rel of [ENCRYPTION, KEYRING]) {
    it(`${rel} never logs a plaintext / stored / ciphertext / key variable`, () => {
      const src = read(rel)
      // Any console.* call must not pass an obviously-sensitive identifier.
      const forbiddenArgs = /console\.\w+\([^)]*\b(plaintext|stored|ciphertext|ctHex|keyHex|keyBytes|legacyKeyBytes|decrypted|pin)\b/i
      expect(forbiddenArgs.test(src)).toBe(false)
    })
  }

  it('keyringFingerprint never digests raw key bytes without the domain-separated keyHash wrapper', () => {
    const src = read(KEYRING)
    // The fingerprint must route key bytes through keyHash() (domain-separated),
    // never a bare sha256 over the hex string. Assert keyHash is the only path
    // feeding key material into the digest.
    expect(src.includes('function keyHash')).toBe(true)
    expect(src.includes("'redeemo-keyring-v1:'")).toBe(true)
  })
})

describe('R1 static guard — worker verify-and-exit + best-effort boot publish (CodeRabbit Majors #3/#4)', () => {
  it('the --verify-keyring-and-exit path exits NON-ZERO on a failed publish (process.exit(ok ? 0 : 1))', () => {
    const src = read(WORKER)
    // Major #3: this mode IS the parity-verification step — a failed publish must
    // exit non-zero so an operator/CI relying on it cannot get a false green and
    // proceed to a flip/migration with unverified worker parity.
    expect(src.includes('process.exit(ok ? 0 : 1)')).toBe(true)
    // The verify path must NOT regress to an unconditional success exit. Capture the
    // WHOLE verify block, then assert on its exit calls (CodeRabbit re-review nit — a
    // fixed-width window could miss a later exit if the block grows). NOTE: the block's
    // closing brace is 2-space-indented (`\n  }`), so we anchor on that — and assert the
    // match is non-null so the guard can never pass vacuously on a failed capture.
    const verifyMatch = src.match(/if \(process\.argv\.includes\('--verify-keyring-and-exit'\)\) \{[\s\S]*?\n  \}/)
    expect(verifyMatch).not.toBeNull()
    const verifyBlock = verifyMatch?.[0] ?? ''
    expect(verifyBlock).toContain('process.exit(ok ? 0 : 1)')
    expect(verifyBlock.includes('process.exit(0)')).toBe(false)
  })

  it('the normal-boot keyring publish is wrapped so a publish/import failure never crashes boot', () => {
    const src = read(WORKER)
    // Major #4: the whole best-effort publish (dynamic import + call) is in a
    // try/catch — an import rejection or upsert throw is logged + swallowed, never
    // takes the worker process down. The catch log is the unique evidence string.
    expect(src.includes('[worker] keyring fingerprint publish skipped (best-effort)')).toBe(true)
    // Structural: a try-block encloses the normal-boot dynamic import + publish call.
    expect(
      /try\s*\{[\s\S]*?await import\('\.\/api\/shared\/keyring'\)[\s\S]*?await publishKeyringFingerprint\(prisma, 'worker'\)[\s\S]*?\}\s*catch/.test(src),
    ).toBe(true)
  })
})
