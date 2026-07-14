/**
 * The Brand Full Stop: Redeemo's signature terminal period, rendered
 * larger than its sentence (~1.42x; brand foundations doc 2026-06-10).
 * Owner ruling 2026-07-14: the stop must CONTRAST with its sentence,
 * that is the point of the device. Navy/ink text takes the rose stop;
 * red/gradient text takes the navy stop; on navy surfaces (where navy
 * would vanish) gradient text takes the white stop.
 * Locked overuse guard: at most ONE per screen or composition, only on
 * confident marketing statements, never in body, labels, or legal text.
 * Callers must keep it glued to its word: wrap the last word and the
 * stop together in a whitespace-nowrap span.
 * WebkitTextFillColor is set as well as color so the stop still shows
 * inside `gradient-text` spans (their transparent fill inherits).
 */
export function BrandStop({ tone = 'rose' }: { tone?: 'rose' | 'navy' | 'white' | 'inherit' }) {
  const color =
    tone === 'rose' ? '#E20C04'
    : tone === 'navy' ? '#010C35'
    : tone === 'white' ? '#FFFFFF'
    : undefined
  return (
    <span
      style={{
        color,
        WebkitTextFillColor: color,
        fontSize: '1.42em',
        lineHeight: 0,
      }}
    >
      .
    </span>
  )
}
