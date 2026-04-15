'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { AccountNav } from '@/components/account/AccountNav'
import { profileApi, ApiError } from '@/lib/api'
import {
  Bell, RefreshCw, CreditCard, Tag, Star, ShieldCheck,
  ChevronRight, Settings,
} from 'lucide-react'
import Link from 'next/link'

/* ── Types ───────────────────────────────────────────────────────────────── */

type NotificationCategory = {
  id: string
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>
  label: string
  description: string
  accent: string
}

const CATEGORIES: NotificationCategory[] = [
  {
    id: 'voucher-cycle',
    icon: RefreshCw,
    label: 'Voucher cycle resets',
    description: 'When your monthly cycle resets and new vouchers become available',
    accent: '#16A34A',
  },
  {
    id: 'subscription',
    icon: CreditCard,
    label: 'Subscription updates',
    description: 'Renewal confirmations, payment updates, and plan changes',
    accent: '#0891B2',
  },
  {
    id: 'offers',
    icon: Tag,
    label: 'New offers nearby',
    description: 'When merchants in your area add new vouchers or promotions',
    accent: '#E20C04',
  },
  {
    id: 'favourites',
    icon: Star,
    label: 'Favourites activity',
    description: 'Updates from merchants and vouchers you have saved',
    accent: '#D97706',
  },
  {
    id: 'account',
    icon: ShieldCheck,
    label: 'Account & security',
    description: 'Login alerts, profile changes, and security notifications',
    accent: '#7C3AED',
  },
]

/* ── Empty state ─────────────────────────────────────────────────────────── */

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center text-center py-12"
    >
      {/* Icon */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
        className="w-16 h-16 rounded-2xl bg-navy/[0.05] flex items-center justify-center mb-5"
      >
        <Bell size={26} strokeWidth={1.4} className="text-navy/25" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <h2 className="font-display text-[22px] text-navy mb-2 leading-snug">
          No notifications yet
        </h2>
        <p className="text-[14px] text-navy/45 leading-relaxed max-w-[340px] mx-auto mb-8">
          Activity and messages will appear here — subscription updates, voucher cycle resets, new offers, and more.
        </p>
      </motion.div>

      {/* Category previews */}
      <div className="w-full max-w-lg text-left">
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-navy/30 mb-3 text-center">
          You will be notified about
        </p>
        <div className="flex flex-col gap-2">
          {CATEGORIES.map((cat, i) => {
            const Icon = cat.icon
            return (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: 0.3 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-4 bg-white border border-navy/[0.07] rounded-xl px-4 py-3.5"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${cat.accent}12` }}
                >
                  <span style={{ color: cat.accent }}><Icon size={15} strokeWidth={1.8} /></span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-navy leading-none mb-0.5">{cat.label}</p>
                  <p className="text-[11px] text-navy/40 leading-snug">{cat.description}</p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function NotificationsPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Auth check — if profile 401s, redirect to login
    profileApi.get().then(() => {
      setIsLoading(false)
    }).catch((err: unknown) => {
      if (err instanceof ApiError && err.statusCode === 401) {
        router.push('/login?next=/account/notifications')
      } else {
        setIsLoading(false)
      }
    })
  }, [router])

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav variant="mobile" />
      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <AccountNav variant="desktop" />

        <main className="flex-1 max-w-2xl">
          {/* Page header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-2">
                Account
              </p>
              <h1 className="font-display text-[clamp(26px,4vw,38px)] text-navy leading-none">
                Notifications
              </h1>
            </div>

            {/* Preferences link (placeholder) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <button
                type="button"
                disabled
                title="Notification preferences coming soon"
                className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.08em] uppercase text-navy/25 cursor-not-allowed mt-1"
              >
                <Settings size={13} strokeWidth={1.8} />
                Preferences
              </button>
            </motion.div>
          </div>

          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="animate-pulse flex flex-col gap-3"
              >
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-[68px] bg-navy/[0.04] rounded-xl" />
                ))}
              </motion.div>
            ) : (
              <motion.div key="content">
                <EmptyState />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
