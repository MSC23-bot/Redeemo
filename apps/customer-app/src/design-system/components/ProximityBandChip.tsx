import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '../Text'
import { color, radius, spacing } from '../tokens'
import type { ProximityBand } from '@/lib/api/discovery'

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

// PR #112 device-QA copy refresh (2026-05-19) — owner-locked copy:
//   IN_YOUR_AREA       → 'In your area'           (unchanged)
//   A_LITTLE_FURTHER   → 'A little further away'  (was 'A little further' — felt unfinished)
//   NEAREST_ON_REDEEMO → 'Closest match on Redeemo' (was 'Nearest on Redeemo' — clearer copy)
//
// Direct text-match-fallback tiles surface here with `proximityBand:
// 'NEAREST_ON_REDEEMO'` set explicitly by the backend (see
// `service.ts` §7.5).  No client-side bridge needed — the wire carries
// the right value.
const BAND_LABEL: Record<ProximityBand, string | null> = {
  NEARBY:             null,
  IN_YOUR_AREA:       'In your area',
  A_LITTLE_FURTHER:   'A little further away',
  NEAREST_ON_REDEEMO: 'Closest match on Redeemo',
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
  const label = BAND_LABEL[band]
  if (label === null) return null
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? label}
      style={styles.chip}
    >
      <Text variant="label.md" style={styles.text}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    backgroundColor: color.surface.tint,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  text: {
    color: color.brandRose,
  },
})
