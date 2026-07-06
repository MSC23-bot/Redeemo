'use client'

// Business Profile M2: the shared disabled "editing is not wired yet" control. M2 is
// a strict READ shell - editing/edit-requests land with M3/M4. This renders the
// SAME card chrome the reference screenshots show (an "Edit" / "Change category"
// button in its usual place) but performs no behaviour: disabled, no onClick, never
// reaches the network. Mirrors the spirit of Branches' <LockedAffordance>, kept
// local (not imported) because that component's built-in copy is Branches-specific
// ("Coming in this Branches rollout").
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Pencil } from '@/lib/icons'

export function DisabledEditButton({
  label,
  icon = <Pencil size={14} aria-hidden />,
  testId,
}: {
  label: string
  /** Pass `null` explicitly to render no icon (e.g. "Change category" has none). */
  icon?: React.ReactNode
  testId?: string
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled
      title="Editing opens in a future update."
      aria-label={`${label} (editing opens in a future update)`}
      data-testid={testId}
    >
      {icon}
      {label}
    </Button>
  )
}
