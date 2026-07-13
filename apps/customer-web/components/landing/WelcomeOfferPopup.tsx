'use client'

import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { isMarketplaceLive } from '@/lib/prelaunch'

const RibbonScene3D = dynamic(() => import('./RibbonScene3D').then((m) => m.RibbonScene3D), { ssr: false })

/**
 * The founding-member offer as a welcome popup (owner 2026-07-13: the
 * landing page ended in a stack of cards; the offer ticket moves here and
 * greets the visitor instead). One voucher-shaped dialog: brand band,
 * logo, the offer, a die-cut tear line into the claim stub, and the
 * Huddersfield rollout line: with the live 3D ribbon flowing through the
 * dimmed backdrop behind it. Shows once per session, shortly after
 * arrival; dismissible by X, backdrop, or Escape. Pre-launch only.
 *
 * Fulfilment of the 2-months-free incentive (owner revised from 3 on
 * 2026-07-13) is the Admin Panel follow-up recorded in
 * docs/deferrals/open-register.md (§FOUND.1).
 */

const SEEN_KEY = 'redeemo-welcome-offer-seen'
// 5s (owner 2026-07-13): the visitor gets a first look at what Redeemo is
// before the offer greets them
const SHOW_AFTER_MS = 5000

// The tear line sits this far above the ticket's bottom edge; the die-cut
// notches are cut from the silhouette so the backdrop shows through them
const STUB_H = 176

const PERKS = [
  'Two months of full membership, free at launch',
  'Founding member badge on your profile',
  'First to know when we reach your town',
]

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-shrink-0 mt-[2.5px]">
      <circle cx="8" cy="8" r="7.25" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
      <path d="M5 8.2 L7.2 10.4 L11 6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function WelcomeOfferPopup() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (isMarketplaceLive()) return
    if (sessionStorage.getItem(SEEN_KEY)) return
    const t = window.setTimeout(() => setOpen(true), SHOW_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const dismiss = () => {
    sessionStorage.setItem(SEEN_KEY, '1')
    setOpen(false)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="welcome-offer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
          style={{ background: 'rgba(1,8,35,0.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
          onClick={dismiss}
        >
          {/* The live brand ribbon flows through the backdrop */}
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <RibbonScene3D preset="hero" />
          </div>

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Founding member offer"
            initial={{ opacity: 0, y: 28, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.08 }}
            className="relative w-full max-w-[500px] max-h-[92svh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            style={{ filter: 'drop-shadow(0 32px 70px rgba(120,5,2,0.55))' }}
          >
            {/* The ticket: die-cut notches on the tear line, cut from the
                silhouette so the backdrop shows through */}
            <div
              className="relative overflow-hidden rounded-[26px]"
              style={{
                background: '#BE0A03 radial-gradient(130% 320% at 20% 0%, #F24E2C 0%, #BE0A03 100%)',
                maskImage: `radial-gradient(circle at 0 calc(100% - ${STUB_H}px), transparent 9.5px, black 10px), radial-gradient(circle at 100% calc(100% - ${STUB_H}px), transparent 9.5px, black 10px)`,
                WebkitMaskImage: `radial-gradient(circle at 0 calc(100% - ${STUB_H}px), transparent 9.5px, black 10px), radial-gradient(circle at 100% calc(100% - ${STUB_H}px), transparent 9.5px, black 10px)`,
                maskComposite: 'intersect',
                WebkitMaskComposite: 'source-in',
              }}
            >
              <button
                onClick={dismiss}
                aria-label="Close"
                className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center text-white/85 hover:text-white bg-white/[0.12] hover:bg-white/[0.2] border-none cursor-pointer transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>

              {/* Offer */}
              <div className="px-6 pt-6 pb-5 sm:px-8 sm:pt-7">
                <Image src="/logo-white.svg" alt="Redeemo" width={150} height={40} className="h-[34px] w-auto mb-5" />
                <p className="text-[10.5px] font-bold tracking-[0.2em] uppercase text-white/65 mb-2.5">Founding member offer</p>
                <h2
                  className="font-display text-white leading-[1.12] mb-3"
                  style={{ fontSize: 'clamp(24px, 5.5vw, 31px)', letterSpacing: '-0.5px', textWrap: 'balance' }}
                >
                  Join before launch. Two months on us.
                </h2>
                <ul className="flex flex-col gap-2 list-none p-0 m-0">
                  {PERKS.map((perk) => (
                    <li key={perk} className="flex items-start gap-2.5 text-[13px] text-white/95 leading-[1.5]">
                      <Tick />
                      {perk}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Tear line into the claim stub */}
              <div aria-hidden="true" className="mx-5 border-t-2 border-dashed border-white/35" />
              <div className="px-6 sm:px-8 flex flex-col items-center justify-center text-center" style={{ height: STUB_H }}>
                <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/70 mb-3">
                  2 months free at launch
                </p>
                <Link
                  href="/register"
                  onClick={dismiss}
                  className="inline-flex items-center gap-2 bg-white text-[#BE0A03] font-bold text-[15px] px-7 py-3 rounded-xl no-underline hover:opacity-90 transition-opacity"
                >
                  Create free account
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </Link>
                <p className="mt-2.5 text-[11.5px] text-white/60">Free to join · no card needed · takes a minute</p>
                <p className="mt-2 text-[11px] text-white/65 leading-[1.5] max-w-[380px]">
                  Rolling out first in Huddersfield and the surrounding areas,
                  then more towns and cities across the UK. Join now and we
                  will tell you the moment we reach yours.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
