// Branch PIN set/not-set derivation - the SINGLE compatibility rule (wire
// hygiene correction round 2, 2026-07-05).
//
// Contract:
//   1. The server-derived `redemptionPinSet` boolean is authoritative whenever
//      it is present - INCLUDING an explicit `false`. The legacy field can
//      never override an explicit boolean.
//   2. Only when `redemptionPinSet` is entirely absent (an OLDER backend that
//      predates the #377 contract - Vercel auto-deploys the frontend from main
//      while Railway may still run the previous backend) may set/not-set be
//      derived from the legacy `redemptionPin` field's PRESENCE. The value is
//      never read beyond `!= null`, never rendered, never logged, never copied.
//   3. Both absent -> false (fail closed: PIN treated as not set).
//
// REMOVAL TRIGGER: delete the legacy-presence fallback only after a CONFIRMED
// Railway backend deployment that contains the corrected #377 contract
// (redemptionPinSet emitted on every branch-row exit). The removal PR must
// drop the legacy `redemptionPin?` field from THREE places: the type below,
// BranchesOverview's BranchRow intersection type, and PinCard's BranchWithPin
// intersection type. Until then this bridge is what keeps configured PINs
// from appearing unset during frontend/backend version skew.
export interface BranchPinFields {
  redemptionPinSet?: boolean
  redemptionPin?: string | null
}

export function branchPinSet(branch: BranchPinFields): boolean {
  if (typeof branch.redemptionPinSet === 'boolean') return branch.redemptionPinSet
  return branch.redemptionPin != null
}
