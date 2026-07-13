/**
 * ErrorState — the ONE shared fetch-failure surface for apps/admin-web.
 *
 * Honesty-copy sweep (prototype-fidelity audit item #13, 2026-07-13). Every
 * gated page previously carried its own hand-copied "ErrorState" that said
 * "Could not load X. Check your connection and try again." — plausible on
 * its own, but never stated that nothing had been changed, which is exactly
 * the reassurance the module specs require and which lets an operator tell
 * a genuine failure apart from an empty result set at a glance:
 *   - docs/superpowers/specs/2026-07-10-admin-panel-module-specs/
 *     approval-queue-spec.md §A.1 (qError) — "The service did not respond.
 *     No items were changed. This is different from an empty queue."
 *   - .../cross-module-notes.md §5 — the full per-screen state set requires
 *     a "DISTINCT error" state, never mistakable for empty.
 *
 * `subject` names what failed to load (e.g. "the approval queue", "this
 * review"); the fixed reassurance + retry sentence stays identical everywhere
 * so an operator learns the pattern once. The red/destructive styling (kept
 * from the pre-sweep local components) is deliberately the OPPOSITE tone from
 * ForbiddenState's calm grey/lock treatment, and neither one is the muted,
 * borderless "No X match" copy each list's own empty state uses — three
 * visually and textually distinct states, never confusable with one another.
 */
import { AlertCircle } from 'lucide-react'

interface ErrorStateProps {
  /** What failed to load, e.g. "the approval queue", "this review". */
  subject: string
  onRetry: () => void
  testId?: string
}

export function ErrorState({ subject, onRetry, testId }: ErrorStateProps) {
  return (
    <div
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
      data-testid={testId}
    >
      <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden="true" />
      <p className="text-sm font-medium text-destructive">Could not load {subject}.</p>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        No items were changed. Check your connection, then retry.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm font-medium text-primary hover:underline"
      >
        Retry
      </button>
    </div>
  )
}
