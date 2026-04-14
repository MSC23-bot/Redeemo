'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

export function MerchantCtaSection() {
  return (
    <section className="bg-navy py-20 px-6 overflow-hidden">
      <div className="max-w-screen-lg mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-10">

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
        >
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-orange-red mb-3">For businesses</p>
          <h2 className="font-display text-white leading-[1.2] max-w-[480px]" style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}>
            Attract new local customers. Free to list.
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="flex-shrink-0"
        >
          <Link
            href="/merchants"
            className="inline-block bg-white text-navy font-bold text-[15px] px-8 py-3.5 rounded-xl no-underline hover:bg-white/90 transition-colors"
          >
            Learn more →
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
