import { REDEEMO_NAV_ICONS, type NavIconName } from '@/features/navigation/icons/navIconPaths'

// Bespoke Redeemo nav icons (Codex-authored paths). These pins guard the two
// things device QA caught earlier: a metaphor swap (map became a location PIN)
// and a tab missing one of its two weights / its viewBox.

const TABS: NavIconName[] = ['home', 'map', 'favourites', 'savings', 'profile']
const OLD_MAP_PIN =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z'

describe('REDEEMO_NAV_ICONS', () => {
  it('defines exactly the five tabs', () => {
    expect(Object.keys(REDEEMO_NAV_ICONS).sort()).toEqual([...TABS].sort())
  })

  it('every tab has a non-empty outline, filled, and viewBox', () => {
    for (const name of TABS) {
      const icon = REDEEMO_NAV_ICONS[name]
      expect(icon.outline.length).toBeGreaterThan(0)
      expect(icon.filled.length).toBeGreaterThan(0)
      expect(icon.viewBox.length).toBeGreaterThan(0)
    }
  })

  it('map is a folded map in BOTH weights, never a location pin', () => {
    expect(REDEEMO_NAV_ICONS.map.outline).not.toBe(OLD_MAP_PIN)
    expect(REDEEMO_NAV_ICONS.map.filled).not.toBe(OLD_MAP_PIN)
  })

  it('savings outline and filled are distinct paths (two real weights, not duplicated)', () => {
    expect(REDEEMO_NAV_ICONS.savings.outline).not.toBe(REDEEMO_NAV_ICONS.savings.filled)
  })
})
