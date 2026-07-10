'use client'

/**
 * VouchersTab: the merchant's mandatory flagship (RMV) co-build surface (spec
 * merchant-360-spec.md, Tab 4; Option B B5.1 wired in Merchant 360 A3).
 *
 * Reads the existing admin RMV endpoint and renders one card per mandatory
 * voucher. DRAFT flagships get Edit + Submit-for-review affordances (gated on
 * merchant:manage-vouchers, and wired to the two existing-but-unconsumed co-build
 * routes); non-DRAFT flagships are read-only with a status pill. The advisory
 * value meter and category value benchmark (D41) are NOT in this slice (they need
 * cross-merchant aggregation). CUSTOM (RCV) vouchers now render a real read-only
 * section from the A4 custom-voucher read (status + approval pills, saving,
 * expiry, an open-request hint). No custom-voucher mutations: B5.2 stays unbuilt.
 *
 * View is gated by the page (merchant:read); this tab never fires a write the role
 * lacks (merchant:manage-vouchers), and the backend requireAdminCapability stays
 * the enforcement.
 */
import { useState } from 'react'
import { Loader2, AlertCircle, Lock, Pencil, Send } from 'lucide-react'
import { useAdminRmvVouchers } from '@/lib/vouchers/useAdminRmvVouchers'
import { useAdminCustomVouchers } from '@/lib/vouchers/useAdminCustomVouchers'
import { RmvCoBuildDialog } from './RmvCoBuildDialog'
import { SubmitRmvDialog } from './SubmitRmvDialog'
import { Badge } from '@/features/shared/Badge'
import type { BadgeTone } from '@/features/shared/Badge'
import type { AdminRmvVoucher, AdminCustomVoucher } from '@/lib/api/vouchers'

const gbpFmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

function typeLabel(type: string): string {
  if (type === 'BOGO') return 'BOGO'
  const words = type.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function statusPill(status: string): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'DRAFT':
      return { label: 'Draft', tone: 'neutral' }
    case 'PENDING_APPROVAL':
      return { label: 'Pending approval', tone: 'warn' }
    case 'ACTIVE':
      return { label: 'Active', tone: 'success' }
    case 'INACTIVE':
      return { label: 'Inactive', tone: 'neutral' }
    default: {
      const words = status.toLowerCase().replace(/_/g, ' ')
      return { label: words.charAt(0).toUpperCase() + words.slice(1), tone: 'neutral' }
    }
  }
}

function approvalPill(approvalStatus: string): { label: string; tone: BadgeTone } {
  switch (approvalStatus) {
    case 'APPROVED':
      return { label: 'Approved', tone: 'success' }
    case 'PENDING':
      return { label: 'Pending', tone: 'warn' }
    case 'REJECTED':
      return { label: 'Rejected', tone: 'danger' }
    default: {
      const words = approvalStatus.toLowerCase().replace(/_/g, ' ')
      return { label: words.charAt(0).toUpperCase() + words.slice(1), tone: 'neutral' }
    }
  }
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
function formatDate(iso: string | null): string {
  if (!iso) return 'No expiry'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'No expiry' : dateFmt.format(d)
}

// The effective (staged) title/saving: the merchant's staged merchantFields value
// wins over the template default the read returns at the top level.
function effectiveTitle(v: AdminRmvVoucher): string {
  const staged = v.merchantFields.title
  return typeof staged === 'string' && staged.trim() !== '' ? staged : v.title
}
function effectiveSaving(v: AdminRmvVoucher): number {
  const staged = v.merchantFields.estimatedSaving
  const n = typeof staged === 'number' ? staged : Number(staged)
  return Number.isFinite(n) && staged != null && staged !== '' ? n : v.estimatedSaving
}

type OpenDialog =
  | { kind: 'edit'; voucher: AdminRmvVoucher }
  | { kind: 'submit'; voucher: AdminRmvVoucher }
  | null

interface VouchersTabProps {
  merchantId: string
  canManageVouchers: boolean
}

export function VouchersTab({ merchantId, canManageVouchers }: VouchersTabProps) {
  const { data, isLoading, isError, refetch } = useAdminRmvVouchers(merchantId, { enabled: true })
  const [dialog, setDialog] = useState<OpenDialog>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="workspace-vouchers-loading">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
        <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden="true" />
        <p className="mb-4 text-sm text-destructive">
          Could not load this merchant&apos;s vouchers. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={refetch}
          className="text-sm font-medium text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  const vouchers = data.vouchers
  const mandatoryCount = vouchers.length

  return (
    <div className="space-y-4" data-testid="workspace-vouchers">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">Vouchers</h2>
        <span data-testid="vouchers-mandatory-count">
          <Badge tone={mandatoryCount >= 2 ? 'success' : 'warn'}>
            Mandatory {mandatoryCount} / 2
          </Badge>
        </span>
      </div>

      {/* Honest lane banner */}
      <p className="rounded-md border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
        These are the merchant&apos;s mandatory flagship vouchers. Draft flagships can be co-built
        and submitted for go-live review on the merchant&apos;s behalf; submitted or live flagships
        are read-only here. Submitting only queues a voucher; an admin actioner still approves it
        separately.
      </p>

      {/* RMV cards */}
      {mandatoryCount === 0 ? (
        <div
          className="rounded-lg border border-border bg-card px-6 py-10 text-center"
          data-testid="vouchers-rmv-empty"
        >
          <p className="text-sm text-muted-foreground">
            No mandatory vouchers have been provisioned for this merchant yet.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {vouchers.map((v) => {
            const isDraft = v.status === 'DRAFT'
            const pill = statusPill(v.status)
            return (
              <li
                key={v.id}
                data-testid={`rmv-card-${v.id}`}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">{typeLabel(v.type)}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{v.code}</span>
                      <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        Mandatory (RMV)
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-foreground">{effectiveTitle(v)}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Saves about {gbpFmt.format(effectiveSaving(v))}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5" data-testid={`rmv-status-${v.id}`}>
                    <Badge tone={pill.tone}>{pill.label}</Badge>
                  </div>
                </div>

                {/* Affordances: DRAFT-only + capability-gated */}
                {isDraft && canManageVouchers ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setDialog({ kind: 'edit', voucher: v })}
                      data-testid={`rmv-edit-${v.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      Edit on behalf
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialog({ kind: 'submit', voucher: v })}
                      data-testid={`rmv-submit-${v.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Send className="size-4" aria-hidden="true" />
                      Submit for review
                    </button>
                  </div>
                ) : isDraft && !canManageVouchers ? (
                  <p
                    className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                    data-testid={`rmv-gated-${v.id}`}
                  >
                    <Lock className="size-3.5" aria-hidden="true" />
                    Editing a draft flagship needs the merchant:manage-vouchers capability.
                  </p>
                ) : (
                  <p
                    className="mt-4 text-xs text-muted-foreground"
                    data-testid={`rmv-readonly-${v.id}`}
                  >
                    Read-only: this flagship is no longer a draft.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* CUSTOM (RCV): real read-only section (A4). No mutations (B5.2 unbuilt). */}
      <CustomVouchersSection merchantId={merchantId} />

      {/* Dialogs */}
      {dialog?.kind === 'edit' && (
        <RmvCoBuildDialog
          merchantId={merchantId}
          voucher={dialog.voucher}
          onSuccess={() => setDialog(null)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'submit' && (
        <SubmitRmvDialog
          merchantId={merchantId}
          voucher={dialog.voucher}
          onSuccess={() => setDialog(null)}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  )
}

// ── Custom (RCV) vouchers: read-only roster (A4) ──────────────────────────────────

function CustomVoucherCard({ v }: { v: AdminCustomVoucher }) {
  const status = statusPill(v.status)
  const approval = approvalPill(v.approvalStatus)
  return (
    <li
      key={v.id}
      data-testid={`rcv-card-${v.id}`}
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{typeLabel(v.type)}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{v.code}</span>
            <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              Custom (RCV)
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">{v.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Saves about {gbpFmt.format(v.estimatedSaving)} · Expires {formatDate(v.expiryDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" data-testid={`rcv-status-${v.id}`}>
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone={approval.tone}>{approval.label}</Badge>
        </div>
      </div>
      {v.pendingEdit && (
        <p className="mt-3 text-xs text-muted-foreground" data-testid={`rcv-pending-${v.id}`}>
          {v.pendingEdit.kind === 'END' ? 'End request' : 'Change request'} awaiting review.
        </p>
      )}
    </li>
  )
}

function CustomVouchersSection({ merchantId }: { merchantId: string }) {
  const { data, isLoading, isError, refetch } = useAdminCustomVouchers(merchantId, { enabled: true })

  return (
    <section className="space-y-3" data-testid="vouchers-custom">
      <h3 className="text-sm font-semibold text-foreground">Custom vouchers (RCV)</h3>

      {isLoading ? (
        <div className="flex items-center justify-center py-8" data-testid="vouchers-custom-loading">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
        </div>
      ) : isError || !data ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center">
          <p className="mb-3 text-sm text-destructive">Could not load custom vouchers.</p>
          <button
            type="button"
            onClick={refetch}
            className="text-sm font-medium text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      ) : data.vouchers.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center"
          data-testid="vouchers-custom-empty"
        >
          <p className="text-sm text-muted-foreground">
            This merchant has no custom vouchers. Only the two mandatory flagship vouchers are set up.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.vouchers.map((v) => (
            <CustomVoucherCard key={v.id} v={v} />
          ))}
        </ul>
      )}
    </section>
  )
}
