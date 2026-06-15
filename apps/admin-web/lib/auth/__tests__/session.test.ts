/**
 * session.ts — token/session storage + the capability truth table.
 *
 * The truth table is the load-bearing assertion: it must mirror the backend
 * `adminHasCapability` exactly (OPERATIONS = all five Slice-1 caps, SUPER_ADMIN
 * = superuser, FINANCE/CONTENT/SUPPORT = none).
 */
import {
  hasCapability,
  setSession,
  clearSession,
  getAccessToken,
  getRefreshToken,
  getSessionMeta,
  getAdminRole,
  isAuthenticated,
  updateTokens,
  getOrCreateDeviceId,
  decodeAdminJwt,
  type AdminCapability,
  type AdminRole,
} from '../session'

const ALL_CAPS: AdminCapability[] = [
  'merchant:create-draft',
  'approval:read',
  'approval:action',
  'merchant:suspend',
  'branch:confirm-location',
  'approval:apply-edit',
]

const ALL_ROLES: AdminRole[] = [
  'SUPER_ADMIN',
  'OPERATIONS',
  'FINANCE',
  'CONTENT',
  'SUPPORT',
]

// Expected grant per role (must match src/api/admin/capability.ts).
const GRANTS: Record<AdminRole, AdminCapability[]> = {
  SUPER_ADMIN: ALL_CAPS,
  OPERATIONS: ALL_CAPS,
  FINANCE: [],
  CONTENT: [],
  SUPPORT: [],
}

beforeEach(() => {
  localStorage.clear()
  document.cookie = 'redeemo_admin_auth=; path=/; max-age=0'
})

describe('hasCapability — truth table (5 roles x 5 caps)', () => {
  for (const role of ALL_ROLES) {
    for (const cap of ALL_CAPS) {
      const expected = GRANTS[role].includes(cap)
      it(`${role} ${expected ? 'HAS' : 'lacks'} ${cap}`, () => {
        expect(hasCapability(role, cap)).toBe(expected)
      })
    }
  }

  it('returns false for a null/undefined role', () => {
    expect(hasCapability(null, 'approval:read')).toBe(false)
    expect(hasCapability(undefined, 'approval:read')).toBe(false)
  })

  it('SUPER_ADMIN holds every capability (superuser)', () => {
    for (const cap of ALL_CAPS) {
      expect(hasCapability('SUPER_ADMIN', cap)).toBe(true)
    }
  })

  it('an unknown role holds nothing', () => {
    expect(hasCapability('GHOST', 'approval:read')).toBe(false)
  })
})

// Option B B2.2: merchant:edit-identity is intentionally NOT in ALL_SLICE1_CAPS,
// so it is held ONLY by SUPER_ADMIN (via the superuser short-circuit). This
// mirror must match the backend src/api/admin/capability.ts exactly.
describe('merchant:edit-identity is SUPER_ADMIN-only (B2.2)', () => {
  it('SUPER_ADMIN holds it', () => {
    expect(hasCapability('SUPER_ADMIN', 'merchant:edit-identity')).toBe(true)
  })
  it('OPERATIONS does NOT hold it', () => {
    expect(hasCapability('OPERATIONS', 'merchant:edit-identity')).toBe(false)
  })
  it('FINANCE / CONTENT / SUPPORT do NOT hold it', () => {
    expect(hasCapability('FINANCE', 'merchant:edit-identity')).toBe(false)
    expect(hasCapability('CONTENT', 'merchant:edit-identity')).toBe(false)
    expect(hasCapability('SUPPORT', 'merchant:edit-identity')).toBe(false)
  })
})

describe('session storage — set / get / clear', () => {
  const meta = {
    entityId: 'admin-1',
    sessionId: 'sess-1',
    adminRole: 'OPERATIONS' as AdminRole,
    email: 'ops@redeemo.co.uk',
  }

  it('starts signed out', () => {
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(getSessionMeta()).toBeNull()
    expect(getAdminRole()).toBeNull()
    expect(isAuthenticated()).toBe(false)
  })

  it('persists tokens + meta on setSession and reads them back', () => {
    setSession({ accessToken: 'acc', refreshToken: 'ref', meta })

    expect(getAccessToken()).toBe('acc')
    expect(getRefreshToken()).toBe('ref')
    expect(getSessionMeta()).toEqual(meta)
    expect(getAdminRole()).toBe('OPERATIONS')
    expect(isAuthenticated()).toBe(true)
    expect(document.cookie).toContain('redeemo_admin_auth=1')
  })

  it('updateTokens rotates tokens but keeps meta', () => {
    setSession({ accessToken: 'acc', refreshToken: 'ref', meta })
    updateTokens('acc2', 'ref2')

    expect(getAccessToken()).toBe('acc2')
    expect(getRefreshToken()).toBe('ref2')
    expect(getSessionMeta()).toEqual(meta) // unchanged
  })

  it('clearSession wipes everything and clears the flag cookie', () => {
    setSession({ accessToken: 'acc', refreshToken: 'ref', meta })
    clearSession()

    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(getSessionMeta()).toBeNull()
    expect(isAuthenticated()).toBe(false)
    expect(document.cookie).not.toContain('redeemo_admin_auth=1')
  })

  it('isAuthenticated requires BOTH a token and session meta', () => {
    localStorage.setItem('redeemo_admin_access_token', 'acc')
    // No meta -> not authenticated.
    expect(isAuthenticated()).toBe(false)
  })

  it('getSessionMeta tolerates corrupt JSON', () => {
    localStorage.setItem('redeemo_admin_session', '{not json')
    expect(getSessionMeta()).toBeNull()
  })
})

describe('getOrCreateDeviceId', () => {
  it('creates a stable UUID and reuses it', () => {
    const a = getOrCreateDeviceId()
    const b = getOrCreateDeviceId()
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
    expect(a).toBe(b)
  })
})

describe('decodeAdminJwt', () => {
  function makeJwt(payload: Record<string, unknown>): string {
    const b64 = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
    return `${b64({ alg: 'HS256' })}.${b64(payload)}.signature`
  }

  it('reads sub / sessionId / adminRole from a well-formed token', () => {
    const token = makeJwt({
      sub: 'admin-9',
      sessionId: 'sess-9',
      adminRole: 'SUPER_ADMIN',
      role: 'admin',
    })
    expect(decodeAdminJwt(token)).toEqual({
      sub: 'admin-9',
      sessionId: 'sess-9',
      adminRole: 'SUPER_ADMIN',
    })
  })

  it('returns null when required claims are missing', () => {
    const token = makeJwt({ sub: 'admin-9' }) // no sessionId/adminRole
    expect(decodeAdminJwt(token)).toBeNull()
  })

  it('returns null on a malformed token', () => {
    expect(decodeAdminJwt('not.a.jwt.at.all')).toBeNull()
    expect(decodeAdminJwt('only-one-part')).toBeNull()
  })
})
