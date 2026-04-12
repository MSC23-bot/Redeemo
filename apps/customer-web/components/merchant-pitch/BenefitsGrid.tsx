'use client'
import { motion } from 'framer-motion'

const HERO_BENEFITS = [
  {
    icon: '🎯',
    title: 'Reach motivated local buyers',
    body: 'Redeemo subscribers pay for access to local offers. They are actively looking to spend — not passively browsing social media.',
  },
  {
    icon: '£0',
    title: 'Free to list, always',
    body: 'No listing fee. No commission on redemptions. Create your profile, add your vouchers, get approved. Your only optional cost is featured placement.',
  },
]

const SUB_BENEFITS = [
  { icon: '📊', title: 'Redemption analytics', body: 'See which vouchers drive footfall, tracked per branch and time period.' },
  { icon: '📍', title: 'Location-targeted exposure', body: 'Your business appears to subscribers within your area — people who can actually visit.' },
  { icon: '⚡', title: 'In-store validation in seconds', body: 'Staff scan a QR code or enter a code in the merchant app. No hardware needed.' },
  { icon: '🚀', title: 'Featured campaigns', body: 'Purchase featured placement to appear at the top of local discovery feeds when you want a boost.' },
]

export function BenefitsGrid() {
  return (
    <section className="bg-white py-24 px-6">
      <div className="max-w-screen-xl mx-auto">
        <div className="mb-14">
          <p className="font-mono text-xs tracking-[0.12em] uppercase text-red mb-4">Why Redeemo</p>
          <h2 className="font-display text-[clamp(30px,3.5vw,48px)] font-normal text-navy leading-[1.12] max-w-2xl">
            Everything your business needs to grow locally
          </h2>
        </div>

        {/* Hero benefit cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {HERO_BENEFITS.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-navy rounded-2xl p-10 flex flex-col gap-6 min-h-[260px]"
            >
              <span className="text-4xl" aria-hidden>{b.icon}</span>
              <div>
                <h3 className="font-display text-[26px] font-normal text-white leading-[1.2] mb-3">{b.title}</h3>
                <p className="text-[15px] leading-relaxed text-white/60">{b.body}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Sub-benefit cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {SUB_BENEFITS.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className="bg-surface-muted rounded-xl p-7 border border-navy/[0.05] flex flex-col gap-4"
            >
              <span className="text-2xl" aria-hidden>{b.icon}</span>
              <div>
                <h3 className="font-display text-[18px] font-normal text-navy leading-snug mb-2">{b.title}</h3>
                <p className="text-[13px] leading-relaxed text-navy/55">{b.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
