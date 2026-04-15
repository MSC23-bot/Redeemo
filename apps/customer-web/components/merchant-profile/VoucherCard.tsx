'use client'
import { motion } from 'framer-motion'

type Voucher = {
  id: string
  title: string
  type: string
  description: string | null
  terms: string | null
  imageUrl: string | null
  estimatedSaving: number | null
  expiryDate: Date | string | null
}

const TYPE_LABELS: Record<string, string> = {
  BOGO:             'Buy One Get One',
  DISCOUNT:         'Discount',
  DISCOUNT_PERCENT: 'Discount',
  FREEBIE:          'Freebie',
  PACKAGE_DEAL:     'Package Deal',
  TIME_LIMITED:     'Time Limited',
  REUSABLE:         'Reusable',
  SPEND_AND_SAVE:   'Spend & Save',
}

// Each type gets its own identity colour applied to stripe, badge, tint surfaces, and stub
const TYPE_STYLES: Record<string, { text: string; bg: string; border: string; stripe: string }> = {
  BOGO:             { text: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE', stripe: '#7C3AED' },
  DISCOUNT:         { text: '#B91C1C', bg: '#FEF2F2', border: '#FECACA', stripe: '#E20C04' },
  DISCOUNT_PERCENT: { text: '#B91C1C', bg: '#FEF2F2', border: '#FECACA', stripe: '#E20C04' },
  FREEBIE:          { text: '#15803D', bg: '#F0FDF4', border: '#BBF7D0', stripe: '#16A34A' },
  PACKAGE_DEAL:     { text: '#0369A1', bg: '#EFF6FF', border: '#BFDBFE', stripe: '#0284C7' },
  TIME_LIMITED:     { text: '#B45309', bg: '#FFFBEB', border: '#FDE68A', stripe: '#D97706' },
  REUSABLE:         { text: '#0F766E', bg: '#F0FDFA', border: '#99F6E4', stripe: '#0D9488' },
  SPEND_AND_SAVE:   { text: '#9A3412', bg: '#FFF7ED', border: '#FED7AA', stripe: '#EA580C' },
}

const FALLBACK = { text: '#4B5563', bg: '#F8F9FA', border: '#E5E7EB', stripe: '#9CA3AF' }

export function VoucherCard({ voucher }: { voucher: Voucher }) {
  const typeLabel = TYPE_LABELS[voucher.type] ?? voucher.type
  const style = TYPE_STYLES[voucher.type] ?? FALLBACK
  const saving = voucher.estimatedSaving

  return (
    <motion.article
      whileHover={{ y: -3, boxShadow: `0 14px 40px ${style.border}80` }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="relative flex flex-col h-full rounded-2xl"
      style={{
        background: '#FFFFFF',
        border: '1px solid #EAE4DE',
        boxShadow: '0 2px 10px rgba(1,12,53,0.06)',
      }}
    >
      {/* Type-coloured left stripe */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{ background: style.stripe }}
        aria-hidden="true"
      />

      {/* ── Main body ── */}
      <div className="flex-1 pl-6 pr-5 pt-5 pb-3 flex flex-col">
        {/* Type badge + save badge */}
        <div className="flex items-start justify-between gap-3 mb-3.5">
          <span
            className="inline-block text-[10px] font-bold tracking-[0.12em] uppercase px-2.5 py-1 rounded-full flex-shrink-0"
            style={{ color: style.text, background: style.bg, border: `1.5px dashed ${style.border}` }}
          >
            {typeLabel}
          </span>
          {saving !== null && saving > 0 && (
            <span
              className="text-[11px] font-bold whitespace-nowrap px-2.5 py-1 rounded-full text-white flex-shrink-0"
              style={{ background: style.stripe }}
            >
              Save £{Math.round(saving)}
            </span>
          )}
        </div>

        {/* Title */}
        <h3
          className="font-display text-[#010C35] leading-[1.2] mb-2.5"
          style={{ fontSize: 'clamp(16px, 1.8vw, 19px)', letterSpacing: '-0.15px' }}
        >
          {voucher.title}
        </h3>

        {/* Description */}
        {voucher.description && (
          <p className="text-[13px] text-[#4B5563] leading-[1.65] mb-3 line-clamp-2">
            {voucher.description}
          </p>
        )}

        {/* Spacer keeps footer anchored */}
        <div className="flex-1" />

        {/* Terms — type-tinted pills */}
        {voucher.terms && (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {voucher.terms
              .split(/[,;\n]/)
              .map(t => t.trim())
              .filter(Boolean)
              .slice(0, 3)
              .map((term, i) => (
                <span
                  key={i}
                  className="inline-block text-[10.5px] px-2 py-0.5 rounded-full border"
                  style={{ color: style.text, background: style.bg, borderColor: style.border }}
                >
                  {term}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* ── Coupon separator — perforated tear line ── */}
      <div className="relative py-[13px] mx-4">
        <div
          className="absolute inset-x-0 top-1/2"
          style={{ borderTop: '1.5px dashed #D8D0C8', transform: 'translateY(-50%)' }}
        />
      </div>

      {/* ── Stub footer — uses type tint as background ── */}
      <div
        className="pl-6 pr-5 py-3.5 flex items-center justify-between rounded-b-2xl"
        style={{ background: style.bg }}
      >
        <span
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold"
          style={{ color: style.text }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" />
          </svg>
          Redeem in the app
        </span>
        {voucher.expiryDate && (
          <span className="text-[10.5px] text-[#9CA3AF] tabular-nums">
            Exp{' '}
            {new Date(voucher.expiryDate).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        )}
      </div>
    </motion.article>
  )
}
