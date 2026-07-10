/**
 * OnBehalfBanner + ReadOnlyTag — the two small shared building blocks the
 * design spec pairs on every review body (approval-queue-spec.md §D preamble:
 * "Every body opens with a title row + 'Read only' tag and a cream on-behalf
 * shield banner").
 *
 * `ReadOnlyTag` sits inline in a panel's own title row (each of the 5 lanes
 * keeps its own heading structure — this is not a shared header component,
 * just the small tag). `OnBehalfBanner` is the shield-banner block below it,
 * with the lane's own copy passed as children (verbatim from the spec where
 * quoted, adapted honestly where the spec only sketches the idea).
 *
 * Tone: an amber/cream informational tint, reusing the SAME border-amber-200/
 * bg-amber-50 pattern already used for this exact "acting on behalf, read
 * this" register elsewhere in the review surface (RejectDialog's consequence
 * banner, VoucherReviewPanel's existing admin-proposed notice) — not a new
 * colour system, per the B2 brief's "extend adminTones, never a new colour
 * system" instruction (this is presentational chrome, not a Badge tone, so it
 * lives here rather than in adminTones.ts).
 */
import { ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'

export function ReadOnlyTag() {
  return (
    <span
      className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
      data-testid="read-only-tag"
    >
      Read only
    </span>
  )
}

export function OnBehalfBanner({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-5 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      data-testid="on-behalf-banner"
    >
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
      <p>{children}</p>
    </div>
  )
}
