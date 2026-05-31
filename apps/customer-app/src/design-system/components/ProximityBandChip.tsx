import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '../Text'
import { color, radius, spacing } from '../tokens'
import type { ProximityBand } from '@/lib/api/discovery'

/**
 * Batch 1B (2026-06-01) status: this component is no longer mounted by
 * <BranchTile>. The same per-band copy and the same semantic colour
 * mapping are now rendered as a nested <Text> child INSIDE the
 * BranchTile info line so the chip surface area shrinks to typography
 * weight. The component file stays exported for any future Discovery
 * surface that wants a standalone chip treatment (Search results,
 * Merchant Profile branches tab, etc.) and its standalone unit tests
 * at tests/design-system/components/ProximityBandChip.test.tsx remain
 * green.
 *
 * Active JSX mounts as of 2026-06-01: zero.
 *
 * A static-source meta-pin at tests/_meta/proximity-chip-no-jsx-
 * consumers.test.ts enforces zero JSX mounts; if a future surface
 * needs the standalone chip, allowlist that file in the meta-pin
 * AND document the surface here.
 */

// ─── Plan 4 M3.6 — ProximityBandChip ──────────────────────────────────────────
//
// Passive label that explains, in human-friendly copy, why a merchant tile
// is appearing this far out from the user's effective location. Driven by
// the `proximityBand` field that backend M3.3 attaches to every V2-classified
// tile. Designed to sit alongside (NOT replace) the merchant card content.
//
// Locked behaviour — renders nothing (returns null) when:
//   - `band` is undefined (older API responses pre-M3)
//   - `band` is null (the M3a hybrid phase — V2-rejected merchants:
//     POSTCODE_CENTROID, NEEDS_REVIEW, inactive)
//   - `band` is 'NEARBY' (already-nearby merchants need no "you are
//     here" reminder)
//
// The other three bands render the same chip shape with different
// copy. No colour-coded escalation — this is informational, not a
// warning.
//
// Callers can ALWAYS render the chip directly from a tile without a
// guard, regardless of the tile's source:
//
//   <ProximityBandChip band={tile.proximityBand} />
//
// — even if `tile.proximityBand` is typed `ProximityBand | null | undefined`.
//
// Visual language: existing design-system tokens only — no new visual
// vocabulary introduced. Cream-rose tint surface (`surface.tint`) + brand
// rose text (`brandRose`) + `radius.sm` + `label.md` typography. Same
// pill shape used elsewhere for passive labels (e.g. the spec §10.1
// "subtle tag-style pill" annotation).
//
// Not interactive (no Pressable, no haptics). For interactive filter
// chips use `design-system/components/Chip.tsx` instead.

// PR #112 device-QA fixup-3 copy lock (2026-05-19) — owner-locked copy:
//   IN_YOUR_AREA       → 'In your area'                (unchanged)
//   A_LITTLE_FURTHER   → 'A short trip away'           (was 'A little further away' — too
//                                                      casual at 6.7 miles per device QA)
//   NEAREST_ON_REDEEMO → 'Nearest match on Redeemo'    (v1.9 PR #126 device-QA-6 2026-05-23
//                                                      — was 'Closest match on Redeemo';
//                                                      'Nearest' reads more distance-specific
//                                                      per owner direction.  The pre-fixup-2
//                                                      copy 'Nearest on Redeemo' is still
//                                                      WRONG — it lacks 'match' — and remains
//                                                      pinned as a negative guard.)
//
// Thresholds remain backend-driven (rankBranchesV3 rung classification —
// Plan 4 M3 / Task 2.1.0); the client only renames labels.
//
// Direct text-match-fallback tiles surface here with `proximityBand:
// 'NEAREST_ON_REDEEMO'` set explicitly by the backend (see
// `service.ts` §7.5).  No client-side bridge needed — the wire carries
// the right value.
const BAND_LABEL: Record<ProximityBand, string | null> = {
  NEARBY:             null,
  IN_YOUR_AREA:       'In your area',
  A_LITTLE_FURTHER:   'A short trip away',
  NEAREST_ON_REDEEMO: 'Nearest match on Redeemo',
}

// v1.8 (PR #126 device-QA-5 owner direction 2026-05-23) — semantic-tinted
// chip variants so the colour communicates meaning, not just text.  Locked
// product direction:
//
//   IN_YOUR_AREA       → reassuring green-tinted chip
//   A_LITTLE_FURTHER   → warm amber/orange-tinted chip
//   NEAREST_ON_REDEEMO → neutral-rose chip (existing visual baseline)
//
// Token strategy (lightweight, no token churn):
//   - Background colours are inlined as soft tinted hex values matching
//     the established palette (alpha-blended-from-cream look).
//   - Text colours pull from `color.success` / `color.warning` /
//     `color.brandRose` — existing semantic tokens.
//
// Future polish (richer chip system / interactive explainer modal) is
// deferred under §DI per owner direction in PR #126 device-QA-5.  The
// goal here is minimal visual differentiation, not a chip-system redesign.
const BAND_STYLE: Record<ProximityBand, { bg: string; text: string } | null> = {
  // NEARBY never renders — kept null so no surface tokens leak through.
  NEARBY:             null,
  // Soft sage/green tint — reassuring "you're in the zone".
  IN_YOUR_AREA:       { bg: '#E8F5EE', text: color.success    },
  // Soft amber/peach tint — warm "a bit further".
  A_LITTLE_FURTHER:   { bg: '#FEF3E6', text: color.warning    },
  // Existing baseline — cream-rose surface + brand rose text.
  NEAREST_ON_REDEEMO: { bg: color.surface.tint, text: color.brandRose },
}

export type ProximityBandChipProps = {
  /**
   * Accepts the full `ProximityBand | null | undefined` shape the
   * backend may produce. null = M3a hybrid phase V2-rejected
   * merchant; undefined = pre-M3 response that didn't carry the field;
   * 'NEARBY' = no chip (per §10.1 visual contract). All three cases
   * render nothing so callers don't need a guard.
   *
   * The explicit `| undefined` is load-bearing under
   * `exactOptionalPropertyTypes: true` — without it, `band={undefined}`
   * wouldn't typecheck even though omitting the prop entirely would.
   */
  band?: ProximityBand | null | undefined
  /** Override the accessibility label. Defaults to the visible text. */
  accessibilityLabel?: string
}

export function ProximityBandChip({ band, accessibilityLabel }: ProximityBandChipProps) {
  if (band === null || band === undefined) return null
  const label   = BAND_LABEL[band]
  const variant = BAND_STYLE[band]
  if (label === null || variant === null) return null
  return (
    <View
      testID="proximity-band-chip"
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.chip, { backgroundColor: variant.bg }]}
    >
      <Text variant="label.md" style={{ color: variant.text }}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
})
