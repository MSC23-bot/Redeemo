import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react-native'
import {
  Utensils, Scissors, Stethoscope, Dumbbell, Compass, ShoppingBag,
  Home, Plane, Baby, Car, PawPrint, MapPin,
} from '@/design-system/icons'

// Map Phase 2 Slice S3 (pin v2, owner-approved Option A, 2026-07-10) —
// category pin glyph matcher.
//
// Mirrors the MATCHING APPROACH of
// `src/features/home/components/RailHeader.tsx` CATEGORY_ICONS: an
// ordered array of `{ match, icon }` entries, cascaded with
// `.find()`, falling through to a default glyph for anything
// unmatched. `medical` is checked BEFORE `health` for the same reason
// RailHeader orders it first — "Health & Medical" also contains
// "health", so a naive single-pass match would wrongly grab the
// Health & Fitness icon.
//
// UNLIKE RailHeader (which renders brand-gradient-tinted PNGs sized to
// sit next to a title), pins need a flat WHITE stroke-style glyph at a
// small fixed size sitting on a solid colour-filled teardrop — so this
// uses the app's existing lucide icon system (already the sanctioned
// icon source per `.claude/rules/customer-app.md`: "lucide icons
// import via the `src/design-system/icons.ts` barrel") rather than
// hand-authoring new SVG path data for ~11 glyphs. Lucide icons are
// themselves SVG (react-native-svg) and accept `color`/`strokeWidth`,
// satisfying the brief's "white stroke-style category icon" anatomy
// with lower maintenance risk than bespoke path strings.
//
// `Category.pinIcon` (schema field) is NOT read here — it's believed
// unused/null in the current seed (task brief). This matcher is the
// interim client-side resolution; `pinIcon` remains the documented
// FUTURE hook for an admin-driven icon key once that pipeline exists
// (out of scope for this slice — no remote-icon pipeline is built).
//
// Matches against a TOP-LEVEL category name (branch.merchant
// .primaryCategory.topLevelName — see the S3 backend addendum in
// service.ts `enrichBranchTile`), NOT the raw subcategory name: a
// subcategory like "Pizza Restaurant" won't reliably contain a
// top-level keyword like "food"/"drink".

export type PinGlyphIcon = ComponentType<LucideProps>

type GlyphEntry = { match: (n: string) => boolean; icon: PinGlyphIcon }

const CATEGORY_PIN_GLYPHS: GlyphEntry[] = [
  { match: (n) => n.includes('food') || n.includes('drink'), icon: Utensils },
  { match: (n) => n.includes('beauty') || n.includes('wellness'), icon: Scissors },
  // 'medical' MUST precede 'health' — see header comment.
  { match: (n) => n.includes('medical'), icon: Stethoscope },
  { match: (n) => n.includes('health') || n.includes('fitness'), icon: Dumbbell },
  { match: (n) => n.includes('out') || n.includes('about'), icon: Compass },
  { match: (n) => n.includes('shop'), icon: ShoppingBag },
  { match: (n) => n.includes('home') || n.includes('local'), icon: Home },
  { match: (n) => n.includes('travel') || n.includes('hotel'), icon: Plane },
  { match: (n) => n.includes('family') || n.includes('kid'), icon: Baby },
  { match: (n) => n.includes('auto') || n.includes('garage'), icon: Car },
  { match: (n) => n.includes('pet'), icon: PawPrint },
]

// Default glyph for an unmatched (or absent) top-level category name.
// A generic map-pin glyph reads sensibly inside a pin of any colour —
// mirrors RailHeader's CAT_FALLBACK contract (always resolves, never
// renders nothing).
const DEFAULT_PIN_GLYPH: PinGlyphIcon = MapPin

export function getCategoryPinGlyph(topLevelName: string | null | undefined): PinGlyphIcon {
  if (!topLevelName) return DEFAULT_PIN_GLYPH
  const n = topLevelName.toLowerCase()
  return CATEGORY_PIN_GLYPHS.find((v) => v.match(n))?.icon ?? DEFAULT_PIN_GLYPH
}
