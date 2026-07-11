'use client'

/**
 * ChangeRoleDialog: SUPER_ADMIN changes an admin's base role (Team & Roles S2).
 *
 * A confirm dialog: pick a new base role, confirm. Honest effect-timing note
 * (spec §3.3): the new role's capabilities apply once their session next
 * refreshes (within about 15 minutes), not necessarily immediately.
 */
import { useRef, useState } from 'react'
import { useSetAdminRole } from '@/lib/team/useTeam'
import { NamedGateBanner } from '@/features/review/NamedGateBanner'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ASSIGNABLE_ROLE_OPTIONS, roleLabel } from './labels'
import type { AssignableRole } from '@/lib/api/team'
import type { TeamAdmin } from '@/lib/api/team'

interface ChangeRoleDialogProps {
  admin: TeamAdmin
  onSuccess: () => void
  onCancel: () => void
}

export function ChangeRoleDialog({ admin, onSuccess, onCancel }: ChangeRoleDialogProps) {
  const [role, setRole] = useState<AssignableRole>(
    (ASSIGNABLE_ROLE_OPTIONS.find((o) => o.value === admin.role)?.value ?? 'OPERATIONS') as AssignableRole
  )
  const mutation = useSetAdminRole(admin.id)
  const selectRef = useRef<HTMLSelectElement>(null)

  const isUnchanged = role === admin.role
  const canSubmit = !isUnchanged && !mutation.isPending

  async function handleConfirm() {
    if (!canSubmit) return
    try {
      await mutation.mutateAsync(role)
      onSuccess()
    } catch {
      // Error is available via mutation.error; NamedGateBanner renders it.
    }
  }

  return (
    <Dialog
      label="Change role"
      onClose={onCancel}
      scrimTestId="change-role-scrim"
      panelTestId="change-role-dialog"
      initialFocusRef={selectRef}
    >
      <h2 className="mb-1 text-base font-semibold text-foreground">Change role</h2>
      <p className="mb-4 text-sm text-muted-foreground" data-testid="change-role-current">
        {admin.name} is currently <span className="font-medium text-foreground">{roleLabel(admin.role)}</span>.
      </p>

      <label htmlFor="change-role-select" className="mb-1.5 block text-sm font-medium text-foreground">
        New role
      </label>
      <select
        id="change-role-select"
        ref={selectRef}
        value={role}
        onChange={(e) => setRole(e.target.value as AssignableRole)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="change-role-select"
      >
        {ASSIGNABLE_ROLE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <p className="mt-3 text-xs text-muted-foreground" data-testid="change-role-timing-note">
        The new role&apos;s capabilities apply once their session next refreshes (within about 15
        minutes), not necessarily immediately.
      </p>

      {mutation.error && (
        <div className="mt-3">
          <NamedGateBanner error={mutation.error} />
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={mutation.isPending}
          data-testid="change-role-cancel"
        >
          Cancel
        </Button>
        <Button type="button" onClick={handleConfirm} disabled={!canSubmit} data-testid="change-role-submit">
          {mutation.isPending ? 'Saving...' : 'Change role'}
        </Button>
      </div>
    </Dialog>
  )
}
