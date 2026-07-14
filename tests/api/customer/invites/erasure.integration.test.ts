import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { scrubInvitesForUser } from '../../../../src/api/customer/invites/service'
import { buildInviterKey, buildPlaceKey } from '../../../../src/api/customer/invites/identity'

/**
 * Round-4 correction (Codex) — real-DB proof that account erasure genuinely
 * REMOVES the person linkage, rather than merely flipping a grant to VOIDED
 * while retaining grant.userId.
 *
 * Exercises the true delete-account path: a single transaction that
 * anonymises the User in place (same id, as the route does) and calls
 * scrubInvitesForUser. Then asserts, by querying the real tables, that:
 *   - no MerchantInvite row links back to the user (inviterUserId AND
 *     inviterKey both severed to NULL);
 *   - PENDING reward grants are GONE (deleted, not lingering as VOIDED
 *     rows still carrying userId);
 *   - ISSUED grants (financial records) SURVIVE with userId intact — the
 *     owner/solicitor retention gate (spec A3.1) is respected, not
 *     silently erased;
 *   - the non-personal aggregate demand row still exists (placeKey +
 *     businessNameRaw), so the business's tally is preserved.
 *
 * DO NOT RUN standalone here (no loopback DB) — typechecks and follows the
 * *.integration.test.ts lane conventions. Executed by `test:integration:invites`
 * (package.json), which is NOT YET invoked by ci.yml: the advisory CI step is
 * the owner-applied patch docs/superpowers/plans/2026-07-14-invite-ci-pilot-step.patch
 * (session tokens lack the GitHub workflow scope). Until that patch is applied
 * this is a manual/local lane — run `npm run test:integration:invites` against
 * a disposable loopback Postgres.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const ts = Date.now()
const ERASE_BUSINESS_NAME = `TEST erasure business ${ts}`
const ERASE_LOCALITY = 'TEST Erasure Locality'

let userId: string
let inviteId: string
let leadId: string
const placeKey = buildPlaceKey({ businessName: ERASE_BUSINESS_NAME, locality: ERASE_LOCALITY })
const issuedInviteId = `TEST-erasure-issued-invite-${ts}`
const issuedMerchantId = `TEST-erasure-merchant-${ts}`

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: `erasure-test-${ts}@redeemo.test`,
      passwordHash: 'placeholder',
      firstName: 'Erasure',
      lastName: 'Test',
      phoneVerified: true,
    },
    select: { id: true },
  })
  userId = user.id

  const lead = await prisma.merchantLead.create({
    data: { businessName: ERASE_BUSINESS_NAME, locationHint: ERASE_LOCALITY, source: 'CUSTOMER_REQUEST', stage: 'LEAD' },
    select: { id: true },
  })
  leadId = lead.id

  const invite = await prisma.merchantInvite.create({
    data: {
      inviterUserId: userId,
      inviterKey: buildInviterKey(userId),
      inviterEmailNorm: 'erasure-test@redeemo.test',
      placeKey,
      businessNameRaw: ERASE_BUSINESS_NAME,
      localityRaw: ERASE_LOCALITY,
      note: 'a personal note that must be erased',
      consentShareName: true,
      status: 'ACTIVE',
      rewardEligible: true,
      countableAt: new Date(),
      leadId,
      ipHash: 'deadbeefdeadbeefdeadbeefdeadbeef',
    },
    select: { id: true },
  })
  inviteId = invite.id

  // A PENDING grant (no financial value) and an ISSUED grant (financial
  // record) for the SAME user, so we can prove pending is deleted while
  // issued is retained.
  await prisma.inviteRewardGrant.create({
    data: { inviteId, userId, merchantId: issuedMerchantId, status: 'PENDING' },
  })
  await prisma.inviteRewardGrant.create({
    data: { inviteId: issuedInviteId, userId, merchantId: issuedMerchantId, status: 'ISSUED', issuedAt: new Date() },
  })
})

afterAll(async () => {
  await prisma.inviteRewardGrant.deleteMany({ where: { userId } })
  await prisma.merchantInvite.deleteMany({ where: { OR: [{ id: inviteId }, { placeKey }] } })
  await prisma.merchantLead.deleteMany({ where: { id: leadId } })
  await prisma.user.delete({ where: { id: userId } }).catch(() => {})
  await prisma.$disconnect()
})

describe('account erasure removes the invite person linkage (real DB)', () => {
  it('deletes pending grants, severs invite linkage, retains issued financial records, preserves aggregate demand', async () => {
    const inviterKey = buildInviterKey(userId)

    // The real delete-account path: anonymise the User in place (same id)
    // and scrub, atomically.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted_${userId}@deleted.redeemo.co.uk`,
          phone: null, firstName: '[Deleted]', lastName: '[Deleted]',
          passwordHash: null, deletedAt: new Date(), status: 'DELETED',
        },
      })
      await scrubInvitesForUser(tx, userId)
    })

    // (1) No invite row links back to the person — by id or by key.
    const bySubjectId = await prisma.merchantInvite.count({ where: { inviterUserId: userId } })
    const byKey = await prisma.merchantInvite.count({ where: { inviterKey } })
    expect(bySubjectId).toBe(0)
    expect(byKey).toBe(0)

    // (2) The specific invite row survives as NON-personal aggregate demand:
    // placeKey/businessNameRaw intact, all person/PII fields NULL.
    const scrubbed = await prisma.merchantInvite.findUnique({
      where: { id: inviteId },
      select: {
        inviterUserId: true, inviterKey: true, inviterEmailNorm: true,
        note: true, ipHash: true, rewardEligible: true, anonymisedAt: true,
        placeKey: true, businessNameRaw: true, leadId: true,
      },
    })
    expect(scrubbed).not.toBeNull()
    expect(scrubbed!.inviterUserId).toBeNull()
    expect(scrubbed!.inviterKey).toBeNull()
    expect(scrubbed!.inviterEmailNorm).toBeNull()
    expect(scrubbed!.note).toBeNull()
    expect(scrubbed!.ipHash).toBeNull()
    expect(scrubbed!.rewardEligible).toBe(false)
    expect(scrubbed!.anonymisedAt).not.toBeNull()
    expect(scrubbed!.placeKey).toBe(placeKey)
    expect(scrubbed!.businessNameRaw).toBe(ERASE_BUSINESS_NAME)

    // (3) PENDING grant is GONE — not a lingering VOIDED row still carrying
    // userId. This is the core round-4 proof: identity linkage removed, not
    // merely status-flipped.
    const pendingGrants = await prisma.inviteRewardGrant.count({ where: { userId, status: 'PENDING' } })
    const grantForPendingInvite = await prisma.inviteRewardGrant.findUnique({ where: { inviteId } })
    expect(pendingGrants).toBe(0)
    expect(grantForPendingInvite).toBeNull()

    // (4) The ISSUED financial record is RETAINED with userId intact — the
    // owner/solicitor retention gate is respected, not silently erased.
    const issued = await prisma.inviteRewardGrant.findUnique({ where: { inviteId: issuedInviteId } })
    expect(issued).not.toBeNull()
    expect(issued!.status).toBe('ISSUED')
    expect(issued!.userId).toBe(userId)
  }, 30000)
})
