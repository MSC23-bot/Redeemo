'use client'
import { motion } from 'framer-motion'

type Props = {
  children: React.ReactNode
  heading: string
  subheading: string
}

export function AuthShell({ children, heading, subheading }: Props) {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left: brand panel — hidden on mobile */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="hidden lg:flex flex-col justify-between bg-deep-navy p-16 relative overflow-hidden"
      >
        {/* Grain noise texture */}
        <svg aria-hidden="true" className="absolute inset-0 w-full h-full opacity-[0.025] pointer-events-none">
          <filter id="auth-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#auth-grain)" />
        </svg>

        {/* Diagonal red shard */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 right-0 w-[70%] h-[60%] pointer-events-none"
          style={{ background: 'linear-gradient(135deg, transparent 40%, rgba(226,0,12,0.07) 100%)' }}
        />

        {/* Warm glow — top-left */}
        <div
          aria-hidden="true"
          className="absolute -top-24 -left-24 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(238,105,4,0.06) 0%, transparent 70%)' }}
        />

        {/* Logo top-left */}
        <div className="relative z-10">
          <span className="font-display text-[28px] text-white tracking-tight">Redeemo</span>
        </div>

        {/* Centre: oversized R + quote */}
        <div className="relative z-10 flex flex-col gap-6">
          <span
            aria-hidden="true"
            className="absolute -top-20 -left-6 font-display text-[clamp(160px,20vw,260px)] leading-none text-white opacity-[0.04] pointer-events-none select-none"
          >
            R
          </span>

          <blockquote className="font-display text-[clamp(28px,3vw,44px)] text-white leading-[1.1] max-w-xs relative z-10">
            Local businesses,{' '}
            <span className="gradient-brand-text">exclusive to you.</span>
          </blockquote>
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-white/30">
            The UK&apos;s location-first voucher marketplace
          </p>
        </div>

        {/* Bottom */}
        <p className="font-mono text-[11px] text-white/20 relative z-10 tracking-wide">
          redeemo.co.uk
        </p>
      </motion.div>

      {/* Right: form panel */}
      <div className="flex items-center justify-center bg-[#FAF8F5] px-6 py-16 lg:px-16">
        <div className="w-full max-w-[420px]">
          {/* Mobile-only logo */}
          <div className="lg:hidden mb-10">
            <span className="font-display text-[24px] text-navy tracking-tight">Redeemo</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="font-display text-[clamp(28px,3.5vw,38px)] text-navy leading-[1.08] mb-2">
              {heading}
            </h1>
            <p className="text-[15px] text-navy/50 mb-10 leading-relaxed">
              {subheading}
            </p>
          </motion.div>

          {children}
        </div>
      </div>
    </div>
  )
}
