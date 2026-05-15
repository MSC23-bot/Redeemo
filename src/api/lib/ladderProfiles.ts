// src/api/lib/ladderProfiles.ts
//
// Plan 4 M2.2 — Pure-data ladder-profile matrix.
//
// Three matrices keyed by (LadderProfile, DensityClass):
//   - NEARBY radius in miles
//   - max rung the ladder walks to before refusing further candidates
//   - proximityBand mapping (per-rung × density-class) — this one is keyed
//     by (SupplyRung, DensityClass)
//
// Plus the canonical 8-element RUNG_ORDER, ordinal helper, and a legacy
// compat mapper (M2-internal — used by rankMerchantsV2 to populate the
// legacy `supplyTier` field on tiles for callers that haven't migrated to
// `supplyRung` yet).
//
// See:
//   docs/superpowers/specs/2026-05-13-plan-4-location-model-uk-enrichment-design.md §5.1–§5.3
//   docs/superpowers/plans/2026-05-13-plan-4-location-model-uk-enrichment.md  Task M2.2

export type LadderProfile =
  | 'LOCAL_TIGHT' | 'LOCAL_NORMAL' | 'MIXED_NORMAL' | 'DESTINATION_LOCAL' | 'DESTINATION_WIDE'

export type DensityClass = 'URBAN' | 'SUBURBAN' | 'RURAL'

export type SupplyRung =
  | 'NEARBY' | 'CATCHMENT' | 'POST_TOWN' | 'LAD'
  | 'COUNTY' | 'REGION' | 'COUNTRY' | 'NATIONAL'

export type ProximityBand =
  | 'NEARBY' | 'IN_YOUR_AREA' | 'A_LITTLE_FURTHER' | 'NEAREST_ON_REDEEMO'

// Mirrors the Prisma `PopulationTier` enum — kept inline here to avoid
// importing Prisma types into a pure-data module. If the enum changes
// in the schema, `deriveDensityClass`'s exhaustive switch must update.
type PopulationTier =
  | 'UNKNOWN' | 'HAMLET' | 'VILLAGE' | 'SMALL_TOWN'
  | 'TOWN' | 'LARGE_TOWN' | 'CITY' | 'METRO_CORE'

export const RUNG_ORDER: readonly SupplyRung[] = [
  'NEARBY', 'CATCHMENT', 'POST_TOWN', 'LAD',
  'COUNTY', 'REGION', 'COUNTRY', 'NATIONAL',
]

export function rungOrdinal(r: SupplyRung): number {
  return RUNG_ORDER.indexOf(r)
}

// NEARBY radius matrix — spec §5.2.
// Reads: NEARBY_RADII[profile][density] = miles.
const NEARBY_RADII: Record<LadderProfile, Record<DensityClass, number>> = {
  LOCAL_TIGHT:       { URBAN: 1.5, SUBURBAN: 4,  RURAL: 7  },
  LOCAL_NORMAL:      { URBAN: 3,   SUBURBAN: 6,  RURAL: 10 },
  MIXED_NORMAL:      { URBAN: 5,   SUBURBAN: 10, RURAL: 15 },
  DESTINATION_LOCAL: { URBAN: 8,   SUBURBAN: 15, RURAL: 20 },
  DESTINATION_WIDE:  { URBAN: 15,  SUBURBAN: 25, RURAL: 35 },
}

// Max rung matrix — spec §5.2.
// The ladder walk stops here (or at the last non-empty rung below it).
const MAX_RUNGS: Record<LadderProfile, Record<DensityClass, SupplyRung>> = {
  LOCAL_TIGHT:       { URBAN: 'LAD',      SUBURBAN: 'COUNTY',   RURAL: 'COUNTY'   },
  LOCAL_NORMAL:      { URBAN: 'COUNTY',   SUBURBAN: 'COUNTY',   RURAL: 'REGION'   },
  MIXED_NORMAL:      { URBAN: 'REGION',   SUBURBAN: 'REGION',   RURAL: 'COUNTRY'  },
  DESTINATION_LOCAL: { URBAN: 'COUNTRY',  SUBURBAN: 'COUNTRY',  RURAL: 'NATIONAL' },
  DESTINATION_WIDE:  { URBAN: 'NATIONAL', SUBURBAN: 'NATIONAL', RURAL: 'NATIONAL' },
}

// proximityBand mapping — spec §5.3.
// Drives the customer-app pill copy ("NEARBY" / "in your area" / etc.).
const PROXIMITY_BAND: Record<SupplyRung, Record<DensityClass, ProximityBand>> = {
  NEARBY:    { URBAN: 'NEARBY',              SUBURBAN: 'NEARBY',              RURAL: 'NEARBY'              },
  CATCHMENT: { URBAN: 'IN_YOUR_AREA',        SUBURBAN: 'IN_YOUR_AREA',        RURAL: 'IN_YOUR_AREA'        },
  POST_TOWN: { URBAN: 'IN_YOUR_AREA',        SUBURBAN: 'IN_YOUR_AREA',        RURAL: 'IN_YOUR_AREA'        },
  LAD:       { URBAN: 'A_LITTLE_FURTHER',    SUBURBAN: 'IN_YOUR_AREA',        RURAL: 'IN_YOUR_AREA'        },
  COUNTY:    { URBAN: 'NEAREST_ON_REDEEMO',  SUBURBAN: 'A_LITTLE_FURTHER',    RURAL: 'A_LITTLE_FURTHER'    },
  REGION:    { URBAN: 'NEAREST_ON_REDEEMO',  SUBURBAN: 'NEAREST_ON_REDEEMO',  RURAL: 'A_LITTLE_FURTHER'    },
  COUNTRY:   { URBAN: 'NEAREST_ON_REDEEMO',  SUBURBAN: 'NEAREST_ON_REDEEMO',  RURAL: 'NEAREST_ON_REDEEMO'  },
  NATIONAL:  { URBAN: 'NEAREST_ON_REDEEMO',  SUBURBAN: 'NEAREST_ON_REDEEMO',  RURAL: 'NEAREST_ON_REDEEMO'  },
}

export function getNearbyRadiusMiles(p: LadderProfile, d: DensityClass): number {
  return NEARBY_RADII[p][d]
}

export function getMaxRung(p: LadderProfile, d: DensityClass): SupplyRung {
  return MAX_RUNGS[p][d]
}

export function getProximityBand(rung: SupplyRung, d: DensityClass): ProximityBand {
  return PROXIMITY_BAND[rung][d]
}

export function deriveDensityClass(tier: PopulationTier): DensityClass {
  switch (tier) {
    case 'METRO_CORE':
    case 'CITY':
      return 'URBAN'
    case 'LARGE_TOWN':
    case 'TOWN':
      return 'SUBURBAN'
    default:
      return 'RURAL'
  }
}

// Legacy compat — spec §3.7. Used by `rankMerchantsV2` (M2.6) to keep the
// existing `supplyTier: 'NEARBY' | 'CITY' | 'DISTANT'` field populated on
// tiles so callers that haven't migrated to `supplyRung` keep working.
// M3 swaps callers to read `supplyRung`; M5 drops `supplyTier`.
export function mapRungToLegacyTier(rung: SupplyRung): 'NEARBY' | 'CITY' | 'DISTANT' {
  if (rung === 'NEARBY') return 'NEARBY'
  if (rung === 'CATCHMENT' || rung === 'POST_TOWN') return 'CITY'
  return 'DISTANT'
}
