'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

const CAPABILITIES = [
  {
    title: 'See every redemption',
    body: 'Which offer, which branch, when. Attributable, logged, exportable. Figures are totals: individual customers stay anonymous.',
  },
  {
    title: 'Run your offers',
    body: 'Create custom vouchers, set terms and time windows, submit changes for review. Your flagship offers stay live while edits are checked.',
  },
  {
    title: 'Manage branches and staff',
    body: 'Multiple locations under one account. Branch staff validate codes in the app; you control who has access to what.',
  },
]

/**
 * Real Merchant Portal screens (owner-approved prototype, fully synthetic
 * example business). Honesty rule: labelled as example data, and only modules
 * that exist for merchants are shown.
 */
export function PortalShowcaseSection() {
  return (
    <section style={{ background: '#FAFAF8' }} className="py-20 md:py-28 px-6 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mb-12"
        >
          <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] uppercase text-[#9CA3AF] mb-3">
            <span className="inline-block w-5 h-[2px] rounded-full bg-[#E20C04]" aria-hidden="true" />
            The Merchant Portal
          </span>
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-3"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            Your business, fully visible.
          </h2>
          <p className="text-[15px] text-[#4B5563] leading-[1.65] max-w-[560px]">
            One place to see what Redeemo brings you, update what you offer,
            and check every redemption. Shown here with an example business.
          </p>
        </motion.div>

        {/* Main portal frame */}
        <motion.figure
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="relative m-0"
        >
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              border: '1px solid #E5E0D8',
              boxShadow: '0 24px 70px rgba(1,12,53,0.13)',
              background: '#FFFFFF',
            }}
          >
            {/* Browser chrome */}
            <div
              className="flex items-center gap-2 px-4 py-2.5"
              style={{ background: '#F3F4F6', borderBottom: '1px solid #E5E7EB' }}
              aria-hidden="true"
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#E5E0D8' }} />
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#E5E0D8' }} />
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#E5E0D8' }} />
              <span
                className="ml-3 text-[11px] font-medium px-3 py-1 rounded-md"
                style={{ background: '#FFFFFF', color: '#9CA3AF', border: '1px solid #E5E7EB' }}
              >
                merchant.redeemo.co.uk
              </span>
            </div>
            <Image
              src="/portal/portal-home.png"
              alt="Merchant Portal home for an example business: redemptions over time, customers brought in, live vouchers and recent redemptions"
              width={2200}
              height={1601}
              className="w-full h-auto block"
              sizes="(max-width: 1152px) 100vw, 1152px"
            />
          </div>
          <figcaption className="mt-3 text-[12px] text-[#9CA3AF] text-center">
            Merchant Portal preview · example business with example data
          </figcaption>
        </motion.figure>

        {/* Voucher detail + capabilities */}
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-10 items-center">
          <motion.figure
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.55, ease: EASE }}
            className="m-0"
          >
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                border: '1px solid #E5E0D8',
                boxShadow: '0 18px 50px rgba(1,12,53,0.11)',
                background: '#FFFFFF',
              }}
            >
              <Image
                src="/portal/portal-voucher.png"
                alt="A voucher detail page in the Merchant Portal: the offer as customers see it, redemption counts and where it applies"
                width={2200}
                height={1228}
                className="w-full h-auto block"
                sizes="(max-width: 1024px) 100vw, 620px"
              />
            </div>
            <figcaption className="mt-3 text-[12px] text-[#9CA3AF]">
              A live offer, as you and your customers both see it. Example data.
            </figcaption>
          </motion.figure>

          <div className="flex flex-col gap-6">
            {CAPABILITIES.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.45, delay: i * 0.08, ease: EASE }}
                className="flex gap-4 items-start"
              >
                <span
                  className="mt-1 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white"
                  style={{ background: 'var(--brand-gradient)' }}
                  aria-hidden="true"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <div>
                  <h3 className="font-display text-[16.5px] font-semibold text-[#010C35] leading-snug mb-1.5" style={{ letterSpacing: '-0.1px' }}>
                    {c.title}
                  </h3>
                  <p className="text-[14px] text-[#4B5563] leading-[1.65]">{c.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
