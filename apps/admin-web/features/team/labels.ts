/**
 * Team & Roles — shared display-copy helpers (role + capability labels).
 *
 * Kept in one small file so the roster table and the dialogs never drift on
 * wording. No emojis, no em-dashes (project style lock).
 */
import { ASSIGNABLE_ROLES, type AssignableRole } from '@/lib/api/team'

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  OPERATIONS: 'Operations',
  FINANCE: 'Finance',
  CONTENT: 'Content',
  SUPPORT: 'Support',
  FIELD: 'Field',
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role
}

/** The 5 roles assignable from this screen, in a stable display order. */
export const ASSIGNABLE_ROLE_OPTIONS: { value: AssignableRole; label: string }[] =
  ASSIGNABLE_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))

// Launch curated grantable set has exactly one member; this label is what the
// roster pill and the grant/revoke dialogs show for it.
export const CAPABILITY_LABELS: Record<string, string> = {
  'approval:action': 'Can approve merchants',
}

export function capabilityLabel(cap: string): string {
  return CAPABILITY_LABELS[cap] ?? cap
}
