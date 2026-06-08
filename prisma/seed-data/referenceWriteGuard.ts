// ─────────────────────────────────────────────────────────────────────────────
// Reference-seed write guard (PR2b)
//
// A Prisma Client extension that enforces DEFAULT-DENY on writes for the
// production-safe reference seed (prisma/seed-reference.ts). Only the
// reference/config models listed below may be WRITTEN; every other model —
// including all marketplace / customer / activity models AND any future model —
// is blocked on write by default.
//
// READS are never restricted: any operation that is not a known write
// (find*/count/aggregate/groupBy) passes straight through, so the reference
// phases' lookups (e.g. the merchantCategory.count orphan check in
// seedCategories, category/locality findFirst) keep working.
//
// seed-reference.ts builds `base.$extends(referenceWriteGuard)` and passes the
// guarded client to the reference phases. A non-reference write THROWS in the
// query hook BEFORE it reaches the database — nothing is written.
//
// NOTE: $extends model hooks intercept model operations only. Raw queries
// ($executeRaw/$queryRaw) bypass this guard — the reference path is verified to
// use none (a static check would catch a regression).
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma } from '../../generated/prisma/client'

// The ONLY models the reference seed may write. Derived from the reference
// phases it runs: taxonomy (Category/Tag/SubcategoryTag/Amenity/CategoryAmenity/
// RedundantHighlight), localities (Locality) + catchment (LocalityCatchmentEdge)
// + markets (Market, plus Locality.update for market membership), subscription
// plans (SubscriptionPlan), RMV templates (RmvTemplate), interests (Interest),
// and CMS placeholders (CmsContent). Adding a reference phase that writes a NEW
// model requires adding that model here — deliberately, not by accident.
export const REFERENCE_WRITE_ALLOWLIST: ReadonlySet<string> = new Set([
  'Category',
  'Tag',
  'SubcategoryTag',
  'Amenity',
  'CategoryAmenity',
  'Locality',
  'RedundantHighlight',
  'LocalityCatchmentEdge',
  'Market',
  'SubscriptionPlan',
  'RmvTemplate',
  'Interest',
  'CmsContent',
])

// Operations that only READ. Anything NOT in this set is treated as a write and
// checked against the allow-list — so a new/unknown Prisma operation is blocked
// by default unless it is one of these known reads.
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

export function isReferenceWriteOperation(operation: string): boolean {
  return !READ_OPERATIONS.has(operation)
}

export function assertReferenceWriteAllowed(model: string | undefined, operation: string): void {
  if (!model || !REFERENCE_WRITE_ALLOWLIST.has(model)) {
    throw new Error(
      `[reference-seed-guard] BLOCKED ${operation} on "${model ?? 'unknown'}". ` +
        `The reference seed may only WRITE reference/config models ` +
        `(${[...REFERENCE_WRITE_ALLOWLIST].join(', ')}). ` +
        `This is a default-deny guard: it prevents the reference seed from ever ` +
        `writing demo / marketplace / customer / activity data.`,
    )
  }
}

// Reusable Prisma Client extension. Applied in seed-reference.ts via
// `base.$extends(referenceWriteGuard)`.
export const referenceWriteGuard = Prisma.defineExtension({
  name: 'reference-write-guard',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (isReferenceWriteOperation(operation)) {
          assertReferenceWriteAllowed(model, operation)
        }
        return query(args)
      },
    },
  },
})
