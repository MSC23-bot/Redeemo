import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { AppError } from '../../../../src/api/shared/errors'
import { __resetKeyProviderForTests } from '../../../../src/api/shared/keyring'

// Request-path controlled-envelope + redaction (encryption key-rotation R1, spec §3.10
// / §3.11; Codex review finding 3). getBranchPin / sendBranchPin now wrap decrypt() so a
// keyring / envelope / auth-mismatch throw is MAPPED to a controlled AppError
// (KEY_NOT_AVAILABLE / REDEMPTION_PIN_UNREADABLE) via the shared classifyPinDecryptError —
// instead of propagating a raw typed error to the global handler (which would have
// returned a generic INTERNAL_ERROR 500). This suite proves, at BOTH the service level
// and the actual Fastify route level, that:
//   (1) the response is the CONTROLLED envelope (not a raw 500), and
//   (2) no stored ciphertext / key bytes / plaintext PIN appears in the response OR logs.

vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create: vi.fn() } })) }))
vi.mock('../../../../src/api/shared/smsLimiter', () => ({
  consumeSmsSend: vi.fn().mockResolvedValue(undefined),
  // buildApp() reads this at registration — stub it so the real app builds. (decrypt
  // throws before any SMS path in these tests, and the mock branch has phone:null.)
  smsCountryCodeConfigWarning: vi.fn(() => null),
}))

import { getBranchPin, sendBranchPin } from '../../../../src/api/merchant/branch/service'
import { buildApp } from '../../../../src/api/app'

// LEGACY_KEY matches tests/setup.ts (the bridge env).
const LEGACY_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
// A v2 value naming a kid that is NOT in the (bridged, legacy-only) ring → KeyNotAvailableError.
const UNKNOWN_KID_VALUE = 'v2:pin-retired-kid:001122334455667788990011:00112233445566778899aabbccddeeff:deadbeef'
// A structurally-broken value → EnvelopeParseError (4 parts).
const CORRUPT_VALUE = 'aabb:ccdd:eeff:gggg'

const mockPrisma = (redemptionPin: string) => ({
  merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
  merchantMembership: {
    findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }),
    findMany: vi.fn().mockResolvedValue([{
      id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER',
      allBranches: true, canManageVouchers: false,
      merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [],
    }]),
  },
  merchant: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', status: 'ACTIVE' }) },
  branch: {
    findFirst: vi.fn().mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin, name: 'Main', email: null, phone: null }),
    update: vi.fn(),
  },
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

function stringifyArg(a: unknown): string {
  if (typeof a === 'string') return a
  if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ''}`
  return JSON.stringify(a)
}

// Flatten every logged argument (across all console.* spies) into one inspectable
// string. Error args are rendered via message + stack (JSON.stringify(Error) === '{}').
function loggedString(): string {
  return [errorSpy, warnSpy, logSpy]
    .flatMap((s) => s.mock.calls)
    .flat()
    .map(stringifyArg)
    .join(' | ')
}

// A STRICTLY-MORE-INCLUSIVE approximation of pino's std err serializer (name + message
// + stack + every own enumerable prop), so a clean assertion here proves the real
// logged/serialized error payload cannot leak a secret either.
function serializeErrorLikePino(err: unknown): string {
  if (!(err instanceof Error)) return JSON.stringify(err)
  const ownProps: Record<string, unknown> = {}
  const bag = err as unknown as Record<string, unknown>
  for (const k of Object.keys(err)) ownProps[k] = bag[k]
  return [err.name, err.message, err.stack ?? '', JSON.stringify(ownProps), ...Object.values(ownProps).map((v) => String(v))].join(' | ')
}

// Asserts the thrown AppError + every log channel + the pino-style serialization carry
// none of the supplied secret fragments.
function assertNoSecret(thrown: unknown, fragments: string[]) {
  const surfaces = [serializeErrorLikePino(thrown), loggedString()]
  for (const surface of surfaces) {
    for (const frag of fragments) expect(surface).not.toContain(frag)
  }
}

describe('getBranchPin — controlled error + redaction (service level)', () => {
  it('unknown-kid value ⇒ throws AppError(KEY_NOT_AVAILABLE), leaks no ciphertext/key', async () => {
    const prisma = mockPrisma(UNKNOWN_KID_VALUE)
    let thrown: unknown
    try {
      await getBranchPin(prisma, 'ma1', 'b1')
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(AppError)
    expect((thrown as AppError).code).toBe('KEY_NOT_AVAILABLE')
    // The CONTROLLED client message must not contain the ciphertext/key/value.
    assertNoSecret(thrown, ['deadbeef', LEGACY_KEY, UNKNOWN_KID_VALUE])
    // The redacted alert may carry the safe kid label, never key bytes.
    expect(errorSpy).toHaveBeenCalled()
  })

  it('corrupt value ⇒ throws AppError(REDEMPTION_PIN_UNREADABLE), leaks no stored value', async () => {
    const prisma = mockPrisma(CORRUPT_VALUE)
    let thrown: unknown
    try {
      await getBranchPin(prisma, 'ma1', 'b1')
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(AppError)
    expect((thrown as AppError).code).toBe('REDEMPTION_PIN_UNREADABLE')
    assertNoSecret(thrown, [CORRUPT_VALUE, 'aabb'])
  })
})

describe('sendBranchPin — controlled error + redaction (service level)', () => {
  it('unknown-kid value ⇒ throws AppError(KEY_NOT_AVAILABLE), leaks no ciphertext/key', async () => {
    const prisma = mockPrisma(UNKNOWN_KID_VALUE)
    let thrown: unknown
    try {
      await sendBranchPin(prisma, {} as any, 'ma1', 'b1', { ipAddress: '1.2.3.4', userAgent: 'test' })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(AppError)
    expect((thrown as AppError).code).toBe('KEY_NOT_AVAILABLE')
    assertNoSecret(thrown, ['deadbeef', LEGACY_KEY, UNKNOWN_KID_VALUE])
  })

  it('corrupt value ⇒ throws AppError(REDEMPTION_PIN_UNREADABLE), leaks no stored value', async () => {
    const prisma = mockPrisma(CORRUPT_VALUE)
    let thrown: unknown
    try {
      await sendBranchPin(prisma, {} as any, 'ma1', 'b1', { ipAddress: '1.2.3.4', userAgent: 'test' })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(AppError)
    expect((thrown as AppError).code).toBe('REDEMPTION_PIN_UNREADABLE')
    assertNoSecret(thrown, [CORRUPT_VALUE, 'aabb'])
  })
})

// ── Codex review finding 3: ACTUAL Fastify request tests for both routes × both
// typed failures. Proves the route returns the CONTROLLED envelope (not a generic
// INTERNAL_ERROR 500) and that no secret appears in the response body or logs.
describe('merchant PIN routes — controlled envelope via real Fastify requests', () => {
  async function makeApp(redemptionPin: string) {
    const app = await buildApp()
    app.decorate('prisma', mockPrisma(redemptionPin) as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null), set: vi.fn(), incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1), exists: vi.fn().mockResolvedValue(1), ttl: vi.fn().mockResolvedValue(900),
    } as any)
    await app.ready()
    const token = (app.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
    return { app, token }
  }

  const cases: Array<{ name: string; pin: string; code: string }> = [
    { name: 'unknown-kid', pin: UNKNOWN_KID_VALUE, code: 'KEY_NOT_AVAILABLE' },
    { name: 'corrupt value', pin: CORRUPT_VALUE, code: 'REDEMPTION_PIN_UNREADABLE' },
  ]

  for (const c of cases) {
    it(`GET /pin (${c.name}) ⇒ ${c.code} envelope, no secret in response/logs`, async () => {
      const { app, token } = await makeApp(c.pin)
      try {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/merchant/branches/b1/pin',
          headers: { authorization: `Bearer ${token}` },
        })
        const body = JSON.parse(res.body)
        expect(body.error?.code).toBe(c.code)
        expect(body.error?.code).not.toBe('INTERNAL_ERROR')
        for (const frag of ['deadbeef', LEGACY_KEY, UNKNOWN_KID_VALUE, CORRUPT_VALUE, 'aabb']) {
          expect(res.body).not.toContain(frag)
        }
        expect(loggedString()).not.toContain('deadbeef')
        expect(loggedString()).not.toContain(LEGACY_KEY)
      } finally {
        await app.close()
      }
    })

    it(`POST /pin/send (${c.name}) ⇒ ${c.code} envelope, no secret in response/logs`, async () => {
      const { app, token } = await makeApp(c.pin)
      try {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/merchant/branches/b1/pin/send',
          headers: { authorization: `Bearer ${token}` },
          payload: {},
        })
        const body = JSON.parse(res.body)
        expect(body.error?.code).toBe(c.code)
        expect(body.error?.code).not.toBe('INTERNAL_ERROR')
        for (const frag of ['deadbeef', LEGACY_KEY, UNKNOWN_KID_VALUE, CORRUPT_VALUE, 'aabb']) {
          expect(res.body).not.toContain(frag)
        }
        expect(loggedString()).not.toContain('deadbeef')
        expect(loggedString()).not.toContain(LEGACY_KEY)
      } finally {
        await app.close()
      }
    })
  }
})
