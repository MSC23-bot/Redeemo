// Calm branded shelf bottom-nav tokens (Option B, 2026-06-06).
//
// Local constants so values aren't raw literals in `app/(app)/_layout.tsx`
// (that file is under the `screens` no-raw-tokens lint rule). The nav keeps the
// existing 80px footprint + bottom positioning (defined inline in _layout) —
// these are the shelf/label/indicator treatment values.

/** Warm off-white shelf surface — a hair brighter than the #FFF9F5 body so the
 *  shelf reads as a distinct elevated surface. Non-floating, full-width. */
export const NAV_SHELF_BG = '#FFFDFB'
/** Warm-ink for inactive icon + label (matches color.text.secondary). */
export const NAV_INK = '#4B5563'

/** Tab label type. */
export const NAV_LABEL_FONT_SIZE = 11
export const NAV_LABEL_TRACKING = 0.1

/** Small active indicator (a short brand-gradient pill above the active icon, M2). */
export const NAV_INDICATOR_W = 16
export const NAV_INDICATOR_H = 3
