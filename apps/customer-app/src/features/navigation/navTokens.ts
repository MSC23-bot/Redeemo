// Calm branded shelf bottom-nav tokens (Option B, 2026-06-06; warmed + icon
// correction per device QA).
//
// Local constants so values aren't raw literals in `app/(app)/_layout.tsx`
// (that file is under the `screens` no-raw-tokens rule; this file is exempt).
// The nav keeps the existing 80px footprint + bottom positioning (defined in
// _layout) — these are the shelf/label/indicator/icon treatment values.

import { color } from '@/design-system/tokens'

/** Warm light-PEACH shelf surface (owner: pure white read too stark / iOS-default).
 *  A premium warm shelf sitting between the red header and the cream body — light
 *  and calm, never red, quieter than the header. */
export const NAV_SHELF_BG = '#FCEFE6'
/** Faint warm/brand-tinted top hairline (ties the shelf to the header). */
export const NAV_HAIRLINE = 'rgba(190,10,3,0.14)'

/** Inactive icon + label — the brand SECONDARY colour (navy #010C35). Active
 *  still out-emphasises it via the filled gradient icon + the indicator capsule
 *  + the brand-red label + the outline→filled weight jump, so navy here reads as
 *  the calm secondary state, not competing with active. ~17:1 on the peach. */
export const NAV_INK = color.navy
/** Active LABEL — a slightly deeper brand red than brandRose so 11px label text
 *  clears WCAG AA (4.5:1) on the peach shelf; harmonises with the brand-gradient
 *  glyph + indicator above it. (brandRose #E20C04 is only ~3.6:1 at this size.) */
export const NAV_ACTIVE_INK = '#BE0A03'

/** Tab icon size. Slightly smaller than the old 22 so the icon + label both sit
 *  comfortably in the 80px bar once the safe-area inset is reserved below. */
export const NAV_ICON_SIZE = 20

/** Stroke width for the inactive outline glyph (authored on the 24 grid;
 *  scales with the icon's viewBox). Round caps/joins give the friendly feel. */
export const NAV_OUTLINE_STROKE = 2

/** Tab label type. An EXPLICIT lineHeight is load-bearing: without it RN uses
 *  Lato's default ~1.5x line box (~16px at 11pt), which pushes icon + label
 *  past the ~38px content budget on notch devices and clips the label to
 *  near-invisibility. 14 clears the 'g' descender (Savings) while fitting. */
export const NAV_LABEL_FONT_SIZE = 11
export const NAV_LABEL_LINE_HEIGHT = 14
export const NAV_LABEL_TRACKING = 0.1

/** Small rounded brand-gradient active indicator (capsule) above the active icon. */
export const NAV_INDICATOR_W = 22
export const NAV_INDICATOR_H = 4
