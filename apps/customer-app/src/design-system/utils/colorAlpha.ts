/**
 * Map W2b round 2 — tiny colour helper for the "colour must MEAN
 * something" tint system: category/brand hexes are surfaced at low alpha
 * (12-14%) as chip fills and icon discs instead of introducing new hues.
 *
 * Accepts a #RRGGBB hex (the only format our tokens and the seeded
 * `pinColour` values use) and returns an rgba() string. A malformed
 * input falls back to transparent rather than throwing mid-render.
 */
export function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return 'rgba(0,0,0,0)'
  const int = parseInt(m[1]!, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `rgba(${r},${g},${b},${alpha})`
}
