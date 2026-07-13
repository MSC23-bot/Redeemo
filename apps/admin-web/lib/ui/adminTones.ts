/**
 * adminTones: the small shared semantic -> BadgeTone token layer for the admin
 * panel's operator-scanning language. Two consumers, one source of truth:
 *
 * 1. Merchant 360 (Phase A): merchant lifecycle + verification pills rendered
 *    by the workspace header and merchant cards.
 * 2. Approval Queue (Phase B): court pills, type chips, and waiting-age tints.
 *
 * This module maps DOMAIN concepts onto the small shared `BadgeTone` palette in
 * `features/shared/Badge`. It intentionally does not define any new CSS/hex
 * values itself: every tone referenced below already exists in Badge's
 * TONE_CLASSES. Keeping the mapping here (rather than inlined per-component)
 * is the "small shared token layer" called out in the Phase B build plan's
 * visual-direction note.
 *
 * Design contract: docs/superpowers/specs/2026-07-10-admin-panel-module-specs/
 * approval-queue-spec.md §B.1 (court derivation) and §E (tone tables);
 * merchant-360-spec.md (header pills).
 *
 * (Union of the #461 and #465 add/add versions, resolved at merge time as
 * planned: both stacks created this module independently.)
 */
import type { BadgeTone } from '@/features/shared/Badge'
import type { AdminApproval } from '@/lib/api/approvals'

// ── Merchant lifecycle + verification pills (Merchant 360) ─────────────────

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

// ── Prospect pipeline lead stages (Leads & Onboarding hub §A2) ─────────────
//
// The three live lanes a prospect moves through. The spec's per-lane hexes
// (#6B7280 / #2A63C4 / #B45309) are PROTOTYPE-only; they map onto the shared
// BadgeTone palette here (no new hex, same "small shared token layer" rule as
// the rest of this module): LEAD grey -> neutral, CONTACTED blue -> info,
// VISIT_BOOKED amber -> warn. CONVERTED / LOST are terminal STATES (rendered in
// their own sections below the board), not lanes, so they are handled inline.

export type LeadLaneStage = 'LEAD' | 'CONTACTED' | 'VISIT_BOOKED'

export const LEAD_LANES: readonly LeadLaneStage[] = ['LEAD', 'CONTACTED', 'VISIT_BOOKED']

export const LEAD_STAGE_LABEL: Record<LeadLaneStage, string> = {
  LEAD: 'Lead',
  CONTACTED: 'Contacted',
  VISIT_BOOKED: 'Visit booked',
}

export const LEAD_STAGE_TONE: Record<LeadLaneStage, BadgeTone> = {
  LEAD: 'neutral',
  CONTACTED: 'info',
  VISIT_BOOKED: 'warn',
}

export const LEAD_STAGE_HINT: Record<LeadLaneStage, string> = {
  LEAD: 'Captured, not yet contacted',
  CONTACTED: 'Reached out, in conversation',
  VISIT_BOOKED: 'Meeting or on-site scheduled',
}

export function isLeadLane(stage: string): stage is LeadLaneStage {
  return (LEAD_LANES as readonly string[]).includes(stage)
}

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

// ── Two-pill Status (B2: queue-list Status column + review-body alignment) ──
//
// approval-queue-spec.md §E: "Two-pill Status = lifePill + apprPill. Lifecycle:
// Live green / In review + Changes needed amber / Submitted cyan / Suspended
// red / Inactive grey. Approval: Approved green / Pending grey / Changes
// requested amber / Rejected red."
//
// The prototype's per-row `life`/`appr` fields are synthetic; the real data
// model does not carry a uniform "lifecycle" concept for every approval row
// (recorded gap in the B1 PR). What it DOES carry, honestly:
//   - `approval.status` (PENDING/APPROVED/REJECTED/CHANGES_REQUESTED/
//     WITHDRAWN) on every row — this is the "approval" pill, always available.
//   - `merchant.status` (REGISTERED/PENDING_APPROVAL/ACTIVE/INACTIVE/
//     SUSPENDED/DELETED) on rows that carry a merchant — a genuine second,
//     independent axis: the merchant's own standing, distinct from this one
//     approval's decision state (e.g. an ACTIVE merchant can still have a
//     routine PENDING branch-edit approval sitting in the queue).
//   - `voucher.status` (DRAFT/PENDING_APPROVAL/ACTIVE/INACTIVE/EXPIRED) on a
//     VOUCHER-type row — the reviewed voucher's OWN lifecycle, a more precise
//     second axis than the merchant's for that row (the voucher, not the
//     merchant, is what's being decided).
// So the lifecycle pill is genuinely available (and shown) only where one of
// these entity-level fields exists; otherwise callers fall back to a single
// pill (approval-status only) — never a fabricated lifecycle value.
//
// The claim-aware "In review" vs "Submitted" vs "Changes needed" split lives
// ENTIRELY in the lifecycle pill; the approval pill is deliberately the pure,
// claim-unaware rendering of `approval.status`, so the two pills read as two
// distinct axes rather than double-signalling the same claim state.

export interface StatusPill {
  label: string
  tone: BadgeTone
}

/** Friendly label for the raw ApprovalStatus enum — the "approval" pill. */
export function approvalStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    CHANGES_REQUESTED: 'Changes requested',
    WITHDRAWN: 'Withdrawn',
  }
  return map[status] ?? status
}

/** approval-queue-spec.md §E: "Approval: Approved green / Pending grey / Changes requested amber / Rejected red." */
export function approvalStatusTone(status: string): BadgeTone {
  if (status === 'APPROVED') return 'success'
  if (status === 'REJECTED') return 'danger'
  if (status === 'CHANGES_REQUESTED') return 'warn'
  return 'neutral' // PENDING + WITHDRAWN (not in the spec's vocabulary; a calm neutral default)
}

/**
 * The claim-aware sub-state for an entity that is NOT yet live (still moving
 * through this approval's own review). Shared by `merchantLifecycle` and
 * `voucherLifecycle` so the claim-awareness lives in exactly one place.
 */
function pendingLifecycleSubstate(
  approvalStatus: string,
  claimedById: string | null
): StatusPill {
  if (approvalStatus === 'CHANGES_REQUESTED') return { label: 'Changes needed', tone: 'warn' }
  if (claimedById != null) return { label: 'In review', tone: 'warn' }
  return { label: 'Submitted', tone: 'cyan' }
}

/** The merchant's own lifecycle pill (independent of this approval's decision state). */
export function merchantLifecycle(
  merchantStatus: string,
  approvalStatus: string,
  claimedById: string | null
): StatusPill {
  if (merchantStatus === 'ACTIVE') return { label: 'Live', tone: 'success' }
  if (merchantStatus === 'SUSPENDED') return { label: 'Suspended', tone: 'danger' }
  if (merchantStatus === 'INACTIVE') return { label: 'Inactive', tone: 'neutral' }
  // DELETED is not in the spec's vocabulary (the prototype never modelled a
  // deleted merchant reaching the queue); an honest, calmly-toned addition.
  if (merchantStatus === 'DELETED') return { label: 'Deleted', tone: 'neutral' }
  // REGISTERED / PENDING_APPROVAL: still moving through onboarding.
  return pendingLifecycleSubstate(approvalStatus, claimedById)
}

/** The voucher's own lifecycle pill (VOUCHER-type rows: more precise than the merchant's). */
export function voucherLifecycle(
  voucherStatus: string,
  approvalStatus: string,
  claimedById: string | null
): StatusPill {
  if (voucherStatus === 'ACTIVE') return { label: 'Live', tone: 'success' }
  if (voucherStatus === 'INACTIVE') return { label: 'Inactive', tone: 'neutral' }
  if (voucherStatus === 'EXPIRED') return { label: 'Expired', tone: 'neutral' }
  if (voucherStatus === 'DRAFT') return { label: 'Draft', tone: 'neutral' }
  // PENDING_APPROVAL: still moving through this voucher's own review.
  return pendingLifecycleSubstate(approvalStatus, claimedById)
}
