// D-BM1 (merged spec §4/§5/§12): the per-branch capability signal.
//
// Covers:
//   1. `canManageBranchPredicate` role/assignment unit matrix (the full
//      OWNER / BRANCH_MANAGER (allBranches + assigned + unassigned) / STAFF
//      matrix from spec §2).
//   2. STRUCTURAL CONTRACT GUARD, two layers per spec §4:
//        (a) delegation pin - `assertCanManageBranch` is proven to CALL the
//            shared predicate export (spied on the module namespace) and to
//            throw exactly when the spy returns false.
//        (b) single-definition-site pin - a static source-text guard proving
//            the role-qualified BRANCH_MANAGER + allowedBranchIds.includes
//            combination exists in EXACTLY ONE place (the predicate itself),
//            and that both `assertCanManageBranch` and the `getBranch`
//            capability emit reference the helper by name rather than
//            re-inlining the formula.
//   3. `getBranch` emit pins (OWNER true / assigned BM true / STAFF-assigned
//      false / unassigned BM unreachable - 403 via assertBranchAllowed).
//   4. Sanitizer-chain pin: the emitted response carries viewerCapabilities
//      AND redemptionPinSet, and never the raw redemptionPin ciphertext
//      (composing correctly with the #377 wire-hygiene sanitizer).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AppError } from '../../../../src/api/shared/errors'
import {
  canManageBranchPredicate,
  assertCanManageBranch,
  type MerchantContext,
} from '../../../../src/api/merchant/shared'
import * as shared from '../../../../src/api/merchant/shared'
import { getBranch } from '../../../../src/api/merchant/branch/service'

const ctx = (over: Partial<MerchantContext> = {}): MerchantContext => ({
  adminId: 'a1',
  merchantId: 'm1',
  role: 'STAFF',
  allBranches: false,
  allowedBranchIds: [],
  canManageVouchers: false,
  ...over,
})

// ── 1. canManageBranchPredicate role/assignment unit matrix ────────────────

describe('canManageBranchPredicate', () => {
  it('OWNER manages any branch (allBranches irrelevant)', () => {
    expect(canManageBranchPredicate(ctx({ role: 'OWNER', allBranches: false, allowedBranchIds: [] }), 'bX')).toBe(true)
  })

  it('BRANCH_MANAGER with allBranches manages any branch', () => {
    expect(
      canManageBranchPredicate(ctx({ role: 'BRANCH_MANAGER', allBranches: true, allowedBranchIds: [] }), 'bX'),
    ).toBe(true)
  })

  it('BRANCH_MANAGER manages an explicitly assigned branch', () => {
    expect(
      canManageBranchPredicate(
        ctx({ role: 'BRANCH_MANAGER', allBranches: false, allowedBranchIds: ['b1', 'b2'] }),
        'b2',
      ),
    ).toBe(true)
  })

  it('BRANCH_MANAGER does NOT manage an unassigned branch', () => {
    expect(
      canManageBranchPredicate(ctx({ role: 'BRANCH_MANAGER', allBranches: false, allowedBranchIds: ['b1'] }), 'b9'),
    ).toBe(false)
  })

  it('STAFF never manages, even with allBranches', () => {
    expect(canManageBranchPredicate(ctx({ role: 'STAFF', allBranches: true, allowedBranchIds: [] }), 'bX')).toBe(false)
  })

  it('STAFF never manages an assigned branch either', () => {
    expect(
      canManageBranchPredicate(ctx({ role: 'STAFF', allBranches: false, allowedBranchIds: ['b1'] }), 'b1'),
    ).toBe(false)
  })

  it('an unknown/future role never manages', () => {
    expect(
      canManageBranchPredicate(ctx({ role: 'SOMETHING_ELSE' as never, allBranches: true, allowedBranchIds: [] }), 'bX'),
    ).toBe(false)
  })
})

// ── 2a. Structural guard: delegation pin ────────────────────────────────────
//
// IMPLEMENTATION NOTE (deviation from the spec's literal wording): the spec
// says "vi.spyOn the shared module's canManageBranchPredicate and prove
// assertCanManageBranch CALLS it ... works under vitest". Empirically, in
// THIS repo (package.json "type": "commonjs", CJS-compiled test transform), a
// same-FILE call from assertCanManageBranch to canManageBranchPredicate binds
// to the local function declaration at parse time and does NOT route through
// the module's exports object, so spying on the shared-module namespace and
// calling assertCanManageBranch directly observes ZERO calls (verified: this
// literal approach fails). A genuinely CROSS-FILE call, however, DOES route
// through the required module's exports object under this transform - so the
// delegation pin below spies on `shared.canManageBranchPredicate` and drives
// it via `getBranch` (branch/service.ts), which imports the predicate across
// a real module boundary. This proves the SAME thing the spec's layer (a)
// wants (the predicate is the single call target other code delegates to),
// via a call path that is actually interceptable in this repo's transform.
// Layer (b) below (the source-text single-definition-site guard) is the
// primary, unconditionally-reliable structural guard either way.
describe('D-BM1 structural delegation guard (cross-file call path)', () => {
  it('getBranch calls the shared canManageBranchPredicate export (spy observes the call) and emits its return value verbatim', async () => {
    const spy = vi.spyOn(shared, 'canManageBranchPredicate').mockReturnValue(true)
    const prisma = mockPrisma(staffMembership({ branches: [{ branchId: 'b1' }] }))
    const result = await getBranch(prisma, 'a1', 'b1')
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ role: 'STAFF' }), 'b1')
    // Even though the real predicate would say false for STAFF, the emit
    // trusts whatever the (spied) helper returns - proving getBranch has no
    // independent inlined formula of its own.
    expect(result.viewerCapabilities).toEqual({ canManage: true })
    spy.mockRestore()
  })

  it('assertCanManageBranch throws iff canManageBranchPredicate returns false, across the full role/assignment matrix (behavioural parity)', () => {
    const matrix: Array<[Partial<MerchantContext>, string, boolean]> = [
      [{ role: 'OWNER', allBranches: true, allowedBranchIds: [] }, 'bX', true],
      [{ role: 'BRANCH_MANAGER', allBranches: true, allowedBranchIds: [] }, 'bX', true],
      [{ role: 'BRANCH_MANAGER', allBranches: false, allowedBranchIds: ['b1'] }, 'b1', true],
      [{ role: 'BRANCH_MANAGER', allBranches: false, allowedBranchIds: ['b1'] }, 'b9', false],
      [{ role: 'STAFF', allBranches: true, allowedBranchIds: [] }, 'bX', false],
      [{ role: 'STAFF', allBranches: false, allowedBranchIds: ['b1'] }, 'b1', false],
    ]
    for (const [ctxOver, branchId, expectAllowed] of matrix) {
      const c = ctx(ctxOver)
      expect(canManageBranchPredicate(c, branchId)).toBe(expectAllowed)
      if (expectAllowed) {
        expect(() => assertCanManageBranch(c, branchId)).not.toThrow()
      } else {
        expect(() => assertCanManageBranch(c, branchId)).toThrow('INSUFFICIENT_PERMISSIONS')
      }
    }
  })
})

// ── 2b. Structural guard: single-definition-site source-text pin ───────────

// Matches the role-qualified BRANCH_MANAGER + allowedBranchIds.includes
// combination within a single expression/statement (bounded distance so it
// cannot accidentally span two unrelated functions in the same file). Per the
// spec's implementer note, a bare `allowedBranchIds.includes` alone is NOT the
// match target (assertBranchAllowed legitimately uses it for the separate,
// role-free READ-scope predicate) - the guard requires BOTH tokens adjacent.
const BM_ASSIGNMENT_COMBINATION_RE = /role\s*===\s*'BRANCH_MANAGER'[\s\S]{0,120}?allowedBranchIds\.includes/g

function countCombinationOccurrences(source: string): number {
  return [...source.matchAll(BM_ASSIGNMENT_COMBINATION_RE)].length
}

describe('D-BM1 single-definition-site source guard', () => {
  const sharedSrc = readFileSync(
    resolve(__dirname, '../../../../src/api/merchant/shared.ts'),
    'utf8',
  )
  const branchServiceSrc = readFileSync(
    resolve(__dirname, '../../../../src/api/merchant/branch/service.ts'),
    'utf8',
  )

  it('the BRANCH_MANAGER + allowedBranchIds.includes combination appears EXACTLY ONCE in shared.ts (the predicate body)', () => {
    expect(countCombinationOccurrences(sharedSrc)).toBe(1)
  })

  it('the combination does NOT appear anywhere in branch/service.ts (the getBranch emit site must not re-inline it)', () => {
    expect(countCombinationOccurrences(branchServiceSrc)).toBe(0)
  })

  it('assertCanManageBranch references the helper by name (delegates, does not duplicate the formula)', () => {
    const fnStart = sharedSrc.indexOf('export function assertCanManageBranch')
    expect(fnStart).toBeGreaterThan(-1)
    const fnBody = sharedSrc.slice(fnStart, fnStart + 300)
    expect(fnBody).toMatch(/canManageBranchPredicate\(ctx,\s*branchId\)/)
    // And it must NOT independently re-check role === 'BRANCH_MANAGER' itself.
    expect(fnBody).not.toMatch(/role\s*===\s*'BRANCH_MANAGER'/)
  })

  it('the getBranch capability emit references the helper by name (does not duplicate the formula)', () => {
    const fnStart = branchServiceSrc.indexOf('export async function getBranch')
    expect(fnStart).toBeGreaterThan(-1)
    const fnEnd = branchServiceSrc.indexOf('\n}', fnStart)
    const fnBody = branchServiceSrc.slice(fnStart, fnEnd)
    expect(fnBody).toMatch(/canManageBranchPredicate\(ctx,\s*branchId\)/)
    expect(fnBody).not.toMatch(/role\s*===\s*'BRANCH_MANAGER'/)
  })

  // Mutation probe: re-inlining the formula in either site must fail this
  // suite. Simulated here (not mutating real source) by asserting the count
  // would be >1 if a duplicate existed - proven above via the exact-1 pin.
})

// ── 3 + 4. getBranch emit pins + sanitizer-chain composition ────────────────

function baseBranchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    merchantId: 'm1',
    name: 'High Street',
    redemptionPin: 'enc:SECRETCIPHER123',
    openingHours: [],
    amenities: [],
    photos: [],
    pendingEdits: [],
    pendingHours: [],
    ...overrides,
  }
}

function mockPrisma(membershipRow: Record<string, unknown>, branchOverrides: Record<string, unknown> = {}) {
  return {
    merchantMembership: { findMany: vi.fn().mockResolvedValue([membershipRow]) },
    branch: { findFirst: vi.fn().mockResolvedValue(baseBranchRow(branchOverrides)) },
  } as any
}

function ownerMembership(over: Record<string, unknown> = {}) {
  return {
    id: 'mm1', merchantId: 'm1', merchantAdminId: 'a1', role: 'OWNER',
    allBranches: true, canManageVouchers: false,
    merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [],
    ...over,
  }
}

function bmMembership(over: Record<string, unknown> = {}) {
  return {
    id: 'mm1', merchantId: 'm1', merchantAdminId: 'a1', role: 'BRANCH_MANAGER',
    allBranches: false, canManageVouchers: false,
    merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [{ branchId: 'b1' }],
    ...over,
  }
}

function staffMembership(over: Record<string, unknown> = {}) {
  return {
    id: 'mm1', merchantId: 'm1', merchantAdminId: 'a1', role: 'STAFF',
    allBranches: false, canManageVouchers: false,
    merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [{ branchId: 'b1' }],
    ...over,
  }
}

describe('getBranch - D-BM1 viewerCapabilities emit', () => {
  it('OWNER -> viewerCapabilities.canManage: true', async () => {
    const prisma = mockPrisma(ownerMembership())
    const result = await getBranch(prisma, 'a1', 'b1')
    expect(result.viewerCapabilities).toEqual({ canManage: true })
  })

  it('an assigned BRANCH_MANAGER -> viewerCapabilities.canManage: true', async () => {
    const prisma = mockPrisma(bmMembership({ branches: [{ branchId: 'b1' }] }))
    const result = await getBranch(prisma, 'a1', 'b1')
    expect(result.viewerCapabilities).toEqual({ canManage: true })
  })

  it('STAFF assigned to the branch (read allowed) -> viewerCapabilities.canManage: false', async () => {
    const prisma = mockPrisma(staffMembership({ branches: [{ branchId: 'b1' }] }))
    const result = await getBranch(prisma, 'a1', 'b1')
    expect(result.viewerCapabilities).toEqual({ canManage: false })
  })

  it('an unassigned BRANCH_MANAGER cannot even read the branch: 403 via assertBranchAllowed (reachability boundary)', async () => {
    const prisma = mockPrisma(bmMembership({ branches: [{ branchId: 'other-branch' }] }))
    await expect(getBranch(prisma, 'a1', 'b1')).rejects.toThrow('INSUFFICIENT_PERMISSIONS')
  })

  // ── 4. Sanitizer-chain composition (with #377 wire-hygiene) ──────────────

  it('the emitted response carries BOTH viewerCapabilities AND redemptionPinSet, and never the raw ciphertext', async () => {
    const prisma = mockPrisma(ownerMembership())
    const result = await getBranch(prisma, 'a1', 'b1')
    expect(result.viewerCapabilities).toEqual({ canManage: true })
    expect((result as any).redemptionPinSet).toBe(true)
    expect(result).not.toHaveProperty('redemptionPin')
    expect(JSON.stringify(result)).not.toContain('SECRETCIPHER123')
  })

  it('viewerCapabilities never carries ids or assignment lists - a boolean only', async () => {
    const prisma = mockPrisma(bmMembership({ branches: [{ branchId: 'b1' }, { branchId: 'b2' }] }))
    const result = await getBranch(prisma, 'a1', 'b1')
    expect(Object.keys(result.viewerCapabilities!)).toEqual(['canManage'])
    expect(JSON.stringify(result)).not.toContain('allowedBranchIds')
  })
})
