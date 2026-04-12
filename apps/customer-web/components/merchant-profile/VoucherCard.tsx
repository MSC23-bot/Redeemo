'use client'
import { motion } from 'framer-motion'

type Voucher = {
  id: string
  title: string
  type: string
  description: string | null
  terms: string | null
  imageUrl: string | null
  estimatedSaving: unknown
  expiryDate: Date | string | null
}

const TYPE_LABELS: Record<string, string> = {
  BOGO: 'BOGO', DISCOUNT: 'Discount', FREEBIE: 'Freebie',
  PACKAGE_DEAL: 'Package', TIME_LIMITED: 'Time Limited', REUSABLE: 'Reusable',
  SPEND_AND_SAVE: 'Spend & Save',
}

const TYPE_COLOURS: Record<string, string> = {
  BOGO: 'bg-purple-50 text-purple-700 border-purple-200',
  DISCOUNT: 'bg-red/[0.07] text-red border-red/20',
  FREEBIE: 'bg-green-50 text-green-700 border-green-200',
  PACKAGE_DEAL: 'bg-blue-50 text-blue-700 border-blue-200',
  TIME_LIMITED: 'bg-orange-50 text-orange-700 border-orange-200',
  REUSABLE: 'bg-teal-50 text-teal-700 border-teal-200',
  SPEND_AND_SAVE: 'bg-yellow-50 text-yellow-700 border-yellow-200',
}

export function VoucherCard({ voucher, index }: { voucher: Voucher; index: number }) {
  const saving = typeof voucher.estimatedSaving === 'number' || typeof voucher.estimatedSaving === 'string'
    ? Number(voucher.estimatedSaving)
    : null

  const typeLabel = TYPE_LABELS[voucher.type] ?? voucher.type
  const typeColour = TYPE_COLOURS[voucher.type] ?? 'bg-navy/[0.05] text-navy/60 border-navy/10'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="bg-white border border-navy/[0.08] rounded-2xl p-5 flex gap-4 items-start"
    >
      {/* Left: type badge */}
      <div className="flex-shrink-0 pt-0.5">
        <span className={`font-mono text-[10px] tracking-[0.1em] uppercase px-2.5 py-1 rounded-full border ${typeColour}`}>
          {typeLabel}
        </span>
      </div>

      {/* Right: content */}
      <div className="flex-1 min-w-0">
        <h3 className="font-display text-[18px] text-navy leading-snug mb-1.5">
          {voucher.title}
        </h3>

        {voucher.description && (
          <p className="text-[13px] leading-relaxed text-navy/55 mb-2 line-clamp-2">
            {voucher.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {saving !== null && !isNaN(saving) && saving > 0 && (
            <span className="text-[12px] font-semibold text-red bg-red/[0.07] px-2.5 py-0.5 rounded-full border border-red/15">
              Save up to £{saving.toFixed(0)}
            </span>
          )}

          {voucher.expiryDate && (
            <span className="font-mono text-[11px] text-navy/35">
              Expires {new Date(voucher.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>

        {voucher.terms && (
          <p className="text-[11px] text-navy/35 mt-2 leading-relaxed line-clamp-1">
            T&Cs: {voucher.terms}
          </p>
        )}

        {/* Website-only redeem message — no button */}
        <p className="mt-3 text-[12px] font-mono text-orange-red tracking-wide">
          📱 Redeem in the Redeemo app
        </p>
      </div>
    </motion.div>
  )
}
