'use client'
import Image from 'next/image'
import { motion } from 'framer-motion'

type Props = {
  children: React.ReactNode
  heading?: string
  subheading?: string
}

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number]

const STATS = [
  { value: '2,000+', label: 'Merchants' },
  { value: '£6.99', label: 'Per month' },
  { value: 'One', label: 'Voucher per cycle' },
]

export function AuthShell({ children, heading, subheading }: Props) {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* ── Left: brand panel (desktop only) ── */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease }}
        className="hidden lg:flex flex-col justify-between bg-[#010C35] p-16 relative overflow-hidden"
      >
        {/* Strong rose-red radial glows */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(580px circle at -8% 4%, rgba(226,12,4,0.38), transparent 55%), radial-gradient(380px circle at 110% 108%, rgba(200,50,0,0.22), transparent 55%)',
          }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <Image
            src="/logo-dark.png"
            alt="Redeemo"
            width={200}
            height={54}
            className="h-[56px] w-auto"
          />
        </div>

        {/* Centre content */}
        <div className="relative z-10 flex flex-col gap-7">
          {/* Ghost watermark */}
          <span
            aria-hidden="true"
            className="absolute -top-20 -left-6 font-display leading-none text-white pointer-events-none select-none"
            style={{ fontSize: 'clamp(160px, 20vw, 260px)', opacity: 0.03 }}
          >
            R
          </span>

          {/* Headline */}
          <div className="relative z-10 max-w-[340px]">
            <blockquote
              className="font-display text-white leading-[1.1] mb-4"
              style={{ fontSize: 'clamp(26px, 2.8vw, 40px)', letterSpacing: '-0.3px' }}
            >
              Local businesses,{' '}
              <span className="gradient-brand-text">exclusive to you.</span>
            </blockquote>
            <p className="text-[13px] text-white/42 leading-[1.7]">
              The UK&apos;s location-first voucher marketplace. One subscription. Hundreds of independent businesses.
            </p>
          </div>

          {/* Floating voucher preview card */}
          <motion.div
            initial={{ opacity: 0, y: 20, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: -2 }}
            transition={{ duration: 0.85, delay: 0.4, ease }}
            className="w-[272px] rounded-2xl p-5 relative overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Top gradient bar */}
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{ background: 'var(--brand-gradient)' }}
            />
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-white/32 mb-1.5">
                  Exclusive offer
                </p>
                <p className="font-display text-white text-[17px] leading-tight">
                  2 for 1 on all mains
                </p>
              </div>
              <div
                className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-[15px] font-display"
                style={{ background: 'var(--brand-gradient)' }}
              >
                B
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full bg-[#E20C04] flex-shrink-0"
                aria-hidden="true"
              />
              <p className="text-[12px] text-white/40">Bella Cucina · Manchester</p>
            </div>
          </motion.div>
        </div>

        {/* Bottom: stats row */}
        <div className="relative z-10 flex gap-8 pt-4 border-t border-white/[0.07]">
          {STATS.map(({ value, label }) => (
            <div key={label}>
              <p className="font-display text-white text-[18px] leading-none mb-1">{value}</p>
              <p className="text-[11px] text-white/28 tracking-[0.05em]">{label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Right: form panel ── */}
      <div className="flex items-center justify-center bg-white px-6 py-16 lg:px-16">
        <div className="w-full max-w-[420px]">
          {/* Mobile-only logo */}
          <div className="lg:hidden mb-10">
            <Image
              src="/logo-light.png"
              alt="Redeemo"
              width={180}
              height={48}
              className="h-11 w-auto"
            />
          </div>

          {heading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1
                className="font-display text-[#010C35] leading-[1.08] mb-2"
                style={{ fontSize: 'clamp(28px, 3.5vw, 38px)', letterSpacing: '-0.3px' }}
              >
                {heading}
              </h1>
              {subheading && (
                <p className="text-[15px] text-[#010C35]/45 mb-10 leading-relaxed">
                  {subheading}
                </p>
              )}
            </motion.div>
          )}

          {children}
        </div>
      </div>
    </div>
  )
}
