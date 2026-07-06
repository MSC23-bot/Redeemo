'use client'

/**
 * "Your live vouchers" ranked list (home-1): ACTIVE vouchers (flagship + custom) sorted
 * by redemptionCount desc. Reuse-only from GET /merchant/vouchers + /vouchers/rmv. House
 * style: no emojis, no em-dashes, tokens only.
 */
import * as React from 'react'
import Link from 'next/link'
import { Ticket, ArrowRight, Lock } from '@/lib/icons'

/** The minimal ACTIVE-voucher shape this list consumes (list-row compatible). */
export interface LiveVoucherRow {
  id: string
  title: string
  type: string
  redemptionCount: number
  isRmv?: boolean
}

const TYPE_LABEL: Record<string, string> = {
  BOGO: 'Buy one, get one free',
  SPEND_AND_SAVE: 'Spend & save',
  DISCOUNT_FIXED: 'Discount',
  DISCOUNT_PERCENT: 'Discount',
  DISCOUNT: 'Discount',
  FREEBIE: 'Freebie',
  PACKAGE_DEAL: 'Package deal',
  TIME_LIMITED: 'Time-limited',
  REUSABLE: 'Reusable',
}

function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? 'Voucher'
}

export function LiveVouchers({ vouchers }: { vouchers: LiveVoucherRow[] }) {
  return (
    <section
      data-testid="home-live-vouchers"
      aria-labelledby="home-live-vouchers-heading"
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
      style={{ borderColor: 'var(--border)' }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2
            id="home-live-vouchers-heading"
            className="text-base font-semibold"
            style={{ color: 'var(--navy)' }}
          >
            Your live vouchers
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Redemptions to date.
          </p>
        </div>
        <Link
          href="/insights"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold"
          style={{ color: 'var(--primary)' }}
        >
          View full insights
          <ArrowRight size={15} aria-hidden />
        </Link>
      </header>

      {vouchers.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No live vouchers yet.
        </p>
      ) : (
        <ul className="flex flex-col">
          {vouchers.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-3 border-b py-3.5 last:border-b-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: 'var(--tint)', color: 'var(--coral)' }}
                  aria-hidden
                >
                  <Ticket size={16} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold" style={{ color: 'var(--navy)' }}>
                      {v.title}
                    </span>
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
                      style={{ background: '#E9F7EF', color: '#0F7A3E' }}
                    >
                      <span
                        aria-hidden
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: '#0F7A3E' }}
                      />
                      Live
                    </span>
                  </span>
                  <span className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {typeLabel(v.type)}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-lg font-semibold leading-none" style={{ color: 'var(--navy)' }}>
                  {v.redemptionCount}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  redemptions
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
        <Lock size={12} aria-hidden />
        Every figure here is a total. We never show you who an individual customer is.
      </p>
    </section>
  )
}
