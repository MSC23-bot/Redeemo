/**
 * Batch 1B Tier 3 (2026-06-01) — pure-function composition helper for the
 * shared <BranchTile> info hierarchy.
 *
 * Layout B (owner-locked 2026-06-01 device-QA direction): the info area
 * splits onto TWO lines beneath the merchant name —
 *
 *   line 1 (primary):   `descriptor · locality`   e.g. "Indian Restaurant · Brightlingsea"
 *   line 2 (distance + proximity): `distance · proximity`  e.g. "0.4 mi · In your area"
 *
 * Returns:
 *   - primary:   a single string composed of [descriptor, locality] joined
 *     by ` · ` (Unicode middot U+00B7), empty segments dropped via
 *     `.filter(Boolean)` so there are no orphan separators.
 *   - distance:  the compact distance string ("0.4 mi") passed through, or
 *     '' when unknown. Rendered as the leading segment of line 2.
 *   - proximity: the per-band human-friendly clause OR null for NEARBY /
 *     null / undefined / unknown bands. Returned separately so the consumer
 *     can render it as a nested <Text> child carrying the band-specific
 *     semantic colour (sage / amber / brand-rose per PR #126 v1.8 lock).
 *
 * WHY two lines (replaces the Batch-1B single-line compose): on the dense
 * fixed-width rail cards, `descriptor · locality` alone consumes ~85–100%
 * of the line, so a single-line `descriptor · locality · distance ·
 * proximity` always tail-truncated the proximity clause (the highest-value
 * semantic) right off-screen. Splitting distance + proximity onto their
 * own short line guarantees the proximity clause is always visible and
 * sits visually adjacent to the distance it qualifies. The compact "mi"
 * distance (see `formatDistanceCompact`) keeps line 2 short enough that
 * even "Nearest match on Redeemo" never truncates.
 *
 * Each line is rendered `numberOfLines={1}`; line 1 may still tail-ellipsis
 * a very long descriptor/locality, but that NEVER starves line 2 — distance
 * and proximity live on their own protected line. The §DH descriptor →
 * locality composition order is the locked product-rule baseline.
 */

import type { ProximityBand } from '@/lib/api/discovery'

export type InfoLineInput = {
  descriptor: string
  locality:   string
  distance:   string
  band:       ProximityBand | null | undefined
}

export type InfoLineOutput = {
  primary:   string
  distance:  string
  proximity: string | null
}

const BAND_LABEL: Record<ProximityBand, string | null> = {
  NEARBY:             null,
  IN_YOUR_AREA:       'In your area',
  A_LITTLE_FURTHER:   'A short trip away',
  NEAREST_ON_REDEEMO: 'Nearest match on Redeemo',
}

export function composeInfoLine(input: InfoLineInput): InfoLineOutput {
  const primary   = [input.descriptor, input.locality].filter(Boolean).join(' · ')
  const distance  = input.distance
  const proximity = input.band == null ? null : BAND_LABEL[input.band] ?? null
  return { primary, distance, proximity }
}
