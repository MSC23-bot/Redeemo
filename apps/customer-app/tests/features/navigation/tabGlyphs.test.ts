import { TAB_GLYPHS } from '@/features/navigation/tabGlyphs'

// The active glyph for each tab must be the FILLED TWIN of its inactive lucide
// metaphor — never a different object. The map tab is the one that regressed in
// device QA (a location PIN, which reads as "Location", not "Map"), so it gets
// an explicit regression lock here.

const OLD_MAP_PIN =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z'

describe('TAB_GLYPHS (active filled twin per tab)', () => {
  it('defines a non-empty glyph for every visible tab', () => {
    for (const name of ['home', 'map', 'favourites', 'savings', 'profile']) {
      const glyph = TAB_GLYPHS[name]
      expect(typeof glyph).toBe('string')
      expect((glyph ?? '').length).toBeGreaterThan(0)
    }
  })

  it('map glyph is a folded map, NOT a location pin (metaphor lock)', () => {
    expect(TAB_GLYPHS.map).not.toBe(OLD_MAP_PIN)
  })
})
