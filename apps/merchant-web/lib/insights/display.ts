/**
 * PR-B final-review: Insights-LOCAL display helpers.
 *
 * These exist because the shared lib/redemptions/display.voucherTypeLabel sentence-cases
 * the enum ("Spend and save", "Time limited", "Package deal"), but spec section 1.16
 * LOCKS the exact merchant-facing voucher-type labels for the Insights surface. Insights
 * must use the locked strings verbatim, so the label map lives here, scoped to Insights.
 *
 * UI-free so they can be unit-tested without React. House style: no em/en dashes; no
 * emojis.
 */
import type { VoucherType7 } from '@/lib/api/insights'

/**
 * The seven LOCKED merchant-facing voucher-type labels (spec section 1.16):
 *   Buy one, get one free / Spend & save / Discount / Freebie / Package deal /
 *   Time limited / Reusable.
 *
 * `DISCOUNT` is the merged type (DISCOUNT_FIXED + DISCOUNT_PERCENT collapse to the single
 * "Discount" top-level category per section 1.16). The seven keys are exactly the
 * VoucherType7 enum the wire emits.
 */
const INSIGHTS_VOUCHER_TYPE_LABELS: Record<VoucherType7, string> = {
  BOGO: 'Buy one, get one free',
  SPEND_AND_SAVE: 'Spend & save',
  DISCOUNT: 'Discount',
  FREEBIE: 'Freebie',
  PACKAGE_DEAL: 'Package deal',
  TIME_LIMITED: 'Time limited',
  REUSABLE: 'Reusable',
}

/**
 * The locked Insights-facing label for one of the seven merchant voucher types.
 * Unknown/forward values fall back to the raw input (never mislabelled).
 */
export function insightsVoucherTypeLabel(type: VoucherType7 | string): string {
  return INSIGHTS_VOUCHER_TYPE_LABELS[type as VoucherType7] ?? String(type)
}

/**
 * The single LOCKED repeat-customer-rate explainer (spec 1.3 / 1.5 + the backend
 * definition: "returning" = a customer with a PRIOR eligible logged redemption BEFORE
 * the period began). Shared verbatim by the KpiCards repeat-rate card AND the Customers
 * tab repeat-rate card so the two can never drift. The previous "redeemed with you more
 * than once" wording was WRONG (it described a different, frequency-based measure).
 */
export const REPEAT_RATE_EXPLAINER =
  'The share of customers in this selection who had already redeemed with you before ' +
  'this period began. It is only shown once enough customers are in view to be ' +
  'reliable; until then it reads as building. Excludes test, deleted, and removed records.'

export interface ScopeBranchOption {
  id: string
  name: string
}

/**
 * Resolve the human scope label shown on the Reports card + printable summary.
 *
 * The backend emits a machine-friendly placeholder ("Viewing: selected branch") when a
 * single branch is in view, because the service layer does not enumerate branch names
 * (it would risk leaking sibling names server-side). PR-B already holds the viewer's
 * authorised branch list client-side, so when a branchId filter is active we resolve the
 * real branch NAME from that list and show "Viewing: <name>" instead of the placeholder.
 *
 * Falls back to the raw server label when no branchId filter is active or the id is not
 * in the authorised list (so a crafted/stale id can never widen or invent a label).
 */
export function resolveScopeLabel(
  rawScopeLabel: string,
  branchId: string | undefined | null,
  branches: ScopeBranchOption[],
): string {
  if (!branchId) return rawScopeLabel
  const match = branches.find((b) => b.id === branchId)
  if (!match) return rawScopeLabel
  return `Viewing: ${match.name}`
}
