import { describe, it, expect, vi } from 'vitest'
import { approveApproval, deriveSelfOnboarded } from '../../../src/api/admin/approvals/service'

// Team & Roles S1 — self-approval derivation + stamping (spec §5). A go-live is
// "self-approved" when the approving admin also created the merchant's draft
// (matched via the durable MERCHANT_DRAFT_CREATED audit actorId). No schema.

const ctx = { ipAddress: '127.0.0.1', userAgent: 't' }

describe('deriveSelfOnboarded', () => {
  const prismaWith = (goLiveMeta: unknown, draftActor: string | null) =>
    ({
      auditLog: {
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          if (where.event === 'MERCHANT_GO_LIVE') return goLiveMeta === undefined ? null : { metadata: goLiveMeta }
          if (where.event === 'MERCHANT_DRAFT_CREATED') return draftActor === null ? null : { actorId: draftActor }
          return null
        }),
      },
    }) as any

  it('prefers the durable stamp (selfOnboarded:true) on the MERCHANT_GO_LIVE row', async () => {
    const prisma = prismaWith({ selfOnboarded: true }, 'other-admin')
    expect(await deriveSelfOnboarded(prisma, 'm1', 'approver')).toBe(true)
  })

  it('prefers the durable stamp (selfOnboarded:false) even if actors would match', async () => {
    const prisma = prismaWith({ selfOnboarded: false }, 'approver')
    expect(await deriveSelfOnboarded(prisma, 'm1', 'approver')).toBe(false)
  })

  it('falls back to live derivation: true when draft-creator == approver', async () => {
    const prisma = prismaWith(undefined, 'approver')
    expect(await deriveSelfOnboarded(prisma, 'm1', 'approver')).toBe(true)
  })

  it('falls back to live derivation: false when different admins', async () => {
    const prisma = prismaWith(undefined, 'creator')
    expect(await deriveSelfOnboarded(prisma, 'm1', 'approver')).toBe(false)
  })

  it('self-serve merchant (no MERCHANT_DRAFT_CREATED actor) -> false', async () => {
    const prisma = prismaWith(undefined, null)
    expect(await deriveSelfOnboarded(prisma, 'm1', 'approver')).toBe(false)
  })

  it('not-yet-actioned (no actioner id) -> false', async () => {
    const prisma = prismaWith(undefined, 'creator')
    expect(await deriveSelfOnboarded(prisma, 'm1', null)).toBe(false)
  })
})

// approveApproval writes the derived selfOnboarded onto the MERCHANT_GO_LIVE
// audit row. We mock the whole go-live transaction to reach the audit writes and
// capture the metadata.
function buildApproveMocks(draftActorId: string | null) {
  const auditCreate = vi.fn().mockResolvedValue({})
  const tx = {
    adminApproval: {
      findUnique: vi.fn().mockResolvedValue({ id: 'a1', type: 'MERCHANT_ONBOARDING', status: 'PENDING', referenceId: 'm1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    merchant: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'm1', businessName: 'Biz', status: 'PENDING_APPROVAL', onboardingStep: 'REVIEW',
        verificationStatus: 'PENDING', contractStatus: 'SIGNED', isTestData: false,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    branch: {
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValue({ id: 'b1', locationConfidence: 'MERCHANT_CONFIRMED' }),
    },
    voucher: {
      count: vi.fn().mockResolvedValue(2),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: {
      findFirst: vi.fn().mockResolvedValue(draftActorId === null ? null : { actorId: draftActorId }),
      create: auditCreate,
    },
  }
  const prisma = {
    $transaction: vi.fn().mockImplementation(async (cb: any) => cb(tx)),
    // post-commit: no active owner -> notify skipped.
    merchantMembership: { findFirst: vi.fn().mockResolvedValue(null) },
  } as any
  const redis = {} as any
  return { prisma, redis, auditCreate }
}

function goLiveMeta(auditCreate: ReturnType<typeof vi.fn>) {
  const call = auditCreate.mock.calls.find((c: any[]) => c[0]?.data?.event === 'MERCHANT_GO_LIVE')
  return call?.[0]?.data?.metadata as { selfOnboarded?: boolean } | undefined
}

describe('approveApproval — self-approval stamp on MERCHANT_GO_LIVE', () => {
  it('stamps selfOnboarded:true when the approver created the draft', async () => {
    const { prisma, redis, auditCreate } = buildApproveMocks('admin-approver')
    await approveApproval(prisma, redis, 'a1', 'admin-approver', ctx)
    expect(goLiveMeta(auditCreate)).toEqual({ selfOnboarded: true })
  })

  it('stamps selfOnboarded:false when a different admin created the draft', async () => {
    const { prisma, redis, auditCreate } = buildApproveMocks('someone-else')
    await approveApproval(prisma, redis, 'a1', 'admin-approver', ctx)
    expect(goLiveMeta(auditCreate)).toEqual({ selfOnboarded: false })
  })

  it('stamps selfOnboarded:false for a self-serve merchant (no draft-creator row)', async () => {
    const { prisma, redis, auditCreate } = buildApproveMocks(null)
    await approveApproval(prisma, redis, 'a1', 'admin-approver', ctx)
    expect(goLiveMeta(auditCreate)).toEqual({ selfOnboarded: false })
  })
})
