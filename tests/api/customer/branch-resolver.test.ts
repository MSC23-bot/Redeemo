import { describe, it, expect } from 'vitest'
import { resolveSelectedBranch } from '../../../src/api/customer/discovery/branch-resolver'

type B = {
  id: string
  isActive: boolean
  isMainBranch: boolean
  latitude: number | null
  longitude: number | null
  createdAt: Date
}

const mk = (over: Partial<B> & { id: string }): B => ({
  isActive: true, isMainBranch: false,
  latitude: 51.5, longitude: -0.1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
})

describe('resolveSelectedBranch', () => {
  it('honours a valid candidate that belongs to the merchant and is active', () => {
    const branches = [mk({ id: 'b1' }), mk({ id: 'b2' })]
    const r = resolveSelectedBranch(branches, 'b2', undefined, undefined)
    expect(r).toEqual({ resolvedBranchId: 'b2', fallbackReason: 'used-candidate' })
  })

  it('falls back to nearest active when the candidate is suspended', () => {
    const branches = [
      mk({ id: 'b1', isActive: false, latitude: 51.5, longitude: -0.1 }),
      mk({ id: 'b2', latitude: 51.6, longitude: -0.05 }),  // 11 km away from user
      mk({ id: 'b3', latitude: 51.5, longitude: -0.15 }),  // 3 km away
    ]
    const r = resolveSelectedBranch(branches, 'b1', 51.5, -0.12)
    expect(r.fallbackReason).toBe('candidate-inactive')
    expect(r.resolvedBranchId).toBe('b3')
  })

  it('falls back silently for an unknown candidate id', () => {
    const branches = [mk({ id: 'b1' }), mk({ id: 'b2', isMainBranch: true })]
    const r = resolveSelectedBranch(branches, 'b-typo', undefined, undefined)
    expect(r.fallbackReason).toBe('candidate-not-found')
    expect(r.resolvedBranchId).toBe('b2')  // isMainBranch wins over first
  })

  it('cold-open with GPS picks nearest active branch', () => {
    const branches = [
      mk({ id: 'b1', latitude: 53.5, longitude: -2.2 }),  // Manchester
      mk({ id: 'b2', latitude: 51.5, longitude: -0.1 }),  // London
    ]
    const r = resolveSelectedBranch(branches, null, 51.5, -0.12)  // user in London
    expect(r.resolvedBranchId).toBe('b2')
    expect(r.fallbackReason).toBe('no-candidate')
  })

  it('cold-open without GPS prefers isMainBranch over first', () => {
    const branches = [
      mk({ id: 'b1', createdAt: new Date('2026-01-01') }),
      mk({ id: 'b2', createdAt: new Date('2026-02-01'), isMainBranch: true }),
    ]
    const r = resolveSelectedBranch(branches, null, undefined, undefined)
    expect(r.resolvedBranchId).toBe('b2')
  })

  it('cold-open with no isMainBranch falls back to first by createdAt', () => {
    const branches = [
      mk({ id: 'b-newer', createdAt: new Date('2026-03-01') }),
      mk({ id: 'b-older', createdAt: new Date('2026-01-01') }),
    ]
    const r = resolveSelectedBranch(branches, null, undefined, undefined)
    expect(r.resolvedBranchId).toBe('b-older')
  })

  it('cold-open with all branches inactive returns all-suspended', () => {
    const branches = [
      mk({ id: 'b1', isActive: false }),
      mk({ id: 'b2', isActive: false }),
    ]
    const r = resolveSelectedBranch(branches, null, undefined, undefined)
    expect(r).toEqual({ resolvedBranchId: null, fallbackReason: 'all-suspended' })
  })

  it('candidate-active among all-other-suspended still returns used-candidate', () => {
    const branches = [
      mk({ id: 'b1', isActive: false }),
      mk({ id: 'b2' }),
    ]
    const r = resolveSelectedBranch(branches, 'b2', undefined, undefined)
    expect(r).toEqual({ resolvedBranchId: 'b2', fallbackReason: 'used-candidate' })
  })
})
