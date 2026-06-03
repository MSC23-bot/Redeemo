/**
 * Pure-function composition helper for the shared <BranchTile> info hierarchy.
 *
 * Layout C (2026-06-02 design pass) — the info area reads as THREE lines
 * beneath the merchant name, so location stops looking like a run-on:
 *
 *   line 1 (descriptor):  what it is        e.g. "Indian Restaurant"
 *   line 2 (where):       locality · distance, with a pin icon (rendered by
 *                         the consumer)      e.g. "◎ Brightlingsea · 0.4 mi"
 *   line 3 (proximity):   the per-band clause, carrying its semantic colour
 *                         (rendered by the consumer)  e.g. "In your area"
 *
 * Returns the atomic parts so the consumer can render the pin icon inline on
 * line 2 and apply the band colour to line 3:
 *   - descriptor: the category/subcategory descriptor, or '' when unknown.
 *   - locality:   the branch locality string, or '' when unknown.
 *   - distance:   the compact distance ("0.4 mi"), or '' when unknown.
 *   - proximity:  the per-band human clause, or null for NEARBY / null / unknown.
 *
 * WHY three lines (replaces the Layout-B two-line `descriptor · locality` /
 * `distance · proximity`): welding the descriptor to the locality with a
 * middot read as a run-on and buried the "where". Giving the descriptor,
 * the location (locality + distance, with a pin), and the proximity clause
 * each their own line makes the hierarchy legible — what it is, where it is,
 * how near. Each line is rendered `numberOfLines={1}` by the consumer.
 */

import type { ProximityBand } from '@/lib/api/discovery'

export type InfoLineInput = {
  descriptor: string
  locality:   string
  distance:   string
  band:       ProximityBand | null | undefined
}

export type InfoLineOutput = {
  descriptor: string
  locality:   string
  distance:   string
  proximity:  string | null
}

const BAND_LABEL: Record<ProximityBand, string | null> = {
  NEARBY:             null,
  IN_YOUR_AREA:       'In your area',
  A_LITTLE_FURTHER:   'A short trip away',
  NEAREST_ON_REDEEMO: 'Nearest match on Redeemo',
}

export function composeInfoLine(input: InfoLineInput): InfoLineOutput {
  return {
    descriptor: input.descriptor,
    locality:   input.locality,
    distance:   input.distance,
    proximity:  input.band == null ? null : BAND_LABEL[input.band] ?? null,
  }
}

/**
 * Joins the location line (locality + distance) with a middot, dropping empty
 * segments so there are no orphan separators. The consumer renders the pin
 * icon before this string. Exposed for the consumer + unit tests.
 */
export function composeWhereLine(locality: string, distance: string): string {
  return [locality, distance].filter(Boolean).join(' · ')
}
