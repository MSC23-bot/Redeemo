// OD4: customer identity shown to merchants is first name + last initial only,
// formatted at the API boundary. NEVER a full surname, never email/phone. This
// is the SINGLE source of the OD4 format, shared by the merchant list, lookup,
// detail, and CSV paths AND by the merchant-admin redemption-verify response.
export function formatCustomerName(firstName?: string | null, lastName?: string | null): string {
  const first = (firstName ?? '').trim()
  const last = (lastName ?? '').trim()
  if (!first && !last) return 'Customer'
  if (!last) return first
  if (!first) return last.charAt(0).toUpperCase() + '.'
  return first + ' ' + last.charAt(0).toUpperCase() + '.'
}
