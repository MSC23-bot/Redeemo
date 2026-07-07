'use client'

/**
 * M3 F3: the merchant-safe redemption detail surface, presented as a right-side
 * DRAWER (prototype fidelity). Shows a voucher hero (title, type, saving, optional
 * description), the terms rendered as a tick checklist, a "View voucher" link, the
 * branch / redeemed / code facts, and an "IN-PERSON VALIDATION" section:
 *   - AWAITING  -> an explanatory note + an embedded "Validate this code" CTA that
 *                  opens the shared Validate-a-code flow pre-seeded with this code.
 *   - VALIDATED -> the method / when / by details.
 *
 * Reversal is intentionally NOT shown: there is no reversed state in the schema,
 * so the drawer never offers or implies a reverse action.
 *
 * Privacy: this surface only ever receives the curated merchant-safe row (no
 * email / phone / PIN); customerName is pre-formatted first name + last initial.
 */
import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { StatusPill } from '@/components/redemptions/StatusPill'
import { useValidateDialog } from '@/components/redemptions/validateDialogContext'
import { Check, ExternalLink, ScanLine, X } from '@/lib/icons'
import {
  formatRedemptionCode,
  formatRedeemedAt,
  formatSaving,
  voucherTypeChip,
  voucherTypeLabel,
  voucherTypeAccent,
} from '@/lib/redemptions/display'
import type { RedemptionRow } from '@/lib/api/redemptions'

const labelClass = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const sectionLabelClass = 'text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <span className={labelClass}>{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{children}</span>
    </div>
  )
}

// Voucher.terms is a single string; render newline-separated lines as a bulleted
// tick checklist (a single blob term renders as one item). Blank lines are
// dropped; the line content is preserved (whitespace kept via pre-wrap).
function TermsChecklist({ terms }: { terms: string }) {
  const lines = terms.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return null
  return (
    <div className="space-y-1.5">
      <p className={sectionLabelClass}>Terms</p>
      <ul className="space-y-1.5">
        {lines.map((line, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check
              size={15}
              strokeWidth={2.5}
              aria-hidden="true"
              className="mt-0.5 shrink-0"
              style={{ color: 'var(--success)' }}
            />
            <span className="whitespace-pre-wrap">{line.trim()}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RedemptionDetail({
  row,
  onClose,
  // Whether to offer the "View voucher" link. The /vouchers surface is OWNER /
  // BRANCH_MANAGER only (STAFF sees Redemptions but not Vouchers), so a STAFF /
  // null / unknown viewer must NOT be offered the link. Defaults false so the
  // affordance fails closed if a caller forgets to pass it.
  canViewVoucher = false,
}: {
  row: RedemptionRow
  onClose: () => void
  canViewVoucher?: boolean
}) {
  const { openValidate } = useValidateDialog()
  const panelRef = React.useRef<HTMLDivElement>(null)
  const previouslyFocused = React.useRef<HTMLElement | null>(null)

  // On open: remember the trigger, move focus in. On close: restore focus.
  React.useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const target = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? null
    target?.focus()
    return () => {
      previouslyFocused.current?.focus?.()
    }
    // Mount/unmount only.
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    if (focusables.length === 0) {
      e.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement as HTMLElement | null
    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (active === last || !panel.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  // description / terms are optional passthrough fields (the curated redemption
  // row does not always carry them); render only when present.
  const voucher = row.voucher as RedemptionRow['voucher'] & {
    description?: string | null
    terms?: string | null
  }
  const accent = voucherTypeAccent(voucher.type)
  const isAwaiting = row.status === 'AWAITING_VALIDATION'

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onKeyDown={handleKeyDown}>
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
        data-testid="redemption-detail-scrim"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Redemption detail"
        aria-modal="true"
        className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card shadow-xl"
        data-testid="redemption-detail-dialog"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="font-display text-base font-semibold text-foreground">Redemption detail</h2>
          <Button
            variant="secondary"
            size="icon"
            className="size-8"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </Button>
        </header>

        <div className="flex-1 space-y-5 px-5 py-5">
          {/* Customer + status */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="font-display text-lg font-semibold text-foreground">{row.customerName}</p>
              <p className="text-sm text-muted-foreground">Customer</p>
            </div>
            <StatusPill status={row.status} />
          </div>

          {/* Voucher hero */}
          <div className="overflow-hidden rounded-xl border border-border">
            <div
              className="px-4 py-4"
              style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)` }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">Redeemo</p>
              <p className="mt-1 font-display text-lg font-semibold text-white">{voucher.title}</p>
            </div>
            <div className="space-y-3 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <Chip type={voucherTypeChip(voucher.type)}>{voucherTypeLabel(voucher.type)}</Chip>
                <span className="text-base font-semibold text-foreground">
                  {formatSaving(row.estimatedSaving)}
                </span>
              </div>
              {voucher.description && (
                <p className="text-sm text-muted-foreground">{voucher.description}</p>
              )}
              {voucher.terms && <TermsChecklist terms={voucher.terms} />}
              {canViewVoucher && (
                <Button variant="secondary" className="w-full" asChild>
                  <Link href={`/vouchers/${voucher.id}`}>
                    <ExternalLink size={15} aria-hidden="true" /> View voucher
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/* Facts */}
          <div className="rounded-xl border border-border bg-card px-4 py-1">
            <DetailRow label="Branch">{row.branch.name}</DetailRow>
            <DetailRow label={isAwaiting ? 'Redeemed in app' : 'Redeemed'}>
              {formatRedeemedAt(row.redeemedAt)}
            </DetailRow>
            <DetailRow label="Code">{formatRedemptionCode(row.redemptionCode)}</DetailRow>
          </div>

          {/* In-person validation */}
          <div className="space-y-2">
            <p className={sectionLabelClass}>In-person validation</p>
            {isAwaiting ? (
              <div className="space-y-3 rounded-xl border border-[#E84A00]/20 bg-[#FFF6F0] px-4 py-4">
                <p className="text-sm text-foreground">
                  Not yet validated. The customer has this code, and staff confirm it by QR scan in
                  person or by entering the code, at the counter or later. Validate it per code, never
                  in bulk.
                </p>
                <Button
                  variant="gradient"
                  className="w-full"
                  onClick={() => {
                    openValidate(row.redemptionCode)
                    onClose()
                  }}
                >
                  <ScanLine size={16} aria-hidden="true" /> Validate this code
                </Button>
              </div>
            ) : (
              <div
                className="rounded-xl border px-4 py-1"
                style={{ borderColor: 'rgba(15,122,62,0.25)', background: 'rgba(15,122,62,0.05)' }}
              >
                {row.validationMethod && (
                  <DetailRow label="Method">
                    {row.validationMethod === 'MANUAL' ? 'Manual entry' : 'QR scan'}
                  </DetailRow>
                )}
                <DetailRow label="When">{formatRedeemedAt(row.validatedAt)}</DetailRow>
                {row.validatedByLabel && <DetailRow label="By">{row.validatedByLabel}</DetailRow>}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Redemption records are permanent. We never show a customer&apos;s email or phone.
          </p>
        </div>
      </div>
    </div>
  )
}
