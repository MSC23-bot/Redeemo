'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'

// Icons: inline SVGs render consistently cross-platform (no emoji rendering variance).
const NAV_ITEMS = [
  {
    href: '/account', label: 'Overview',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor"/>
        <rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor"/>
        <rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor"/>
        <rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor"/>
      </svg>
    ),
  },
  {
    href: '/account/profile', label: 'Profile',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="4.5" r="2.5" fill="currentColor"/>
        <path d="M2 12c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: '/account/subscription', label: 'Subscription',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M1 6h12" stroke="currentColor" strokeWidth="1.4"/>
      </svg>
    ),
  },
  {
    href: '/account/savings', label: 'Savings',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <text x="1" y="12" fontFamily="serif" fontSize="13" fill="currentColor">£</text>
      </svg>
    ),
  },
  {
    href: '/account/favourites', label: 'Favourites',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M7 12L2.5 7.5C1.5 6.5 1.5 4.9 2.5 3.9 3.5 2.9 5.1 2.9 6.1 3.9L7 4.8l.9-.9c1-1 2.6-1 3.6 0 1 1 1 2.6 0 3.6L7 12z" fill="currentColor"/>
      </svg>
    ),
  },
]

type AccountNavVariant = 'mobile' | 'desktop' | 'both'

export function AccountNav({ variant = 'both' }: { variant?: AccountNavVariant }) {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile: horizontal scroll tab bar */}
      {(variant === 'mobile' || variant === 'both') && (
        <nav aria-label="Account tabs" className="lg:hidden overflow-x-auto scrollbar-none bg-[#FAF8F5] border-b border-navy/[0.06] sticky top-[64px] z-10">
          <div className="flex gap-1 px-6 py-2" style={{ width: 'max-content' }}>
            {NAV_ITEMS.map(item => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 font-mono text-[11px] tracking-[0.08em] uppercase px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-navy text-white'
                      : 'text-navy/55 hover:text-navy'
                  }`}
                >
                  <span className="w-3.5 h-3.5 flex-shrink-0">{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </div>
        </nav>
      )}

      {/* Desktop: sticky left sidebar */}
      {(variant === 'desktop' || variant === 'both') && (
        <nav aria-label="Account menu" className="hidden lg:flex flex-col gap-1 w-56 flex-shrink-0 sticky top-24 self-start pt-2">
          {NAV_ITEMS.map((item, i) => {
            const isActive = pathname === item.href
            return (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
              >
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] transition-colors relative group ${
                    isActive
                      ? 'bg-white text-navy font-medium shadow-sm'
                      : 'text-navy/55 hover:text-navy hover:bg-white/60'
                  }`}
                >
                  {/* Active left-border accent */}
                  {isActive && (
                    <motion.span
                      layoutId="account-nav-indicator"
                      className="absolute left-0 top-2 bottom-2 w-[3px] bg-gradient-to-b from-red to-orange-red rounded-full"
                    />
                  )}
                  <span aria-hidden className="text-[16px] ml-2">{item.icon}</span>
                  {item.label}
                </Link>
              </motion.div>
            )
          })}
        </nav>
      )}
    </>
  )
}
