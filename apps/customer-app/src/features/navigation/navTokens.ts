// Calm branded shelf bottom-nav tokens (Option B, 2026-06-06; warmed + icon
// correction per device QA).
//
// Local constants so values aren't raw literals in `app/(app)/_layout.tsx`
// (that file is under the `screens` no-raw-tokens rule; this file is exempt).
// The nav keeps the existing 80px footprint + bottom positioning (defined in
// _layout) — these are the shelf/label/indicator/icon treatment values.

import { color } from '@/design-system/tokens'

/** Bar height. Nudged up from the original 80 (owner: "a little bit bigger") so
 *  the larger icon + label + indicator get more breathing room and don't hug the
 *  top edge. react-navigation reserves the safe-area inset on top of this. */
export const NAV_BAR_HEIGHT = 90

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

/** Tab icon size. Bumped to the bespoke icons' native 24 grid (owner: icons
 *  read a bit small at 20) so they render 1:1 and crisp. */
export const NAV_ICON_SIZE = 24

/** Stroke width for the inactive outline glyph (authored on the 24 grid;
 *  scales with the icon's viewBox). Round caps/joins give the friendly feel. */
export const NAV_OUTLINE_STROKE = 2

/** Tab label type. An EXPLICIT lineHeight is load-bearing: without it RN uses
 *  Lato's default ~1.5x line box, which pushes icon + label past the content
 *  budget on notch devices and clips the label. 15 clears the 'g' descender
 *  (Savings) at 12pt. The label also uses adjustsFontSizeToFit so the longest
 *  label (Favourites) shrinks rather than truncates on the narrowest devices. */
export const NAV_LABEL_FONT_SIZE = 12
export const NAV_LABEL_LINE_HEIGHT = 15
export const NAV_LABEL_TRACKING = 0.2

/** Small rounded brand-gradient active indicator (capsule) above the active icon.
 *  Slightly longer than the old 22 (owner: make the active line longer) — reads
 *  a touch wider than the icon as a deliberate active marker. */
export const NAV_INDICATOR_W = 28
export const NAV_INDICATOR_H = 4
