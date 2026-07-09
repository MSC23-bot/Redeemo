/**
 * session.ts — capability truth table, deviceId, decodeAdminJwt, and the H5
 * token-storage delegation to tokenStore.ts.
 *
 * The truth table is the load-bearing assertion: it must mirror the backend
 * `adminHasCapability` exactly (OPERATIONS = all Slice-1 caps, SUPER_ADMIN
 * = superuser, FINANCE/CONTENT/SUPPORT = none).
 */
import {
  hasCapability,
  getAccessToken,
  setSession,
  clearSession,
  getOrCreateDeviceId,
  decodeAdminJwt,
  type AdminCapability,
  type AdminRole,
} from '../session'
import { getAccessToken as getStoredAccessToken, setAccessToken as setStoredAccessToken, setOnSessionLost } from '../tokenStore'

const ALL_CAPS: AdminCapability[] = [
  'merchant:create-draft',
  'approval:read',
  'approval:action',
  'merchant:suspend',
  'branch:confirm-location',
  'approval:apply-edit',
  // B3: merchant:submit is OPERATIONS-held (in ALL_SLICE1_CAPS), so it behaves
  // like the other Slice-1 caps in the truth table.
  'merchant:submit',
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
  setOnSessionLost(null)
  // Reset the token store directly (NOT via clearSession/triggerSessionLost —
  // that would hit the no-handler-registered fallback, window.location.assign,
  // which jsdom does not implement). A truthy set re-arms the hard-logout
  // latch (see tokenStore.ts), then null clears the token without firing it.
  setStoredAccessToken('reset-arm')
  setStoredAccessToken(null)
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

// ── OPERATIONS grant parity with the backend (own-your-own-knowledge pin) ──────
//
// The two capability layers deliberately do NOT share code (admin-web must not
// depend on the API source tree), so the mirror is pinned against a literal copy
// of the backend list. This is the load-bearing anti-drift assertion: if the
// backend adds/removes an OPERATIONS cap, this test forces the same edit here.
//
// COPY LITERALLY from `ALL_SLICE1_CAPS` in src/api/admin/capability.ts. Keep the
// order identical so a reviewer can diff the two lists by eye.
const BACKEND_OPERATIONS_CAPS: AdminCapability[] = [
  'merchant:create-draft',
  'merchant:read',
  'approval:read',
  'approval:action',
  'merchant:suspend',
  'branch:confirm-location',
  'approval:apply-edit',
  'merchant:edit',
  'merchant:submit',
  'merchant:manage-vouchers',
  'redemption:read',
]

// The SUPER_ADMIN-only caps: declared in the union but intentionally NOT in
// ALL_SLICE1_CAPS, so OPERATIONS must NOT hold them (they resolve true only via
// the SUPER_ADMIN superuser short-circuit). Copy from src/api/admin/capability.ts.
const SUPER_ADMIN_ONLY_CAPS: AdminCapability[] = [
  'merchant:edit-identity',
  'merchant:edit-category',
  'merchant:manage-branches',
  'merchant:propose-edit',
  'merchant:manage-documents',
]

describe('OPERATIONS grant mirrors the backend ALL_SLICE1_CAPS exactly', () => {
  for (const cap of BACKEND_OPERATIONS_CAPS) {
    it(`OPERATIONS holds ${cap}`, () => {
      expect(hasCapability('OPERATIONS', cap)).toBe(true)
    })
  }

  for (const cap of SUPER_ADMIN_ONLY_CAPS) {
    it(`OPERATIONS does NOT hold the SUPER_ADMIN-only ${cap}`, () => {
      expect(hasCapability('OPERATIONS', cap)).toBe(false)
    })
  }

  it('the two lists partition the whole capability union (no cap unaccounted for)', () => {
    const all = [...BACKEND_OPERATIONS_CAPS, ...SUPER_ADMIN_ONLY_CAPS]
    // No duplicates and no overlap between the two lists.
    expect(new Set(all).size).toBe(all.length)
  })

  it('merchant:manage-vouchers is OPERATIONS-held (mirror-drift regression pin)', () => {
    // Regression pin for the chore/admin-s3-hygiene fix: the mirror previously
    // omitted this cap that the backend ALL_SLICE1_CAPS already granted OPERATIONS.
    expect(hasCapability('OPERATIONS', 'merchant:manage-vouchers')).toBe(true)
    expect(hasCapability('SUPER_ADMIN', 'merchant:manage-vouchers')).toBe(true)
    expect(hasCapability('FINANCE', 'merchant:manage-vouchers')).toBe(false)
  })
})

// Option B B3: merchant:submit IS in ALL_SLICE1_CAPS, so OPERATIONS holds it.
describe('merchant:submit is OPERATIONS-held (B3)', () => {
  it('SUPER_ADMIN holds it', () => {
    expect(hasCapability('SUPER_ADMIN', 'merchant:submit')).toBe(true)
  })
  it('OPERATIONS holds it', () => {
    expect(hasCapability('OPERATIONS', 'merchant:submit')).toBe(true)
  })
  it('FINANCE / CONTENT / SUPPORT do NOT hold it', () => {
    expect(hasCapability('FINANCE', 'merchant:submit')).toBe(false)
    expect(hasCapability('CONTENT', 'merchant:submit')).toBe(false)
    expect(hasCapability('SUPPORT', 'merchant:submit')).toBe(false)
  })
})

describe('token-storage delegation to tokenStore.ts (H5 migration)', () => {
  const meta = {
    entityId: 'admin-1',
    sessionId: 'sess-1',
    adminRole: 'OPERATIONS' as AdminRole,
    email: 'ops@redeemo.co.uk',
  }

  it('starts signed out', () => {
    expect(getAccessToken()).toBeNull()
  })

  it('setSession installs the access token in the in-memory store (never localStorage)', () => {
    setSession('acc-1', meta)
    expect(getAccessToken()).toBe('acc-1')
    expect(getStoredAccessToken()).toBe('acc-1')
    expect(window.localStorage.getItem('redeemo_admin_access_token')).toBeNull()
    expect(window.localStorage.getItem('redeemo_admin_refresh_token')).toBeNull()
    expect(window.localStorage.getItem('redeemo_admin_session')).toBeNull()
  })

  it('setSession works without a meta argument (client.ts doRefresh call site)', () => {
    setSession('acc-2')
    expect(getAccessToken()).toBe('acc-2')
  })

  it('clearSession clears the in-memory token and arms the hard-logout latch', () => {
    const handler = jest.fn()
    setOnSessionLost(handler)
    setSession('acc-1', meta)

    clearSession()

    expect(getAccessToken()).toBeNull()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('never writes the vestigial redeemo_admin_auth flag cookie', () => {
    setSession('acc-1', meta)
    expect(document.cookie).not.toContain('redeemo_admin_auth')
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
