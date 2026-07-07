'use client'

import * as React from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordField } from '@/components/auth/PasswordField'
import { PasswordRequirements } from '@/components/auth/PasswordRequirements'
import { PasswordStrengthMeter } from './PasswordStrengthMeter'
import { passwordPolicyOk } from '@/lib/auth/password'
import { useChangePassword } from '@/lib/account/useChangePassword'
import { useToast } from '@/components/ui/toast'
import { authErrorMessage } from '@/lib/auth/errorMessages'
import { X } from '@/lib/icons'

// My Account "Login and security -> Change password" (myaccount-2 prototype).
// Client-side checks mirror the backend order (current password required, new
// password policy, confirmation match, new !== current) so the common mistakes
// never round-trip; CURRENT_PASSWORD_INCORRECT / PASSWORD_POLICY_VIOLATION /
// NEW_PASSWORD_SAME_AS_CURRENT from the backend are still surfaced inline via the
// shared authErrorMessage map for anything the client check cannot catch (e.g. the
// backend is the only place that actually knows the current password).
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const changePassword = useChangePassword()

  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [fieldError, setFieldError] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)

  // P3 modal-hardening: block EVERY dismissal path (X button, Escape, scrim
  // click) while the password update is in flight, so a mid-request dismiss
  // can never leave the user unsure whether the change landed. A ref mirrors the
  // latest pending state so the guard reads it even if the shared Dialog
  // memoized its onClose handler at mount (the closure would otherwise capture a
  // stale `busy`). The successful-submit path calls `onClose()` DIRECTLY (below)
  // - it runs after the mutation resolves, when we are no longer pending.
  const busyRef = React.useRef(false)
  busyRef.current = changePassword.isPending
  const requestClose = React.useCallback(() => {
    if (!busyRef.current) onClose()
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setActionError(null)
    setFieldError(null)

    if (!currentPassword) {
      setFieldError('Enter your current password.')
      return
    }
    if (!passwordPolicyOk(newPassword)) {
      setFieldError('Your new password does not yet meet all the requirements below.')
      return
    }
    if (newPassword !== confirmPassword) {
      setFieldError('The passwords do not match.')
      return
    }
    if (newPassword === currentPassword) {
      setFieldError('Choose a new password that is different from your current one.')
      return
    }

    try {
      await changePassword.mutateAsync({ currentPassword, newPassword })
      toast({ message: 'Password updated.', variant: 'success' })
      onClose()
    } catch (err) {
      setActionError(authErrorMessage(err).message)
    }
  }

  const busy = changePassword.isPending

  return (
    <Dialog label="Change password" onClose={requestClose} panelTestId="change-password-modal" scrimTestId="change-password-scrim">
      <form onSubmit={submit}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-foreground">Change password</h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {actionError ? (
            <p
              role="alert"
              className="rounded-[10px] border px-3 py-2 text-sm font-medium"
              style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
            >
              {actionError}
            </p>
          ) : null}
          {fieldError ? (
            <p role="alert" className="text-xs font-medium" style={{ color: 'var(--destructive)' }}>
              {fieldError}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="change-password-current">Current password</Label>
            <PasswordField
              id="change-password-current"
              value={currentPassword}
              onChange={setCurrentPassword}
              disabled={busy}
              autoComplete="current-password"
              placeholder="Your current password"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="change-password-new">New password</Label>
            <PasswordField
              id="change-password-new"
              value={newPassword}
              onChange={setNewPassword}
              disabled={busy}
              placeholder="Create a new password"
            />
            <PasswordStrengthMeter password={newPassword} />
            <PasswordRequirements password={newPassword} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="change-password-confirm">Confirm new password</Label>
            <PasswordField
              id="change-password-confirm"
              value={confirmPassword}
              onChange={setConfirmPassword}
              disabled={busy}
              placeholder="Re-enter your new password"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={requestClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Updating...' : 'Update password'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
