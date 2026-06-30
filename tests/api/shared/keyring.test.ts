import { describe, it, expect, vi } from 'vitest'
import {
  buildKeyProviderFromEnv,
  validateKeyringEnv,
  keyringFingerprint,
  publishKeyringFingerprint,
  KeyNotAvailableError,
  EnvKeyProvider,
} from '../../../src/api/shared/keyring'

// Deterministic 64-hex TEST keys (NOT real secrets — locally generated).
const LEGACY_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const PIN_KEY_A = '1111111111111111111111111111111111111111111111111111111111111111'
const PIN_KEY_B = '2222222222222222222222222222222222222222222222222222222222222222'
const OTP_KEY_A = '3333333333333333333333333333333333333333333333333333333333333333'

// A baseline single-var env (only ENCRYPTION_KEY set) — the current production shape.
function singleVarEnv(): NodeJS.ProcessEnv {
  return { ENCRYPTION_KEY: LEGACY_KEY } as NodeJS.ProcessEnv
}

describe('keyring — legacy-bridge boot mode (A)', () => {
  it('synthesises a legacy-only PIN ring from a single ENCRYPTION_KEY (ACTIVE == legacy is VALID)', () => {
    const p = buildKeyProviderFromEnv(singleVarEnv())
    expect(p.getLegacyKid()).toBe('legacy')
    expect(p.getActiveKid('pin')).toBe('legacy')
    expect(p.listKids('pin')).toEqual(['legacy'])
    expect(p.getKey('pin', 'legacy')).toEqual(Buffer.from(LEGACY_KEY, 'hex'))
  })

  it('validateKeyringEnv returns no problems for the single-var env', () => {
    expect(validateKeyringEnv(singleVarEnv())).toEqual([])
  })

  it('honours a custom ENCRYPTION_LEGACY_KID in bridge mode', () => {
    const p = buildKeyProviderFromEnv({ ENCRYPTION_KEY: LEGACY_KEY, ENCRYPTION_LEGACY_KID: 'legacy' } as NodeJS.ProcessEnv)
    expect(p.getLegacyKid()).toBe('legacy')
  })

  it('bridges the OTP ring independently of the PIN ring (OTP unset -> otp-legacy from ENCRYPTION_KEY)', () => {
    const p = buildKeyProviderFromEnv(singleVarEnv())
    expect(p.getActiveKid('otp')).toBe('otp-legacy')
    // CRYPTO-1: the bridged otp-legacy keying material is the ASCII hex STRING bytes,
    // byte-identical to the legacy createHmac('sha256', ENCRYPTION_KEY).
    expect(p.getOtpHmacKey('otp-legacy')).toEqual(Buffer.from(LEGACY_KEY, 'utf8'))
  })
})

describe('keyring — explicit-keyring boot mode (B)', () => {
  function explicitPinEnv(): NodeJS.ProcessEnv {
    return {
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: JSON.stringify({ legacy: LEGACY_KEY, 'pin-2026-06': PIN_KEY_A }),
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
    } as NodeJS.ProcessEnv
  }

  it('parses an explicit PIN ring with a pin-* ACTIVE and the legacy kid present', () => {
    const p = buildKeyProviderFromEnv(explicitPinEnv())
    expect(p.getActiveKid('pin')).toBe('pin-2026-06')
    expect(p.getLegacyKid()).toBe('legacy')
    expect(new Set(p.listKids('pin'))).toEqual(new Set(['legacy', 'pin-2026-06']))
    expect(p.getKey('pin', 'pin-2026-06')).toEqual(Buffer.from(PIN_KEY_A, 'hex'))
    expect(p.getKey('pin', 'legacy')).toEqual(Buffer.from(LEGACY_KEY, 'hex'))
  })

  it('rejects when ACTIVE equals the legacy kid in explicit mode', () => {
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: JSON.stringify({ legacy: LEGACY_KEY }),
      ENCRYPTION_KEY_ACTIVE: 'legacy',
    } as NodeJS.ProcessEnv)
    expect(problems.join('\n')).toMatch(/ENCRYPTION_KEY_ACTIVE/)
    expect(problems.length).toBeGreaterThan(0)
  })

  it('rejects when ACTIVE is not a pin-* kid', () => {
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: JSON.stringify({ legacy: LEGACY_KEY, 'wrong-2026-06': PIN_KEY_A }),
      ENCRYPTION_KEY_ACTIVE: 'wrong-2026-06',
    } as NodeJS.ProcessEnv)
    expect(problems.length).toBeGreaterThan(0)
  })

  it('rejects when the legacy kid is absent from an explicit PIN ring', () => {
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: JSON.stringify({ 'pin-2026-06': PIN_KEY_A }),
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
    } as NodeJS.ProcessEnv)
    expect(problems.join('\n')).toMatch(/ENCRYPTION_LEGACY_KID|legacy/)
  })

  it('selects boot mode PER-NAMESPACE — explicit OTP ring + bridged PIN ring honours the fresh OTP active, NOT the leaked key', () => {
    const p = buildKeyProviderFromEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      OTP_HMAC_KEYS: JSON.stringify({ 'otp-2026-06': OTP_KEY_A }),
      OTP_HMAC_KEY_ACTIVE: 'otp-2026-06',
    } as NodeJS.ProcessEnv)
    // PIN ring is bridged (ENCRYPTION_KEYS unset)
    expect(p.getActiveKid('pin')).toBe('legacy')
    // OTP ring is explicit — the leaked ENCRYPTION_KEY is NOT the OTP signer.
    expect(p.getActiveKid('otp')).toBe('otp-2026-06')
    expect(p.getOtpHmacKey('otp-2026-06')).toEqual(Buffer.from(OTP_KEY_A, 'utf8'))
  })
})

describe('keyring — fail-closed boot validation', () => {
  const base = (overrides: Record<string, string | undefined>): NodeJS.ProcessEnv =>
    ({ ENCRYPTION_KEY: LEGACY_KEY, ...overrides } as NodeJS.ProcessEnv)

  it('rejects a non-64-hex value in the ring', () => {
    const problems = validateKeyringEnv(base({
      ENCRYPTION_KEYS: JSON.stringify({ legacy: LEGACY_KEY, 'pin-2026-06': 'deadbeef' }),
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
    }))
    expect(problems.length).toBeGreaterThan(0)
  })

  it('rejects a placeholder value via isPlaceholder', () => {
    const placeholder = 'your-placeholder-key-0000000000000000000000000000000000000000'
    const problems = validateKeyringEnv(base({
      ENCRYPTION_KEYS: JSON.stringify({ legacy: LEGACY_KEY, 'pin-2026-06': placeholder }),
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
    }))
    expect(problems.length).toBeGreaterThan(0)
  })

  it('rejects when ACTIVE is absent from the ring', () => {
    const problems = validateKeyringEnv(base({
      ENCRYPTION_KEYS: JSON.stringify({ legacy: LEGACY_KEY }),
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
    }))
    expect(problems.length).toBeGreaterThan(0)
  })

  it('rejects when ACTIVE is in DECOMMISSIONED_KIDS', () => {
    const problems = validateKeyringEnv(base({
      ENCRYPTION_KEYS: JSON.stringify({ legacy: LEGACY_KEY, 'pin-2026-06': PIN_KEY_A }),
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
      DECOMMISSIONED_KIDS: 'pin-2026-06,pin-old',
    }))
    expect(problems.length).toBeGreaterThan(0)
  })

  it('rejects malformed ENCRYPTION_KEYS JSON', () => {
    const problems = validateKeyringEnv(base({
      ENCRYPTION_KEYS: '{not json',
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
    }))
    expect(problems.length).toBeGreaterThan(0)
  })

  it('rejects a swapped-ring paste — OTP-namespaced kid inside ENCRYPTION_KEYS (namespace containment)', () => {
    const problems = validateKeyringEnv(base({
      ENCRYPTION_KEYS: JSON.stringify({ legacy: LEGACY_KEY, 'otp-2026-06': PIN_KEY_A }),
      ENCRYPTION_KEY_ACTIVE: 'otp-2026-06',
    }))
    expect(problems.length).toBeGreaterThan(0)
  })

  it('rejects a swapped-ring paste — PIN-namespaced kid inside OTP_HMAC_KEYS', () => {
    const problems = validateKeyringEnv(base({
      OTP_HMAC_KEYS: JSON.stringify({ 'pin-2026-06': OTP_KEY_A }),
      OTP_HMAC_KEY_ACTIVE: 'pin-2026-06',
    }))
    expect(problems.length).toBeGreaterThan(0)
  })

  it('buildKeyProviderFromEnv throws (fail-closed) when validation fails', () => {
    expect(() =>
      buildKeyProviderFromEnv(base({
        ENCRYPTION_KEYS: '{not json',
        ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
      })),
    ).toThrow()
  })
})

describe('keyring — getKey resolver + namespace rejection', () => {
  const explicit = (): EnvKeyProvider =>
    buildKeyProviderFromEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: JSON.stringify({ legacy: LEGACY_KEY, 'pin-2026-06': PIN_KEY_A }),
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
      OTP_HMAC_KEYS: JSON.stringify({ 'otp-2026-06': OTP_KEY_A }),
      OTP_HMAC_KEY_ACTIVE: 'otp-2026-06',
    } as NodeJS.ProcessEnv)

  it('throws KeyNotAvailableError for an unknown pin kid', () => {
    expect(() => explicit().getKey('pin', 'pin-nope')).toThrow(KeyNotAvailableError)
  })

  it('rejects a pin-* kid asked of the OTP ring (cross-namespace confusion impossible)', () => {
    expect(() => explicit().getKey('otp', 'pin-2026-06')).toThrow(KeyNotAvailableError)
  })

  it('rejects an otp-* kid asked of the PIN ring', () => {
    expect(() => explicit().getKey('pin', 'otp-2026-06')).toThrow(KeyNotAvailableError)
  })

  it('KeyNotAvailableError message contains the kid but NO key bytes', () => {
    try {
      explicit().getKey('pin', 'pin-nope')
      throw new Error('should have thrown')
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toContain('pin-nope')
      expect(msg).not.toContain(PIN_KEY_A)
      expect(msg).not.toContain(LEGACY_KEY)
    }
  })
})

describe('keyring — canonical fingerprint (§3.9)', () => {
  it('is a deterministic sha256 hex digest containing no raw key bytes', () => {
    const p = buildKeyProviderFromEnv(singleVarEnv())
    const fp = keyringFingerprint(p)
    expect(fp).toMatch(/^[0-9a-f]{64}$/)
    expect(fp).not.toContain(LEGACY_KEY)
  })

  it('is stable across two providers built from the same env', () => {
    const a = keyringFingerprint(buildKeyProviderFromEnv(singleVarEnv()))
    const b = keyringFingerprint(buildKeyProviderFromEnv(singleVarEnv()))
    expect(a).toBe(b)
  })

  it('an ACTIVE-only divergence between two otherwise-identical rings changes the digest', () => {
    const ring = { legacy: LEGACY_KEY, 'pin-2026-06': PIN_KEY_A, 'pin-2026-07': PIN_KEY_B }
    const fpJune = keyringFingerprint(buildKeyProviderFromEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: JSON.stringify(ring),
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
    } as NodeJS.ProcessEnv))
    const fpJuly = keyringFingerprint(buildKeyProviderFromEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: JSON.stringify(ring),
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-07',
    } as NodeJS.ProcessEnv))
    expect(fpJune).not.toBe(fpJuly)
  })

  it('a different key under the same kid changes the digest (keyHash is over the bytes)', () => {
    const fp1 = keyringFingerprint(buildKeyProviderFromEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: JSON.stringify({ legacy: LEGACY_KEY, 'pin-2026-06': PIN_KEY_A }),
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
    } as NodeJS.ProcessEnv))
    const fp2 = keyringFingerprint(buildKeyProviderFromEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: JSON.stringify({ legacy: LEGACY_KEY, 'pin-2026-06': PIN_KEY_B }),
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
    } as NodeJS.ProcessEnv))
    expect(fp1).not.toBe(fp2)
  })

  it('includes a codeCapability marker so a non-reader build cannot collide with a reader build', () => {
    // The fingerprint must encode 'v2-reader-v1'. We assert indirectly: the digest
    // changes if we recompute with the marker absent is hard to test directly, so we
    // assert the provider exposes the capability constant the publisher uses.
    const p = buildKeyProviderFromEnv(singleVarEnv())
    expect(p.codeCapability).toBe('v2-reader-v1')
  })
})

describe('publishKeyringFingerprint — best-effort upsert', () => {
  function fakePrisma() {
    const upsert = vi.fn().mockResolvedValue({})
    return { prisma: { keyringFingerprint: { upsert } } as any, upsert }
  }

  it('upserts a row keyed by service with the canonical fingerprint + codeCapability (no key bytes)', async () => {
    const { prisma, upsert } = fakePrisma()
    const ok = await publishKeyringFingerprint(prisma, 'web', singleVarEnv())
    expect(ok).toBe(true)
    expect(upsert).toHaveBeenCalledTimes(1)
    const arg = upsert.mock.calls[0][0]
    expect(arg.where).toEqual({ service: 'web' })
    expect(arg.create.service).toBe('web')
    expect(arg.create.codeCapability).toBe('v2-reader-v1')
    expect(arg.create.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    // No raw key bytes anywhere in the upsert payload.
    expect(JSON.stringify(arg)).not.toContain(LEGACY_KEY)
  })

  it('is best-effort — a DB failure returns false and does NOT throw (boot must not be blocked)', async () => {
    const upsert = vi.fn().mockRejectedValue(new Error('relation does not exist'))
    const prisma = { keyringFingerprint: { upsert } } as any
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ok = await publishKeyringFingerprint(prisma, 'worker', singleVarEnv())
    expect(ok).toBe(false)
    errorSpy.mockRestore()
  })

  it('a failed publish logs no key bytes', async () => {
    const upsert = vi.fn().mockRejectedValue(new Error('boom'))
    const prisma = { keyringFingerprint: { upsert } } as any
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await publishKeyringFingerprint(prisma, 'worker', singleVarEnv())
    const logged = (errorSpy.mock.calls.flat() as unknown[])
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' | ')
    expect(logged).not.toContain(LEGACY_KEY)
    errorSpy.mockRestore()
  })
})

// ── Adversarial-review regression pins (R1 round-2) ───────────────────────────

describe('keyring — custom ENCRYPTION_LEGACY_KID in bridge mode (BV-1 keyring leg)', () => {
  it('a non-default legacy kid keys the bridge ring under THAT kid (not "legacy")', () => {
    const p = buildKeyProviderFromEnv({ ENCRYPTION_KEY: LEGACY_KEY, ENCRYPTION_LEGACY_KID: 'pin-old' } as NodeJS.ProcessEnv)
    expect(p.getLegacyKid()).toBe('pin-old')
    expect(p.getActiveKid('pin')).toBe('pin-old')
    expect(p.listKids('pin')).toEqual(['pin-old'])
    expect(p.getKey('pin', 'pin-old')).toEqual(Buffer.from(LEGACY_KEY, 'hex'))
    // The hardcoded 'legacy' kid is NOT in the ring when the legacy kid is custom.
    expect(() => p.getKey('pin', 'legacy')).toThrow(KeyNotAvailableError)
  })
})

describe('keyring — *_ACTIVE without its map var is a fail-closed operator trap (BV-2)', () => {
  it('ENCRYPTION_KEY_ACTIVE set without ENCRYPTION_KEYS is rejected (not silently ignored)', () => {
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-99',
    } as NodeJS.ProcessEnv)
    expect(problems.some((p) => /ENCRYPTION_KEY_ACTIVE/.test(p) && /ENCRYPTION_KEYS/.test(p))).toBe(true)
    expect(() =>
      buildKeyProviderFromEnv({ ENCRYPTION_KEY: LEGACY_KEY, ENCRYPTION_KEY_ACTIVE: 'pin-2026-99' } as NodeJS.ProcessEnv),
    ).toThrow(/keyring/i)
  })

  it('OTP_HMAC_KEY_ACTIVE set without OTP_HMAC_KEYS is rejected too', () => {
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      OTP_HMAC_KEY_ACTIVE: 'otp-2026-99',
    } as NodeJS.ProcessEnv)
    expect(problems.some((p) => /OTP_HMAC_KEY_ACTIVE/.test(p) && /OTP_HMAC_KEYS/.test(p))).toBe(true)
  })
})

describe('keyring — fingerprint leaks no key bytes across a multi-key PIN + OTP ring (SEC-REDACT-2)', () => {
  it('digest contains NONE of the raw keys (incl. the utf8 OTP-bridge byte path)', () => {
    const p = buildKeyProviderFromEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: JSON.stringify({ legacy: LEGACY_KEY, 'pin-2026-06': PIN_KEY_A, 'pin-2026-07': PIN_KEY_B }),
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
      OTP_HMAC_KEYS: JSON.stringify({ 'otp-2026-06': OTP_KEY_A }),
      OTP_HMAC_KEY_ACTIVE: 'otp-2026-06',
    } as NodeJS.ProcessEnv)
    const fp = keyringFingerprint(p)
    expect(fp).toMatch(/^[0-9a-f]{64}$/)
    for (const key of [LEGACY_KEY, PIN_KEY_A, PIN_KEY_B, OTP_KEY_A]) {
      expect(fp).not.toContain(key)
    }
  })
})

// CodeRabbit (Major #1): ENCRYPTION_LEGACY_KID is operator-supplied, becomes the
// bridged kid + is keyed into the ring + echoed in errors. Its charset must be
// validated fail-closed BEFORE use, and any echoed value must be redacted so a
// fat-fingered key can never be reflected into the (stderr) boot log.
describe('keyring — ENCRYPTION_LEGACY_KID charset is validated fail-closed (CodeRabbit Major #1)', () => {
  it('rejects an out-of-charset legacy kid (underscore) and names the var', () => {
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_LEGACY_KID: 'pin_2026_06', // underscore is not a legal kid char
    } as NodeJS.ProcessEnv)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toMatch(/ENCRYPTION_LEGACY_KID/)
  })

  it('rejects an otp-* value in the PIN legacy kid (wrong namespace)', () => {
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_LEGACY_KID: 'otp-2026-06',
    } as NodeJS.ProcessEnv)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toMatch(/ENCRYPTION_LEGACY_KID/)
  })

  it('FULLY REDACTS a fat-fingered 64-hex key placed in ENCRYPTION_LEGACY_KID (no source chars retained — Codex finding 1)', () => {
    // A distinctive 64-hex value so substring assertions are meaningful.
    const KEY_SHAPED = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_LEGACY_KID: KEY_SHAPED, // 64-hex — never a kid
    } as NodeJS.ProcessEnv)
    expect(problems.length).toBeGreaterThan(0)
    const joined = problems.join('\n')
    expect(joined).toMatch(/ENCRYPTION_LEGACY_KID/)
    // The raw key + EVERY meaningful-length substring must be ABSENT — the previous
    // implementation leaked the first 8 chars via `s.slice(0, 8)`.
    expect(joined).not.toContain(KEY_SHAPED)
    expect(joined).not.toContain(KEY_SHAPED.slice(0, 8)) // the old leak window
    expect(joined).not.toContain(KEY_SHAPED.slice(0, 16))
    expect(joined).not.toContain(KEY_SHAPED.slice(24, 40)) // a middle chunk
    expect(joined).not.toContain(KEY_SHAPED.slice(-16)) // the suffix
    // Fully redacted to a constant that carries no source characters.
    expect(joined).toContain('[redacted]')
    expect(joined).not.toContain('…[redacted]') // the old prefix-leaking marker is gone
  })

  it('buildKeyProviderFromEnv throws (fail-closed) on an invalid legacy kid', () => {
    expect(() =>
      buildKeyProviderFromEnv({
        ENCRYPTION_KEY: LEGACY_KEY,
        ENCRYPTION_LEGACY_KID: 'pin_bad',
      } as NodeJS.ProcessEnv),
    ).toThrow()
  })
})

// CodeRabbit (Major #2): a decommissioned kid must not be present in the ring AT
// ALL — not merely barred from being ACTIVE. Retirement removes the kid from the
// ring AND adds it to DECOMMISSIONED_KIDS (mutually exclusive states), so a
// denylisted kid appearing as ANY ring key (even a non-active one) is a misconfig
// that would keep a retired/compromised key loaded + usable for decrypt.
describe('keyring — a decommissioned kid present anywhere in the ring is rejected (CodeRabbit Major #2)', () => {
  it('rejects a NON-active ring key that is in DECOMMISSIONED_KIDS', () => {
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: JSON.stringify({ legacy: LEGACY_KEY, 'pin-2026-06': PIN_KEY_A, 'pin-old': PIN_KEY_B }),
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06', // active is fine + not denylisted
      DECOMMISSIONED_KIDS: 'pin-old', // a retired kid still left in the ring
    } as NodeJS.ProcessEnv)
    expect(problems.length).toBeGreaterThan(0)
    const joined = problems.join('\n')
    expect(joined).toMatch(/DECOMMISSIONED_KIDS/)
    expect(joined).toMatch(/pin-old/)
  })

  it('buildKeyProviderFromEnv throws (fail-closed) when a retired kid is left in the ring', () => {
    expect(() =>
      buildKeyProviderFromEnv({
        ENCRYPTION_KEY: LEGACY_KEY,
        ENCRYPTION_KEYS: JSON.stringify({ legacy: LEGACY_KEY, 'pin-2026-06': PIN_KEY_A, 'pin-old': PIN_KEY_B }),
        ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
        DECOMMISSIONED_KIDS: 'pin-old',
      } as NodeJS.ProcessEnv),
    ).toThrow()
  })

  // CodeRabbit (re-review nit): validateKeyringEnv aggregates BOTH namespaces, and the
  // denylist check lives in the shared validateRing per-key loop — so the OTP ring must
  // reject a decommissioned kid too. Pin it so a regression that drops the OTP path can't
  // pass while the suite still claims "anywhere in the ring".
  it('rejects a NON-active OTP ring key that is in DECOMMISSIONED_KIDS (both namespaces covered)', () => {
    const OTP_KEY_OLD = '4444444444444444444444444444444444444444444444444444444444444444'
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY, // bridges the PIN ring so only the OTP ring is under test
      OTP_HMAC_KEYS: JSON.stringify({ 'otp-2026-06': OTP_KEY_A, 'otp-old': OTP_KEY_OLD }),
      OTP_HMAC_KEY_ACTIVE: 'otp-2026-06', // active is fine + not denylisted
      DECOMMISSIONED_KIDS: 'otp-old', // a retired OTP kid still left in the ring
    } as NodeJS.ProcessEnv)
    expect(problems.length).toBeGreaterThan(0)
    const joined = problems.join('\n')
    expect(joined).toMatch(/DECOMMISSIONED_KIDS/)
    expect(joined).toMatch(/otp-old/)
  })

  it('buildKeyProviderFromEnv throws (fail-closed) on a retired OTP kid left in OTP_HMAC_KEYS', () => {
    const OTP_KEY_OLD = '4444444444444444444444444444444444444444444444444444444444444444'
    expect(() =>
      buildKeyProviderFromEnv({
        ENCRYPTION_KEY: LEGACY_KEY,
        OTP_HMAC_KEYS: JSON.stringify({ 'otp-2026-06': OTP_KEY_A, 'otp-old': OTP_KEY_OLD }),
        OTP_HMAC_KEY_ACTIVE: 'otp-2026-06',
        DECOMMISSIONED_KIDS: 'otp-old',
      } as NodeJS.ProcessEnv),
    ).toThrow()
  })
})

// Codex review finding 4: duplicate top-level kids must FAIL CLOSED. JSON.parse keeps
// only the LAST value (last-wins), which would silently shadow a retired/old key — so a
// raw-text scan rejects repeats BEFORE the parsed object is trusted. Covered for both
// namespaces, with different values, identical values, and whitespace variations.
describe('keyring — duplicate kid rejection (CodeRabbit/Codex finding 4)', () => {
  it('rejects duplicate PIN kids with DIFFERENT values (last-wins shadowing)', () => {
    const raw = `{"legacy":"${LEGACY_KEY}","pin-2026-06":"${PIN_KEY_A}","pin-2026-06":"${PIN_KEY_B}"}`
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: raw,
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
    } as NodeJS.ProcessEnv)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toMatch(/duplicate kid/i)
    expect(problems.join('\n')).toMatch(/pin-2026-06/)
  })

  it('rejects duplicate PIN kids with IDENTICAL values', () => {
    const raw = `{"legacy":"${LEGACY_KEY}","pin-2026-06":"${PIN_KEY_A}","pin-2026-06":"${PIN_KEY_A}"}`
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: raw,
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
    } as NodeJS.ProcessEnv)
    expect(problems.join('\n')).toMatch(/duplicate kid/i)
  })

  it('rejects duplicate kids despite whitespace variations around the key/colon', () => {
    const raw = `{ "legacy" : "${LEGACY_KEY}" ,\n  "pin-2026-06":"${PIN_KEY_A}",\n  "pin-2026-06" :  "${PIN_KEY_B}" }`
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: raw,
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
    } as NodeJS.ProcessEnv)
    expect(problems.join('\n')).toMatch(/duplicate kid/i)
  })

  it('rejects a duplicate LEGACY kid (the shadow-the-legacy-key attack)', () => {
    const raw = `{"legacy":"${LEGACY_KEY}","legacy":"${PIN_KEY_A}","pin-2026-06":"${PIN_KEY_B}"}`
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: raw,
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
    } as NodeJS.ProcessEnv)
    expect(problems.join('\n')).toMatch(/duplicate kid/i)
  })

  it('rejects duplicate OTP kids in OTP_HMAC_KEYS (both namespaces covered)', () => {
    const raw = `{"otp-2026-06":"${OTP_KEY_A}","otp-2026-06":"${PIN_KEY_B}"}`
    const problems = validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      OTP_HMAC_KEYS: raw,
      OTP_HMAC_KEY_ACTIVE: 'otp-2026-06',
    } as NodeJS.ProcessEnv)
    expect(problems.join('\n')).toMatch(/duplicate kid/i)
    expect(problems.join('\n')).toMatch(/otp-2026-06/)
  })

  it('buildKeyProviderFromEnv THROWS (fail-closed) on a duplicate kid', () => {
    const raw = `{"legacy":"${LEGACY_KEY}","pin-2026-06":"${PIN_KEY_A}","pin-2026-06":"${PIN_KEY_B}"}`
    expect(() =>
      buildKeyProviderFromEnv({
        ENCRYPTION_KEY: LEGACY_KEY,
        ENCRYPTION_KEYS: raw,
        ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
      } as NodeJS.ProcessEnv),
    ).toThrow()
  })

  it('a single-occurrence (non-duplicate) explicit ring still passes', () => {
    const raw = `{"legacy":"${LEGACY_KEY}","pin-2026-06":"${PIN_KEY_A}"}`
    expect(validateKeyringEnv({
      ENCRYPTION_KEY: LEGACY_KEY,
      ENCRYPTION_KEYS: raw,
      ENCRYPTION_KEY_ACTIVE: 'pin-2026-06',
    } as NodeJS.ProcessEnv)).toEqual([])
  })
})
