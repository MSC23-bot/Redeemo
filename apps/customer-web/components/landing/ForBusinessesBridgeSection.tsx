'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number]

export function ForBusinessesBridgeSection() {
  return (
    <section className="bg-white py-14 md:py-18 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease }}
          className="relative overflow-hidden rounded-2xl px-7 py-8 md:px-10 md:py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6"
          style={{
            /* Rose to coral: deep brand red → warm coral */
            background: 'linear-gradient(135deg, #C40902 0%, #E20C04 45%, #E8500A 100%)',
            boxShadow:
              '0 20px 60px rgba(226,12,4,0.28), 0 6px 20px rgba(226,12,4,0.14)',
          }}
        >
          {/* Subtle specular highlight — upper-right */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(480px circle at 110% -20%, rgba(255,255,255,0.10), transparent 55%)',
            }}
          />

          <div className="relative max-w-[640px]">
            <h2
              className="font-display text-white leading-[1.2] mb-2"
              style={{ fontSize: 'clamp(20px, 2.5vw, 28px)', letterSpacing: '-0.2px' }}
            >
              Got a business? List it on Redeemo.
            </h2>
            <p className="text-[14px] text-white/72 leading-[1.65]">
              Any business with customers walking through the door can list for free. No commission. No listing fees. You design the vouchers.
            </p>
          </div>

          <Link
            href="/for-businesses"
            className="relative inline-flex items-center justify-center flex-shrink-0 font-semibold text-[14px] px-6 py-3 rounded-lg bg-white no-underline hover:bg-white/92 transition-colors"
            style={{
              color: '#010C35',
              boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
            }}
          >
            Find out more
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
