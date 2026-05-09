// PR-C T11 (LOCKED 2026-05-09 §0.3): pure helper that maps the
// merchant-profile URL params describing "open Write Review for
// this branch with this redemption id" into the prop shape that
// ReviewsTab expects.
//
// Wire-up: the URL is built by SuccessPopup's onRateReview handler
// in VoucherDetailScreen (T13 — not yet shipped).  Shape:
//
//   /(app)/merchant/<merchantId>?branch=<branchId>&tab=reviews&openWriteReview=1&fromRedemption=<redemptionId>
//
// MerchantProfileScreen reads useLocalSearchParams, calls this
// helper, and forwards the result to <ReviewsTab initialOpenWriteFor
// = ...>.  After the sheet auto-opens once, the screen scrubs
// openWriteReview + fromRedemption from the URL via router.replace
// so back-nav doesn't re-trigger the auto-open.
//
// Pure function — exported for direct unit testing.

export type InitialOpenWriteFor = { branchId: string; redemptionId?: string } | null

export function deriveInitialOpenWriteFor(params: {
  branch?: string | string[]
  openWriteReview?: string | string[]
  fromRedemption?: string | string[]
}): InitialOpenWriteFor {
  const openWriteReview = firstString(params.openWriteReview)
  const branch          = firstString(params.branch)
  const fromRedemption  = firstString(params.fromRedemption)

  // The auto-open only fires when the URL EXPLICITLY signals it.
  // Anything other than the literal "1" is treated as not-set, so a
  // stale param (e.g. ?openWriteReview=true) doesn't accidentally
  // trigger the flow.
  if (openWriteReview !== '1') return null

  // We need a branchId to know which branch the auto-open targets.
  // Without it, ReviewsTab can't auto-open against any specific
  // branch — return null and let the user open the sheet manually.
  if (!branch) return null

  // fromRedemption is OPTIONAL.  If absent, the sheet still
  // auto-opens but without the verified-banner / redemptionId
  // linkage.  This lets the URL trigger the sheet for non-redemption
  // flows in future without changing the contract.
  return fromRedemption
    ? { branchId: branch, redemptionId: fromRedemption }
    : { branchId: branch }
}

function firstString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}
