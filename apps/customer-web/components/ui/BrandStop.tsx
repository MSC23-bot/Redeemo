/**
 * The Brand Full Stop: Redeemo's signature terminal period, rendered
 * larger than its sentence in brand rose (brand foundations doc,
 * 2026-06-10: ~1.4-1.5x, rose #E20C04, or the warm gradient on
 * hero-scale statements where it inherits the parent's gradient clip).
 * Locked overuse guard: at most ONE per screen or composition, only on
 * confident marketing statements, never in body, labels, or legal text.
 * Callers must keep it glued to its word: wrap the last word and the
 * stop together in a whitespace-nowrap span.
 */
export function BrandStop({ tone = 'rose' }: { tone?: 'rose' | 'inherit' }) {
  return (
    <span
      style={{
        color: tone === 'rose' ? '#E20C04' : undefined,
        fontSize: '1.42em',
        lineHeight: 0,
      }}
    >
      .
    </span>
  )
}
