'use client'

/**
 * "Needs your attention" action list (home-1), assembled CLIENT-SIDE from the reads the
 * dashboard already holds (profile pending edits, branch location/edit state, voucher
 * changes-requested). Each row links to the relevant page. Empty -> a calm all-caught-up
 * state. House style: no emojis, no em-dashes, tokens only.
 */
import * as React from 'react'
import Link from 'next/link'
import { MapPin, FileText, Ticket, ChevronDown, CheckCircle2 } from '@/lib/icons'

export type AttentionIconKind = 'location' | 'profile' | 'branch' | 'voucher'

export interface AttentionItem {
  key: string
  title: string
  subtitle: string
  href: string
  icon: AttentionIconKind
}

function iconFor(kind: AttentionIconKind) {
  if (kind === 'location') return <MapPin size={16} />
  if (kind === 'voucher') return <Ticket size={16} />
  if (kind === 'branch') return <FileText size={16} />
  return <FileText size={16} />
}

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  return (
    <section
      data-testid="home-needs-attention"
      aria-labelledby="home-attention-heading"
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm"
      style={{ borderColor: 'var(--border)' }}
    >
      <header className="flex items-center gap-2">
        <h2 id="home-attention-heading" className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
          Needs your attention
        </h2>
        {items.length > 0 ? (
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold"
            style={{ background: 'var(--tint)', color: 'var(--coral)' }}
          >
            {items.length}
          </span>
        ) : null}
      </header>

      {items.length === 0 ? (
        <div className="flex items-center gap-3" data-testid="home-attention-empty">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: '#E9F7EF', color: '#0F7A3E' }}
            aria-hidden
          >
            <CheckCircle2 size={20} />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>
              You are all caught up
            </span>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Nothing needs your attention right now.
            </span>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex items-center gap-3 rounded-xl border p-3.5 transition-colors hover:bg-[color-mix(in_srgb,var(--tint)_60%,transparent)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: 'var(--tint)', color: 'var(--coral)' }}
                  aria-hidden
                >
                  {iconFor(item.icon)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>
                    {item.title}
                  </span>
                  <span className="truncate text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {item.subtitle}
                  </span>
                </span>
                <span aria-hidden className="shrink-0 -rotate-90" style={{ color: 'var(--text-muted)' }}>
                  <ChevronDown size={18} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
