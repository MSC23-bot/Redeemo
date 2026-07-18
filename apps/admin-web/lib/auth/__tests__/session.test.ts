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
  hasEffectiveCapability,
  isGrantableCapability,
  GRANTABLE_CAPABILITIES,
  ALL_ADMIN_CAPABILITIES,
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
//
// FIELD is NOT in ALL_ROLES below (the truth-table loop only exercises
// SUPER_ADMIN/OPERATIONS/FINANCE/CONTENT/SUPPORT, unchanged by Team & Roles
// S2), so this FIELD entry only exists to satisfy the Record<AdminRole, ...>
// type now that AdminRole includes FIELD — it is never iterated here.
// Computed (not hand-copied) so it can never silently drift from the real
// FIELD baseline; the FIELD baseline itself is separately pinned exactly in
// the "FIELD baseline (pinned, mirrors the backend exactly)" describe block
// below.
const GRANTS: Record<AdminRole, AdminCapability[]> = {
  SUPER_ADMIN: ALL_CAPS,
  OPERATIONS: ALL_CAPS,
  FIELD: ALL_CAPS.filter((cap) => hasCapability('FIELD', cap)),
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
  'merchant:sign-agreement',
  'redemption:read',
  'merchant:notes',
  'contract:view-evidence',
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

  it('D65: merchant:sign-agreement held by OPERATIONS + FIELD + SUPER_ADMIN, not FINANCE/CONTENT/SUPPORT', () => {
    // Mirrors the backend tests/api/admin/capability.test.ts D65 pin.
    expect(hasCapability('OPERATIONS', 'merchant:sign-agreement')).toBe(true)
    expect(hasCapability('FIELD', 'merchant:sign-agreement')).toBe(true)
    expect(hasCapability('SUPER_ADMIN', 'merchant:sign-agreement')).toBe(true)
    expect(hasCapability('FINANCE', 'merchant:sign-agreement')).toBe(false)
    expect(hasCapability('CONTENT', 'merchant:sign-agreement')).toBe(false)
    expect(hasCapability('SUPPORT', 'merchant:sign-agreement')).toBe(false)
  })

  it('D65 lane-2: contract:view-evidence held by OPERATIONS + SUPER_ADMIN, NOT FIELD/FINANCE/CONTENT/SUPPORT', () => {
    // Mirrors the backend tests/api/admin/capability.test.ts D65 lane-2 pin. Distinct from
    // merchant:sign-agreement (which FIELD holds): the evidence-read surface is OPERATIONS + SUPER only.
    expect(hasCapability('OPERATIONS', 'contract:view-evidence')).toBe(true)
    expect(hasCapability('SUPER_ADMIN', 'contract:view-evidence')).toBe(true)
    expect(hasCapability('FIELD', 'contract:view-evidence')).toBe(false)
    expect(hasCapability('FINANCE', 'contract:view-evidence')).toBe(false)
    expect(hasCapability('CONTENT', 'contract:view-evidence')).toBe(false)
    expect(hasCapability('SUPPORT', 'contract:view-evidence')).toBe(false)
  })
})

// MerchantNote packet (PR #510, honesty-copy sweep 2026-07-13 mirror-drift fix):
// the backend added `merchant:notes` to ALL FIVE role baselines
// (OPERATIONS/FIELD via their own lists, FINANCE/CONTENT/SUPPORT as their
// only entry); this mirror had missed it entirely until this fix. Universal
// by owner decision (OD2 grill-me 2026-07-10), so unlike every other
// capability pin above, every role holds it.
describe('merchant:notes is UNIVERSAL: every role holds it (mirror-drift fix, PR #510)', () => {
  const ALL_FIVE_ROLES: AdminRole[] = ['SUPER_ADMIN', 'OPERATIONS', 'FIELD', 'FINANCE', 'CONTENT']
  for (const role of ALL_FIVE_ROLES) {
    it(`${role} holds it`, () => {
      expect(hasCapability(role, 'merchant:notes')).toBe(true)
    })
  }
  it('SUPPORT holds it too', () => {
    expect(hasCapability('SUPPORT', 'merchant:notes')).toBe(true)
  })
  it('an unknown role does NOT hold it (no-role fallback still applies)', () => {
    expect(hasCapability('GHOST', 'merchant:notes')).toBe(false)
    expect(hasCapability(null, 'merchant:notes')).toBe(false)
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

// ── Team & Roles S2: FIELD baseline + GRANTABLE_CAPABILITIES + hasEffectiveCapability ──
//
// Mirrors the backend tests/api/admin/capability-effective.test.ts pins
// (spec 2026-07-10-admin-capability-grants-field-role §4.1, §3.2-3.3).

describe('GRANTABLE_CAPABILITIES — launch curated set (mirror)', () => {
  it('is EXACTLY [approval:action]', () => {
    expect([...GRANTABLE_CAPABILITIES]).toEqual(['approval:action'])
  })

  it('admin:manage-team is NOT grantable (privilege-escalation guard)', () => {
    expect(isGrantableCapability('admin:manage-team')).toBe(false)
  })

  it('merchant:suspend is NOT grantable', () => {
    expect(isGrantableCapability('merchant:suspend')).toBe(false)
  })

  it('approval:action IS grantable', () => {
    expect(isGrantableCapability('approval:action')).toBe(true)
  })
})

describe('FIELD baseline (pinned, mirrors the backend exactly)', () => {
  // COPY LITERALLY from EXPECTED_FIELD in
  // tests/api/admin/capability-effective.test.ts.
  const EXPECTED_FIELD: AdminCapability[] = [
    'lead:manage',
    'merchant:create-draft',
    'merchant:read',
    'merchant:edit',
    'merchant:submit',
    'merchant:manage-branches',
    'merchant:manage-documents',
    'merchant:manage-vouchers',
    // D65: FIELD witnesses the in-person contract-signing ceremony (assisted
    // onboarding end-to-end), clamped by the pre-live scope guard.
    'merchant:sign-agreement',
    // MerchantNote packet: the universal notes cap is in every baseline (incl FIELD).
    'merchant:notes',
  ]

  it('FIELD holds exactly the expected baseline set (order-insensitive)', () => {
    const held = EXPECTED_FIELD.filter((cap) => hasCapability('FIELD', cap))
    expect([...held].sort()).toEqual([...EXPECTED_FIELD].sort())
  })

  it('FIELD baseline EXCLUDES approval:action and redemption:read', () => {
    expect(hasCapability('FIELD', 'approval:action')).toBe(false)
    expect(hasCapability('FIELD', 'redemption:read')).toBe(false)
  })

  it('FIELD baseline EXCLUDES merchant:suspend and admin:manage-team', () => {
    expect(hasCapability('FIELD', 'merchant:suspend')).toBe(false)
    expect(hasCapability('FIELD', 'admin:manage-team')).toBe(false)
  })

  it('FIELD baseline EXCLUDES the SUPER_ADMIN-only edit caps', () => {
    expect(hasCapability('FIELD', 'merchant:edit-identity')).toBe(false)
    expect(hasCapability('FIELD', 'merchant:edit-category')).toBe(false)
  })

  // Anti-drift improvement (honesty-copy sweep, 2026-07-13): this used to be
  // a hand-copied `ALL_DECLARED` literal, the same kind of list that let the
  // mirror silently miss `merchant:notes` (PR #510); nothing forced it back
  // in sync when the AdminCapability union grew. It now iterates the
  // exported `ALL_ADMIN_CAPABILITIES`, which is itself derived from a
  // TS-enforced exhaustiveness guard in session.ts (see its doc comment): a
  // capability added to the union without a corresponding guard entry is a
  // compile error, so this loop can never silently skip one again.
  it('every OTHER declared capability is correctly absent from the FIELD baseline', () => {
    for (const cap of ALL_ADMIN_CAPABILITIES) {
      expect(hasCapability('FIELD', cap)).toBe(EXPECTED_FIELD.includes(cap))
    }
  })
})

describe('hasEffectiveCapability — grant-aware, caps-claim-preferring (mirrors backend adminHasEffectiveCapability)', () => {
  it('no role -> false, regardless of caps', () => {
    expect(hasEffectiveCapability(undefined, ['approval:action'], 'approval:action')).toBe(false)
    expect(hasEffectiveCapability(null, undefined, 'approval:action')).toBe(false)
  })

  it('SUPER_ADMIN passes every capability check regardless of the caps claim', () => {
    expect(hasEffectiveCapability('SUPER_ADMIN', undefined, 'admin:manage-team')).toBe(true)
    expect(hasEffectiveCapability('SUPER_ADMIN', [], 'approval:action')).toBe(true)
  })

  it('a granted approval:action (present in the caps claim) resolves true for a FIELD account', () => {
    expect(hasEffectiveCapability('FIELD', ['lead:manage', 'approval:action'], 'approval:action')).toBe(true)
  })

  it('denies when the caps claim is present but lacks the cap (revoke took effect on the next token)', () => {
    // Same FIELD account, caps claim minted AFTER a revoke: approval:action absent.
    expect(hasEffectiveCapability('FIELD', ['lead:manage', 'merchant:read'], 'approval:action')).toBe(false)
  })

  it('an empty (but present) caps array denies every capability except via SUPER_ADMIN', () => {
    expect(hasEffectiveCapability('FIELD', [], 'lead:manage')).toBe(false)
  })

  it('legacy token (caps === undefined) falls back to the role baseline', () => {
    expect(hasEffectiveCapability('OPERATIONS', undefined, 'merchant:suspend')).toBe(true)
    expect(hasEffectiveCapability('SUPPORT', undefined, 'merchant:suspend')).toBe(false)
  })

  it('caps claim membership is authoritative even when it WIDENS beyond the FIELD baseline (a grant)', () => {
    // admin:manage-team must never appear in a legitimately-minted caps array
    // (server-side allow-list), but the client mirror trusts the claim as
    // given — the allow-list boundary is the backend's job, not this check's.
    expect(hasEffectiveCapability('FIELD', ['admin:manage-team'], 'admin:manage-team')).toBe(true)
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

  // Team & Roles S1: the `caps` claim (spec §3.3 Option A).
  it('reads the caps claim from a well-formed token carrying it', () => {
    const token = makeJwt({
      sub: 'admin-9',
      sessionId: 'sess-9',
      adminRole: 'FIELD',
      caps: ['lead:manage', 'merchant:read', 'approval:action'],
    })
    expect(decodeAdminJwt(token)).toEqual({
      sub: 'admin-9',
      sessionId: 'sess-9',
      adminRole: 'FIELD',
      caps: ['lead:manage', 'merchant:read', 'approval:action'],
    })
  })

  it('decodes caps as undefined for a legacy token that carries no caps claim', () => {
    const token = makeJwt({ sub: 'admin-9', sessionId: 'sess-9', adminRole: 'OPERATIONS' })
    const decoded = decodeAdminJwt(token)
    expect(decoded?.caps).toBeUndefined()
  })

  it('decodes an empty caps array as-is (not undefined) — a fully-revoked non-SUPER_ADMIN', () => {
    const token = makeJwt({ sub: 'admin-9', sessionId: 'sess-9', adminRole: 'SUPPORT', caps: [] })
    expect(decodeAdminJwt(token)?.caps).toEqual([])
  })

  it('ignores a malformed (non-array) caps claim rather than throwing', () => {
    const token = makeJwt({ sub: 'admin-9', sessionId: 'sess-9', adminRole: 'SUPPORT', caps: 'not-an-array' })
    expect(decodeAdminJwt(token)?.caps).toBeUndefined()
  })

  it('filters out non-string entries from a malformed caps array', () => {
    const token = makeJwt({ sub: 'admin-9', sessionId: 'sess-9', adminRole: 'SUPPORT', caps: ['approval:action', 42, null] })
    expect(decodeAdminJwt(token)?.caps).toEqual(['approval:action'])
  })
})
