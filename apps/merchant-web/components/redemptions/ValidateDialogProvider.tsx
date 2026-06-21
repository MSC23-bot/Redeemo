'use client'

/**
 * M3 F2: mounts the shared Validate-a-code dialog once for the whole portal and
 * exposes openValidate() via the F1 context, so BOTH the topbar global action
 * (always mounted in the shell) and the Redemptions page action open the SAME
 * dialog. The dialog invalidates ['redemptions'] on a successful validation so
 * the log reflects the new state wherever it is mounted.
 */
import * as React from 'react'
import { ValidateDialogContext } from './validateDialogContext'
import { ValidateCodeDialog } from './ValidateCodeDialog'

export function ValidateDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const openValidate = React.useCallback(() => setOpen(true), [])
  const close = React.useCallback(() => setOpen(false), [])

  const value = React.useMemo(() => ({ openValidate }), [openValidate])

  return (
    <ValidateDialogContext.Provider value={value}>
      {children}
      {open && <ValidateCodeDialog onClose={close} />}
    </ValidateDialogContext.Provider>
  )
}
