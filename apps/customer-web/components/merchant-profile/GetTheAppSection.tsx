'use client'
import { motion } from 'framer-motion'

export function GetTheAppSection({ merchantName }: { merchantName: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-7xl mx-auto px-6 py-12 md:py-14"
    >
      <div
        className="relative overflow-hidden rounded-2xl bg-[#010C35]"
        style={{ minHeight: '260px' }}
      >
        {/* Red radial glow — top right */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(560px circle at 88% 15%, rgba(226,12,4,0.38), transparent 52%), radial-gradient(380px circle at 12% 110%, rgba(200,50,0,0.2), transparent 55%)',
          }}
        />

        {/* Subtle grid texture overlay */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-8 p-8 md:p-12">
          <div className="max-w-[480px]">
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.2em] uppercase text-white/90 px-3 py-1.5 rounded-full mb-5"
              style={{ background: 'var(--brand-gradient)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white/80" aria-hidden="true" />
              Mobile-only
            </span>
            <h2
              className="font-display text-white leading-[1.1] mb-3.5"
              style={{ fontSize: 'clamp(22px, 3vw, 34px)', letterSpacing: '-0.4px' }}
            >
              Redeem at {merchantName} with the Redeemo app.
            </h2>
            <p className="text-[14.5px] text-white/65 leading-[1.7] max-w-[400px]">
              Redemption happens in-person at the business through the mobile app. Browse, save, and redeem at thousands of independent UK businesses.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 md:flex-shrink-0">
            <AppStoreButton
              store="apple"
              href="https://apps.apple.com/app/redeemo"
              upper="Download on the"
              lower="App Store"
            />
            <AppStoreButton
              store="google"
              href="https://play.google.com/store/apps/details?id=com.redeemo"
              upper="Get it on"
              lower="Google Play"
            />
          </div>
        </div>
      </div>
    </motion.section>
  )
}

function AppStoreButton({
  store,
  href,
  upper,
  lower,
}: {
  store: 'apple' | 'google'
  href: string
  upper: string
  lower: string
}) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${upper} ${lower}`}
      whileHover={{ scale: 1.03, backgroundColor: 'rgba(255,255,255,0.14)' }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className="inline-flex items-center gap-3 px-5 py-3.5 rounded-xl border border-white/20 bg-white/08 no-underline backdrop-blur-sm cursor-pointer"
    >
      <span aria-hidden="true" className="text-white">
        {store === 'apple' ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.365 12.548c-.022-2.485 2.027-3.67 2.119-3.727-1.155-1.69-2.953-1.92-3.596-1.948-1.533-.155-2.993.903-3.77.903-.783 0-1.983-.881-3.264-.856-1.68.025-3.228.973-4.09 2.47-1.743 3.022-.447 7.49 1.255 9.94.832 1.2 1.824 2.548 3.126 2.5 1.254-.05 1.727-.81 3.243-.81 1.515 0 1.944.81 3.27.784 1.351-.025 2.208-1.224 3.036-2.427.955-1.396 1.349-2.747 1.371-2.817-.03-.014-2.633-1.01-2.7-4.012zm-2.475-7.375c.691-.84 1.159-2.004 1.031-3.162-.997.042-2.204.664-2.92 1.5-.638.74-1.2 1.926-1.05 3.063 1.112.085 2.247-.566 2.94-1.4z" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.3 20.5c.26.3.72.44 1.19.38l11.09-6.39-2.52-2.52L3.3 20.5zM4.5 3.5L3.3 3.5c-.47-.06-.93.08-1.19.38l10.75 10.75 2.52-2.52L4.5 3.5zM20.6 11.37l-2.8-1.62-2.82 2.25 2.82 2.24 2.83-1.62c.7-.4.7-1.43-.03-1.25zM17.65 10l-2.75-1.58-10.62 6.12 5.85 5.85L17.65 10z" />
          </svg>
        )}
      </span>
      <span className="text-left leading-tight">
        <span className="block text-[9.5px] font-semibold tracking-[0.12em] uppercase text-white/60">
          {upper}
        </span>
        <span className="block text-[14px] font-bold text-white">{lower}</span>
      </span>
    </motion.a>
  )
}
