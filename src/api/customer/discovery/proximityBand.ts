// src/api/customer/discovery/proximityBand.ts
//
// §DG post-T8 fixup (PR #127, 2026-05-24) — owner-locked unified proximity-band
// derivation.  The chip emitted on every merchant card is derived purely from
// the visible distance, so the chip matches the distance shown on the card.
// Replaces the previous split where V3-head tiles used rung-based derivation
// (ladderProfiles.ts::getProximityBand) while NBC cascade/top-up fillers used
// distance-based derivation (the old deriveFillerProximityBand).
//
// Owner-locked thresholds:
//   < 8 mi  (12 875 m)  → IN_YOUR_AREA       — green chip
//   < 25 mi (40 234 m)  → A_LITTLE_FURTHER   — amber chip
//   >= 25 mi            → NEAREST_ON_REDEEMO — rose chip
//   null distance       → null (no chip rendered)
//
// V3's internal rung classification + maxRung gate stay UNCHANGED — they still
// drive ranking + inclusion decisions.  Only the EMITTED proximityBand on
// tile output switches to this helper.
//
// NEARBY band is NEVER emitted from this helper.  V3 head tiles may have
// supplyRung='NEARBY' for ranking purposes, but the chip uses the visible
// distance — < 8mi → IN_YOUR_AREA (green) which is the visible-distance
// equivalent of "you're in the zone".  The NEARBY band's null label (no
// chip) was the V3-era behaviour for already-nearby merchants; under the
// distance-based derivation, < 8mi merchants always show the green chip.

import type { ProximityBand } from '../../lib/ladderProfiles'

const PROXIMITY_BAND_IN_AREA_M    = 12_875   // 8 mi  × 1609.344 m/mi rounded
const PROXIMITY_BAND_SHORT_TRIP_M = 40_234   // 25 mi × 1609.344 m/mi rounded

export function deriveProximityBandFromDistance(distanceMetres: number | null): ProximityBand | null {
  if (distanceMetres === null) return null
  if (distanceMetres < PROXIMITY_BAND_IN_AREA_M)    return 'IN_YOUR_AREA'
  if (distanceMetres < PROXIMITY_BAND_SHORT_TRIP_M) return 'A_LITTLE_FURTHER'
  return 'NEAREST_ON_REDEEMO'
}
