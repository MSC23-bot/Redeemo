# D67 · Read-only admin visibility of voucher redemptions

**Status: APPROVED-TO-BUILD (owner instruction 2026-07-09: "continue toward the highest-value
acceptance unblocker: D67 read-only admin visibility of voucher redemptions; bounded,
read-only, no schema unless inspection proves otherwise"). Tier 2; this plan merges with the
implementation PR.**

## 1. Why (the gate this opens)

PROJECT-STATE §6 records D67 (owner-flagged 2026-07-05/06): read-only admin visibility of
voucher redemptions is REQUIRED before pre-launch staging acceptance can pass. Admins
currently have NO surface that lists redemptions; during the acceptance walk they cannot
verify that a redemption performed in the customer/merchant flow actually landed.

## 2. Inspection findings (2026-07-09, against main `a5808113`)

- **Greenfield, no schema change needed.** No admin route or admin-web page reads
  `VoucherRedemption` today; the only admin-side usage is the suspend cycle-state reset
  (`src/api/admin/merchants/service.ts:453-479`, a write).
- **Reusable reference implementation:** `src/api/merchant/redemptions/{service,format,routes}.ts`
  - curated `ROW_SELECT` (never selects `redemptionPin`, customer email/phone), tenancy via the
  `branch: { merchantId }` relation (VoucherRedemption has no `merchantId` column), stable
  total-order sort, Zod filters, capped pagination.
- **Admin patterns to slot into:** capability union + `requireAdminCapability` preHandler
  (`src/api/admin/capability.ts`), plugin registration (`src/api/admin/plugin.ts`),
  capability-aware nav (`apps/admin-web/components/admin-shell.tsx` `NAV_ITEMS`), typed
  Zod API modules (`apps/admin-web/lib/api/*`), list-page pattern (`app/(app)/queue/page.tsx`).

## 3. Adjudicated defaults (flagged for owner ratification; none forecloses a later change)

- **D67-a Customer PII:** the admin list shows the SAME masked customer name as the merchant
  surface (`formatCustomerName` = "First L."); no email/phone. Rationale: least privilege;
  the shared formatter is the platform-wide mask; widening later is additive and would be its
  own owner decision.
- **D67-b Scope/filters:** cross-merchant list (that is the point of admin visibility) with
  optional filters: `merchantId`, `branchId`, `status` (awaiting|validated), `from`/`to`,
  `voucherType`, `code` (normalized redemption-code prefix OR voucher-title contains), sort
  `recent|saving`, capped pagination (limit ≤ 100). v1 is LIST-ONLY: no CSV export (smaller
  data-exfiltration surface; the merchant surface already has tenant-scoped CSV), no detail
  page (the row carries what acceptance needs).
- **D67-c Test data:** unlike analytics (which must exclude `isTestData`), this ops view
  INCLUDES test rows by default and shows an explicit "Test" badge, with an `includeTest`
  filter to hide them. Rationale: D67 exists to verify redemptions during the staging
  acceptance walk, where the redemptions being verified ARE test rows; hiding them would
  defeat the feature. The analytics-cleanliness rule is untouched (this view feeds no
  analytics).
- **Capability:** new `'redemption:read'` in the `AdminCapability` union + `ALL_SLICE1_CAPS`
  (OPERATIONS + SUPER_ADMIN hold it, matching the other read caps).

## 4. Build shape (2 surfaces, no schema, no migration)

Backend (`src/api/admin/redemptions/`):
- `format.ts`: curated select mirroring the merchant `ROW_SELECT` + `merchant {id,businessName}`
  (via voucher relation) + `isTestData`; row mapper reuses `formatCustomerName`; Decimal
  `estimatedSaving` coerced to Number.
- `service.ts`: `buildAdminRedemptionWhere` (no tenancy scope; optional filters incl.
  `includeTest`), `buildRedemptionOrderBy` semantics identical to the merchant version
  (recent|saving, `id` tie-breaker), `listAdminRedemptions` (parallel count + findMany).
- `routes.ts`: `GET /api/v1/admin/redemptions` behind `requireAdminCapability('redemption:read')`;
  Zod filter schema; limit max 100 default 25.
- `capability.ts` + `plugin.ts`: one-line additions.
- Unit tests mirroring the merchant redemptions tests (where-builder, orderBy, formatter,
  capability deny).

Admin-web (`apps/admin-web/`):
- `lib/api/redemptions.ts` (Zod schema + list fetch), `lib/redemptions/useRedemptions.ts`
  (hook mirroring `useQueue`).
- `app/(app)/redemptions/page.tsx`: capability-gated list page (Forbidden/Loading/Error
  states per the queue-page pattern), status filter, code search, include-test toggle,
  validated/awaiting pill, Test badge, pagination.
- `admin-shell.tsx`: nav item `{label:'Redemptions', href:'/redemptions', cap:'redemption:read'}`.
- Jest tests for the API module + page states; `next build` verification before PR
  (standing admin-web rule).

## 5. Privacy/security posture

Read-only route; curated selects only (structurally cannot leak `redemptionPin`; customer
PII limited to the existing platform mask); capability-gated fail-closed (403 for roles
without the cap; nav hidden). No new PII surface beyond what merchants already see, minus
tenancy restriction, which is the entire intent of an admin console and is gated by admin
auth + capability.

## 6. As-shipped addendum

(To be completed on merge.)
