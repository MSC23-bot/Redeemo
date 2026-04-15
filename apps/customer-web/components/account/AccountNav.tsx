'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { LayoutDashboard, PiggyBank, Heart, CreditCard, User, Bell } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/account',                label: 'Overview',       icon: LayoutDashboard },
  { href: '/account/profile',        label: 'Profile',        icon: User },
  { href: '/account/subscription',   label: 'Subscription',   icon: CreditCard },
  { href: '/account/savings',        label: 'Savings',        icon: PiggyBank },
  { href: '/account/favourites',     label: 'Favourites',     icon: Heart },
  { href: '/account/notifications',  label: 'Notifications',  icon: Bell },
]

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (parts[0]?.[0] ?? '?').toUpperCase()
}

function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

type AccountNavVariant = 'mobile' | 'desktop' | 'both'

export function AccountNav({ variant = 'both' }: { variant?: AccountNavVariant }) {
  const pathname = usePathname()
  const { user } = useAuth()

  const initials = user?.name ? getInitials(user.name) : '?'
  const firstName = user?.name ? getFirstName(user.name) : 'Member'

  return (
    <>
      {/* Mobile: horizontal scroll tab bar */}
      {(variant === 'mobile' || variant === 'both') && (
        <nav aria-label="Account tabs" className="lg:hidden overflow-x-auto scrollbar-none bg-[#FAF8F5] border-b border-navy/[0.06] sticky top-[64px] z-10">
          <div className="flex gap-1 px-6 py-2" style={{ width: 'max-content' }}>
            {NAV_ITEMS.map(item => {
              const isActive = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-1.5 font-mono text-[11px] tracking-[0.08em] uppercase px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-navy text-white'
                      : 'text-navy/55 hover:text-navy'
                  }`}
                >
                  <Icon size={12} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </nav>
      )}

      {/* Desktop: sticky left sidebar */}
      {(variant === 'desktop' || variant === 'both') && (
        <nav aria-label="Account menu" className="hidden lg:flex flex-col gap-1 w-56 flex-shrink-0 sticky top-24 self-start">

          {/* User profile card */}
          {user && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-4 p-4 rounded-2xl bg-navy"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex items-center justify-center rounded-full font-bold text-white text-[15px] flex-shrink-0"
                  style={{
                    width: 42,
                    height: 42,
                    background: 'var(--brand-gradient)',
                    boxShadow: '0 2px 10px rgba(226,12,4,0.40)',
                  }}
                  aria-hidden="true"
                >
                  {initials}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-white leading-tight truncate">
                    {firstName}
                  </p>
                  <p className="text-[10px] text-white/40 font-mono tracking-wide uppercase mt-0.5">
                    Member
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Nav items */}
          <div className="pt-1">
            {NAV_ITEMS.map((item, i) => {
              const isActive = pathname === item.href
              const Icon = item.icon
              return (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.06 }}
                >
                  <Link
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] transition-all duration-150 relative group ${
                      isActive
                        ? 'bg-white text-navy font-medium shadow-sm'
                        : 'text-navy/55 hover:text-navy hover:bg-white/60'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="account-nav-indicator"
                        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                        style={{ background: 'var(--brand-gradient)' }}
                      />
                    )}
                    <Icon
                      size={15}
                      strokeWidth={isActive ? 2.2 : 1.7}
                      className={`flex-shrink-0 ml-2 transition-colors ${isActive ? 'text-[#E20C04]' : 'text-current'}`}
                      aria-hidden="true"
                    />
                    {item.label}
                  </Link>
                </motion.div>
              )
            })}
          </div>
        </nav>
      )}
    </>
  )
}
