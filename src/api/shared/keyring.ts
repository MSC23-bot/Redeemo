// src/api/shared/keyring.ts
//
// Encryption key-rotation R1 foundation (spec §3.3 / §3.4 / §3.9).
//
// A provider-neutral keyring behind a `KeyProvider` interface. R1 populates and
// uses ONLY the 'pin' namespace (PIN-encryption keys for Branch.redemptionPin);
// the interface also models 'otp' so R2 (OTP-HMAC key separation) can drop in
// without an interface change. R1 does NOT swap the 7 live OTP createHmac sites —
// it only provides a bridged otp-legacy keying so the fingerprint can describe the
// OTP ring; OTP separation is R2.
//
// Two boot modes, selected PER-NAMESPACE (spec §3.4):
//   (A) legacy-bridge — a ring's map var is unset; the ring is synthesised from the
//       single ENCRYPTION_KEY ({legacy: KEY} for pin, {otp-legacy: KEY} for otp),
//       ACTIVE == the bridged kid (VALID + expected in bridge mode).
//   (B) explicit-keyring — a ring's map var is set; ACTIVE must be a namespaced kid,
//       present, not denylisted, and (pin only) != the legacy kid; the legacy kid
//       must be present in the pin ring.
//
// Boot validation is fail-closed and collects ALL problems (mirrors env.ts), so a
// misconfigured deploy reports every issue at once. NEVER logs key bytes — only kid
// + masked context.

import crypto from 'crypto'

export type Namespace = 'pin' | 'otp'

/** R1 code capability marker baked into the fingerprint (spec §3.9). */
export const CODE_CAPABILITY = 'v2-reader-v1'

/** Default kid that 3-part legacy (no-prefix) values map to (spec §3.1). */
export const DEFAULT_LEGACY_KID = 'legacy'

/** Bridged OTP kid synthesised from ENCRYPTION_KEY when OTP_HMAC_KEYS is unset. */
export const OTP_LEGACY_KID = 'otp-legacy'

const HEX64 = /^[0-9a-fA-F]{64}$/
// kid charset — NO underscore (SQL LIKE single-char wildcard hazard, spec §3.1), no colon.
const PIN_KID = /^(pin-[a-z0-9-]{1,28}|legacy)$/
const OTP_KID = /^otp-[a-z0-9-]{1,28}$/

// ── Typed errors (exported for Guard-10 classification, §3.10) ───────────────

/** A decrypt resolved a kid that is absent/retired from the keyring. */
export class KeyNotAvailableError extends Error {
  public readonly code = 'KEY_NOT_AVAILABLE'
  constructor(ns: Namespace, kid: string) {
    // NEVER include key bytes — only the namespace + kid (a safe index label).
    // Defence-in-depth (adversarial-review parity): route the kid through
    // safeKidLabel so that even if a future caller passes an UN-validated kid (a
    // fat-fingered 64-hex key), the propagated app.log.error(error) cannot reflect
    // raw key material. Today every kid reaching here is already charset-validated
    // (parseEnvelope KID_RE / getLegacyKid boot validation), so this is a no-op for
    // legitimate kids — but it closes the leak window unconditionally.
    super(`No key available for ${ns} kid "${safeKidLabel(kid)}"`)
    this.name = 'KeyNotAvailableError'
  }
}

/** A stored encrypted value failed envelope parsing (format / charset). */
export class EnvelopeParseError extends Error {
  public readonly code = 'ENVELOPE_PARSE'
  constructor(message = 'Invalid encrypted value format') {
    // NEVER include the stored value, ciphertext, iv, tag, or key bytes.
    super(message)
    this.name = 'EnvelopeParseError'
  }
}

/**
 * An AES-256-GCM authentication-tag mismatch — the resolved key + iv could not
 * authenticate the STORED ciphertext (wrong key bytes, tampering, or corrupt data, OR a
 * value written under a different key). This is a SERVER/DATA fault, NOT a user entering
 * the wrong PIN: the submitted PIN is compared to the decrypted plaintext AFTER decryption
 * succeeds, so it is never a decryption input (Codex re-review). A GcmAuthError therefore
 * fails LOUDLY (controlled REDEMPTION_PIN_UNREADABLE + redacted alert) like every other
 * decrypt fault and NEVER increments the wrong-PIN counter — the genuine wrong-PIN is a
 * SUCCESSFUL decrypt whose plaintext differs from the submitted PIN. Carries NO key bytes /
 * ciphertext / plaintext (a fixed message).
 */
export class GcmAuthError extends Error {
  public readonly code = 'GCM_AUTH_MISMATCH'
  constructor() {
    super('Decryption authentication failed')
    this.name = 'GcmAuthError'
  }
}

// ── Provider interface ───────────────────────────────────────────────────────

export interface KeyProvider {
  /** Active kid for new writes in this namespace. */
  getActiveKid(ns: Namespace): string
  /** AES key (HEX-DECODED 32 bytes) for (ns, kid). Throws KeyNotAvailableError if absent. */
  getKey(ns: Namespace, kid: string): Buffer
  /** OTP-HMAC keying material for the OTP kid (CRYPTO-1: bridged = ASCII hex string bytes). */
  getOtpHmacKey(kid: string): Buffer
  /** The kid that 3-part legacy (no-prefix) values resolve to. */
  getLegacyKid(): string
  /** All kids in the namespace (verify / telemetry). */
  listKids(ns: Namespace): string[]
  /** R1 reader/telemetry capability marker (spec §3.9 fingerprint component). */
  readonly codeCapability: string
}

// ── Placeholder rejection (reuse the env.ts policy) ──────────────────────────
// Kept local (not imported from env.ts) so the keyring module has no boot-time
// import cycle with env.ts (env.ts imports keyring validation, not vice versa).
const PLACEHOLDER_SUBSTRINGS = [
  'placeholder',
  'replace_me',
  'your-',
  'changeme',
  'dev-customer-secret',
  'dev-merchant-secret',
  'dev-branch-secret',
  'dev-admin-secret',
]
function isPlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase()
  return PLACEHOLDER_SUBSTRINGS.some((marker) => v.includes(marker))
}

// A genuine kid: the bare legacy kid, or a namespaced pin- / otp- kid. Anything
// echoed into a boot/runtime error that is NOT this shape is treated as a misconfig
// (most dangerously a 64-hex KEY fat-fingered into an *_ACTIVE / *_KID / map var).
const VALID_KID_LABEL = /^(legacy|(pin|otp)-[a-z0-9-]{1,28})$/

/**
 * SEC-REDACT-1: a safe label for echoing an operator-supplied kid into a boot /
 * runtime error. A real kid (legacy / pin-* / otp-*) passes through verbatim — it
 * is a safe index label that aids operator triage. ANYTHING else is FULLY redacted
 * to a constant that retains NO source characters (Codex review finding 1): the
 * previous `s.slice(0, 8) + '…[redacted]'` still leaked the first eight characters
 * of a pasted key. A real 64-hex key (or any non-kid value) now reflects as
 * "[redacted]" — never a prefix, never a substring of the raw value.
 */
function safeKidLabel(s: string): string {
  return VALID_KID_LABEL.test(s) ? s : '[redacted]'
}

/**
 * Resolve the PIN legacy kid from ENCRYPTION_LEGACY_KID consistently (CodeRabbit
 * re-review). A whitespace-only (or unset) value is treated as UNSET → DEFAULT_LEGACY_KID;
 * any other value is TRIMMED. Both validateRing AND buildKeyProviderFromEnv route through
 * this so the bridged ring kid and the EnvKeyProvider.getLegacyKid() can never diverge
 * (a divergence would brick 3-part legacy reads: getKey('pin', legacyKid) would miss).
 * NOTE: a value with SURROUNDING whitespace is additionally REJECTED by validateRing's
 * charset check before any ring is built; this normalizer only governs the unset case.
 */
function resolveLegacyKid(raw: string | undefined): string {
  const trimmed = raw?.trim()
  return trimmed ? trimmed : DEFAULT_LEGACY_KID
}

// ── Parsed ring shape ────────────────────────────────────────────────────────

interface ParsedRing {
  /** kid -> hex string (validated 64-hex, non-placeholder). */
  keys: Map<string, string>
  activeKid: string
  /** true when this ring was synthesised from ENCRYPTION_KEY (bridge mode). */
  bridged: boolean
}

function csv(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  )
}

/**
 * Detect DUPLICATE top-level object keys in a raw JSON map string (Codex review
 * finding 4). `JSON.parse` silently keeps only the LAST value for a duplicated key
 * (last-wins), which would let a retired/shadowed kid hide behind a duplicate — so
 * we scan the RAW text BEFORE trusting the parsed object. Pure dependency-free char
 * scan: tracks string + escape state and object/array nesting depth, collecting
 * strings that sit at object depth 1 in KEY position (the next non-space char is
 * `:`). Returns the set of kids that appear more than once (by RAW token) AND the
 * total count of depth-1 key tokens (`rawKeyCount`). Operates on text that
 * `JSON.parse` already accepted as an object.
 *
 * CodeRabbit re-review: a raw-token comparison alone MISSES escape-variant
 * duplicates — `{"pin-a":…,"pin-a":…}` are different raw tokens but JSON.parse
 * collapses both to "pin-a" (last-wins). The CALLER therefore also compares
 * `rawKeyCount` against `Object.keys(parsed).length`: any mismatch means a collapse
 * happened (plain OR escaped duplicate), so it fails closed even when `dups` is empty.
 */
function duplicateTopLevelKeys(raw: string): { dups: Set<string>; rawKeyCount: number } {
  const seen = new Set<string>()
  const dups = new Set<string>()
  let rawKeyCount = 0
  const n = raw.length
  let depth = 0
  let i = 0
  // Advance to the outer object's opening brace.
  while (i < n && raw[i] !== '{') i++
  for (; i < n; i++) {
    const c = raw[i]
    if (c === '{' || c === '[') {
      depth++
      continue
    }
    if (c === '}' || c === ']') {
      depth--
      continue
    }
    if (c === '"') {
      // Read the full string literal (honouring escapes) so any structural chars
      // inside it (`:`, `{`, `,`) are never mistaken for tokens.
      let s = ''
      i++
      for (; i < n; i++) {
        const ch = raw[i]
        if (ch === '\\') {
          s += ch + (raw[i + 1] ?? '')
          i++
          continue
        }
        if (ch === '"') break
        s += ch
      }
      // A KEY is a depth-1 string immediately followed (after whitespace) by ':'.
      let j = i + 1
      while (j < n && (raw[j] === ' ' || raw[j] === '\t' || raw[j] === '\n' || raw[j] === '\r')) j++
      if (depth === 1 && raw[j] === ':') {
        rawKeyCount++
        if (seen.has(s)) dups.add(s)
        else seen.add(s)
      }
      continue
    }
  }
  return { dups, rawKeyCount }
}

/**
 * Validate one ring's env config and return [problems, parsedRing | null].
 * Pure — operates on a passed env object so it is trivially testable.
 */
function validateRing(
  env: NodeJS.ProcessEnv,
  ns: Namespace,
): { problems: string[]; ring: ParsedRing | null } {
  const problems: string[] = []
  const legacyKey = env.ENCRYPTION_KEY
  const denylist = csv(env.DECOMMISSIONED_KIDS)
  const mapVar = ns === 'pin' ? 'ENCRYPTION_KEYS' : 'OTP_HMAC_KEYS'
  const activeVar = ns === 'pin' ? 'ENCRYPTION_KEY_ACTIVE' : 'OTP_HMAC_KEY_ACTIVE'
  // ENCRYPTION_LEGACY_KID is normalized via resolveLegacyKid so the SAME value drives
  // both validation and ring construction (CodeRabbit re-review): a whitespace-only
  // value is treated as UNSET (→ DEFAULT_LEGACY_KID), never kept as a truthy whitespace
  // kid.
  const legacyKid = ns === 'pin' ? resolveLegacyKid(env.ENCRYPTION_LEGACY_KID) : OTP_LEGACY_KID
  const kidPattern = ns === 'pin' ? PIN_KID : OTP_KID
  const containment = ns === 'pin' ? /^(pin-|legacy$)/ : /^otp-/
  const rawMap = env[mapVar]

  // CodeRabbit (Major, security): ENCRYPTION_LEGACY_KID is operator-supplied and
  // becomes the bridged kid + is keyed into the ring + echoed in errors. Validate
  // its charset fail-closed (pin-* or 'legacy', no underscore/colon) BEFORE use, so
  // an invalid/long value (e.g. a fat-fingered 64-hex key) cannot become a kid. The
  // value is redacted via safeKidLabel if it must be echoed. A whitespace-only value
  // is normalized to "unset" (handled by resolveLegacyKid → DEFAULT); a value with
  // SURROUNDING whitespace fails closed (rawLegacyKid !== trimmed) since the derivation
  // uses the trimmed form and a kid cannot contain whitespace (CodeRabbit re-review).
  const rawLegacyKid = env.ENCRYPTION_LEGACY_KID
  if (ns === 'pin' && rawLegacyKid !== undefined && rawLegacyKid.trim() !== '') {
    if (rawLegacyKid !== rawLegacyKid.trim() || !PIN_KID.test(rawLegacyKid.trim())) {
      problems.push(
        `ENCRYPTION_LEGACY_KID "${safeKidLabel(rawLegacyKid)}" is not a valid pin kid (expected pin-* or "legacy", charset a-z0-9- only, no surrounding whitespace).`,
      )
      return { problems, ring: null }
    }
  }

  // ── Bridge mode: the ring's map var is unset → synthesise from ENCRYPTION_KEY.
  if (rawMap === undefined || rawMap.trim() === '') {
    if (!legacyKey) {
      // env.ts already requires ENCRYPTION_KEY; if it is genuinely absent the
      // bridge cannot form. Report so the boot list is complete.
      problems.push(`${mapVar} is unset and ENCRYPTION_KEY is not present, so the ${ns} legacy bridge cannot be formed.`)
      return { problems, ring: null }
    }
    if (!HEX64.test(legacyKey)) {
      problems.push(`ENCRYPTION_KEY must be a 64-character hex string (32 bytes) for the ${ns} legacy bridge.`)
      return { problems, ring: null }
    }
    const bridgedKid = ns === 'pin' ? legacyKid : OTP_LEGACY_KID
    const keys = new Map<string, string>([[bridgedKid, legacyKey]])
    // A denylisted bridged kid would make the bridge boot impossible — report it.
    if (denylist.has(bridgedKid)) {
      problems.push(`The bridged ${ns} active kid "${bridgedKid}" is in DECOMMISSIONED_KIDS, so it cannot be the active key.`)
    }
    // BV-2: a set *_ACTIVE without its map var is an operator trap — the ring
    // silently runs in legacy-bridge mode and the ACTIVE value is ignored. Fail
    // closed: the operator almost certainly meant explicit-keyring mode but
    // forgot/typo'd the map var. (safeKidLabel: never echo a fat-fingered key.)
    const explicitActive = env[activeVar]
    if (explicitActive !== undefined && explicitActive.trim() !== '' && explicitActive !== bridgedKid) {
      problems.push(
        `${activeVar} is set ("${safeKidLabel(explicitActive)}") but ${mapVar} is unset, so the ${ns} ring would run in legacy-bridge mode under "${bridgedKid}" and ${activeVar} would be IGNORED. Set ${mapVar} (explicit-keyring mode) or unset ${activeVar}.`,
      )
    }
    if (problems.length > 0) return { problems, ring: null }
    return { problems, ring: { keys, activeKid: bridgedKid, bridged: true } }
  }

  // ── Explicit mode: parse + validate the map var.
  let parsed: unknown
  try {
    parsed = JSON.parse(rawMap)
  } catch {
    problems.push(`${mapVar} is not valid JSON. It must be a JSON object mapping kid -> 64-hex key.`)
    return { problems, ring: null }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    problems.push(`${mapVar} must be a JSON object mapping kid -> 64-hex key.`)
    return { problems, ring: null }
  }
  const entries = Object.entries(parsed as Record<string, unknown>)
  if (entries.length === 0) {
    problems.push(`${mapVar} is an empty object; it must contain at least the active kid.`)
    return { problems, ring: null }
  }

  // Duplicate-kid rejection (Codex review finding 4): `Object.entries(parsed)` can
  // NEVER surface a duplicate because `JSON.parse` already collapsed it last-wins —
  // which would silently SHADOW a retired/old key behind a re-declared kid. The merged
  // spec/plan require duplicate kids to FAIL CLOSED, so we scan the RAW map text for
  // repeated depth-1 keys. Two checks: (a) raw-token duplicates (the common case, with
  // named kids in the error); (b) rawKeyCount vs the parsed key count — a mismatch means
  // JSON.parse collapsed an ESCAPE-VARIANT duplicate (e.g. "pin-a" vs "pin-a") that
  // the raw-token compare cannot see (CodeRabbit re-review). Either ⇒ fail closed.
  const { dups: dupKids, rawKeyCount } = duplicateTopLevelKeys(rawMap)
  if (dupKids.size > 0 || rawKeyCount !== entries.length) {
    const named = dupKids.size > 0 ? [...dupKids].map(safeKidLabel).join(', ') : '(escape-variant duplicate)'
    problems.push(
      `${mapVar} declares duplicate kid(s) [${named}]. JSON parsing silently keeps only the LAST value for a repeated key (including \\uXXXX escape-variant re-declarations), which could shadow a retired/old key — provide each kid exactly once.`,
    )
    return { problems, ring: null }
  }

  const keys = new Map<string, string>()
  for (const [kid, value] of entries) {
    if (!containment.test(kid) || !kidPattern.test(kid)) {
      problems.push(`${mapVar} kid "${safeKidLabel(kid)}" is not in the ${ns} namespace (expected ${ns === 'pin' ? 'pin-* or legacy' : 'otp-*'}, charset a-z0-9- only).`)
    }
    // CodeRabbit (Major, security): a decommissioned kid must not be present in the
    // ring AT ALL — not merely barred from being ACTIVE. Retirement removes the kid
    // from the ring AND adds it to DECOMMISSIONED_KIDS (mutually exclusive states), so
    // a denylisted kid appearing as any ring key is a misconfig that would keep a
    // retired/compromised key loaded + usable for decrypt. Fail closed.
    if (denylist.has(kid)) {
      problems.push(`${mapVar} contains kid "${safeKidLabel(kid)}" which is in DECOMMISSIONED_KIDS; a retired/compromised kid must be removed from the ring entirely, not kept as a key.`)
    }
    if (typeof value !== 'string' || !HEX64.test(value)) {
      problems.push(`${mapVar} kid "${safeKidLabel(kid)}" must map to a 64-character hex key (32 bytes).`)
      continue
    }
    if (isPlaceholder(value)) {
      problems.push(`${mapVar} kid "${safeKidLabel(kid)}" is set to a placeholder value. Provide a real key.`)
      continue
    }
    keys.set(kid, value)
  }

  const activeKid = env[activeVar]
  if (!activeKid || activeKid.trim() === '') {
    problems.push(`${activeVar} is not set. It must name the active ${ns} kid present in ${mapVar}.`)
  } else {
    if (!kidPattern.test(activeKid)) {
      problems.push(`${activeVar} "${safeKidLabel(activeKid)}" is not a valid ${ns} kid (expected ${ns === 'pin' ? 'pin-*' : 'otp-*'}).`)
    }
    // `keys` only holds kids that passed every per-key check. If the active kid
    // failed a check (bad hex / placeholder) it was already reported above; only
    // flag "not present" when the kid is genuinely absent from the parsed object.
    const presentInRaw = Object.prototype.hasOwnProperty.call(parsed as object, activeKid)
    if (!keys.has(activeKid) && !presentInRaw) {
      problems.push(`${activeVar} "${safeKidLabel(activeKid)}" is not present in ${mapVar}.`)
    }
    if (denylist.has(activeKid)) {
      problems.push(`${activeVar} "${safeKidLabel(activeKid)}" is in DECOMMISSIONED_KIDS and can never be the active key.`)
    }
    if (ns === 'pin' && activeKid === legacyKid) {
      problems.push(`${activeVar} "${safeKidLabel(activeKid)}" must not equal the legacy kid "${legacyKid}" in explicit-keyring mode.`)
    }
  }

  // PIN explicit mode: the legacy kid must be present so 3-part values keep decrypting.
  if (ns === 'pin' && !keys.has(legacyKid)) {
    problems.push(`The legacy kid "${legacyKid}" (ENCRYPTION_LEGACY_KID) must be present in ENCRYPTION_KEYS so existing 3-part values keep decrypting.`)
  }

  if (problems.length > 0) return { problems, ring: null }
  return { problems, ring: { keys, activeKid: activeKid as string, bridged: false } }
}

/**
 * Validate the keyring env and return ALL problems (empty array = valid).
 * Called by `validateRequiredEnv()` in env.ts (appended to the same problem list).
 */
export function validateKeyringEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const pin = validateRing(env, 'pin')
  const otp = validateRing(env, 'otp')
  return [...pin.problems, ...otp.problems]
}

// ── EnvKeyProvider ─────────────────────────────────────────────────────────

export class EnvKeyProvider implements KeyProvider {
  public readonly codeCapability = CODE_CAPABILITY
  private readonly pin: ParsedRing
  private readonly otp: ParsedRing
  private readonly legacyKid: string

  constructor(pin: ParsedRing, otp: ParsedRing, legacyKid: string) {
    this.pin = pin
    this.otp = otp
    this.legacyKid = legacyKid
  }

  private ring(ns: Namespace): ParsedRing {
    return ns === 'pin' ? this.pin : this.otp
  }

  getActiveKid(ns: Namespace): string {
    return this.ring(ns).activeKid
  }

  getLegacyKid(): string {
    return this.legacyKid
  }

  listKids(ns: Namespace): string[] {
    return [...this.ring(ns).keys.keys()]
  }

  getKey(ns: Namespace, kid: string): Buffer {
    const hex = this.ring(ns).keys.get(kid)
    if (hex === undefined) throw new KeyNotAvailableError(ns, kid)
    return Buffer.from(hex, 'hex')
  }

  getOtpHmacKey(kid: string): Buffer {
    // CRYPTO-1: the live OTP sites key the HMAC with the raw 64-hex STRING bytes
    // (createHmac('sha256', ENCRYPTION_KEY)), NOT the decoded 32 bytes. Return the
    // ASCII hex string bytes so a future otpHmac() byte-equals the legacy output.
    const hex = this.otp.keys.get(kid)
    if (hex === undefined) throw new KeyNotAvailableError('otp', kid)
    return Buffer.from(hex, 'utf8')
  }

  /** Internal: the hex strings (for fingerprint keyHash; never logged). */
  _entries(): Array<{ ns: Namespace; kid: string; hex: string }> {
    const out: Array<{ ns: Namespace; kid: string; hex: string }> = []
    for (const [kid, hex] of this.pin.keys) out.push({ ns: 'pin', kid, hex })
    for (const [kid, hex] of this.otp.keys) out.push({ ns: 'otp', kid, hex })
    return out
  }
}

/**
 * Build (and validate) a KeyProvider from an env object. Throws a single
 * aggregated error (fail-closed) if validation fails — same semantics as
 * `validateRequiredEnv()`. Pure: operates on the passed env object.
 */
export function buildKeyProviderFromEnv(env: NodeJS.ProcessEnv = process.env): EnvKeyProvider {
  const pin = validateRing(env, 'pin')
  const otp = validateRing(env, 'otp')
  const problems = [...pin.problems, ...otp.problems]
  if (problems.length > 0 || !pin.ring || !otp.ring) {
    throw new Error(
      `[keyring] Refusing to start — ${problems.length} keyring configuration problem(s):\n` +
        problems.map((p) => '  - ' + p).join('\n'),
    )
  }
  // Same normalization as validateRing (CodeRabbit re-review): a whitespace-only value
  // must resolve to DEFAULT_LEGACY_KID here too, else the provider's getLegacyKid() would
  // diverge from the bridged ring kid and brick 3-part legacy reads.
  const legacyKid = resolveLegacyKid(env.ENCRYPTION_LEGACY_KID)
  return new EnvKeyProvider(pin.ring, otp.ring, legacyKid)
}

// ── Boot-once singleton (used by encryption.ts) ───────────────────────────────

let cached: EnvKeyProvider | null = null

/**
 * The process-wide KeyProvider, parsed ONCE from process.env on first use
 * (spec §3.3 — deliberate change from per-call key reads, enables atomic
 * multi-key validation). Throws fail-closed on a misconfigured ring.
 */
export function getKeyProvider(): EnvKeyProvider {
  if (cached === null) cached = buildKeyProviderFromEnv(process.env)
  return cached
}

/**
 * TEST-ONLY: reset the boot-once cache so a test can re-parse process.env with a
 * different keyring config. Not used in production code paths.
 */
export function __resetKeyProviderForTests(): void {
  cached = null
}

// ── Canonical fingerprint (spec §3.9 — the ONE formula) ───────────────────────

/** Domain-separated, delimited per-key hash — never a bare sha256(keyBytes). */
function keyHash(ns: Namespace, kid: string, keyBytes: Buffer): string {
  return crypto
    .createHash('sha256')
    .update('redeemo-keyring-v1:' + ns + ':' + kid + ':')
    .update(keyBytes)
    .digest('hex')
}

/**
 * Canonical keyring fingerprint (spec §3.9). Proves reader-capable CODE +
 * WHICH kids are active + the exact key SET — without ever exposing raw key
 * bytes. An ACTIVE divergence MUST change the digest (the parity property the
 * runner gate depends on).
 */
export function keyringFingerprint(provider: EnvKeyProvider): string {
  const keys = provider
    ._entries()
    .map((e) => ({ ns: e.ns, kid: e.kid, keyHash: keyHash(e.ns, e.kid, Buffer.from(e.hex, e.ns === 'otp' ? 'utf8' : 'hex')) }))
    .sort((a, b) => (a.kid === b.kid ? a.ns.localeCompare(b.ns) : a.kid.localeCompare(b.kid)))
  const canonical = JSON.stringify({
    codeCapability: provider.codeCapability,
    active: { pin: provider.getActiveKid('pin'), otp: provider.getActiveKid('otp') },
    keys,
  })
  return crypto.createHash('sha256').update(canonical).digest('hex')
}

// ── Fingerprint publication (spec §3.9 / Amendment #9 / R3-#2) ────────────────

export type KeyringService = 'web' | 'worker' | 'migrator'

/** Narrow structural type — avoids importing the heavy generated PrismaClient here. */
export interface KeyringFingerprintWriter {
  keyringFingerprint: {
    upsert(args: {
      where: { service: string }
      create: { service: string; fingerprint: string; codeCapability: string }
      update: { fingerprint: string; codeCapability: string }
    }): Promise<unknown>
  }
}

/**
 * Publish (upsert) the running service's keyring fingerprint row.
 *
 * BEST-EFFORT (Amendment R3-#2): a write failure logs + returns false and does
 * NOT throw — boot must never be blocked by a transient fingerprint write. (A
 * missing/stale row instead blocks LATER rotation: the migrator's parity gate
 * refuses to start on it.) Logs only the service + error message — never key
 * bytes (the canonical fingerprint itself contains no key bytes).
 */
export async function publishKeyringFingerprint(
  prisma: KeyringFingerprintWriter,
  service: KeyringService,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  try {
    const provider = buildKeyProviderFromEnv(env)
    const fingerprint = keyringFingerprint(provider)
    const codeCapability = provider.codeCapability
    await prisma.keyringFingerprint.upsert({
      where: { service },
      create: { service, fingerprint, codeCapability },
      update: { fingerprint, codeCapability },
    })
    return true
  } catch (err) {
    // No key bytes are present in `err` (build/upsert errors carry only config
    // labels). Surface for observability; never block boot.
    console.error('[keyring] fingerprint publish failed (best-effort, boot continues)', {
      service,
      reason: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
