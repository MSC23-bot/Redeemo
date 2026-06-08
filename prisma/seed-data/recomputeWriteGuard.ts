// ─────────────────────────────────────────────────────────────────────────────
// Recompute-runner write guard
//
// A Prisma Client extension enforcing DEFAULT-DENY on writes for the standalone
// recompute-count runner (prisma/recompute-counts.ts). The runner only rewrites
// denormalized count maps, so the allow-list is just Category + Tag — far tighter
// than the reference seed. Every other model (merchants, branches, vouchers,
// users, reviews, redemptions, AND any reference/config model) is blocked on
// write by default.
//
// READS are never restricted (find*/count/aggregate/groupBy pass through), so the
// recompute helpers' merchant/branch/category/tag lookups keep working.
//
// The runner builds `base.$extends(recomputeWriteGuard)`; a write to anything
// other than Category/Tag THROWS before it reaches the database.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma } from '../../generated/prisma/client'

// The ONLY models the recompute runner may write: it updates
// Category.merchantCountByCity and Tag.merchantCountByCity, nothing else.
export const RECOMPUTE_WRITE_ALLOWLIST: ReadonlySet<string> = new Set(['Category', 'Tag'])

// Operations that only READ. Anything else is treated as a write and checked —
// so a new/unknown operation is blocked by default unless it's a known read.
const READ_OPERATIONS: ReadonlySet<string> = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
])

export function isRecomputeWriteOperation(operation: string): boolean {
  return !READ_OPERATIONS.has(operation)
}

export function assertRecomputeWriteAllowed(model: string | undefined, operation: string): void {
  if (!model || !RECOMPUTE_WRITE_ALLOWLIST.has(model)) {
    throw new Error(
      `[recompute-guard] BLOCKED ${operation} on "${model ?? 'unknown'}". The recompute ` +
        `runner may only WRITE Category / Tag (denormalized count maps). This default-deny ` +
        `guard prevents it from writing any other model — merchants, branches, vouchers, ` +
        `users, reviews, redemptions, or reference/config data.`,
    )
  }
}

export const recomputeWriteGuard = Prisma.defineExtension({
  name: 'recompute-write-guard',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (isRecomputeWriteOperation(operation)) {
          assertRecomputeWriteAllowed(model, operation)
        }
        return query(args)
      },
    },
  },
})
