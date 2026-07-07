import { Prisma } from '../../../../generated/prisma/client'
import { formatCustomerName } from '../../shared/customerName'

export type RedemptionStatus = 'AWAITING_VALIDATION' | 'VALIDATED'

// OD4: the customer-name formatter now lives in one shared module so the
// merchant-redemption paths AND the merchant-admin redemption-verify response
// share a single source of truth. Re-exported here so existing imports of
// `formatCustomerName` from this module keep resolving; the local import above
// is what `validatedByLabel` / `toMerchantRedemptionRow` reference.
export { formatCustomerName }

export function deriveRedemptionStatus(isValidated: boolean): RedemptionStatus {
  return isValidated ? 'VALIDATED' : 'AWAITING_VALIDATION'
}

// OD6: validator attribution. When a branch user validated, show their first
// name + last initial. When validated with a null validatedBy (the merchant-admin
// portal path under OD6's no-schema fix), show "Validated in the portal". Never
// a raw id.
export function validatedByLabel(r: { isValidated: boolean; validatedBy: { firstName: string | null; lastName: string | null } | null }): string | null {
  if (!r.isValidated) return null
  if (r.validatedBy) return formatCustomerName(r.validatedBy.firstName, r.validatedBy.lastName)
  return 'Validated in the portal'
}

// Staging-acceptance A5 (additive): the validator's DISPLAY NAME for the
// merchant-facing detail drawer. VoucherRedemption.validatedById references a
// BranchUser and is set ONLY on the branch-staff PIN path
// (src/api/redemption/service.ts: `validatedById: actor.role === 'branch' ? ...`);
// the merchant-portal Quick Validate path deliberately stores null (OD6
// no-schema fix), so a portal validation is NOT resolvable to a person and keeps
// the generic label. The staff name is the merchant's OWN staff (not customer
// PII), so the FULL name is shown; a nameless BranchUser row also degrades to
// the generic label rather than an empty string.
export function validatedByDisplayName(r: { isValidated: boolean; validatedBy: { firstName: string | null; lastName: string | null } | null }): string | null {
  if (!r.isValidated) return null
  const first = (r.validatedBy?.firstName ?? '').trim()
  const last = (r.validatedBy?.lastName ?? '').trim()
  const full = [first, last].filter(Boolean).join(' ')
  return full || 'Validated in the portal'
}

export function normalizeRedemptionCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Curated select: NEVER a blind spread, NEVER redemptionPin (lives on Branch),
// NEVER customer email/phone. Branch select is id + name only. Staging-acceptance
// A5 adds voucher.description + voucher.terms (merchant-authored public voucher
// copy, not PII) so the detail drawer can render them.
export const ROW_SELECT = {
  id: true, redemptionCode: true, redeemedAt: true,
  isValidated: true, validatedAt: true, validationMethod: true, estimatedSaving: true,
  voucher: { select: { id: true, title: true, type: true, description: true, terms: true } },
  branch: { select: { id: true, name: true } },
  user: { select: { firstName: true, lastName: true } },
  validatedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.VoucherRedemptionSelect

// Same as ROW_SELECT but also pulls voucher.merchantId for the lookup ownership
// check. toMerchantRedemptionRow maps the voucher WITHOUT merchantId, so the
// merchantId never leaks out of the mapped row.
export const ROW_SELECT_WITH_MERCHANT = {
  ...ROW_SELECT,
  voucher: { select: { id: true, title: true, type: true, description: true, terms: true, merchantId: true } },
} satisfies Prisma.VoucherRedemptionSelect

export function toMerchantRedemptionRow(r: any) {
  return {
    id: r.id,
    redemptionCode: r.redemptionCode,
    voucher: {
      id: r.voucher.id,
      title: r.voucher.title,
      type: r.voucher.type,
      // A5 (additive): public voucher copy for the detail drawer.
      description: r.voucher.description ?? null,
      terms: r.voucher.terms ?? null,
    },
    branch: { id: r.branch.id, name: r.branch.name },
    customerName: formatCustomerName(r.user?.firstName, r.user?.lastName),
    redeemedAt: r.redeemedAt.toISOString(),
    status: deriveRedemptionStatus(r.isValidated),
    validatedAt: r.validatedAt ? r.validatedAt.toISOString() : null,
    validationMethod: r.validationMethod ?? null,
    validatedByLabel: validatedByLabel(r),
    // A5 (additive): the resolved validator display name (full staff name when a
    // BranchUser validated; the generic portal label otherwise; null unvalidated).
    validatedBy: validatedByDisplayName(r),
    estimatedSaving: Number(r.estimatedSaving),
  }
}
