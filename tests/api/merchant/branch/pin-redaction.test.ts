import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { KeyNotAvailableError, EnvelopeParseError, __resetKeyProviderForTests } from '../../../../src/api/shared/keyring'

// Request-path logging redaction (encryption key-rotation R1, spec §3.10 / §3.11).
//
// getBranchPin / sendBranchPin call decrypt() OUTSIDE any try/catch, so a keyring /
// envelope throw propagates to the global Fastify handler (app.log.error(error)).
// This test uses the REAL decrypt() (NOT the usual encryption mock) against an
// unknown-kid value + a corrupt value, and asserts:
//   (1) the thrown error is the correct typed class, and
//   (2) its message contains NO stored ciphertext, NO key bytes, NO plaintext —
//       so the propagated app.log.error(error) cannot leak a secret.
// It also spies on console.* to prove the readers themselves log nothing sensitive.

vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create: vi.fn() } })) }))
vi.mock('../../../../src/api/shared/smsLimiter', () => ({
  consumeSmsSend: vi.fn().mockResolvedValue(undefined),
}))

import { getBranchPin, sendBranchPin } from '../../../../src/api/merchant/branch/service'

// LEGACY_KEY matches tests/setup.ts (the bridge env).
const LEGACY_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
// A v2 value naming a kid that is NOT in the (bridged, legacy-only) ring → KeyNotAvailableError.
const UNKNOWN_KID_VALUE = 'v2:pin-retired-kid:001122334455667788990011:00112233445566778899aabbccddeeff:deadbeef'
// A structurally-broken value → EnvelopeParseError (4 parts).
const CORRUPT_VALUE = 'aabb:ccdd:eeff:gggg'

const mockPrisma = () => ({
  merchantAdmin: { findUnique: vi.fn() },
  merchantMembership: {
    findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }),
    findMany: vi.fn().mockResolvedValue([{
      id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER',
      allBranches: true, canManageVouchers: false,
      merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [],
    }]),
  },
  branch:     { findFirst: vi.fn(), update: vi.fn() },
  branchUser: { findMany: vi.fn() },
  auditLog:   { create: vi.fn().mockResolvedValue({}) },
} as any)

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ENCRYPTION_KEY = LEGACY_KEY
  delete process.env.ENCRYPTION_KEYS
  delete process.env.ENCRYPTION_KEY_ACTIVE
  __resetKeyProviderForTests()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  errorSpy.mockRestore()
  warnSpy.mockRestore()
  logSpy.mockRestore()
  __resetKeyProviderForTests()
})

// Flatten every logged argument to an inspectable string. CodeRabbit (Minor,
// test rigor): JSON.stringify(new Error('secret')) === '{}' because Error props
// are non-enumerable — so a leak via console.error(err) would have false-greened
// these "not.toContain" assertions. Render Error args via message + stack so the
// redaction guard actually inspects what an operator would see in the logs.
function stringifyArg(a: unknown): string {
  if (typeof a === 'string') return a
  if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ''}`
  return JSON.stringify(a)
}

function loggedString(): string {
  return [errorSpy, warnSpy, logSpy]
    .flatMap((s) => s.mock.calls)
    .flat()
    .map(stringifyArg)
    .join(' | ')
}

// Spec §3.10 line 236 requires the redaction test to "assert the captured
// app.log.error payload contains no ciphertext/key/plaintext". getBranchPin /
// sendBranchPin call decrypt() OUTSIDE any try/catch, so the typed error
// propagates VERBATIM to Fastify's global handler (src/api/app.ts:86 →
// app.log.error(error)), which serializes it via pino's std err serializer.
// This helper is a STRICTLY-MORE-INCLUSIVE approximation of that serialization
// (name + message + stack + EVERY own enumerable prop, e.g. `code`), so a clean
// assertion here proves the real logged payload cannot leak a secret either.
function serializeErrorLikePino(err: unknown): string {
  if (!(err instanceof Error)) return JSON.stringify(err)
  const ownProps: Record<string, unknown> = {}
  const bag = err as unknown as Record<string, unknown>
  for (const k of Object.keys(err)) ownProps[k] = bag[k]
  return [
    err.name,
    err.message,
    err.stack ?? '',
    JSON.stringify(ownProps),
    ...Object.values(ownProps).map((v) => String(v)),
  ].join(' | ')
}

describe('getBranchPin — unknown-kid value redaction', () => {
  it('throws KeyNotAvailableError whose message leaks no ciphertext/key, and logs nothing sensitive', async () => {
    const prisma = mockPrisma()
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: UNKNOWN_KID_VALUE })

    let thrown: unknown
    try {
      await getBranchPin(prisma, 'ma1', 'b1')
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(KeyNotAvailableError)
    const msg = (thrown as Error).message
    expect(msg).toContain('pin-retired-kid') // safe index label is allowed
    expect(msg).not.toContain('deadbeef') // ciphertext fragment must NOT appear
    expect(msg).not.toContain(LEGACY_KEY)
    expect(msg).not.toContain(UNKNOWN_KID_VALUE)

    const logged = loggedString()
    expect(logged).not.toContain('deadbeef')
    expect(logged).not.toContain(LEGACY_KEY)

    // The propagated app.log.error(error) payload (pino-serialized) leaks nothing.
    const payload = serializeErrorLikePino(thrown)
    expect(payload).not.toContain('deadbeef')
    expect(payload).not.toContain(LEGACY_KEY)
    expect(payload).not.toContain(UNKNOWN_KID_VALUE)
  })
})

describe('getBranchPin — corrupt value redaction', () => {
  it('throws EnvelopeParseError whose message contains no stored value', async () => {
    const prisma = mockPrisma()
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: CORRUPT_VALUE })

    let thrown: unknown
    try {
      await getBranchPin(prisma, 'ma1', 'b1')
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(EnvelopeParseError)
    expect((thrown as Error).message).not.toContain(CORRUPT_VALUE)
    expect((thrown as Error).message).not.toContain('aabb')

    // app.log.error(error) payload (pino-serialized) contains no stored value.
    const payload = serializeErrorLikePino(thrown)
    expect(payload).not.toContain(CORRUPT_VALUE)
    expect(payload).not.toContain('aabb')
  })
})

describe('sendBranchPin — unknown-kid value redaction', () => {
  it('throws KeyNotAvailableError whose message leaks no ciphertext/key', async () => {
    const prisma = mockPrisma()
    prisma.branch.findFirst.mockResolvedValue({
      id: 'b1', merchantId: 'm1', redemptionPin: UNKNOWN_KID_VALUE, name: 'Main', email: null, phone: null,
    })

    let thrown: unknown
    try {
      await sendBranchPin(prisma, {} as any, 'ma1', 'b1', { ipAddress: '1.2.3.4', userAgent: 'test' })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(KeyNotAvailableError)
    const msg = (thrown as Error).message
    expect(msg).not.toContain('deadbeef')
    expect(msg).not.toContain(LEGACY_KEY)

    const logged = loggedString()
    expect(logged).not.toContain('deadbeef')
    expect(logged).not.toContain(LEGACY_KEY)

    // The propagated app.log.error(error) payload (pino-serialized) leaks nothing.
    const payload = serializeErrorLikePino(thrown)
    expect(payload).not.toContain('deadbeef')
    expect(payload).not.toContain(LEGACY_KEY)
    expect(payload).not.toContain(UNKNOWN_KID_VALUE)
  })
})
