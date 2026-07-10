/**
 * adminTones — semantic -> BadgeTone mapping for the Approval Queue's
 * multi-tone operator-scanning language (court pills, type chips, age tints).
 *
 * This module maps DOMAIN concepts (claim/court membership, approval type,
 * waiting age) onto the small shared `BadgeTone` palette in
 * `features/shared/Badge`. It intentionally does not define any new CSS/hex
 * values itself: every tone referenced below already exists in Badge's
 * TONE_CLASSES. Keeping the mapping here (rather than inlined per-component)
 * is the "small shared token layer" called out in the Phase B build plan's
 * visual-direction note, so later Approval Queue slices (B2/B3) reuse the
 * same source of truth instead of re-deriving these groupings.
 *
 * Design contract: docs/superpowers/specs/2026-07-10-admin-panel-module-specs/
 * approval-queue-spec.md §B.1 (court derivation) and §E (tone tables).
 */
import type { BadgeTone } from '@/features/shared/Badge'
import type { AdminApproval } from '@/lib/api/approvals'

// ── Court ──────────────────────────────────────────────────────────────────
//
// "Court" answers: whose turn is it to act on this row? It is a PRESENTATION
// grouping derived from the row's existing `status`/`claimedById` fields —
// no new state, no schema change (approval-queue-spec.md: "the underlying
// API filters are unchanged").
//
// - 'you'     — PENDING and unclaimed, or claimed by the current admin.
// - 'other'   — PENDING and claimed by a different admin.
// - 'merchant'— CHANGES_REQUESTED (with the merchant), regardless of claim.
// - 'closed'  — a terminal status (APPROVED / REJECTED / WITHDRAWN): nobody's
//   turn any more. Not in the design spec (which only models the two live
//   courts) — added so the History affordance can reuse the same row
//   components instead of a parallel set.

export type Court = 'you' | 'other' | 'merchant' | 'closed'

const TERMINAL_STATUSES: ReadonlySet<AdminApproval['status']> = new Set([
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
])

export function courtOf(
  approval: Pick<AdminApproval, 'status' | 'claimedById'>,
  currentAdminId: string | null
): Court {
  if (TERMINAL_STATUSES.has(approval.status)) return 'closed'
  if (approval.status === 'CHANGES_REQUESTED') return 'merchant'
  if (approval.claimedById == null) return 'you'
  if (approval.claimedById === currentAdminId) return 'you'
  return 'other'
}

export const COURT_LABEL: Record<Court, string> = {
  you: 'Needs you',
  other: 'Claimed by other',
  merchant: 'Awaiting merchant',
  closed: 'Closed',
}

export const COURT_TONE: Record<Court, BadgeTone> = {
  you: 'success',
  other: 'neutral',
  merchant: 'warn',
  closed: 'neutral',
}

// ── Court TABS (the two-court queue + the History escape hatch) ────────────
//
// Tab membership is a pure status check — independent of `courtOf` above,
// which is about the per-ROW pill. "Needs you" the TAB holds every PENDING
// row (claimed by anyone or nobody); individual rows inside it can still
// show a "Claimed by other" court pill. This matches the task brief and the
// populated-queue screenshot (a "Needs you 10" tab containing rows pilled
// both "Needs you" and "Claimed by other").

export type CourtTabKey = 'needs' | 'merchant' | 'history'

export const COURT_TAB_LABEL: Record<CourtTabKey, string> = {
  needs: 'Needs you',
  merchant: 'Awaiting merchant',
  history: 'History',
}

export function inNeedsYouTab(approval: Pick<AdminApproval, 'status'>): boolean {
  return approval.status === 'PENDING'
}

export function inAwaitingMerchantTab(approval: Pick<AdminApproval, 'status'>): boolean {
  return approval.status === 'CHANGES_REQUESTED'
}

// ── Type chip / type group ──────────────────────────────────────────────────
//
// The design spec's type-chip taxonomy has exactly four groups (Onboarding /
// Voucher / Merchant edit / Branch lifecycle) with four distinct hues. The
// REAL ApprovalType enum has eight values (edit-on-behalf and voucher-edit
// lanes split more finely on the review side). This map folds the real
// 8-value enum into the spec's 4 visual groups; the Record is exhaustive over
// AdminApproval['type'] so a future enum addition fails to compile here
// rather than silently rendering an uncoloured chip.

export type TypeGroup = 'onboarding' | 'voucher' | 'merchantEdit' | 'branchLifecycle'

const TYPE_GROUP: Record<AdminApproval['type'], TypeGroup> = {
  MERCHANT_ONBOARDING: 'onboarding',
  VOUCHER: 'voucher',
  VOUCHER_EDIT: 'voucher',
  MERCHANT_PROFILE_EDIT: 'merchantEdit',
  MERCHANT_IDENTITY_EDIT: 'merchantEdit',
  BRANCH_IDENTITY_EDIT: 'merchantEdit',
  BRANCH_CREATE: 'branchLifecycle',
  BRANCH_CLOSE: 'branchLifecycle',
}

export const TYPE_GROUP_LABEL: Record<TypeGroup, string> = {
  onboarding: 'Onboarding',
  voucher: 'Voucher',
  merchantEdit: 'Merchant edit',
  branchLifecycle: 'Branch lifecycle',
}

// approval-queue-spec.md §E: Onboarding cyan, Voucher violet, Merchant edit
// blue (-> existing `info`), Branch lifecycle green (-> existing `success`).
export const TYPE_GROUP_TONE: Record<TypeGroup, BadgeTone> = {
  onboarding: 'cyan',
  voucher: 'violet',
  merchantEdit: 'info',
  branchLifecycle: 'success',
}

export function typeGroupOf(type: AdminApproval['type']): TypeGroup {
  return TYPE_GROUP[type]
}

export function typeChipTone(type: AdminApproval['type']): BadgeTone {
  return TYPE_GROUP_TONE[typeGroupOf(type)]
}

export const ALL_TYPE_GROUPS: TypeGroup[] = [
  'onboarding',
  'voucher',
  'merchantEdit',
  'branchLifecycle',
]

// ── Waiting-age tint ─────────────────────────────────────────────────────────
//
// approval-queue-spec.md §E: ">=36h -> red; >=12h -> amber; <12h -> neutral."
// This deliberately supersedes the older 3-day/5-day boundary that lived in
// `lib/queue/urgency.ts` pre-B1 — that helper's own thresholds were a
// pre-fidelity placeholder; the spec (grounded in the prototype source) is
// the authoritative boundary for the two-court row treatment.
export function ageToneForHours(hours: number): BadgeTone {
  if (hours >= 36) return 'danger'
  if (hours >= 12) return 'warn'
  return 'neutral'
}
