'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { favouritesApi, type MerchantTileData } from '@/lib/api'

// Voucher shape as returned by favouritesApi.listVouchers()
type FavouriteVoucher = {
  id: string
  title: string
  type: string
  estimatedSaving: number | null
  imageUrl: string | null
  status: string
  approvalStatus: string
  merchant: { id: string; businessName: string; logoUrl: string | null }
  favouritedAt: string
}

type Props = {
  merchants: MerchantTileData[]
  vouchers: FavouriteVoucher[]
}

type Tab = 'merchants' | 'vouchers'

function MerchantCard({ m, onRemove }: { m: MerchantTileData; onRemove: (id: string) => void }) {
  const name = m.tradingName ?? m.businessName
  return (
    <motion.div
      layout
      exit={{ scale: 0.85, opacity: 0, transition: { duration: 0.2 } }}
      className="bg-white border border-navy/[0.08] rounded-2xl overflow-hidden relative group"
    >
      {/* Remove button */}
      <button
        onClick={() => onRemove(m.id)}
        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 border border-navy/[0.08] flex items-center justify-center text-navy/30 hover:text-red hover:border-red/20 transition-colors z-10"
        aria-label={`Remove ${name} from favourites`}
      >
        ✕
      </button>

      <Link href={`/merchants/${m.id}`} className="block p-5 no-underline">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-navy/[0.06] overflow-hidden flex-shrink-0">
            {m.logoUrl && <Image src={m.logoUrl} alt="" width={40} height={40} className="object-cover" />}
          </div>
          <div className="min-w-0">
            {m.primaryCategory && (
              <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-orange-red block">
                {m.primaryCategory.name}
              </span>
            )}
            <p className="font-display text-[17px] text-navy leading-snug truncate">{name}</p>
          </div>
        </div>

        {m.voucherCount > 0 && (
          <p className="text-[12px] text-navy/45">
            {m.voucherCount} voucher{m.voucherCount !== 1 ? 's' : ''} available
            {m.maxEstimatedSaving != null && m.maxEstimatedSaving > 0
              ? ` · Save up to £${m.maxEstimatedSaving.toFixed(0)}`
              : ''}
          </p>
        )}
      </Link>
    </motion.div>
  )
}

function VoucherCard({ v, onRemove }: { v: FavouriteVoucher; onRemove: (id: string) => void }) {
  const saving = v.estimatedSaving != null ? Number(v.estimatedSaving) : NaN
  return (
    <motion.div
      layout
      exit={{ scale: 0.85, opacity: 0, transition: { duration: 0.2 } }}
      className="bg-white border border-navy/[0.08] rounded-2xl p-5 relative"
    >
      {/* Remove button */}
      <button
        onClick={() => onRemove(v.id)}
        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 border border-navy/[0.08] flex items-center justify-center text-navy/30 hover:text-red hover:border-red/20 transition-colors"
        aria-label={`Remove ${v.title} from favourites`}
      >
        ✕
      </button>

      {/* Merchant info */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-navy/[0.06] overflow-hidden flex-shrink-0">
          {v.merchant.logoUrl && (
            <Image src={v.merchant.logoUrl} alt="" width={24} height={24} className="object-cover" />
          )}
        </div>
        <span className="font-mono text-[11px] text-navy/45 truncate">{v.merchant.businessName}</span>
      </div>

      <p className="font-display text-[18px] text-navy leading-snug mb-2 pr-8">{v.title}</p>

      <div className="flex flex-wrap gap-2 mb-3">
        <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-navy/45 border border-navy/[0.1] rounded-full px-2.5 py-0.5">
          {v.type.replace(/_/g, ' ')}
        </span>
        {!isNaN(saving) && saving > 0 && (
          <span className="text-[11px] font-semibold text-red bg-red/[0.07] px-2.5 py-0.5 rounded-full">
            Save up to £{saving.toFixed(0)}
          </span>
        )}
      </div>

      <p className="font-mono text-[11px] text-orange-red tracking-wide">
        <span aria-hidden>📱</span> Redeem in the Redeemo app
      </p>
    </motion.div>
  )
}

export function FavouritesList({ merchants: initialMerchants, vouchers: initialVouchers }: Props) {
  const [tab, setTab] = useState<Tab>('merchants')
  const [merchants, setMerchants] = useState(initialMerchants)
  const [vouchers, setVouchers] = useState(initialVouchers)

  const removeMerchant = async (id: string) => {
    setMerchants(prev => prev.filter(m => m.id !== id))
    try {
      await favouritesApi.removeMerchant(id)
    } catch {
      // Optimistic remove — silently fail (item already gone from UI)
    }
  }

  const removeVoucher = async (id: string) => {
    setVouchers(prev => prev.filter(v => v.id !== id))
    try {
      await favouritesApi.removeVoucher(id)
    } catch {
      // Optimistic remove — silently fail
    }
  }

  const isEmpty = tab === 'merchants' ? merchants.length === 0 : vouchers.length === 0

  return (
    <div>
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Favourites tabs"
        className="flex gap-1 mb-8 border-b border-navy/[0.06]"
      >
        {(['merchants', 'vouchers'] as Tab[]).map(t => (
          <button
            key={t}
            id={`fav-tab-${t}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`fav-panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                const next = t === 'merchants' ? 'vouchers' : 'merchants'
                setTab(next)
                document.getElementById(`fav-tab-${next}`)?.focus()
              }
              if (e.key === 'ArrowLeft') {
                const prev = t === 'merchants' ? 'vouchers' : 'merchants'
                setTab(prev)
                document.getElementById(`fav-tab-${prev}`)?.focus()
              }
            }}
            className={`relative px-5 py-3 font-mono text-[12px] tracking-[0.08em] uppercase transition-colors ${
              tab === t ? 'text-navy' : 'text-navy/40 hover:text-navy/70'
            }`}
          >
            {t === 'merchants' ? `Merchants (${merchants.length})` : `Vouchers (${vouchers.length})`}
            {tab === t && (
              <motion.span
                layoutId="fav-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red to-orange-red"
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {isEmpty ? (
          <motion.div
            key={`empty-${tab}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="tabpanel"
            id={`fav-panel-${tab}`}
            aria-labelledby={`fav-tab-${tab}`}
            className="text-center py-16"
          >
            <span className="text-4xl mb-3 block" aria-hidden>
              {tab === 'merchants' ? '🏪' : '🎟'}
            </span>
            <p className="font-display text-[22px] text-navy mb-1">
              No favourite {tab} yet
            </p>
            <p className="text-[14px] text-navy/45">
              {tab === 'merchants'
                ? 'Heart a merchant on the discover feed to save it here.'
                : 'Heart a voucher on a merchant profile to save it here.'}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            role="tabpanel"
            id={`fav-panel-${tab}`}
            aria-labelledby={`fav-tab-${tab}`}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <AnimatePresence>
              {tab === 'merchants'
                ? merchants.map(m => (
                    <MerchantCard key={m.id} m={m} onRemove={removeMerchant} />
                  ))
                : vouchers.map(v => (
                    <VoucherCard key={v.id} v={v} onRemove={removeVoucher} />
                  ))
              }
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
