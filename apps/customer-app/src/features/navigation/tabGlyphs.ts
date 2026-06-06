// Filled silhouette paths for the ACTIVE tab glyph (gradient-filled via
// BrandGradientVector on the light shelf). Inactive tabs keep their lucide
// OUTLINE icon in warm ink — the standard "outline inactive / filled active"
// pattern. Each active glyph is the FILLED TWIN of the same inactive metaphor,
// NOT a different object: a filled tab must never change what the icon means.
// Canonical Material-Icons filled paths (viewBox 0 0 24 24), chosen because
// they fill crisply at icon size. Metaphor parity with the lucide inactive icon:
//   home → house (lucide Home) · map → FOLDED MAP (lucide Map — NOT a pin;
//   a pin would mean "Location") · favourites → heart (lucide Heart) ·
//   savings → WALLET (lucide Wallet — owner-locked, not piggy) ·
//   profile → person (lucide User).

export const TAB_GLYPHS: Record<string, string> = {
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  // Material `map` (filled) — a folded map with a centre fold. Same metaphor as
  // the lucide Map outline. Deliberately NOT a location pin.
  map: 'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z',
  favourites: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  // Material `account_balance_wallet` — a clean filled wallet (owner: Wallet, not piggy).
  savings:
    'M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  profile: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
}
