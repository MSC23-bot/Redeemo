// Map Phase 2 Slice S3 (pin v2, 2026-07-10) — name-chip density gating
// unit coverage. Two independent gates (zoom threshold, visible-count
// threshold) + a greedy nearest-first declutter pass.

import {
  selectChipCandidates,
  CHIP_ZOOM_LATITUDE_DELTA_THRESHOLD,
  CHIP_MAX_VISIBLE_SINGLES,
  CHIP_MIN_SEPARATION_FRACTION,
  type ChipGatePoint,
} from '@/features/map/utils/mapNameChipGate'
import type { ClusterRegion } from '@/features/map/utils/mapClustering'

const CLOSE_REGION: ClusterRegion = {
  latitude:       51.5074,
  longitude:      -0.1278,
  latitudeDelta:  CHIP_ZOOM_LATITUDE_DELTA_THRESHOLD - 0.01, // comfortably under the gate
  longitudeDelta: CHIP_ZOOM_LATITUDE_DELTA_THRESHOLD - 0.01,
}

const WIDE_REGION: ClusterRegion = {
  ...CLOSE_REGION,
  latitudeDelta:  CHIP_ZOOM_LATITUDE_DELTA_THRESHOLD + 0.01, // over the gate
  longitudeDelta: CHIP_ZOOM_LATITUDE_DELTA_THRESHOLD + 0.01,
}

function point(id: string, latitude: number, longitude: number): ChipGatePoint {
  return { id, latitude, longitude }
}

describe('selectChipCandidates', () => {
  it('returns empty when the viewport is zoomed out past the threshold, even with few pins', () => {
    const result = selectChipCandidates(
      [point('a', 51.5074, -0.1278)],
      WIDE_REGION,
    )
    expect(result).toEqual([])
  })

  it('returns empty when there are zero singles', () => {
    expect(selectChipCandidates([], CLOSE_REGION)).toEqual([])
  })

  it('returns empty when the visible-count threshold is exceeded, even at close zoom', () => {
    const many = Array.from({ length: CHIP_MAX_VISIBLE_SINGLES + 1 }, (_, i) =>
      point(`p${i}`, 51.5074 + i * 0.05, -0.1278 + i * 0.05), // far apart, no overlap concerns
    )
    expect(selectChipCandidates(many, CLOSE_REGION)).toEqual([])
  })

  it('returns a chip for a single well-separated pin at close zoom', () => {
    const result = selectChipCandidates([point('a', 51.5074, -0.1278)], CLOSE_REGION)
    expect(result.map(r => r.id)).toEqual(['a'])
  })

  it('returns chips for all pins at close zoom, at/under the count threshold, when well separated', () => {
    const pts = Array.from({ length: CHIP_MAX_VISIBLE_SINGLES }, (_, i) =>
      point(`p${i}`, 51.5074 + i * 0.1, -0.1278 + i * 0.1),
    )
    const result = selectChipCandidates(pts, CLOSE_REGION)
    expect(result).toHaveLength(CHIP_MAX_VISIBLE_SINGLES)
  })

  it('dedupe: drops a candidate that would overlap an already-accepted chip', () => {
    // Two pins within the min-separation fraction of each other.
    const delta = CLOSE_REGION.latitudeDelta * (CHIP_MIN_SEPARATION_FRACTION / 2)
    const result = selectChipCandidates(
      [point('near-centre', 51.5074, -0.1278), point('too-close', 51.5074 + delta, -0.1278)],
      CLOSE_REGION,
    )
    expect(result).toHaveLength(1)
  })

  it('keeps both chips when pins are well beyond the min-separation fraction', () => {
    const delta = CLOSE_REGION.latitudeDelta * (CHIP_MIN_SEPARATION_FRACTION * 3)
    const result = selectChipCandidates(
      [point('a', 51.5074, -0.1278), point('b', 51.5074 + delta, -0.1278)],
      CLOSE_REGION,
    )
    expect(result).toHaveLength(2)
  })

  it('prioritises pins nearest the viewport centre when declutter drops others', () => {
    const centre = { latitude: CLOSE_REGION.latitude, longitude: CLOSE_REGION.longitude }
    const tinyDelta = CLOSE_REGION.latitudeDelta * (CHIP_MIN_SEPARATION_FRACTION / 4)
    // 'far' sits exactly at the centre; 'near' and 'nearer' cluster
    // right next to it (both within min-separation of 'far', and of
    // each other), so only ONE of the three should survive: the one
    // closest to the viewport centre, i.e. 'far' itself.
    const result = selectChipCandidates(
      [
        point('far', centre.latitude, centre.longitude),
        point('near', centre.latitude + tinyDelta, centre.longitude),
        point('nearer', centre.latitude + tinyDelta / 2, centre.longitude),
      ],
      CLOSE_REGION,
    )
    expect(result.map(r => r.id)).toEqual(['far'])
  })

  it('is deterministic: repeated calls with the same input return the same subset', () => {
    const pts = [point('a', 51.5074, -0.1278), point('b', 51.60, -0.20)]
    const first = selectChipCandidates(pts, CLOSE_REGION)
    const second = selectChipCandidates(pts, CLOSE_REGION)
    expect(first.map(r => r.id)).toEqual(second.map(r => r.id))
  })
})
