import { PrismaClient } from '../../../../generated/prisma/client'

// Placeholder — full implementation in Phase 3C-A Task 6 (savings API)
export async function getSavingsSummary(
  _prisma: PrismaClient,
  _userId: string,
) {
  return {
    totalSaved: 0,
    totalRedemptions: 0,
    currentCycleRedemptions: 0,
  }
}

export async function getSavingsRedemptions(
  _prisma: PrismaClient,
  _userId: string,
  _params: { limit: number; offset: number },
) {
  return { redemptions: [], total: 0 }
}
