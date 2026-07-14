// §SEC.1 GAP-7 (plan 2026-07-10-transactional-email-enablement §1.7): the
// SUPER_ADMIN transactional-email OPS service. Thin wrappers over the shared
// emailOps helpers so the route stays declarative; the real logic (24h
// CommunicationLog aggregates that NEVER read payload, the daily Redis counters,
// and the GAP-6 pause flag) lives in src/api/shared/emailOps.ts.

import type Redis from 'ioredis'
import type { PrismaClient } from '../../../../generated/prisma/client'
import {
  getEmailOpsSnapshot,
  clearSendPaused,
  type EmailOpsSnapshot,
} from '../../shared/emailOps'

/** Read-only ops snapshot (GAP-7 view). */
export async function readEmailOps(prisma: PrismaClient, redis: Redis): Promise<EmailOpsSnapshot> {
  return getEmailOpsSnapshot(prisma, redis)
}

/**
 * Clear the GAP-6 auto send-pause (SUPER_ADMIN resume action). Returns the fresh
 * snapshot so the UI reflects the resumed state in one round-trip, plus whether a
 * pause was actually in effect.
 */
export async function resumeEmailSending(
  prisma: PrismaClient,
  redis: Redis,
  ctx: { adminId: string; ipAddress: string; userAgent: string },
): Promise<{ wasPaused: boolean; snapshot: EmailOpsSnapshot }> {
  const { wasPaused } = await clearSendPaused(prisma, redis, ctx)
  const snapshot = await getEmailOpsSnapshot(prisma, redis)
  return { wasPaused, snapshot }
}
