// Outline (inactive) + filled (active) glyph PAIRS for each visible tab.
//
// Each pair is the SAME Material icon in two weights — Outlined for the calm,
// secondary inactive state and Filled for the richer active state — so the
// metaphor and silhouette never change between states, only the weight/fill.
// Using one family (not lucide-outline + Material-filled) is deliberate: an
// Outlined and a Filled Material icon share the same silhouette and bounding
// box, so the two states are the SAME optical size by construction. No
// cross-family scale guessing.
//
// Both weights of a tab render in the same fixed slot via the same per-icon
// viewBox (TAB_GLYPH_VIEWBOX), so if a pair ever needs micro-alignment, tuning
// that ONE viewBox moves both weights together and they stay matched.
//
// Metaphor locks: map is a FOLDED MAP in both weights (never a location pin —
// a pin means "Location"); savings is a WALLET in both weights (never a piggy
// or unrelated object). home/favourites/profile keep their house/heart/person.

export const TAB_GLYPHS_OUTLINE: Record<string, string> = {
  home: 'M12 5.69l5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z',
  // Material `map` (outlined) — folded map with three panels. NOT a pin.
  map: 'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM10 5.47l4 1.4v11.66l-4-1.4V5.47zm-5 .99l3-1.01v11.7l-3 1.16V6.46zm14 11.08l-3 1.01V7.85l3-1.16v10.85z',
  favourites:
    'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
  // Material `account_balance_wallet` (outlined) — a wallet. NOT a piggy.
  savings:
    'M21 7.28V5c0-1.1-.9-2-2-2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-2.28c.59-.35 1-.98 1-1.72V9c0-.74-.41-1.37-1-1.72zM20 9v6h-7V9h7zM5 19V5h14v2h-6c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h6v2H5z',
  profile:
    'M12 6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2m0 10c2.7 0 5.8 1.29 6 2H6c.23-.72 3.31-2 6-2m0-12C9.79 4 8 5.79 8 8s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 10c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
}

export const TAB_GLYPHS_FILLED: Record<string, string> = {
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  // Material `map` (filled) — same folded map, centre fold. NOT a pin.
  map: 'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z',
  favourites:
    'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  // Material `account_balance_wallet` (filled) — same wallet. NOT a piggy.
  savings:
    'M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  profile: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
}

/** Per-icon viewBox used for BOTH weights of a tab. Default 24x24. Tune a single
 *  entry (e.g. '2 2 20 20' to zoom in) if a pair needs optical micro-alignment;
 *  because both weights read the same value, they stay matched. */
export const TAB_GLYPH_VIEWBOX: Record<string, string> = {
  home: '0 0 24 24',
  map: '0 0 24 24',
  favourites: '0 0 24 24',
  savings: '0 0 24 24',
  profile: '0 0 24 24',
}
