import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { KeyNotAvailableError, EnvelopeParseError, GcmAuthError } from '../../../src/api/shared/keyring'

// Guard-10 three-bucket hardening (spec §3.10). The encryption module is mocked so
// decrypt() can throw each bucket's error class on demand. The redemption hot path
// must classify:
//   (a) KeyNotAvailableError  → alert (log.error) + AppError('KEY_NOT_AVAILABLE')   — fail closed LOUDLY
//   (b) EnvelopeParseError    → alert (log.error) + AppError('REDEMPTION_PIN_UNREADABLE') — fail closed LOUDLY
//   (c) genuine GCM mismatch  → silent pinMatches=false (→ INVALID_PIN), as today
//
// The mock factory must not reference outer-scope mutable state (vi.mock is hoisted).
const decryptImpl = { fn: (v: string) => v.replace('enc:', '') }
vi.mock('../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => decryptImpl.fn(v)),
}))
vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'A7K2P9X4') }))

import { createRedemption } from '../../../src/api/redemption/service'

const mockPrisma = () => ({
  branch:                  { findUnique: vi.fn() },
  subscription:            { findUnique: vi.fn() },
  voucher:                 { findUnique: vi.fn() },
  userVoucherCycleState:   { findUnique: vi.fn() },
  voucherRedemption:       { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  user:                    { findUnique: vi.fn().mockResolvedValue({ phoneVerified: true }) },
  auditLog:                { create: vi.fn().mockResolvedValue({}) },
  $transaction:            vi.fn(),
} as any)

const mockRedis = () => ({
  get:    vi.fn().mockResolvedValue(null),
  incr:   vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  del:    vi.fn().mockResolvedValue(1),
  ttl:    vi.fn().mockResolvedValue(900),
} as any)

const baseCtx = { ipAddress: '127.0.0.1', userAgent: 'test' }
const happyVoucher = {
  id: 'v1', merchantId: 'm1', status: 'ACTIVE', approvalStatus: 'APPROVED',
  expiryDate: null, estimatedSaving: 5.0, merchant: { id: 'm1', status: 'ACTIVE' },
}
const happyAnchor = new Date(Date.UTC(2026, 0, 10))

// The stored PIN ciphertext the test feeds in — used to assert it is NEVER logged.
const STORED_PIN_CIPHERTEXT = 'enc:secretplaintextpin'

function setupReachingPinCompare(prisma: any, redis: any) {
  redis.get.mockResolvedValue(null)
  prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', isActive: true, redemptionPin: STORED_PIN_CIPHERTEXT })
  prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE', cycleAnchorDate: happyAnchor })
  prisma.voucher.findUnique.mockResolvedValue(happyVoucher)
  prisma.userVoucherCycleState.findUnique.mockResolvedValue(null)
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  decryptImpl.fn = (v: string) => v.replace('enc:', '') // reset to benign default
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  errorSpy.mockRestore()
})

describe('Guard-10 three-bucket hardening', () => {
  it('(a) KeyNotAvailableError → AppError(KEY_NOT_AVAILABLE), fail closed loudly (alert logged)', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    setupReachingPinCompare(prisma, redis)
    decryptImpl.fn = () => {
      throw new KeyNotAvailableError('pin', 'pin-retired-kid')
    }

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx),
    ).rejects.toThrow('KEY_NOT_AVAILABLE')

    // Loud: an alert was logged. NOT silent.
    expect(errorSpy).toHaveBeenCalled()
    // A KEY_NOT_AVAILABLE must NOT be counted as a wrong-PIN attempt.
    expect(redis.incr).not.toHaveBeenCalled()
  })

  it('(b) EnvelopeParseError → AppError(REDEMPTION_PIN_UNREADABLE), fail closed loudly (alert logged)', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    setupReachingPinCompare(prisma, redis)
    decryptImpl.fn = () => {
      throw new EnvelopeParseError()
    }

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx),
    ).rejects.toThrow('REDEMPTION_PIN_UNREADABLE')

    expect(errorSpy).toHaveBeenCalled()
    expect(redis.incr).not.toHaveBeenCalled()
  })

  it('(c) genuine GCM mismatch (typed GcmAuthError) → silent INVALID_PIN as today (no alert)', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    setupReachingPinCompare(prisma, redis)
    // Codex finding 2: ONLY the typed GcmAuthError (a real auth-tag mismatch) may be
    // silenced into INVALID_PIN.
    decryptImpl.fn = () => {
      throw new GcmAuthError()
    }

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx),
    ).rejects.toThrow('INVALID_PIN')

    // Silent: a genuine wrong PIN is NOT a key/data-integrity alert.
    expect(errorSpy).not.toHaveBeenCalled()
    // It IS counted as a wrong-PIN attempt (rate-limit increments).
    expect(redis.incr).toHaveBeenCalled()
  })

  it('(d) an UNRELATED error (e.g. a programming TypeError) is NOT silently converted to INVALID_PIN — fails LOUDLY (Codex finding 2, mutation-resistant)', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    setupReachingPinCompare(prisma, redis)
    // A runtime/programming fault must NEVER be swallowed into a silent wrong-PIN.
    decryptImpl.fn = () => {
      throw new TypeError('Cannot read properties of undefined (reading something)')
    }

    // Loud + controlled: surfaces as REDEMPTION_PIN_UNREADABLE, NOT INVALID_PIN.
    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx),
    ).rejects.toThrow('REDEMPTION_PIN_UNREADABLE')

    // Observable (an alert was logged) and NOT counted as a wrong-PIN attempt.
    expect(errorSpy).toHaveBeenCalled()
    expect(redis.incr).not.toHaveBeenCalled()
  })

  it('a correct decrypt that does not match the submitted PIN stays a silent INVALID_PIN', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    setupReachingPinCompare(prisma, redis)
    decryptImpl.fn = () => '9999' // decrypts fine, but != submitted '1234'

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx),
    ).rejects.toThrow('INVALID_PIN')

    expect(errorSpy).not.toHaveBeenCalled()
    expect(redis.incr).toHaveBeenCalled()
  })
})

describe('Guard-10 request-path redaction — no plaintext/ciphertext/key in logs', () => {
  it('a KEY_NOT_AVAILABLE alert logs only branchId + kid + code (NO ciphertext / plaintext / key)', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    setupReachingPinCompare(prisma, redis)
    const KID = 'pin-retired-kid'
    decryptImpl.fn = () => {
      throw new KeyNotAvailableError('pin', KID)
    }

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx),
    ).rejects.toThrow('KEY_NOT_AVAILABLE')

    // Flatten every logged argument to a single inspectable string. CodeRabbit
    // (Minor, test rigor): JSON.stringify(new Error('secret')) === '{}' (Error
    // props are non-enumerable), so a leak via console.error(err) would have
    // false-greened these "not.toContain" guards. Render Error args via
    // message + stack so the redaction guard inspects what an operator would see.
    const stringifyArg = (a: unknown): string => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ''}`
      return JSON.stringify(a)
    }
    const logged = (errorSpy.mock.calls.flat() as unknown[]).map(stringifyArg).join(' | ')

    // Allowed identifiers may appear:
    expect(logged).toContain('b1')
    // Forbidden: the stored ciphertext, the submitted plaintext PIN, the key bytes.
    expect(logged).not.toContain(STORED_PIN_CIPHERTEXT)
    expect(logged).not.toContain('secretplaintextpin')
    expect(logged).not.toContain('1234')
    expect(logged).not.toContain('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff')
  })
})
