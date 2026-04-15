'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

const CATEGORIES = ['All', 'Food & Drink', 'Health & Fitness', 'Beauty', 'Wellness', 'Local Guides', "Members' Picks"]

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number]

const PREVIEW_ARTICLES = [
  { category: 'Food & Drink',     title: 'The best independent restaurants in Manchester right now',      mins: 5 },
  { category: 'Health & Fitness', title: 'Why more Londoners are switching to boutique gyms',             mins: 4 },
  { category: "Members' Picks",   title: 'Hidden gems: the places our members keep going back to',        mins: 6 },
  { category: 'Beauty',           title: 'A guide to the best independent salons in Birmingham',          mins: 3 },
  { category: 'Local Guides',     title: 'Exploring Leeds: where to eat, train, and unwind',              mins: 7 },
  { category: 'Wellness',         title: "UK wellness on a budget: Redeemo members' favourites",          mins: 5 },
]

export function InsiderContent() {
  return (
    <>
      {/* ── Editorial hero — navy with rose glow ── */}
      <section className="relative overflow-hidden bg-[#010C35] py-20 md:py-28 px-6">
        {/* Glow */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(560px circle at 88% -8%, rgba(226,12,4,0.28), transparent 55%), radial-gradient(400px circle at 8% 112%, rgba(200,50,0,0.18), transparent 55%)',
          }}
        />

        {/* Ghost watermark */}
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-end pr-4 font-display text-white select-none pointer-events-none"
          style={{ fontSize: 'clamp(120px, 18vw, 220px)', opacity: 0.022, letterSpacing: '-4px' }}
        >
          Insider
        </span>

        <div className="relative max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease }}
            className="flex items-center gap-2 mb-6"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#E20C04] flex-shrink-0" aria-hidden="true" />
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/32">
              Redeemo Insider
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease }}
            className="font-display text-white leading-[1.08] mb-5"
            style={{ fontSize: 'clamp(36px, 5vw, 64px)', letterSpacing: '-0.5px' }}
          >
            Guides, picks,{' '}
            <span
              style={{
                background: 'var(--brand-gradient)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              and hidden gems.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.22 }}
            className="text-[15px] text-white/45 max-w-[460px] leading-[1.72]"
          >
            Written by Redeemo members and our local editors. Real places, real experiences.
          </motion.p>
        </div>
      </section>

      {/* ── Category filter pills — sticky ── */}
      <nav
        className="bg-[#010C35] border-b border-white/[0.06] sticky top-[84px] z-40"
        aria-label="Category filters"
      >
        <div className="max-w-7xl mx-auto px-6 py-3 flex gap-2 overflow-x-auto">
          {CATEGORIES.map((cat, i) => (
            <span
              key={cat}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[13px] font-medium cursor-default transition-colors ${
                i === 0 ? 'text-white' : 'text-white/42 hover:text-white/72'
              }`}
              style={
                i === 0
                  ? { background: 'var(--brand-gradient)' }
                  : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }
              }
            >
              {cat}
            </span>
          ))}
        </div>
      </nav>

      {/* ── Coming soon — preview grid ── */}
      <section className="bg-[#F8F7F5] py-16 md:py-20 px-6">
        <div className="max-w-7xl mx-auto">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease }}
            className="text-center mb-14"
          >
            <span
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold tracking-[0.14em] uppercase text-white mb-6"
              style={{ background: 'var(--brand-gradient)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white/60" aria-hidden="true" />
              Coming soon
            </span>
            <h2
              className="font-display text-[#010C35] leading-[1.1] mb-4"
              style={{ fontSize: 'clamp(24px, 3vw, 36px)', letterSpacing: '-0.3px' }}
            >
              The Insider is being curated.
            </h2>
            <p className="text-[14.5px] text-[#6B7280] max-w-[380px] mx-auto leading-[1.72]">
              Local guides, member picks, and staff recommendations are on their way.
              Here is a preview of what to expect.
            </p>
          </motion.div>

          {/* Preview article cards — slightly faded to signal coming soon */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {PREVIEW_ARTICLES.map((article, i) => (
              <motion.div
                key={article.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: i * 0.07, ease }}
                className="bg-white rounded-2xl overflow-hidden border border-[#EDE8E8]"
                style={{ opacity: 0.62 }}
              >
                {/* Placeholder image area */}
                <div
                  className="h-[152px] w-full relative"
                  style={{ background: 'linear-gradient(135deg, #F3F1EF 0%, #EAE8E5 100%)' }}
                >
                  {/* Category stripe */}
                  <div
                    className="absolute top-0 left-0 right-0 h-[3px]"
                    style={{ background: 'var(--brand-gradient)' }}
                  />
                  {/* Placeholder lines */}
                  <div className="absolute bottom-4 left-4 flex flex-col gap-1.5">
                    <div className="h-2 w-20 rounded-full bg-[#DDD9D5]" />
                    <div className="h-2 w-32 rounded-full bg-[#DDD9D5]" />
                  </div>
                </div>

                <div className="p-5">
                  <span className="inline-block text-[10px] font-bold tracking-[0.14em] uppercase text-[#E20C04] mb-3">
                    {article.category}
                  </span>
                  <h3 className="font-display text-[#010C35] text-[15px] leading-[1.3] mb-4">
                    {article.title}
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#9CA3AF]">{article.mins} min read</span>
                    <span className="text-[11px] font-bold tracking-[0.10em] uppercase text-[#9CA3AF]">
                      Soon
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3, ease }}
            className="text-center mt-14"
          >
            <p className="text-[14px] text-[#6B7280] mb-5">
              In the meantime, start exploring what is near you.
            </p>
            <Link
              href="/discover"
              className="inline-flex items-center gap-2 text-white font-semibold text-[14px] px-7 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'var(--brand-gradient)' }}
            >
              Discover merchants
            </Link>
          </motion.div>
        </div>
      </section>
    </>
  )
}
