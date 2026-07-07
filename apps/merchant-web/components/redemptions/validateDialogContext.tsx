'use client'

/**
 * The shared open-handle for the two-step Validate-a-code dialog, so BOTH the
 * topbar global action (always mounted in the shell) and the Redemptions page
 * action open the SAME dialog instance.
 *
 * F1 introduces the context + hook (so the page button has a real opener to call
 * and to test). F2 mounts the provider in the shell and renders the actual
 * ValidateCodeDialog when open.
 */
import * as React from 'react'

interface ValidateDialogContextValue {
  // Overloaded so the zero-arg form stays assignable directly to an onClick
  // handler (topbar / quick actions / page button: `onClick={openValidate}`),
  // while the detail drawer's "Validate this code" action can pre-seed the entry
  // step with `openValidate(code)`.
  openValidate: {
    (): void
    (code: string): void
  }
}

export const ValidateDialogContext = React.createContext<ValidateDialogContextValue | null>(null)

/**
 * Read the shared open-handle. Returns a no-op opener when no provider is mounted
 * so a stray button never throws; every app surface mounts the provider in the
 * shell (F2).
 */
export function useValidateDialog(): ValidateDialogContextValue {
  const ctx = React.useContext(ValidateDialogContext)
  return ctx ?? { openValidate: () => {} }
}
