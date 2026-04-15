'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getAccessToken } from '@/lib/auth'
import { VoucherCard } from './VoucherCard'

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

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
}

export function VouchersSection({ vouchers }: { vouchers: Voucher[] }) {
  const [showNudge, setShowNudge] = useState(false)

  useEffect(() => {
    setShowNudge(!getAccessToken())
  }, [])

  if (vouchers.length === 0) {
    return (
      <section id="vouchers" className="max-w-7xl mx-auto px-6 py-10 md:py-12 border-b border-[#EDE8E8]">
        <h2
          className="font-display text-[#010C35] leading-tight mb-3"
          style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', letterSpacing: '-0.2px' }}
        >
          Member vouchers
        </h2>
        <p className="text-[14px] text-[#9CA3AF]">No active vouchers at the moment.</p>
      </section>
    )
  }

  return (
    <motion.section
      id="vouchers"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-7xl mx-auto px-6 py-10 md:py-12 border-b border-[#EDE8E8]"
    >
      <div className="mb-7">
        <h2
          className="font-display text-[#010C35] leading-tight mb-2"
          style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', letterSpacing: '-0.2px' }}
        >
          Member vouchers
        </h2>
        <p className="text-[13.5px] text-[#9CA3AF]">
          {vouchers.length} {vouchers.length === 1 ? 'voucher' : 'vouchers'} available
          &nbsp;&middot;&nbsp;Browsing is free. Subscribe to redeem.
        </p>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl"
      >
        {vouchers.map(v => (
          <motion.div key={v.id} variants={cardVariants} className="flex flex-col">
            <VoucherCard voucher={v} />
          </motion.div>
        ))}
      </motion.div>

      {showNudge && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.25 }}
          className="mt-8 max-w-5xl rounded-2xl border border-[#EDE8E8] p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-5 overflow-hidden relative"
          style={{ background: 'linear-gradient(135deg, #FEF6F5 0%, #FFF8F7 100%)' }}
        >
          {/* Subtle red glow top-right */}
          <div
            aria-hidden="true"
            className="absolute top-0 right-0 w-40 h-40 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(226,12,4,0.08) 0%, transparent 70%)', transform: 'translate(20%, -20%)' }}
          />
          <div className="flex-1 min-w-0 relative">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#E20C04] mb-1.5">
              Member-only
            </p>
            <h3
              className="font-display text-[#010C35] leading-[1.2] mb-2"
              style={{ fontSize: 'clamp(18px, 2.2vw, 22px)', letterSpacing: '-0.15px' }}
            >
              You can see every voucher. Subscribe to redeem them.
            </h3>
            <p className="text-[13.5px] text-[#4B5563] leading-[1.6]">
              Redeemo membership starts at £6.99 a month. One subscription unlocks every voucher at every merchant.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:flex-shrink-0 relative">
            <Link
              href="/subscribe"
              className="inline-block text-white font-semibold text-[14px] px-6 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity whitespace-nowrap"
              style={{ background: 'var(--brand-gradient)' }}
            >
              Subscribe and redeem
            </Link>
            <Link
              href="/register"
              className="inline-block text-[#010C35] font-semibold text-[14px] px-6 py-3 rounded-lg border border-[#EDE8E8] bg-white no-underline hover:border-[#010C35]/40 transition-colors whitespace-nowrap"
            >
              Join free
            </Link>
          </div>
        </motion.div>
      )}
    </motion.section>
  )
}
