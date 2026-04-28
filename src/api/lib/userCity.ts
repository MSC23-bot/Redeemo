import type { PrismaClient } from '../../../generated/prisma/client'

/**
 * Resolves a user's stored profile city. Returns null if no userId or no city set.
 * Pure-ish: hits the DB. Used by discovery routes for city-scope fallback per spec §4.6.
 */
export async function resolveProfileCity(
  prisma: PrismaClient,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { city: true },
  })
  return user?.city ?? null
}
