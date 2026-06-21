export interface NotificationDestination {
  href: string
  built: boolean
}

const HOME = '/'

// referenceType -> destination builder. Only the CURRENTLY-BUILT sections appear
// here; a future module adds ONE entry (e.g. voucher: (id) => ({ href: `/vouchers/${id}`, built: true }))
// when its section ships. Everything else hits the safe fallback below.
const REFERENCE_DESTINATIONS: Record<string, (id: string | null) => NotificationDestination> = {
  // home/lifecycle hub: application status + changes-requested actions live here.
  merchant: () => ({ href: HOME, built: true }),
}

// Pure, never throws. Maps (referenceType, referenceId, type) to a route + a
// `built` flag. Unknown / null referenceType, or a destination not built yet,
// returns the nearest existing parent (today '/') with built:false; the clicked
// notification still shows its title/body/timestamp, so the user always sees the
// message even when the destination page does not exist yet. `type` is available
// for finer routing later but is not required for the current entry.
export function resolveNotificationDestination(
  referenceType: string | null,
  referenceId: string | null,
  _type?: string,
): NotificationDestination {
  if (referenceType && REFERENCE_DESTINATIONS[referenceType]) {
    return REFERENCE_DESTINATIONS[referenceType](referenceId)
  }
  return { href: HOME, built: false }
}
