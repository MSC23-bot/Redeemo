import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { requireSeedEncryptionKey } from '../../prisma/seed-data/requireEncryptionKey'

// F8 (SEC): the seed scripts must require the REAL ENCRYPTION_KEY (no repo-public
// fallback) before encrypting branch PINs.

const VALID_KEY = '0123456789abcdef'.repeat(4) // 64 hex chars, not the public placeholder

const origKey = process.env.ENCRYPTION_KEY
const origNodeEnv = process.env.NODE_ENV
afterEach(() => {
  if (origKey === undefined) delete process.env.ENCRYPTION_KEY
  else process.env.ENCRYPTION_KEY = origKey
  if (origNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = origNodeEnv
})

describe('requireSeedEncryptionKey (F8)', () => {
  it('accepts a valid 64-hex key', () => {
    process.env.NODE_ENV = 'test'
    process.env.ENCRYPTION_KEY = VALID_KEY
    expect(() => requireSeedEncryptionKey()).not.toThrow()
  })

  it('rejects an unset key', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.ENCRYPTION_KEY
    expect(() => requireSeedEncryptionKey()).toThrow(/not set/i)
  })

  it('rejects malformed / short / long / non-hex keys', () => {
    process.env.NODE_ENV = 'test'
    for (const bad of ['short', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), `${VALID_KEY} `]) {
      process.env.ENCRYPTION_KEY = bad
      expect(
        () => requireSeedEncryptionKey(),
        `expected reject for ${JSON.stringify(bad)}`,
      ).toThrow(/64-character hex/i)
    }
  })

  it("rejects the repo-public placeholder key 'a'.repeat(64)", () => {
    process.env.NODE_ENV = 'test'
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
    expect(() => requireSeedEncryptionKey()).toThrow(/public/i)
  })

  it('refuses to run with NODE_ENV=production even with a valid key', () => {
    process.env.NODE_ENV = 'production'
    process.env.ENCRYPTION_KEY = VALID_KEY
    expect(() => requireSeedEncryptionKey()).toThrow(/production/i)
  })
})

describe('F8 static guard — seed scripts have no public-key fallback and call the helper', () => {
  for (const f of ['prisma/seed.ts', 'prisma/seed-demo.ts']) {
    it(`${f}: no 'a'.repeat(64) fallback, no ENCRYPTION_KEY reassignment, calls requireSeedEncryptionKey()`, () => {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(
        src.includes("'a'.repeat(64)"),
        `${f} must not contain the repo-public 'a'.repeat(64) fallback`,
      ).toBe(false)
      expect(
        /process\.env\.ENCRYPTION_KEY\s*=/.test(src),
        `${f} must not assign process.env.ENCRYPTION_KEY (require the real key instead)`,
      ).toBe(false)
      expect(
        /requireSeedEncryptionKey\(\)/.test(src),
        `${f} must call requireSeedEncryptionKey()`,
      ).toBe(true)
    })
  }
})
