'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

const CATEGORIES = [
  { label: 'Restaurants',       dot: 'var(--brand-rose)' },
  { label: 'Cafes',             dot: 'var(--brand-coral)' },
  { label: 'Gyms & Fitness',    dot: 'var(--brand-rose)' },
  { label: 'Salons & Beauty',   dot: 'var(--brand-coral)' },
  { label: 'Retail',            dot: 'var(--brand-rose)' },
  { label: 'Entertainment',     dot: 'var(--brand-coral)' },
  { label: 'Wellness',          dot: 'var(--brand-rose)' },
  { label: 'Food & Drink',      dot: 'var(--brand-coral)' },
]

export function CategorySection() {
  return (
    <section className="bg-[#FEF6F5] py-20 px-6">
      <div className="max-w-screen-xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-red mb-3">What&apos;s on offer</p>
          <h2 className="font-display text-navy leading-tight" style={{ fontSize: 'clamp(26px, 3vw, 38px)' }}>Browse by category</h2>
        </motion.div>

        <div className="flex flex-wrap gap-3">
          {CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
            >
              <Link
                href={`/search?q=${encodeURIComponent(cat.label)}`}
                className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white border border-navy/[0.1] text-[14px] font-medium text-navy hover:border-navy/25 hover:shadow-sm transition-all no-underline"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: cat.dot }}
                  aria-hidden
                />
                {cat.label}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
