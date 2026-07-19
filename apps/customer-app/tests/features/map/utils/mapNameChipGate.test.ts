// Map Phase 2 Slice S3 (pin v2, 2026-07-10) — name-chip density gating
// unit coverage. Two independent gates (zoom threshold, visible-count
// threshold) + a greedy nearest-first declutter pass.
//
// W2a round 2 (owner direction 2026-07-13) — thresholds LOOSENED: zoom
// gate 0.03 -> 0.10 latitude delta (town-level; the ticket lockup is the
// map's primary information layer, not a close-zoom garnish) and count
// cap 8 -> 10. The declutter pass is UNCHANGED and carries more weight at
// the wider zoom (the honesty valve for dense areas) — pinned by the
// dedicated town-level declutter test below. Most assertions here are
// written relative to the exported constants, so they gate-check the new
// values automatically; the two explicit value pins live at the bottom.

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

  // ── W2a round 2 (owner direction 2026-07-13) ──────────────────────────

  it('W2a-R2: lockups show at a town-level zoom (~0.09 latitude delta, the owner Huddersfield case)', () => {
    // Pre-round-2 (threshold 0.03) this viewport returned [] — the exact
    // "I shouldn't have to zoom really close" complaint. Town-level zoom
    // now passes the gate.
    const townRegion: ClusterRegion = {
      latitude: 53.6458, longitude: -1.7850, // Huddersfield
      latitudeDelta: 0.09, longitudeDelta: 0.09,
    }
    const result = selectChipCandidates([point('a', 53.6458, -1.7850)], townRegion)
    expect(result.map(r => r.id)).toEqual(['a'])
  })

  it('W2a-R2: the UNCHANGED declutter pass still drops overlapping candidates at the wider town-level zoom (honesty valve)', () => {
    const townRegion: ClusterRegion = {
      latitude: 53.6458, longitude: -1.7850,
      latitudeDelta: 0.09, longitudeDelta: 0.09,
    }
    // Two pins within the min-separation fraction of THIS wider viewport:
    // at town zoom that is a real-world gap of ~0.005deg latitude, i.e.
    // pins that would sit on top of each other on screen. Only the one
    // nearer the viewport centre keeps its lockup.
    const delta = townRegion.latitudeDelta * (CHIP_MIN_SEPARATION_FRACTION / 2)
    const result = selectChipCandidates(
      [point('at-centre', 53.6458, -1.7850), point('too-close', 53.6458 + delta, -1.7850)],
      townRegion,
    )
    expect(result.map(r => r.id)).toEqual(['at-centre'])
  })

  it('W2a-R2: explicit value pins — zoom gate 0.10, count cap 10 (owner direction 2026-07-13)', () => {
    // Pinned so a future "tune for density" pass cannot silently re-tighten
    // the gate below the owner-directed leniency (or loosen it further)
    // without a deliberate, documented change here.
    expect(CHIP_ZOOM_LATITUDE_DELTA_THRESHOLD).toBe(0.10)
    expect(CHIP_MAX_VISIBLE_SINGLES).toBe(10)
  })
})
