/**
 * D-BM1 (merged spec §5 / §12): the effective per-branch UI capability formula.
 *
 *   effectiveCanManage = role === 'OWNER'
 *     || (role === 'BRANCH_MANAGER' && branch?.viewerCapabilities?.canManage === true)
 *
 * The nine-cell matrix below pins every combination the spec calls out:
 * owner authorization is profile-role-established (the branch block can NEVER
 * subtract from an owner - absent, malformed, even an explicit false); the BM
 * arm requires the role explicitly, so a forged/erroneous true cannot widen
 * STAFF or an unknown/null role.
 */
import { effectiveCanManage } from '../capability'
import type { Branch } from '@/lib/api/branch'

function branchWith(viewerCapabilities: Branch['viewerCapabilities']): Pick<Branch, 'viewerCapabilities'> {
  return { viewerCapabilities }
}

describe('effectiveCanManage', () => {
  it('OWNER + block absent -> true', () => {
    expect(effectiveCanManage('OWNER', branchWith(undefined))).toBe(true)
  })

  it('OWNER + malformed block (parsed to undefined) -> true', () => {
    expect(effectiveCanManage('OWNER', branchWith(undefined))).toBe(true)
  })

  it('OWNER + explicit false -> true (the block is a BM grant signal, never an owner revocation channel)', () => {
    expect(effectiveCanManage('OWNER', branchWith({ canManage: false }))).toBe(true)
  })

  it('OWNER + explicit true -> true', () => {
    expect(effectiveCanManage('OWNER', branchWith({ canManage: true }))).toBe(true)
  })

  it('assigned BM + explicit true -> true', () => {
    expect(effectiveCanManage('BRANCH_MANAGER', branchWith({ canManage: true }))).toBe(true)
  })

  it('BM + absent -> false', () => {
    expect(effectiveCanManage('BRANCH_MANAGER', branchWith(undefined))).toBe(false)
  })

  it('BM + malformed (parsed to undefined) -> false', () => {
    expect(effectiveCanManage('BRANCH_MANAGER', branchWith(undefined))).toBe(false)
  })

  it('BM + explicit false -> false', () => {
    expect(effectiveCanManage('BRANCH_MANAGER', branchWith({ canManage: false }))).toBe(false)
  })

  it('STAFF + any block including a forged true -> false', () => {
    expect(effectiveCanManage('STAFF', branchWith({ canManage: true }))).toBe(false)
    expect(effectiveCanManage('STAFF', branchWith({ canManage: false }))).toBe(false)
    expect(effectiveCanManage('STAFF', branchWith(undefined))).toBe(false)
  })

  it('unknown/null role + any block (incl. a forged true) -> false', () => {
    expect(effectiveCanManage(null, branchWith({ canManage: true }))).toBe(false)
    expect(effectiveCanManage(undefined, branchWith({ canManage: true }))).toBe(false)
    expect(effectiveCanManage('SOME_FUTURE_ROLE', branchWith({ canManage: true }))).toBe(false)
  })

  it('tolerates an undefined/null branch entirely (defensive - loading state)', () => {
    expect(effectiveCanManage('OWNER', undefined)).toBe(true)
    expect(effectiveCanManage('OWNER', null)).toBe(true)
    expect(effectiveCanManage('BRANCH_MANAGER', undefined)).toBe(false)
    expect(effectiveCanManage('BRANCH_MANAGER', null)).toBe(false)
  })
})
