'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getAccessToken } from '@/lib/auth'

/**
 * Shown to unauthenticated visitors on /discover.
 * Appears once the client has mounted and confirmed no token is present,
 * so authenticated users never see a flash of the nudge.
 */
export function NonMemberNudge() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(!getAccessToken())
  }, [])

  if (!show) return null

  return (
    <section className="px-6 pt-6 pb-2">
      <div className="max-w-7xl mx-auto">
        <div
          className="rounded-2xl border border-[#EDE8E8] p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6"
          style={{ background: 'linear-gradient(135deg, #FEF6F5 0%, #FFF8F7 100%)' }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#E20C04] mb-2">
              Browsing as a guest
            </p>
            <h3
              className="font-display text-[#010C35] leading-[1.2] mb-2"
              style={{ fontSize: 'clamp(20px, 2.4vw, 26px)', letterSpacing: '-0.2px' }}
            >
              You can see every merchant and every voucher.
            </h3>
            <p className="text-[14px] text-[#4B5563] leading-[1.65] max-w-[540px]">
              Subscribe from £6.99 a month to start redeeming them in the app. Cancel anytime.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:flex-shrink-0">
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
        </div>
      </div>
    </section>
  )
}
