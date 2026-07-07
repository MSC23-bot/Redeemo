'use client'

import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { isMarketplaceLive } from '@/lib/prelaunch'

/**
 * The rollout note (owner 2026-07-08: say we start in Huddersfield without
 * making a big deal of it; a popup, but mind the hierarchy). A quiet card
 * that slides in bottom-left after the visitor has met the hero, dismissible,
 * remembered for the session. Never blocks anything.
 */

const DISMISS_KEY = 'redeemo-locality-note'
const SHOW_AFTER_MS = 2600

export function LaunchLocalityToast() {
  const [visible, setVisible] = useState(false)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (isMarketplaceLive()) return
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return
    } catch {
      /* storage unavailable: still show, just not remembered */
    }
    const t = setTimeout(() => setVisible(true), SHOW_AFTER_MS)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => {
    setVisible(false)
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          role="status"
          aria-label="Launch area"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-5 left-5 z-50 w-[min(360px,calc(100vw-40px))] rounded-2xl bg-white p-5"
          style={{ border: '1px solid rgba(1,12,53,0.1)', boxShadow: '0 20px 48px rgba(1,12,53,0.18)' }}
        >
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute top-3 right-3 p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#010C35] hover:bg-[#010C35]/[0.05] transition-colors bg-transparent border-none cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <div className="flex items-start gap-3.5">
            <span
              className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0"
              style={{ background: 'rgba(226,12,4,0.09)' }}
              aria-hidden="true"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5 a5 5 0 0 1 5 5 c0 3.6-5 8-5 8 s-5-4.4-5-8 a5 5 0 0 1 5-5 Z" stroke="#E20C04" strokeWidth="1.6" />
                <circle cx="8" cy="6.5" r="1.8" fill="#E20C04" />
              </svg>
            </span>
            <div className="pr-4">
              <p className="text-[14px] font-bold text-[#010C35] mb-1">Starting in Huddersfield</p>
              <p className="text-[13px] text-[#4B5563] leading-[1.6] mb-3">
                We are rolling out in Huddersfield and the surrounding areas
                first, then expanding across the UK. Join now and we will tell
                you the moment we reach your town.
              </p>
              <Link
                href="/register"
                onClick={dismiss}
                className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-[#E20C04] no-underline hover:opacity-80 transition-opacity"
              >
                Get early access
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8 h9 M8.5 3.5 L13 8 l-4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
