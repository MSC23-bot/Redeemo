// Redeemo bespoke bottom-nav icon paths.
//
// SOURCE: Codex-created handoff bundle (redeemo-nav-icons/navIconPaths.ts).
// Path data copied AS-IS — not re-authored by Claude. Verified against the
// handoff preview SVG: filled paths render under the default NONZERO fill rule
// (no fill-rule attribute), matching how `BrandGradientVector` paints them;
// outline stroke colour in the preview (#3A3C49) is our `NAV_INK`, and the
// preview gradient (#E20C04 -> #E84A00) is our brand gradient. If a designer
// supplies final SVGs later, replace the path strings here — nothing else
// needs to change.
//
// Contract:
// - 24x24 grid, transparent, no baked colour.
// - `outline` is authored for STROKE rendering:
//   strokeWidth=2, strokeLinecap="round", strokeLinejoin="round", fill="none".
// - `filled` is authored for a single gradient-filled <Path> (nonzero).
// - Active/inactive pairs keep the same metaphor and broad silhouette.
//
// Metaphor locks (pinned in navIconPaths.test.ts):
// - map = folded map, never a location pin.
// - savings = wallet, never piggy/tag/percent.

export type NavIconName = 'home' | 'map' | 'favourites' | 'savings' | 'profile'

type NavIconPaths = {
  outline: string
  filled: string
  viewBox: string
}

export const REDEEMO_NAV_ICONS: Record<NavIconName, NavIconPaths> = {
  home: {
    viewBox: '0 0 24 24',
    outline: 'M4.5 11.4 12 5.1l7.5 6.3V20a1 1 0 0 1-1 1h-4.6v-5.3h-3.8V21H5.5a1 1 0 0 1-1-1v-8.6Z',
    filled: 'M3.6 11.1 12 4.1l8.4 7a1.1 1.1 0 0 1 .4.9v8a1.7 1.7 0 0 1-1.7 1.7h-5.2v-5.8a.7.7 0 0 0-.7-.7h-2.4a.7.7 0 0 0-.7.7v5.8H4.9A1.7 1.7 0 0 1 3.2 20v-8a1.1 1.1 0 0 1 .4-.9Z',
  },
  map: {
    viewBox: '0 0 24 24',
    outline: 'M4 6.8a1 1 0 0 1 .7-1l4.5-1.3 5.6 1.9 4.5-1.3A1 1 0 0 1 20.6 6v11.2a1 1 0 0 1-.7 1l-4.5 1.3-5.6-1.9-4.5 1.3A1 1 0 0 1 4 18V6.8Zm5.2-2.3v13.1m5.6-11.2v13.1',
    filled: 'M9.2 3.9c.2-.1.4-.1.6 0l4.8 1.6c.2.1.3.2.3.4v14.2c0 .3-.3.5-.6.4l-4.8-1.6c-.2-.1-.3-.2-.3-.4V3.9Zm-1 .2v14.1c0 .2-.1.4-.3.4l-3.3 1a1.5 1.5 0 0 1-1.9-1.4V6.7c0-.7.5-1.3 1.1-1.5l3.8-1.1c.3-.1.6.1.6.4Zm7.6 2c0-.2.1-.4.3-.4l3.3-1a1.5 1.5 0 0 1 1.9 1.4v11.5c0 .7-.5 1.3-1.1 1.5l-3.8 1.1c-.3.1-.6-.1-.6-.4V6.1Z',
  },
  favourites: {
    viewBox: '0 0 24 24',
    outline: 'M12 20.4s-7.6-4.6-8.5-10.2C2.9 6.6 5 4.1 8 4.1c1.7 0 3.1.9 4 2.2.9-1.3 2.3-2.2 4-2.2 3 0 5.1 2.5 4.5 6.1-.9 5.6-8.5 10.2-8.5 10.2Z',
    filled: 'M12 21.2a1.2 1.2 0 0 1-.6-.2C8.5 19.2 3 15 2.2 10.3 1.5 6.2 4 3.3 7.7 3.3c1.7 0 3.3.8 4.3 2.1 1-1.3 2.6-2.1 4.3-2.1 3.7 0 6.2 2.9 5.5 7-.8 4.7-6.3 8.9-9.2 10.7a1.2 1.2 0 0 1-.6.2Z',
  },
  savings: {
    viewBox: '0 0 24 24',
    outline: 'M4 7.4h13.4a2.6 2.6 0 0 1 2.6 2.6v6.6a2.6 2.6 0 0 1-2.6 2.6H6.6A2.6 2.6 0 0 1 4 16.6V7.4Zm0 0 10.3-2.2a1.9 1.9 0 0 1 2.3 1.7v.5m3.4 4h-4.2a1.9 1.9 0 0 0 0 3.8H20v-3.8Z',
    filled: 'M6.3 6.7h11.1a3.4 3.4 0 0 1 3.4 3.4v1h-5a2.6 2.6 0 0 0 0 5.2h5v.4a3.4 3.4 0 0 1-3.4 3.4H6.3a3.4 3.4 0 0 1-3.4-3.4V9.9a3.2 3.2 0 0 1 3.4-3.2Zm-.8-.9 8.5-1.9a2.5 2.5 0 0 1 3 2H6.2c-.2 0-.5 0-.7-.1Zm10.4 6.6h5v2.6h-5a1.3 1.3 0 1 1 0-2.6Z',
  },
  profile: {
    viewBox: '0 0 24 24',
    outline: 'M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Zm-7.3 8.3c.8-4 3.4-6.2 7.3-6.2s6.5 2.2 7.3 6.2',
    filled: 'M12 12.7a4.9 4.9 0 1 0 0-9.8 4.9 4.9 0 0 0 0 9.8Zm0 1.7c-4.3 0-7.3 2.2-8.2 6.1-.2.7.4 1.3 1.1 1.3h14.2c.7 0 1.3-.6 1.1-1.3-.9-3.9-3.9-6.1-8.2-6.1Z',
  },
}
