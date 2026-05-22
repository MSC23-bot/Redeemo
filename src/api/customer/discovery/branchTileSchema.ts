import { z } from 'zod'

// Spec source: docs/superpowers/specs/2026-05-18-discovery-rebaseline-branch-first.md §1.1.
//
// Strict mode rejects unknown keys to lock the locality-only contract from
// Rev-2 owner-locked decision #12 — `branchAddressLine1` / `branchAddressLine2`
// / `branchPostcode` MUST NOT surface on Discovery cards.  Adding a new wire
// field requires a spec amendment.
//
// SupplyRung / ProximityBand exist as TYPE-only aliases in
// `src/api/lib/ladderProfiles.ts` (lines 25-30).  We re-declare them here as
// Zod enums because the schema needs to PARSE these values at runtime; the
// inferred types are structurally identical and stay in lockstep manually.

const supplyRungSchema = z.enum([
  'NEARBY', 'CATCHMENT', 'POST_TOWN', 'LAD',
  'COUNTY', 'REGION', 'COUNTRY', 'NATIONAL',
])
export type SupplyRung = z.infer<typeof supplyRungSchema>

const proximityBandSchema = z.enum([
  'NEARBY', 'IN_YOUR_AREA', 'A_LITTLE_FURTHER', 'NEAREST_ON_REDEEMO',
])
export type ProximityBand = z.infer<typeof proximityBandSchema>

const locationConfidenceSchema = z.enum([
  'MANUALLY_CONFIRMED', 'POSTCODE_CENTROID', 'NEEDS_REVIEW', 'ADDRESS_GEOCODED',
])

const categorySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  pinColour: z.string().nullable().optional(),
  pinIcon: z.string().nullable().optional(),
  descriptorSuffix: z.string().nullable().optional(),
  parentId: z.string().nullable(),
  intentType: z.enum(['LOCAL', 'DESTINATION', 'MIXED']).nullable().optional(),
}).strict().nullable()

const descriptorTagSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
}).strict().nullable()

const tileHighlightSchema = z.object({
  highlightTagId: z.string(),
  label: z.string(),
}).strict()

const merchantGroupingSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  tradingName: z.string().nullable(),
  logoUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  primaryCategory: categorySummarySchema,
  primaryDescriptorTag: descriptorTagSummarySchema,
  subcategory: categorySummarySchema,
  descriptor: z.string(),
  highlights: z.array(tileHighlightSchema),
  voucherCount: z.number().int().nonnegative(),
  maxEstimatedSaving: z.number().nullable(),
  // PR #112 device-QA fixup-3 (2026-05-19) — sum of estimatedSaving across
  // active+approved vouchers for this merchant.  Drives the Search card
  // "N offers · £X.XX total value" pill for multi-offer merchants.
  // ADDITIVE — maxEstimatedSaving is NOT overloaded.  Other surfaces
  // (Voucher Detail, Merchant Profile voucher card) keep reading
  // maxEstimatedSaving unchanged.
  totalEstimatedSaving: z.number().nullable(),
}).strict()

export const branchTileSchema = z.object({
  id: z.string(),
  // Forward-compat: this wire field name is load-bearing for the
  // `Branch.shortName` schema migration (deferred under §A in the spec).
  // Server-side derivation today uses a `branchShortName(branch.name)`
  // helper; when the migration lands, server reads `branch.shortName`
  // directly and the wire shape does NOT change.  Do NOT rename.
  branchName: z.string(),
  branchLocalityId: z.string().nullable(),
  branchLocalityName: z.string().nullable(),
  branchPostTown: z.string().nullable(),
  branchCity: z.string().nullable(),
  branchLatitude: z.number().nullable(),
  branchLongitude: z.number().nullable(),
  branchLocationConfidence: locationConfidenceSchema,
  isOpenNow: z.boolean(),
  closesAtLocal: z.string().nullable(),
  distance: z.number().nullable(),
  // Forward-compat: derived from merchant favourite state under THIS
  // rebaseline (Rev-2 decision #13).  Wire shape is forward-compatible
  // with the eventual branch-keyed favourites contract — when the
  // separate favourites rebaseline ships, server populates this from
  // the branch-keyed table; the field name + shape stay identical.
  // Do NOT rename.
  isFavourited: z.boolean(),
  avgRating: z.number().nullable(),
  reviewCount: z.number().int().nonnegative(),
  supplyRung: supplyRungSchema.nullable(),
  proximityBand: proximityBandSchema.nullable(),
  distanceMetres: z.number().nullable(),
  merchant: merchantGroupingSchema,
  // §CD v1 (2026-05-22) — voucher keyword search.  Non-null when the
  // merchant surfaced because the user's query matched a curated
  // voucher's title (or description, gated at q.length >= 5) AND no
  // other strong merchant-content / branch-content path explained the
  // match.  Customer-app renders the locked copy
  //   `Found in "<voucherTitle>" voucher`
  // under the meta row of SearchResultItem.  Empty/null when the
  // match was driven by merchant name / category / tag / branch
  // fields (§0.6 single-signal rule).
  matchContext: z.string().nullable(),
}).strict()

export type BranchTile = z.infer<typeof branchTileSchema>
