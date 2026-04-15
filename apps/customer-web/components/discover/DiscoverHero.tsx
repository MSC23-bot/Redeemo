'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'

type LocationContext = {
  city: string | null
  source: 'coordinates' | 'profile' | 'none'
}

export function DiscoverHero({
  locationContext,
  activeView = 'list',
}: {
  locationContext: LocationContext
  activeView?: 'list' | 'map'
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  const locationLabel =
    locationContext.city ??
    (locationContext.source === 'coordinates' ? 'Near you' : 'Everywhere')

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    router.push(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <section
      className="relative overflow-hidden px-6 pt-14 md:pt-18 pb-12 md:pb-14"
      style={{ background: '#010C35' }}
    >
      {/* Red radial glow — top right, brand signature */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(680px circle at 88% -10%, rgba(226,12,4,0.36), transparent 52%), radial-gradient(440px circle at 5% 120%, rgba(200,50,0,0.18), transparent 55%)',
        }}
      />

      {/* Subtle grid texture — depth and texture */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />

      <div className="relative max-w-7xl mx-auto">
        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/50 mb-4"
        >
          Discover
        </motion.p>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="font-display text-white leading-[1.06] mb-3 max-w-[760px]"
          style={{ fontSize: 'clamp(30px, 4.5vw, 52px)', letterSpacing: '-0.6px' }}
        >
          {locationContext.city ? (
            <>
              Good places, near{' '}
              <span className="gradient-text">{locationContext.city}.</span>
            </>
          ) : (
            <>
              Good places,{' '}
              <span className="gradient-text">near you.</span>
            </>
          )}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.18 }}
          className="text-[14.5px] text-white/55 leading-[1.65] max-w-[500px] mb-8"
        >
          Independent restaurants, cafes, gyms, and studios with exclusive vouchers. Browse freely — subscribe to redeem.
        </motion.p>

        {/* ── Search row ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.26, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col sm:flex-row gap-2.5 sm:items-stretch"
        >
          {/* Search input — white card pops against navy */}
          <form
            role="search"
            onSubmit={handleSubmit}
            className="flex-1 relative group"
            aria-label="Search Redeemo"
          >
            <span
              aria-hidden="true"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] group-focus-within:text-[#E20C04] transition-colors pointer-events-none"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search businesses, cuisines, or vouchers…"
              aria-label="Search businesses or vouchers"
              className="w-full h-[50px] pl-11 pr-5 rounded-xl bg-white text-[14.5px] text-[#010C35] placeholder:text-[#A0A8B4] outline-none focus:ring-2 focus:ring-[#E20C04]/25 transition-all"
              style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.22), 0 1px 4px rgba(0,0,0,0.12)' }}
            />
          </form>

          {/* Location chip */}
          <button
            type="button"
            aria-label={`Location: ${locationLabel}`}
            className="inline-flex items-center gap-2 h-[50px] px-4 rounded-xl border border-white/18 bg-white/8 backdrop-blur-sm text-white text-[13.5px] font-medium hover:bg-white/14 transition-colors whitespace-nowrap"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: '#E20C04' }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className="truncate max-w-[140px]">{locationLabel}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-white/40">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* View toggle */}
          <div
            role="tablist"
            aria-label="Discovery view"
            className="inline-flex h-[50px] rounded-xl border border-white/18 bg-white/8 backdrop-blur-sm p-1 self-start sm:self-auto flex-shrink-0"
          >
            <ViewTab active={activeView === 'list'} href="/discover" label="List">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </ViewTab>
            <ViewTab active={activeView === 'map'} href="/map" label="Map">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
              </svg>
            </ViewTab>
          </div>
        </motion.div>

        {/* Advanced search link */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.38 }}
          className="mt-4 text-[12.5px] text-white/38"
        >
          Need filters, sorting, or voucher type?{' '}
          <Link href="/search" className="text-white/60 font-medium no-underline hover:text-white transition-colors">
            Advanced search →
          </Link>
        </motion.p>
      </div>
    </section>
  )
}

function ViewTab({
  active,
  href,
  label,
  children,
}: {
  active: boolean
  href: string
  label: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      aria-label={`${label} view`}
      className={`inline-flex items-center gap-1.5 px-3.5 rounded-lg text-[12.5px] font-semibold transition-all no-underline ${
        active
          ? 'bg-white text-[#010C35] shadow-sm'
          : 'text-white/60 hover:text-white hover:bg-white/10'
      }`}
    >
      {children}
      <span>{label}</span>
    </Link>
  )
}
