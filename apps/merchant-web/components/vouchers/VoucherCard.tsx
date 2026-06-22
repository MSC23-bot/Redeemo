'use client'

import * as React from 'react'
import { Chip } from '@/components/ui/chip'
import { Lock } from '@/lib/icons'
import {
  deriveDisplayState,
  DISPLAY_STATE_LABEL,
  DISPLAY_STATE_BADGE,
  type VoucherDisplayState,
} from '@/lib/voucher/displayState'
import { toChipType, voucherTypeLabel } from './typeChip'

// Day-2 Vouchers B3: a single voucher card. Flagship cards are read-only/locked
// (no edit/delete) and pinned by the list above the customs. Custom cards show the
// derived display-state badge + the per-voucher redemption count and are clickable
// through to the detail page. The action menu (Edit/Submit/Delete/Duplicate) is
// wired in B5 via the `actions` slot so this card has no management logic itself.
//
// The card renders ONLY safe core fields — never customer PII or a redemption PIN.

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

export interface VoucherCardData {
  id: string
  title: string
  type: string
  status: string
  approvalStatus: string
  estimatedSaving: number
  redemptionCount: number
  isRmv?: boolean
}

function money(n: number): string {
  const r = Math.round(n * 100) / 100
  return r % 1 === 0 ? String(r) : r.toFixed(2)
}

export function VoucherCard({
  voucher,
  flagship = false,
  onOpen,
  actions,
}: {
  voucher: VoucherCardData
  flagship?: boolean
  onOpen?: (id: string) => void
  /** B5 action menu slot (kebab). Flagship cards pass nothing (read-only). */
  actions?: React.ReactNode
}) {
  const state = deriveDisplayState(voucher)
  const colour = STATE_COLOUR[state]
  const clickable = !!onOpen

  return (
    <div
      data-voucher-card
      data-voucher-id={voucher.id}
      data-state={flagship ? 'flagship' : state}
      onClick={clickable ? () => onOpen?.(voucher.id) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen?.(voucher.id)
              }
            }
          : undefined
      }
      className={
        'flex flex-col gap-3 rounded-[14px] border bg-white p-4 transition-all ' +
        (clickable ? 'cursor-pointer border-[#E5E7EB] hover:border-[#D1D5DB] hover:shadow-[var(--shadow-sm)] ' : 'border-[#E5E7EB] ')
      }
    >
      <div className="flex items-start justify-between gap-3">
        <Chip type={toChipType(voucher.type)}>{voucherTypeLabel(voucher.type)}</Chip>
        {flagship ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#6B7390]">
            <Lock size={11} /> Flagship
          </span>
        ) : (
          <span
            data-state-badge={state}
            title={DISPLAY_STATE_LABEL[state]}
            className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
            style={{ background: `${colour}1A`, color: colour }}
          >
            {DISPLAY_STATE_BADGE[state]}
          </span>
        )}
      </div>

      <p className="font-display text-[17px] font-semibold leading-snug text-[#010C35]">{voucher.title}</p>

      {state === 'approved-waiting' && !flagship ? (
        <p className="text-xs leading-relaxed text-[#2563EB]">{DISPLAY_STATE_LABEL['approved-waiting']}</p>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="text-[13px] text-[#6B7390]">
          {voucher.estimatedSaving > 0 ? `Saves about £${money(voucher.estimatedSaving)}` : 'Saving not set'}
          {' · '}
          {voucher.redemptionCount} {voucher.redemptionCount === 1 ? 'redemption' : 'redemptions'}
        </span>
        {flagship ? (
          <span className="text-xs font-medium text-[#8089A4]">Always live · edits go to review</span>
        ) : (
          actions ?? null
        )}
      </div>
    </div>
  )
}
