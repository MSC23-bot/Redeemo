'use client'

import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

const RibbonScene3D = dynamic(() => import('./RibbonScene3D').then((m) => m.RibbonScene3D), { ssr: false })

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number]

type Promise = {
  title: string
  body: string
  icon: ReactNode
}

const PROMISES: Promise[] = [
  {
    title: 'Every place is chosen',
    body: 'We list independent local businesses worth visiting, not whoever turns up. If it’s on Redeemo, someone said yes to it.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 4 6.5v5C4 16.5 7.4 20.7 12 22c4.6-1.3 8-5.5 8-10.5v-5L12 3z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    title: 'Fresh vouchers every month',
    body: 'One voucher per place, each month. A new cycle brings them back. You were going out anyway; now it costs less.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 4v4h-4" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 20v-4h4" />
      </svg>
    ),
  },
  {
    title: 'No surprises at the till',
    body: 'No minimum-spend tricks. Your voucher is verified in the app and staff confirm it in seconds. Cancel anytime.',
    icon: (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8" />
        <path d="M8 12h5" />
        <path d="m9.5 16 1.8 1.8L15 14" />
      </svg>
    ),
  },
]

export function FoundingPromiseSection() {
  return (
    <section
      className="relative overflow-hidden py-20 md:py-24 px-6"
      style={{ background: '#010C35' }}
    >
      {/* Red radial glow, matching the testimonials treatment. Origins sit
          well inside the section: pressed against the top boundary they
          printed a visible step against the ribbon divider's flat navy. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(600px circle at 0% 48%, rgba(226,12,4,0.16), transparent 54%), radial-gradient(420px circle at 100% 120%, rgba(200,50,0,0.14), transparent 50%)',
        }}
      />

      {/* The live 3D brand ribbon, slower and deeper here: red over navy is
          the dramatic register the removed break band used to carry.
          Mobile included (owner 2026-07-13): the 3D must travel. */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <RibbonScene3D preset="navy" />
      </div>

      <div className="relative max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="text-center max-w-[640px] mx-auto mb-14"
        >
          <span className="inline-block text-[11px] font-bold tracking-[0.18em] uppercase text-white/40 mb-4">
            The Redeemo standard
          </span>
          <h2
            className="font-display text-white leading-[1.1]"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            Chosen places. Honest terms.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[1040px] mx-auto">
          {PROMISES.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: EASE }}
              className="rounded-2xl p-8"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-5 text-white/85"
                style={{ background: 'rgba(255,255,255,0.08)' }}
                aria-hidden="true"
              >
                {p.icon}
              </div>
              <h3 className="font-body text-[16px] font-bold text-white mb-2">{p.title}</h3>
              <p className="text-[14px] text-white/60 leading-[1.65]">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
