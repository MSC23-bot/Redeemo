// ─────────────────────────────────────────────────────────────────────────────
// M2 B3 (D2): flagship-voucher eligibility.
//
// The merchant chooses ONE eligible voucher type per mandatory flagship RMV. Five
// merchant-facing cards (Discount is one card that maps to the two DISCOUNT_*
// enums), so six eligible ENUM types. TIME_LIMITED + REUSABLE are NOT eligible for
// a flagship (custom-only, M4) and are surfaced as disabled-with-copy in the
// frontend; the create-flagship endpoint rejects them with VOUCHER_TYPE_NOT_ELIGIBLE.
//
// This is a code-level constant (no schema, no config table). The full set of 8
// `VoucherType` enum values still exists in the schema; this list is the M2
// flagship-eligibility subset only.
// ─────────────────────────────────────────────────────────────────────────────

export const ELIGIBLE_FLAGSHIP_TYPES = [
  'BOGO',
  'SPEND_AND_SAVE',
  'DISCOUNT_FIXED',
  'DISCOUNT_PERCENT',
  'FREEBIE',
  'PACKAGE_DEAL',
] as const

export type EligibleFlagshipType = (typeof ELIGIBLE_FLAGSHIP_TYPES)[number]

export function isEligibleFlagshipType(type: string): type is EligibleFlagshipType {
  return (ELIGIBLE_FLAGSHIP_TYPES as readonly string[]).includes(type)
}
