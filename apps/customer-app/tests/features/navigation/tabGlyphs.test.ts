import {
  TAB_GLYPHS_OUTLINE,
  TAB_GLYPHS_FILLED,
  TAB_GLYPH_VIEWBOX,
} from '@/features/navigation/tabGlyphs'

// Inactive (outline) and active (filled) are the SAME Material icon in two
// weights — same metaphor, same silhouette. These pins guard the two things
// device QA caught: a metaphor swap (map became a location PIN) and weight
// drift (a tab missing one of its two weights).

const TABS = ['home', 'map', 'favourites', 'savings', 'profile']
const OLD_MAP_PIN =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z'

describe('TAB_GLYPHS outline/filled pairs', () => {
  it('every tab has both an outline and a filled weight + a viewBox', () => {
    for (const name of TABS) {
      expect((TAB_GLYPHS_OUTLINE[name] ?? '').length).toBeGreaterThan(0)
      expect((TAB_GLYPHS_FILLED[name] ?? '').length).toBeGreaterThan(0)
      expect((TAB_GLYPH_VIEWBOX[name] ?? '').length).toBeGreaterThan(0)
    }
  })

  it('outline and filled cover exactly the same tabs (no weight missing)', () => {
    expect(Object.keys(TAB_GLYPHS_OUTLINE).sort()).toEqual(Object.keys(TAB_GLYPHS_FILLED).sort())
  })

  it('map is a folded map in BOTH weights, never a location pin', () => {
    expect(TAB_GLYPHS_OUTLINE.map).not.toBe(OLD_MAP_PIN)
    expect(TAB_GLYPHS_FILLED.map).not.toBe(OLD_MAP_PIN)
  })
})
