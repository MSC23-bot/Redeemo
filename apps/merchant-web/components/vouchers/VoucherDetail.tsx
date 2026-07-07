'use client'

import * as React from 'react'
import Link from 'next/link'
import { Chip } from '@/components/ui/chip'
import { ExternalLink, Lock } from '@/lib/icons'
import {
  deriveDisplayState,
  DISPLAY_STATE_LABEL,
  type VoucherDisplayState,
} from '@/lib/voucher/displayState'
import type { CustomVoucherDetail } from '@/lib/api/voucher'
import { toChipType, voucherTypeLabel } from './typeChip'

// Day-2 Vouchers B4: the read-only per-state detail render. Shows ONLY safe core
// voucher fields (title / type / state / description / saving / terms / customer
// preview / where-it-applies merchant-wide / submission-review state) + the
// per-voucher redemption count + a View-redemptions deep-link. NEVER customer PII
// or a redemption PIN.
//
// The action menu (Edit / Submit / Delete / Duplicate) is injected via the
// `actions` slot (wired in B5); the concierge diff is injected via `changesBanner`
// (wired through the edit builder in B6). This component owns no mutation logic.

const STATE_COLOUR: Record<VoucherDisplayState, string> = {
  live: '#16A34A',
  'approved-waiting': '#2563EB',
  'in-review': '#D97706',
  draft: '#6B7390',
  'changes-requested': '#B45309',
  rejected: '#B91C1C',
  finished: '#6B7390',
  unknown: '#6B7390',
}

const STATE_HELP: Partial<Record<VoucherDisplayState, string>> = {
  live: 'This voucher is live and visible to customers on Redeemo.',
  'approved-waiting':
    'Approved. It goes live automatically once your business and flagship vouchers are live.',
  'in-review': 'Submitted for review. The Redeemo team will approve it or suggest changes.',
  draft: 'A draft only you can see. Submit it for review when you are ready.',
  'changes-requested': 'The Redeemo team suggested some changes. Open to edit and resubmit.',
  rejected: 'This voucher was not approved. You can duplicate it and try again.',
  finished: 'This voucher is no longer active.',
}

function money(n: number): string {
  const r = Math.round(n * 100) / 100
  return r % 1 === 0 ? String(r) : r.toFixed(2)
}

export function VoucherDetail({
  voucher,
  actions,
  changesBanner,
  flagship = false,
}: {
  voucher: CustomVoucherDetail
  /** B5 action buttons (Edit / Submit / Delete / Duplicate), state-gated by the parent. */
  actions?: React.ReactNode
  /** B6 concierge banner (CHANGES_REQUESTED) OR a governed-flow pending-edit banner. */
  changesBanner?: React.ReactNode
  /**
   * Voucher governed flows (2026-07-07): true for a flagship (isRmv) voucher.
   * Adds the "Flagship" pill + a locked notice; NEVER changes which actions
   * render (the parent page owns that - flagship never gets Edit/Submit/Delete).
   */
  flagship?: boolean
}) {
  const state = deriveDisplayState(voucher)
  const colour = STATE_COLOUR[state]
  const isReusable = voucher.type === 'REUSABLE'
  const isTimeLimited = voucher.type === 'TIME_LIMITED'

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Chip type={toChipType(voucher.type)}>{voucherTypeLabel(voucher.type)}</Chip>
            <span
              data-state-badge={state}
              className="rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide"
              style={{ background: `${colour}1A`, color: colour }}
            >
              {state === 'approved-waiting' ? 'Approved, waiting' : labelShort(state)}
            </span>
            {flagship ? (
              <span
                data-testid="voucher-detail-flagship-pill"
                className="inline-flex items-center gap-1 rounded-full bg-[#F3F4F6] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[#6B7390]"
              >
                <Lock size={12} /> Flagship
              </span>
            ) : null}
          </div>
          <h1 className="font-display text-2xl font-semibold text-foreground">{voucher.title}</h1>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>

      {/* The full state label + help, with the distinct approved-waiting wording. */}
      <div
        className="rounded-[12px] border p-4 text-sm"
        style={{ borderColor: `${colour}40`, background: `${colour}0D`, color: '#1F2A4A' }}
      >
        <p className="font-semibold" style={{ color: colour }}>
          {DISPLAY_STATE_LABEL[state]}
        </p>
        {STATE_HELP[state] ? <p className="mt-1 text-[#4B5366]">{STATE_HELP[state]}</p> : null}
        {voucher.approvalComment ? (
          <p className="mt-2 text-[#4B5366]">
            <span className="font-semibold">From the reviewer:</span> {voucher.approvalComment}
          </p>
        ) : null}
        {flagship ? (
          <p data-testid="voucher-detail-locked-notice" className="mt-2 font-semibold" style={{ color: colour }}>
            Always live: edits go to review, and this voucher cannot be deleted.
          </p>
        ) : null}
      </div>

      {changesBanner}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Section title="Description">
            <p className="text-sm leading-relaxed text-[#4B5366]">
              {voucher.description || 'No description added.'}
            </p>
          </Section>

          <Section title="Terms">
            <p className="text-sm leading-relaxed text-[#4B5366]">
              {voucher.terms || 'No terms added.'}
            </p>
          </Section>

          {isTimeLimited ? (
            <Section title="When it is available">
              <p className="text-sm leading-relaxed text-[#4B5366]">
                This is a time limited offer. Customers can redeem it only inside the
                day-and-time windows you set in the builder.
              </p>
            </Section>
          ) : null}

          {isReusable ? (
            <Section title="How often it can be used">
              <p className="text-sm leading-relaxed text-[#4B5366]">
                {voucher.cooldownSeconds
                  ? `Customers can use this again after ${formatCooldown(voucher.cooldownSeconds)}.`
                  : 'A reusable offer customers can come back and use again after a cooldown.'}
              </p>
            </Section>
          ) : null}

          <Section title="Where it applies">
            <p className="text-sm leading-relaxed text-[#4B5366]">
              This voucher applies across all your branches. New branches inherit it automatically.
            </p>
          </Section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[16px] border border-[#E5E7EB] bg-[#FFF9F5] p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-[#8089A4]">Customer preview</p>
            <p className="mt-2 font-display text-xl font-semibold text-[#010C35]">{voucher.title}</p>
            {voucher.estimatedSaving > 0 ? (
              <p className="mt-1 text-sm font-semibold text-[#16A34A]">
                Save about £{money(voucher.estimatedSaving)}
              </p>
            ) : null}
            {voucher.description ? (
              <p className="mt-2 text-sm leading-relaxed text-[#4B5366]">{voucher.description}</p>
            ) : null}
          </div>

          <div className="rounded-[16px] border border-[#E5E7EB] bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-[#8089A4]">Redemptions</p>
            <p className="mt-1 font-display text-3xl font-semibold text-[#010C35]">
              {voucher.redemptionCount}
            </p>
            <p className="text-[13px] text-[#6B7390]">
              {voucher.redemptionCount === 1 ? 'redemption' : 'redemptions'} so far
            </p>
            <Link
              href={`/redemptions?voucherId=${voucher.id}`}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#E20C04] hover:underline"
            >
              View redemptions <ExternalLink size={14} />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="text-sm font-bold text-[#010C35]">{title}</h2>
      {children}
    </section>
  )
}

function labelShort(state: VoucherDisplayState): string {
  switch (state) {
    case 'live':
      return 'Live'
    case 'in-review':
      return 'In review'
    case 'draft':
      return 'Draft'
    case 'changes-requested':
      return 'Changes requested'
    case 'rejected':
      return 'Rejected'
    case 'finished':
      return 'Finished'
    default:
      return 'Unknown'
  }
}

function formatCooldown(seconds: number): string {
  if (seconds % 604800 === 0) {
    const w = seconds / 604800
    return `${w} ${w === 1 ? 'week' : 'weeks'}`
  }
  if (seconds % 86400 === 0) {
    const d = seconds / 86400
    return `${d} ${d === 1 ? 'day' : 'days'}`
  }
  if (seconds % 3600 === 0) {
    const h = seconds / 3600
    return `${h} ${h === 1 ? 'hour' : 'hours'}`
  }
  const m = Math.round(seconds / 60)
  return `${m} minutes`
}
