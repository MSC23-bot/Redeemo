// Branches PR-1 F1: the PER-BRANCH "with Redeemo" predicate. A branch is shown to
// customers (and counted in the "With Redeemo" summary card) iff it is active AND
// its location has been manually confirmed by an admin.
//
// NOTE: this is ONLY the per-branch test. The merchant-lifecycle gate (the
// merchant itself must be Live, i.e. profile.status === 'ACTIVE' via
// lib/auth/lifecycle.ts) is applied at the F2 summary-card layer, NOT here. When
// the merchant is not Live, the "With Redeemo" count is 0 regardless of any
// per-branch MANUALLY_CONFIRMED flags.
import type { Branch } from '@/lib/api/branch'

export function isWithRedeemo(branch: Pick<Branch, 'isActive' | 'locationConfidence'>): boolean {
  return branch.isActive === true && branch.locationConfidence === 'MANUALLY_CONFIRMED'
}
