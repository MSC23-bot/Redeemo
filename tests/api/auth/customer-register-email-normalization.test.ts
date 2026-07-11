import { describe, it, expect, vi, afterEach } from 'vitest'
import { registerCustomer, loginCustomer } from '../../../src/api/auth/customer/service'

// Email normalization (transitional design, mirrors registerMerchant):
// registerCustomer stores every NEW email trimmed + lowercased so mixed-case
// re-registrations of one address cannot bypass the case-sensitive duplicate
// check. Login stays EXACT-match so pre-existing mixed-case accounts keep
// working until the backfill + lookup-normalization follow-up ships.
// Mocked prisma/redis; hashPassword spied so no real bcrypt cost.

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

const CTX = { ipAddress: '1.2.3.4', userAgent: 'test', deviceId: 'd1', deviceType: 'web' }
const REG_INPUT = {
  email: '  Cust@Example.COM ', password: 'ValidPass1!', firstName: 'Cass', lastName: 'Doe',
  phone: '+447700900123', marketingConsent: false, ...CTX,
}

function registerMocks() {
  const prisma = {
    user: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async (args: any) => ({
        id: 'u-new', email: args.data.email, firstName: args.data.firstName, lastName: args.data.lastName,
        phone: args.data.phone, emailVerified: false, phoneVerified: false,
      })),
    },
    userSession: { create: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
    auditLog: { create: vi.fn(async () => ({})) },
  }
  const redis = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
  }
  const app = { jwt: { customer: { sign: vi.fn(() => 'access.jwt.token') } } }
  return { prisma, redis, app }
}

describe('registerCustomer: email normalization (transitional)', () => {
  it('stores a trimmed + lowercased email from mixed-case, padded input (duplicate check and create both use the normalized address)', async () => {
    const m = registerMocks()
    const password = await import('../../../src/api/shared/password')
    vi.spyOn(password, 'hashPassword').mockResolvedValue('hashed-pw')

    const res = await registerCustomer(m.prisma as any, m.redis as any, m.app as any, REG_INPUT)

    // duplicate check ran against the NORMALIZED address
    expect(m.prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'cust@example.com' } }),
    )
    // the created account stores the NORMALIZED address
    const createArgs = m.prisma.user.create.mock.calls[0][0]
    expect(createArgs.data.email).toBe('cust@example.com')
    expect(res.user.email).toBe('cust@example.com')
  })

  it('duplicate check catches a mixed-case re-registration of an already-normalized account (EMAIL_ALREADY_EXISTS, nothing created)', async () => {
    const m = registerMocks()
    // exact-match store simulation: the account exists ONLY under the lowercase key
    m.prisma.user.findUnique = vi.fn(async (args: any) =>
      args.where.email === 'cust@example.com' ? { id: 'existing-1' } : null,
    ) as any
    const password = await import('../../../src/api/shared/password')
    vi.spyOn(password, 'hashPassword').mockResolvedValue('hashed-pw')

    await expect(
      registerCustomer(m.prisma as any, m.redis as any, m.app as any, { ...REG_INPUT, email: 'CUST@EXAMPLE.COM' }),
    ).rejects.toThrow('EMAIL_ALREADY_EXISTS')
    expect(m.prisma.user.create).not.toHaveBeenCalled()
  })
})

describe('loginCustomer: transitional exact-match lookup', () => {
  it('TRANSITIONAL PIN: a PRE-EXISTING account stored with mixed case still logs in with the exact original-cased string (login lookup is NOT normalized)', async () => {
    const STORED_EMAIL = 'Cust@Example.COM' // pre-normalization account, stored as typed
    const user = {
      id: 'u-legacy', email: STORED_EMAIL, passwordHash: 'hash', firstName: 'Cass', lastName: 'Doe',
      phone: '+447700900123', emailVerified: true, phoneVerified: true, status: 'ACTIVE',
    }
    const prisma = {
      // exact-match store simulation: findUnique resolves ONLY for the exact stored string
      user: { findUnique: vi.fn(async (args: any) => (args.where.email === STORED_EMAIL ? user : null)) },
      userSession: { create: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 0 })) },
      auditLog: { create: vi.fn(async () => ({})) },
    }
    const redis = { get: vi.fn(async () => null), set: vi.fn(async () => 'OK'), del: vi.fn(async () => 1) }
    const app = { jwt: { customer: { sign: vi.fn(() => 'access.jwt.token') } } }
    const password = await import('../../../src/api/shared/password')
    vi.spyOn(password, 'verifyPassword').mockResolvedValue(true)

    const res = await loginCustomer(prisma as any, redis as any, app as any, {
      email: STORED_EMAIL, password: 'MyPass123!', ...CTX,
    })

    // exact-cased login succeeds and the lookup received the string EXACTLY as
    // typed: pins the transitional design (no lookup normalization yet)
    expect(res.accessToken).toBe('access.jwt.token')
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: STORED_EMAIL } }),
    )
  })
})
