// Calm branded shelf bottom-nav tokens (Option B, 2026-06-06; warmed per device QA).
//
// Local constants so values aren't raw literals in `app/(app)/_layout.tsx`
// (that file is under the `screens` no-raw-tokens rule). The nav keeps the
// existing 80px footprint + bottom positioning (defined in _layout) — these are
// the shelf/label/indicator treatment values.

/** Warm light-PEACH shelf surface (owner: pure white read too stark / iOS-default).
 *  A premium warm shelf sitting between the red header and the cream body — light
 *  and calm, never red, quieter than the header. */
export const NAV_SHELF_BG = '#FCEFE6'
/** Faint warm/brand-tinted top hairline (ties the shelf to the header). */
export const NAV_HAIRLINE = 'rgba(190,10,3,0.14)'
/** Warm ink for inactive icon + label (owner: warm, NOT cool grey). */
export const NAV_INK = '#5C4A43'

/** Tab label type. */
export const NAV_LABEL_FONT_SIZE = 11
export const NAV_LABEL_TRACKING = 0.1

/** Small brand-gradient active indicator above the active icon. */
export const NAV_INDICATOR_W = 18
export const NAV_INDICATOR_H = 3
