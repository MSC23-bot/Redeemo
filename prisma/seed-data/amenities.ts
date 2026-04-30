/**
 * AMENITY STARTER SET — not the final universe.
 *
 * Plan 1.5 lays the foundation; admin Phase 5 will add more. Eligibility
 * (CategoryAmenity rules) is the structural control, not enumeration
 * completeness.
 *
 * TAG-VS-AMENITY RULE — a concept lives in EXACTLY ONE system:
 *   - Tag (CUISINE / SPECIALTY / HIGHLIGHT / DETAIL): "What is this place?"
 *     identity, brand, descriptor (e.g. Italian, Specialty Coffee, Pet-Friendly)
 *   - Amenity: "What does this place have/offer?"
 *     operational features, services (e.g. Wi-Fi, Outdoor Seating, Free Parking)
 *
 * If unsure, ask: would the user be searching for places that ARE this
 * (→ tag) or for places that HAVE this (→ amenity)?
 *
 * Items rejected from the amenity list because they overlap with tags:
 *   - Halal Certified  → use "Halal" CUISINE tag
 *   - Vegan Options    → use "Vegan" CUISINE tag / "Vegan-Friendly" HIGHLIGHT
 *   - Family-Friendly  → existing HIGHLIGHT tag
 *   - Pet-Friendly     → existing HIGHLIGHT tag
 *
 * Wheelchair Access is classified as an amenity (operational accessibility
 * fact, used for filtering and detail-page display) — not a HIGHLIGHT (the
 * card-level highlight slots are limited, reserved for promoted attributes).
 */

export type SeedAmenity = {
  name: string
  iconUrl: string | null
}

export const AMENITIES: SeedAmenity[] = [
  { name: 'Wi-Fi',                 iconUrl: null },
  { name: 'Wheelchair Access',     iconUrl: null },
  { name: 'Online Booking',        iconUrl: null },
  { name: 'Outdoor Seating',       iconUrl: null },
  { name: 'Late-Night Service',    iconUrl: null },
  { name: 'Group Bookings',        iconUrl: null },
  { name: 'Walk-Ins Welcome',      iconUrl: null },
  { name: 'Same-Day Appointments', iconUrl: null },
  { name: 'Showers',               iconUrl: null },
  { name: 'Lockers',               iconUrl: null },
  { name: 'Click & Collect',       iconUrl: null },
  { name: 'Free Parking',          iconUrl: null },
  { name: 'Room Service',          iconUrl: null },
  { name: '24-Hour Reception',     iconUrl: null },
  { name: 'Loan Vehicle',          iconUrl: null },
  { name: 'Pickup & Drop-off',     iconUrl: null },
  { name: 'Boarding Available',    iconUrl: null },
]
