import { describe, it, expect } from 'vitest'
import {
  CAPABILITY_SENTINEL_NAMESPACE,
  buildCapabilitySentinelKey,
  targetMatchesHost,
} from '../../prisma/cleanup-agreement-probe.lib'

// Codex round-3 blocker 1 regression: the R2 capability sentinel must NEVER be a fixed/shared key.
// A fixed key (the old 'document/__cleanup-capability-probe__/nonexistent') could coincidentally
// exist and would then be DELETED by the capability probe, touching an object outside any approved
// rehearsal prefix. The sentinel must be freshly generated, collision-resistant, and confined to
// the explicitly authorised marker namespace inside the tool's permitted 'document/' prefix.
describe('capability sentinel key', () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

  it('lives in the authorised marker namespace under document/', () => {
    const key = buildCapabilitySentinelKey()
    expect(key.startsWith(CAPABILITY_SENTINEL_NAMESPACE)).toBe(true)
    expect(CAPABILITY_SENTINEL_NAMESPACE.startsWith('document/')).toBe(true)
    // The marker segment is one no application key can occupy: app keys are
    // document/<merchantId>/<random>.<ext> and a merchant id never equals the marker.
    expect(CAPABILITY_SENTINEL_NAMESPACE).toBe('document/__cleanup-capability-probe__/')
  })

  it('is freshly generated and collision-resistant (never fixed/shared)', () => {
    const keys = new Set(Array.from({ length: 50 }, () => buildCapabilitySentinelKey()))
    expect(keys.size).toBe(50) // every call yields a distinct key
    for (const key of keys) {
      const leaf = key.slice(CAPABILITY_SENTINEL_NAMESPACE.length)
      expect(leaf).toMatch(UUID_RE) // collision-resistant random UUID leaf
      expect(leaf).not.toBe('nonexistent') // the old fixed leaf is gone for good
    }
  })

  it('cannot address an unrelated object: the leaf is a full UUID, no path traversal, no globbing', () => {
    const key = buildCapabilitySentinelKey()
    const leaf = key.slice(CAPABILITY_SENTINEL_NAMESPACE.length)
    expect(leaf).not.toContain('/')
    expect(leaf).not.toContain('..')
    expect(leaf).not.toContain('*')
  })
})

// Anchored target-identity regression (shared helper; mirrors the round-4 #532 negatives).
describe('targetMatchesHost', () => {
  const HOST = 'ep-round-wave-abpnesg3.eu-west-2.aws.neon.tech'
  it('accepts the full host and the exact first label only', () => {
    expect(targetMatchesHost(HOST, HOST)).toBe(true)
    expect(targetMatchesHost('ep-round-wave-abpnesg3', HOST)).toBe(true)
  })
  it.each([
    ['eon.tech'],
    ['ep-round'],
    ['round-wave'],
    ['ep-round-wave-abpnesg'],
    ['ep-round-wave-abpnesg3x'],
    ['aws.neon.tech'],
    [''],
    ['short'],
  ])('rejects the non-anchored value %p', (t) => {
    expect(targetMatchesHost(t, HOST)).toBe(false)
  })
})
