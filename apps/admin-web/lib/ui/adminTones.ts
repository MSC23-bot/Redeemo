/**
 * adminTones: shared label + Badge-tone mapping for merchant lifecycle and
 * verification pills.
 *
 * The Merchant 360 workspace header and the merchant list/detail cards render
 * the same two status pills. This module centralises the (status -> label) and
 * (status -> BadgeTone) mapping so the header reuses the existing shared Badge
 * tones (green success / red danger / amber warn / grey neutral) rather than
 * introducing a new colour system. It deliberately does NOT restyle anything.
 */
import type { BadgeTone } from '@/features/shared/Badge'

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  PENDING_APPROVAL: 'Pending approval',
  REGISTERED: 'Registered',
  INACTIVE: 'Inactive',
  DELETED: 'Deleted',
}

export function merchantStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

export function merchantStatusTone(status: string): BadgeTone {
  if (status === 'ACTIVE') return 'success'
  if (status === 'SUSPENDED') return 'danger'
  if (status === 'PENDING_APPROVAL') return 'warn'
  return 'neutral'
}

export function verificationLabel(status: string): string {
  if (status === 'VERIFIED') return 'Verified'
  if (status === 'REJECTED') return 'Rejected'
  if (status === 'PENDING') return 'Pending'
  if (status === 'NOT_SUBMITTED') return 'Not submitted'
  return status
}

export function verificationTone(status: string): BadgeTone {
  if (status === 'VERIFIED') return 'success'
  if (status === 'REJECTED') return 'danger'
  if (status === 'PENDING') return 'warn'
  return 'neutral'
}
