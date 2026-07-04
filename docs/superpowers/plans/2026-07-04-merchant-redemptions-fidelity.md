# Redemptions fidelity slice (eng-autonomous)

**Date:** 2026-07-04 · **Base:** `origin/main` @ `1eb2b382` (rebased to `399c6596` at PR time) · **Branch:** `feature/merchant-redemptions-fidelity`
**Authority:** the 2026-07-04 Redemptions/Branches fidelity discovery (source-backed cross-check vs prototype + backend + recorded deferrals) and the owner authorization to proceed with the next eng-autonomous slice. Owner-gated items (redemption reversal OD2, alerts recipient model) NOT touched.

## Cross-check -> change map

| Discovery gap | Prototype | Shipped before | This slice | Contract note |
|---|---|---|---|---|
| Per-voucher filter had no UI (URL-only `voucherId` deep-link) | voucher dropdown | `voucherId` supported server-side + qs, no control | "Voucher" select in RedemptionFilters, options = custom + flagship lists merged, title-sorted; hidden when the (non-fatal) options fetch yields none; existing deep-link chip unchanged | frontend-only |
| No sort control (hardcoded `redeemedAt desc`) | recency/saving sort | none | "Sort" select (Newest first / Biggest saving); backend `sort: z.enum(['recent','saving']).optional()`; `buildRedemptionOrderBy` is the SINGLE ordering source for list AND CSV export (B4 parity) | additive merchant-API param; authz untouched |
| Search was code-only; prototype promises name/code/voucher | free search | `code startsWith` only | Search box (relabelled "Search" / "Code or voucher") matches normalized code prefix OR voucher title (case-insensitive contains). The OR sits INSIDE the tenant/branch-scoped where (Prisma top-level AND), pinned. Customer-NAME search deliberately NOT offered: names are privacy-formatted server-side at read (locked OD4); searching raw names would cut against that boundary | additive where-clause; scope/IDOR pins extended |

## Explicitly excluded
Redemption reversal (OD2, owner-gated, schema); staff-at-branch remove action (membership-write surface, belongs to Staff & Access); alerts recipient model (recorded owner decision); status tabs/Reversed/legend (locked 2-state model).

## Security posture
`src/api/merchant/redemptions/**` is on the security path-trigger map. This slice changes only the filter where-clause (inside the tenant pin) and orderBy; `resolveMerchantContext`/`scopeBranchIds` untouched. Pins added: OR-search preserves the tenant pin + scoped-member branch intersection; invalid sort 400s before any query.

## Verification
Backend: redemptions suites 90/90 (new sort-search.test.ts + list.test.ts extensions; the stale code-only pin updated to the OR contract). Frontend: filters control pins, qs serialisation (incl. CSV keeps sort, strips pagination), page wiring pin (merged+sorted options, patch resets offset). Full gates + fresh-context Opus review pre-PR; PR left unmerged for SHA-bound approval.
