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
// Locked behaviour:
//   - 'NEARBY' renders nothing — already-nearby merchants don't need a
//     "you are here" reminder. Returning null lets callers always render
//     `<ProximityBandChip band={tile.proximityBand} />` without a guard.
//   - The other three bands render the same chip shape with different
//     copy. No colour-coded escalation: this is informational, not a
//     warning.
//
// Visual language: existing design-system tokens only — no new visual
// vocabulary introduced. Cream-rose tint surface (`surface.tint`) + brand
// rose text (`brandRose`) + `radius.sm` + `label.md` typography. Same
// pill shape used elsewhere for passive labels (e.g. the spec §10.1
// "subtle tag-style pill" annotation).
//
// Not interactive (no Pressable, no haptics). For interactive filter
// chips use `design-system/components/Chip.tsx` instead.

const BAND_LABEL: Record<ProximityBand, string | null> = {
  NEARBY:             null,
  IN_YOUR_AREA:       'In your area',
  A_LITTLE_FURTHER:   'A little further',
  NEAREST_ON_REDEEMO: 'Nearest on Redeemo',
}

export type ProximityBandChipProps = {
  band: ProximityBand
  /** Override the accessibility label. Defaults to the visible text. */
  accessibilityLabel?: string
}

export function ProximityBandChip({ band, accessibilityLabel }: ProximityBandChipProps) {
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
