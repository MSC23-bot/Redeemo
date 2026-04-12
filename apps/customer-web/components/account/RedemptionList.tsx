'use client'
import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { savingsApi } from '@/lib/api'

type Redemption = {
  id: string
  redeemedAt: string
  estimatedSaving: number
  isValidated: boolean
  merchant: { id: string; name: string; logoUrl: string | null }
  voucher: { id: string; title: string; voucherType: string }
  branch: { id: string; name: string }
}

type Props = { initial: Redemption[]; total: number }

export function RedemptionList({ initial, total }: Props) {
  const [items, setItems] = useState<Redemption[]>(initial)
  const [loading, setLoading] = useState(false)

  const loadMore = useCallback(async () => {
    setLoading(true)
    try {
      const data = await savingsApi.redemptions({ limit: 20, offset: items.length })
      setItems(prev => [...prev, ...data.redemptions])
    } finally {
      setLoading(false)
    }
  }, [items.length])

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <span className="text-4xl mb-3 block" aria-hidden>🎟</span>
        <p className="font-display text-[20px] text-navy mb-1">No redemptions yet</p>
        <p className="text-[14px] text-navy/45">Redeem vouchers in the Redeemo app to see them here.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-3">
        {items.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i, 5) * 0.06 }}
            className="bg-white border border-navy/[0.08] rounded-2xl p-4 flex items-center gap-4"
          >
            {/* Merchant logo */}
            <div className="w-10 h-10 rounded-full bg-navy/[0.06] overflow-hidden flex-shrink-0">
              {r.merchant.logoUrl
                ? <Image src={r.merchant.logoUrl} alt="" width={40} height={40} className="object-cover" />
                : <div className="w-full h-full" />
              }
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[14px] text-navy truncate">
                {r.merchant.name || r.merchant.id}
              </p>
              <p className="text-[12px] text-navy/45 truncate">{r.voucher.title}</p>
              <p className="font-mono text-[11px] text-navy/30 mt-0.5">
                {r.branch.name} · {new Date(r.redeemedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>

            {/* Right: saving + validated */}
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              {r.estimatedSaving > 0 && (
                <span className="font-mono text-[13px] font-bold text-red">
                  £{r.estimatedSaving.toFixed(2)}
                </span>
              )}
              {r.isValidated && (
                <span className="font-mono text-[10px] text-green-600 tracking-wide">✓ Validated</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {items.length < total && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="font-mono text-[12px] tracking-[0.1em] uppercase text-navy/45 border border-navy/[0.15] rounded-xl px-8 py-3 hover:border-navy/30 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
