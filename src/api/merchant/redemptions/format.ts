import { Prisma } from '../../../../generated/prisma/client'

export type RedemptionStatus = 'AWAITING_VALIDATION' | 'VALIDATED'

// OD4: customer identity shown to merchants is first name + last initial only,
// formatted at the API boundary. NEVER a full surname, never email/phone. This
// is the single source of the OD4 format, shared by the list, lookup, detail,
// and CSV paths.
export function formatCustomerName(firstName?: string | null, lastName?: string | null): string {
  const first = (firstName ?? '').trim()
  const last = (lastName ?? '').trim()
  if (!first && !last) return 'Customer'
  if (!last) return first
  if (!first) return last.charAt(0).toUpperCase() + '.'
  return first + ' ' + last.charAt(0).toUpperCase() + '.'
}

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

export function normalizeRedemptionCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Curated select: NEVER a blind spread, NEVER redemptionPin (lives on Branch),
// NEVER customer email/phone. Branch select is id + name only.
export const ROW_SELECT = {
  id: true, redemptionCode: true, redeemedAt: true,
  isValidated: true, validatedAt: true, validationMethod: true, estimatedSaving: true,
  voucher: { select: { id: true, title: true, type: true } },
  branch: { select: { id: true, name: true } },
  user: { select: { firstName: true, lastName: true } },
  validatedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.VoucherRedemptionSelect

// Same as ROW_SELECT but also pulls voucher.merchantId for the lookup ownership
// check. toMerchantRedemptionRow maps voucher to {id,title,type} only, so the
// merchantId never leaks out of the mapped row.
export const ROW_SELECT_WITH_MERCHANT = {
  ...ROW_SELECT,
  voucher: { select: { id: true, title: true, type: true, merchantId: true } },
} satisfies Prisma.VoucherRedemptionSelect

export function toMerchantRedemptionRow(r: any) {
  return {
    id: r.id,
    redemptionCode: r.redemptionCode,
    voucher: { id: r.voucher.id, title: r.voucher.title, type: r.voucher.type },
    branch: { id: r.branch.id, name: r.branch.name },
    customerName: formatCustomerName(r.user?.firstName, r.user?.lastName),
    redeemedAt: r.redeemedAt.toISOString(),
    status: deriveRedemptionStatus(r.isValidated),
    validatedAt: r.validatedAt ? r.validatedAt.toISOString() : null,
    validationMethod: r.validationMethod ?? null,
    validatedByLabel: validatedByLabel(r),
    estimatedSaving: Number(r.estimatedSaving),
  }
}
