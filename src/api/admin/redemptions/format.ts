import { Prisma } from '../../../../generated/prisma/client'
import { formatCustomerName } from '../../shared/customerName'
import {
  deriveRedemptionStatus,
  validatedByLabel,
  normalizeRedemptionCode,
} from '../../merchant/redemptions/format'

// D67: read-only admin visibility of voucher redemptions
// (docs/superpowers/plans/2026-07-09-d67-admin-redemption-visibility.md).
//
// This module mirrors src/api/merchant/redemptions/format.ts (the reference
// implementation) but is NOT tenant-scoped (see service.ts) and additionally
// surfaces the owning merchant identity + the isTestData flag. `formatCustomerName`,
// `deriveRedemptionStatus`, `validatedByLabel`, and `normalizeRedemptionCode` are
// pure, non-tenancy-scoped helpers re-used from the merchant module rather than
// duplicated, so the OD4 (customer-name masking) / OD6 (validator label) rules
// stay a single source of truth. Re-exported so callers of this module resolve
// them from one place.
export { formatCustomerName, deriveRedemptionStatus, validatedByLabel, normalizeRedemptionCode }

// Curated select: NEVER redemptionPin (lives on Branch; never selected here),
// NEVER customer email/phone. Voucher select is deliberately leaner than the
// merchant surface's (no description/terms): D67-b is list-only, no detail
// page, so the row carries only what the list needs. Branch select additionally
// carries the owning merchant's {id, businessName} via the Branch.merchant
// relation (D67-b: cross-merchant admin list; VoucherRedemption has no
// merchantId column; backend-api.md). isTestData surfaces for the "Test" badge
// (D67-c: this ops view INCLUDES test rows by default, unlike analytics).
export const ADMIN_ROW_SELECT = {
  id: true, redemptionCode: true, redeemedAt: true,
  isValidated: true, validatedAt: true, validationMethod: true, estimatedSaving: true,
  isTestData: true,
  voucher: { select: { id: true, title: true, type: true } },
  branch: { select: { id: true, name: true, merchant: { select: { id: true, businessName: true } } } },
  user: { select: { firstName: true, lastName: true } },
  validatedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.VoucherRedemptionSelect

export function toAdminRedemptionRow(r: any) {
  return {
    id: r.id,
    redemptionCode: r.redemptionCode,
    voucher: {
      id: r.voucher.id,
      title: r.voucher.title,
      type: r.voucher.type,
    },
    branch: { id: r.branch.id, name: r.branch.name },
    merchant: { id: r.branch.merchant.id, businessName: r.branch.merchant.businessName },
    customerName: formatCustomerName(r.user?.firstName, r.user?.lastName),
    redeemedAt: r.redeemedAt.toISOString(),
    status: deriveRedemptionStatus(r.isValidated),
    validatedAt: r.validatedAt ? r.validatedAt.toISOString() : null,
    validationMethod: r.validationMethod ?? null,
    validatedByLabel: validatedByLabel(r),
    // Prisma Decimal serializes to a JSON string (backend-api.md); coerce to a
    // number before it reaches the wire.
    estimatedSaving: Number(r.estimatedSaving),
    isTestData: r.isTestData,
  }
}
