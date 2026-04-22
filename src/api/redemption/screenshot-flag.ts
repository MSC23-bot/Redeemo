import { PrismaClient } from '../../../generated/prisma/client'
import { AppError } from '../shared/errors'

const DEDUP_WINDOW_MS = 5000

export async function flagRedemptionScreenshot(
  prisma: PrismaClient,
  userId: string,
  code: string,
  platform: 'ios' | 'android'
): Promise<{ logged: boolean }> {
  const normalised = code.replace(/[\s-]/g, '').toUpperCase()

  const redemption = await prisma.voucherRedemption.findUnique({
    where: { redemptionCode: normalised },
    select: { id: true, userId: true, isValidated: true },
  })

  // Identical error for: does not exist, belongs to another user.
  if (!redemption || redemption.userId !== userId) {
    throw new AppError('REDEMPTION_NOT_FOUND')
  }

  // Post-validation: silently no-op (screenshots of a validated redemption are not a fraud vector).
  if (redemption.isValidated) {
    return { logged: false }
  }

  // Deduplicate: don't log more than once per 5 seconds per redemption.
  const recent = await prisma.redemptionScreenshotEvent.findFirst({
    where: { redemptionId: redemption.id },
    orderBy: { occurredAt: 'desc' },
    select: { occurredAt: true },
  })
  if (recent && Date.now() - recent.occurredAt.getTime() < DEDUP_WINDOW_MS) {
    return { logged: false }
  }

  await prisma.redemptionScreenshotEvent.create({
    data: { userId, redemptionId: redemption.id, platform },
  })
  return { logged: true }
}
