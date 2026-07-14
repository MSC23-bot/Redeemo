import { describe, it, expect } from 'vitest'
import {
  GRANTABLE_CAPABILITIES,
  isGrantableCapability,
  resolveEffectiveCapabilities,
  adminHasEffectiveCapability,
  adminHasCapability,
  type AdminCapability,
} from '../../../src/api/admin/capability'

// Team & Roles S1 — effective-capability resolution + FIELD baseline + the
// grantable allow-list (spec 2026-07-10-admin-capability-grants-field-role §3-§7).
// Pure-function unit tests: no DB, no app.

describe('GRANTABLE_CAPABILITIES — launch curated set', () => {
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

describe('FIELD baseline (pinned)', () => {
  // The exact owner-locked FIELD baseline (UNION set, owner decision 2026-07-10:
  // FIELD completes assisted onboarding end-to-end for pre-live merchants,
  // including submit-for-review; safety boundary = the S3 server-side pre-live
  // scope guard). Pinning it prevents silent drift.
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
    const caps = resolveEffectiveCapabilities('FIELD', [])
    expect([...caps].sort()).toEqual([...EXPECTED_FIELD].sort())
  })

  it('FIELD baseline EXCLUDES approval:action and redemption:read', () => {
    const caps = resolveEffectiveCapabilities('FIELD', [])
    expect(caps).not.toContain('approval:action')
    expect(caps).not.toContain('redemption:read')
  })

  it('FIELD baseline EXCLUDES merchant:suspend and admin:manage-team', () => {
    const caps = resolveEffectiveCapabilities('FIELD', [])
    expect(caps).not.toContain('merchant:suspend')
    expect(caps).not.toContain('admin:manage-team')
  })

  it('FIELD baseline EXCLUDES the SUPER_ADMIN-only edit caps', () => {
    const caps = resolveEffectiveCapabilities('FIELD', [])
    expect(caps).not.toContain('merchant:edit-identity')
    expect(caps).not.toContain('merchant:edit-category')
  })
})

describe('resolveEffectiveCapabilities — baseline UNION grantable grants', () => {
  it('a granted approval:action is added to a FIELD admin effective caps', () => {
    const caps = resolveEffectiveCapabilities('FIELD', ['approval:action'])
    expect(caps).toContain('approval:action')
    // baseline still present
    expect(caps).toContain('lead:manage')
  })

  it('a grant of a NON-grantable cap (admin:manage-team) is IGNORED (defence in depth)', () => {
    const caps = resolveEffectiveCapabilities('FIELD', ['admin:manage-team'])
    expect(caps).not.toContain('admin:manage-team')
  })

  it('a grant of merchant:suspend (off the allow-list) is IGNORED', () => {
    const caps = resolveEffectiveCapabilities('FIELD', ['merchant:suspend'])
    expect(caps).not.toContain('merchant:suspend')
  })

  it('a revoked grant never reaches resolution (empty active set) -> no approval:action', () => {
    // getActiveGrantCapabilities filters revokedAt:null at the DB; resolution
    // only ever sees ACTIVE grants. Simulate a fully-revoked admin (no active).
    const caps = resolveEffectiveCapabilities('FIELD', [])
    expect(caps).not.toContain('approval:action')
  })

  it('no duplicate entries when a grantable cap is also (hypothetically) in baseline', () => {
    const caps = resolveEffectiveCapabilities('OPERATIONS', ['approval:action', 'approval:action'])
    const occurrences = caps.filter((c) => c === 'approval:action').length
    expect(occurrences).toBe(1)
  })

  it('FINANCE/CONTENT/SUPPORT baselines hold ONLY the universal merchant:notes cap', () => {
    // MerchantNote packet (OD2): internal notes are readable + writable by every
    // role, so `merchant:notes` is the sole baseline entry for these three roles
    // (they still hold no other Slice-1 capability).
    expect(resolveEffectiveCapabilities('FINANCE', [])).toEqual(['merchant:notes'])
    expect(resolveEffectiveCapabilities('CONTENT', [])).toEqual(['merchant:notes'])
    expect(resolveEffectiveCapabilities('SUPPORT', [])).toEqual(['merchant:notes'])
  })
})

describe('SUPER_ADMIN short-circuit isolation', () => {
  it('resolveEffectiveCapabilities never returns admin:manage-team for a granted FIELD admin', () => {
    const caps = resolveEffectiveCapabilities('FIELD', ['approval:action', 'admin:manage-team'])
    expect(caps).not.toContain('admin:manage-team')
  })

  it('a non-super admin with EVERY grantable grant still lacks SUPER_ADMIN-only caps', () => {
    const caps = resolveEffectiveCapabilities('FIELD', [...GRANTABLE_CAPABILITIES])
    // admin:manage-team is SUPER_ADMIN-only; never reachable via any grant.
    expect(adminHasEffectiveCapability('FIELD', caps, 'admin:manage-team')).toBe(false)
    expect(adminHasEffectiveCapability('FIELD', caps, 'merchant:edit-identity')).toBe(false)
    // but the granted approval:action IS effective
    expect(adminHasEffectiveCapability('FIELD', caps, 'approval:action')).toBe(true)
  })

  it('SUPER_ADMIN passes every capability check regardless of caps claim', () => {
    expect(adminHasEffectiveCapability('SUPER_ADMIN', undefined, 'admin:manage-team')).toBe(true)
    expect(adminHasEffectiveCapability('SUPER_ADMIN', [], 'approval:action')).toBe(true)
    expect(adminHasCapability('SUPER_ADMIN', 'admin:manage-team')).toBe(true)
  })
})

describe('adminHasEffectiveCapability — token caps enforcement', () => {
  it('no role -> false', () => {
    expect(adminHasEffectiveCapability(undefined, ['approval:action'], 'approval:action')).toBe(false)
  })

  it('uses the caps claim when present (approval:action granted)', () => {
    expect(adminHasEffectiveCapability('FIELD', ['approval:action'], 'approval:action')).toBe(true)
  })

  it('denies when the caps claim is present but lacks the cap (revoke took effect)', () => {
    expect(adminHasEffectiveCapability('FIELD', [], 'approval:action')).toBe(false)
  })

  it('legacy token (caps === undefined) falls back to the role baseline', () => {
    // A pre-rollout OPERATIONS token with no caps claim still resolves via role.
    expect(adminHasEffectiveCapability('OPERATIONS', undefined, 'merchant:suspend')).toBe(true)
    // ...but never confers a cap the role lacks.
    expect(adminHasEffectiveCapability('SUPPORT', undefined, 'merchant:suspend')).toBe(false)
  })
})
