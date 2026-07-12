import React, { memo, useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Marker } from 'react-native-maps'
import Svg, { Path, Line } from 'react-native-svg'
import { Text, color, elevation } from '@/design-system'
import { formatGbpCompact } from '@/design-system/utils/formatters'
import { getCategoryPinGlyph } from '../utils/categoryPinGlyph'

// Map Phase 2 Slice S3 (pin v2, owner-approved Option A, 2026-07-10),
// reworked into the TICKET LOCKUP by Map P2 W2a (owner decisions
// W2-D2 + W2-D6, board direction 2026-07-12) —
//
// the close-zoom label beside a pin is no longer a plain name pill; it is
// the "unfolded ticket" that the whole map system is themed around. It
// carries, in one white rounded card that visibly POINTS at its pin:
//   - a full-height LEFT icon block in the branch's category colour (the
//     SAME resolved colour the pin teardrop uses), with the category glyph;
//   - the branch name on line 1 (name without pin context "becomes
//     irrelevant" — owner F8);
//   - "Save £X" and, side by side beneath the name, the voucher count laid
//     out as a red ticket mark + the WORD "vouchers" (never a bare figure —
//     W2-D2/D6: pins carry no count at all, so the count only ever appears
//     here, always explained).
//
// Shown density-gated in a sparse viewport (see `mapNameChipGate.ts`).
//
// ── Marker-bitmap discipline (LOCKED — preserved byte-for-byte) ──────────
//
// Rendered as a SEPARATE, mostly-frozen Marker (per the S3 brief's explicit
// "separate frozen label markers" option) rather than as extra content
// inside the pin's own Marker: appending it to <CustomPin> would require
// growing that marker's outer bounds per-chip-visibility, violating the
// §BF constant-outer-bounds contract. A standalone marker sidesteps that —
// its OWN bounds are simply constant for its OWN lifetime.
//
// This marker's outer bounds ARE constant for its lifetime: the card has a
// FIXED height (`CARD_HEIGHT`, tall enough for name + meta whether or not
// the meta row is present — a name-only card centres its single line) and a
// FIXED maxWidth (`CARD_MAX_WIDTH`); nothing about selection or hover
// changes them (chips have no selected state). The geometry constants are
// documented below.
//
// Unlike S3's original name pill (whose content — name + category colour —
// was static for a branch's lifetime, so it captured ONCE on mount and
// froze for good), the lockup's meta row (Save £X / voucher count) CAN
// change after mount when a tile refetches (the accumulation store replaces
// a tile's branches with freshly parsed objects; the merchant's
// `voucherCount` / `maxEstimatedSaving` can move). So this mirrors the
// pins' W1.1 content-change re-track pattern: the `tracksViewChanges`
// window RE-OPENS whenever the visible content changes (label / pinColor /
// glyphName / maxEstimatedSaving / voucherCount), letting the frozen bitmap
// recapture cleanly instead of showing stale content or teleporting. The
// freeze window duplicates MapPins.tsx's `SELECTION_TRACK_MS` (1000ms, §BI)
// — see that file's header; duplicated rather than imported for the same
// module-scope-decoupling reason documented in MapClusterMarker.tsx.
const CHIP_TRACK_MS = 1000

// Map P2 W1 (F3 + F4) revised by W1.1 (F15, 2026-07-12) — chip tether
// geometry. PRESERVED UNCHANGED by W2a (the ticket lockup is bigger than
// the old pill, but it grows UPWARD; its downward-pointing tail tip lands
// at the SAME tether point the old pill's bottom did, so the F15 lift is
// untouched and its geometry tests still hold).
//
// The chip is a SEPARATE Marker at the SAME coordinate as the pin, both
// bottom-anchored (react-native-maps default `{x:0.5,y:1}`), so both are
// horizontally centred on the coordinate and rise upward from it. The
// lockup's own bottom-most element is the pointer TAIL tip; lifting the
// whole content by `CHIP_LIFT` places that tail tip just above the pin's
// visible resting head (the F15 tether), so the tail visibly points at the
// pin and the card body sits above it.
//
// Derivation (container coords, y grows downward; the pin container is
// 60x63 with the teardrop tip at the bottom-centre anchor):
//   TEARDROP_TOP     = CONTAINER_HEIGHT - PIN_HEIGHT = 63 - 54 = 9
//   wrapper centre y = TEARDROP_TOP + PIN_HEIGHT / 2 = 9 + 27  = 36
//   (RN `transform: scale` scales a view about its OWN centre)
//   scaled head top y = centre + (top - centre) * scale
//                     = 36 + (9 - 36) * 0.81 = 14.13
// The tail tip sits CHIP_GAP_ABOVE_HEAD above that, at container
// y = 14.13 - 6 = 8.13, so the lift from the anchor is
// CONTAINER_HEIGHT - 8.13 = 54.87. (Constants duplicated from MapPins.tsx
// for the same module-scope-decoupling reason CHIP_TRACK_MS is duplicated.)
const PIN_CONTAINER_HEIGHT    = 63
const PIN_HEIGHT              = 54
const PIN_TEARDROP_TOP        = PIN_CONTAINER_HEIGHT - PIN_HEIGHT // 9
const PIN_INNER_SCALE_RESTING = 0.81
const PIN_WRAP_CENTER_Y       = PIN_TEARDROP_TOP + PIN_HEIGHT / 2 // 36
// Exported for the F15 geometry tests (not part of the runtime API).
export const PIN_SCALED_HEAD_TOP =
  PIN_WRAP_CENTER_Y + (PIN_TEARDROP_TOP - PIN_WRAP_CENTER_Y) * PIN_INNER_SCALE_RESTING // 14.13
export const PIN_SELECTED_HEAD_TOP = PIN_TEARDROP_TOP // scale 1: head top = teardrop top
export const CHIP_GAP_ABOVE_HEAD = 6
export const CHIP_LIFT = PIN_CONTAINER_HEIGHT - PIN_SCALED_HEAD_TOP + CHIP_GAP_ABOVE_HEAD // 54.87
export const PIN_CONTAINER_HEIGHT_FOR_TESTS = PIN_CONTAINER_HEIGHT

// ── Ticket-lockup geometry constants (constant outer bounds) ────────────
// The card's HEIGHT is fixed regardless of whether the meta row renders
// (name-only cards centre their single line), and its WIDTH is capped at
// CARD_MAX_WIDTH (it flexes to the longer of name / meta, but never past
// the cap — `numberOfLines={1}` ellipsizes). Both are constant for a given
// marker's lifetime, honouring the §BF constant-outer-bounds discipline.
const CARD_MAX_WIDTH  = 230
const CARD_HEIGHT     = 46
const CARD_RADIUS     = 12
const ICON_BLOCK_W    = 32
const GLYPH_SIZE      = 14
const TAIL_W          = 14
const TAIL_H          = 7
// The tail sits under the card's centre-left (roughly beneath the name),
// pointing down at the pin.
const TAIL_LEFT       = ICON_BLOCK_W + 6

// Tiny ticket silhouette (brand red): a rounded rectangle with a concave
// notch cut into each of the left and right mid-edges — the universal
// voucher/ticket-stub shape. Self-contained (a single filled Path), so it
// reads correctly on any background. Drawn clockwise (y grows downward);
// convex corners use sweep-flag 1, the concave notches use sweep-flag 0.
function buildTicketPath(w: number, h: number): string {
  const c  = 1.5      // corner radius
  const n  = 1.6      // notch radius
  const my = h / 2    // mid height
  return [
    `M${c},0`,
    `H${w - c}`,
    `A${c},${c} 0 0 1 ${w},${c}`,          // top-right corner
    `V${my - n}`,
    `A${n},${n} 0 0 0 ${w},${my + n}`,     // right notch (concave)
    `V${h - c}`,
    `A${c},${c} 0 0 1 ${w - c},${h}`,      // bottom-right corner
    `H${c}`,
    `A${c},${c} 0 0 1 0,${h - c}`,         // bottom-left corner
    `V${my + n}`,
    `A${n},${n} 0 0 0 0,${my - n}`,        // left notch (concave)
    `V${c}`,
    `A${c},${c} 0 0 1 ${c},0`,             // top-left corner
    'Z',
  ].join(' ')
}
const TICKET_W = 15
const TICKET_H = 10
const TICKET_PATH = buildTicketPath(TICKET_W, TICKET_H)

// Downward-pointing tail triangle (white), so the lockup visibly points at
// its pin. A single filled Path (Polygon isn't used elsewhere in this app;
// Path is).
const TAIL_PATH = `M0,0 H${TAIL_W} L${TAIL_W / 2},${TAIL_H} Z`

type Props = {
  id: string
  latitude: number
  longitude: number
  /** Branch name — line 1 of the lockup. */
  label: string
  /**
   * Map P2 W2a — the resolved category colour, the SAME value the pin
   * teardrop uses (computed by <MapPins> via `resolvePinColorWithTree`,
   * so a subcategory-primary branch inherits its top-level colour even
   * when the backend hasn't merged the parent-fallback yet). Fills the
   * full-height left icon block. (Was `dotColor` on the S3 name pill's
   * small colour dot; renamed to `pinColor` now it drives the whole
   * icon block and to match the pin's own prop name.)
   */
  pinColor: string
  /**
   * Resolved TOP-LEVEL category name for glyph selection — the SAME value
   * <MapPins> feeds the pin (client-side category-tree walk; never a wire
   * field). Optional: degrades to the default map-pin glyph when absent
   * (categories query not yet loaded / direct test renders).
   */
  glyphName?: string | null
  /**
   * The branch's best available saving (`merchant.maxEstimatedSaving`, the
   * SAME field `<BranchTile>`'s default `savingsDisplay="max"` reads),
   * formatted via the same `formatGbpCompact` util so "Save £X" matches
   * the app-wide compact-currency convention exactly. `null`/`undefined`/
   * `0` (no active saving) omits the "Save £X" fragment.
   */
  maxEstimatedSaving?: number | null
  /**
   * Map P2 W2a (W2-D2/D6) — the merchant's active voucher count. Rendered
   * ONLY here (pins carry no count), ONLY when > 0, and NEVER as a bare
   * figure: it is always preceded by the red ticket mark and followed by
   * the word "voucher(s)". `0`/absent omits the voucher fragment.
   */
  voucherCount?: number | null
}

// Map P2 W1 (F1, 2026-07-12) — memoized. Name/ticket lockups are
// mostly-frozen Markers too (tracksViewChanges settles false), so the same
// iOS "frozen annotation re-renders -> teleports to origin" hazard that hit
// the pins applies here. Every prop is a value-stable primitive (no
// function props), so a custom comparator (mirroring the pin's W1.1
// primitive-field comparator, kept in lockstep with the re-track effect
// below) lets a lockup that stays on screen bail out of a pure pan/zoom
// re-render and never teleport. A lockup only re-renders when it genuinely
// enters/leaves the density-gated candidate set OR its visible content
// changes (a tile refetch moving the saving / voucher count).
function MapNameChipMarkerBase({
  id, latitude, longitude, label, pinColor, glyphName, maxEstimatedSaving, voucherCount,
}: Props) {
  const saveLabel = maxEstimatedSaving != null && maxEstimatedSaving > 0
    ? formatGbpCompact(maxEstimatedSaving)
    : null
  const count = voucherCount != null && voucherCount > 0 ? voucherCount : 0
  const hasMeta = saveLabel != null || count > 0
  const Glyph = getCategoryPinGlyph(glyphName ?? null)

  const [tracks, setTracks] = useState(true)
  useEffect(() => {
    // Re-open the capture window on mount AND whenever the VISIBLE content
    // changes (mirrors MapPins' MapPinMarker track-reopen effect; kept in
    // lockstep with the memo comparator's compared fields). A tile refetch
    // that changes the saving / voucher count recaptures the frozen bitmap
    // cleanly instead of leaving stale content or teleporting the marker.
    setTracks(true)
    const t = setTimeout(() => setTracks(false), CHIP_TRACK_MS)
    return () => clearTimeout(t)
  }, [label, pinColor, glyphName, maxEstimatedSaving, voucherCount])

  return (
    <Marker
      identifier={`chip:${id}`}
      coordinate={{ latitude, longitude }}
      tracksViewChanges={tracks}
      // Lockups are decorative labels, not tap targets — taps pass through
      // to the pin underneath. `anchor` keeps the SAME coordinate-to-content
      // relationship as an ordinary pin (bottom-anchored); the visual lift
      // above the pin happens via the inline transform below.
    >
      <View testID={`map-name-chip-${id}`} style={styles.offsetWrap}>
        <View style={styles.card}>
          <View style={[styles.iconBlock, { backgroundColor: pinColor }]}>
            <Glyph size={GLYPH_SIZE} color="#FFFFFF" strokeWidth={2.4} />
          </View>
          <View style={styles.body}>
            <Text
              variant="label.md"
              numberOfLines={1}
              style={styles.name}
              testID={`map-name-chip-name-${id}`}
            >
              {label}
            </Text>
            {hasMeta ? (
              <View style={styles.metaRow}>
                {saveLabel ? (
                  <Text
                    variant="label.md"
                    numberOfLines={1}
                    style={styles.saveLabel}
                    testID={`map-name-chip-save-${id}`}
                  >
                    {`Save ${saveLabel}`}
                  </Text>
                ) : null}
                {count > 0 ? (
                  <>
                    {saveLabel ? (
                      // Perforation divider (dashed, faint navy) — the
                      // "tear here" line of the ticket, separating the
                      // saving from the voucher count.
                      <Svg
                        width={2}
                        height={14}
                        style={styles.perforation}
                        testID={`map-name-chip-perforation-${id}`}
                      >
                        <Line
                          x1={1} y1={0} x2={1} y2={14}
                          stroke="rgba(1,12,53,0.18)"
                          strokeWidth={2}
                          strokeDasharray="2 2"
                        />
                      </Svg>
                    ) : null}
                    <Svg
                      width={TICKET_W}
                      height={TICKET_H}
                      style={styles.ticketMark}
                      testID={`map-name-chip-ticket-${id}`}
                    >
                      <Path d={TICKET_PATH} fill={color.brandRose} />
                    </Svg>
                    <Text
                      variant="label.md"
                      numberOfLines={1}
                      style={styles.vouchers}
                      testID={`map-name-chip-vouchers-${id}`}
                    >
                      {count === 1 ? '1 voucher' : `${count} vouchers`}
                    </Text>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.tailWrap} pointerEvents="none">
          <Svg width={TAIL_W} height={TAIL_H}>
            <Path d={TAIL_PATH} fill="#FFFFFF" />
          </Svg>
        </View>
      </View>
    </Marker>
  )
}

export const MapNameChipMarker = memo(
  MapNameChipMarkerBase,
  // Compared fields are exactly the ways this marker can change its bitmap
  // (no tap target — lockups are non-interactive). In lockstep with the
  // track-reopen effect above. All are value-stable primitives, so a pure
  // pan/zoom re-render of <MapPins> bails out here.
  (prev, next) =>
    prev.id === next.id &&
    prev.latitude === next.latitude &&
    prev.longitude === next.longitude &&
    prev.label === next.label &&
    prev.pinColor === next.pinColor &&
    prev.glyphName === next.glyphName &&
    prev.maxEstimatedSaving === next.maxEstimatedSaving &&
    prev.voucherCount === next.voucherCount,
)

const styles = StyleSheet.create({
  // Centre the lockup over the pin (translateX 0, so it grows symmetrically
  // for any name length) and lift it so its TAIL TIP sits CHIP_GAP_ABOVE_HEAD
  // above the visible resting head top (full derivation in the CHIP_LIFT
  // comment above) — a tight, tethered lockup that points at the pin head.
  offsetWrap: {
    alignItems: 'flex-start',
    transform:  [{ translateY: -CHIP_LIFT }],
  },
  card: {
    flexDirection:   'row',
    alignItems:      'stretch',
    height:          CARD_HEIGHT,
    maxWidth:        CARD_MAX_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius:    CARD_RADIUS,
    overflow:        'hidden',
    ...elevation.sm,
  },
  iconBlock: {
    width:          ICON_BLOCK_W,
    alignItems:     'center',
    justifyContent: 'center',
  },
  body: {
    flexShrink:        1,
    justifyContent:    'center',
    paddingHorizontal: 9,
    paddingVertical:   6,
    gap:               2,
  },
  name: {
    color:      color.navy,
    fontFamily: 'Lato-Bold',
    fontSize:   12.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
  },
  // Map Phase 2 S5b Task 4b — SAME Mustica green (#15803D) as
  // `<BranchTile>`'s `valueSave`/`savingAmount` styles and Home's
  // NearbyCard/PopularCard — one consistent "saving" colour app-wide, not a
  // fresh token — so the saving reads as a distinct, positive fact.
  saveLabel: {
    color:      '#15803D',
    fontFamily: 'Lato-Bold',
    fontSize:   11,
  },
  perforation: {
    marginHorizontal: 1,
  },
  ticketMark: {
    // Nudge the ticket mark to sit on the text baseline.
    marginTop: 0.5,
  },
  // Design-system secondary text token (#4B5563) — the count reads as
  // supporting metadata beneath the name, never a bare figure (it is always
  // preceded by the red ticket mark and carries the word "voucher(s)").
  vouchers: {
    color:      color.text.secondary,
    fontFamily: 'Lato-Bold',
    fontSize:   10.5,
  },
  tailWrap: {
    marginLeft: TAIL_LEFT,
    marginTop:  -0.5, // overlap the card edge by a hair so no seam shows
  },
})
