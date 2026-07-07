'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ChevronDown, LayoutDashboard, PiggyBank, Heart, CreditCard, User, LogOut, Bell } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { isLeadCaptureLive, isMarketplaceLive } from '@/lib/prelaunch'

// Links shown to logged-out visitors. Marketplace routes are middleware-gated
// pre-launch (they redirect home), so Discover only appears once live.
const NAV_LINKS_PUBLIC = [
  ...(isMarketplaceLive() ? [{ href: '/discover', label: 'Discover' }] : []),
  { href: '/how-it-works',   label: 'How it works' },
  { href: '/pricing',        label: 'Pricing' },
  { href: '/insider',        label: 'Insider' },
  { href: '/for-businesses', label: 'For businesses' },
]

// Links shown to signed-in members
const NAV_LINKS_MEMBER = [
  ...(isMarketplaceLive() ? [{ href: '/discover', label: 'Discover' }] : []),
  { href: '/for-businesses', label: 'For businesses' },
  { href: '/insider',        label: 'Insider' },
]

const ACCOUNT_ITEMS = [
  { href: '/account',                label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/account/savings',        label: 'Savings',        icon: PiggyBank },
  { href: '/account/favourites',     label: 'Favourites',     icon: Heart },
  { href: '/account/subscription',   label: 'Subscription',   icon: CreditCard },
  { href: '/account/notifications',  label: 'Notifications',  icon: Bell },
  { href: '/account/profile',        label: 'Profile',        icon: User },
]

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (parts[0]?.[0] ?? '?').toUpperCase()
}

function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

function UserAvatar({ name, imageUrl, size = 36 }: { name: string; imageUrl?: string | null; size?: number }) {
  const initials = getInitials(name)
  if (imageUrl) {
    return (
      <span
        className="flex items-center justify-center rounded-full overflow-hidden flex-shrink-0"
        style={{ width: size, height: size, boxShadow: '0 2px 8px rgba(226,12,4,0.35)' }}
        aria-hidden="true"
      >
        <img src={imageUrl} alt="" className="w-full h-full object-cover" />
      </span>
    )
  }
  return (
    <span
      className="flex items-center justify-center rounded-full font-bold text-white select-none flex-shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: 'var(--brand-gradient)',
        boxShadow: '0 2px 8px rgba(226,12,4,0.35)',
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

export function Navbar() {
  const { user, isLoading, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  // Owner direction 2026-07-07 (revised): the red bar lives at the top only
  // and scrolls away with the page (it clashed with section backgrounds when
  // sticky). Once the visitor is past the hero, the neutral glass bar is
  // simply there: no scroll-direction games, which read as flicker.
  const [floatVisible, setFloatVisible] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const onScroll = () => {
      // Hysteresis so the handoff never flickers at the threshold
      const y = window.scrollY
      setFloatVisible(prev => (prev ? y > 340 : y > 480))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setMenuOpen(false) }, [floatVisible])

  useEffect(() => { setMenuOpen(false); setAccountOpen(false) }, [pathname])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (menuOpen) firstMobileLinkRef.current?.focus()
  }, [menuOpen])

  // Owner direction 2026-07-06: the top-of-page bar carries the primary brand
  // colour, so its inner chrome runs the on-colour (dark) theme permanently.
  const isDark = true
  const navBg = 'border-transparent'

  const navLinks = user ? NAV_LINKS_MEMBER : NAV_LINKS_PUBLIC

  const linkColour = (isActive: boolean) =>
    isActive
      ? isDark ? 'text-white' : 'text-[#E20C04]'
      : isDark ? 'text-white/65 hover:text-white' : 'text-[#4B5563] hover:text-[#010C35]'

  const firstName = user?.name ? getFirstName(user.name) : ''

  // Pre-launch there is no app to send visitors to yet; point "Get the app" at the
  // explainer page instead of a generic App Store link.
  const marketplaceLive = isMarketplaceLive()
  const getAppHref = marketplaceLive ? 'https://apps.apple.com' : '/how-it-works'
  const getAppExternalProps = marketplaceLive ? { target: '_blank', rel: 'noreferrer' } : {}
  // Pre-launch the primary CTA must not imply the marketplace is joinable today:
  // it routes to the waitlist once lead capture is live, the teaching page until then.
  const primaryCtaHref = marketplaceLive ? '/register' : isLeadCaptureLive() ? '/#waitlist' : '/how-it-works'
  const primaryCtaLabel = marketplaceLive ? 'Join free' : 'Get early access'

  return (
    <>
    <header
      className={`relative z-40 border-b ${navBg}`}
      style={{ background: '#BE0A03 radial-gradient(120% 420% at 70% 16%, #F24E2C 0%, #BE0A03 100%)' }}
    >
      <nav aria-label="Main" className="max-w-7xl mx-auto px-6 h-[84px] flex items-center gap-6">

        {/* Logo */}
        <Link href="/" className="flex-shrink-0 no-underline">
          <Image
            src="/logo-white.svg"
            alt="Redeemo"
            width={220}
            height={60}
            className="h-[68px] w-auto transition-opacity duration-300"
            priority
          />
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex gap-0.5 flex-1">
          {navLinks.map(link => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3 py-1.5 rounded-md text-[14px] font-medium transition-colors duration-150 no-underline ${linkColour(isActive)}`}
              >
                {link.label}
                {isActive && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full"
                    style={{ background: 'var(--brand-gradient)' }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </Link>
            )
          })}
        </div>

        {/* Desktop right side */}
        <div className="hidden md:flex items-center gap-3 ml-auto">
          {!isLoading && (
            user ? (
              /* ── Logged-in: Bell + Avatar + Account dropdown ── */
              <>
              {/* Notification bell */}
              {(() => {
                // TODO: replace with real unread count from /api/v1/customer/notifications/unread
                const hasNotifications = false
                return (
                  <Link
                    href="/account/notifications"
                    aria-label="Notifications"
                    className="relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors hover:bg-black/[0.05]"
                  >
                    <Bell
                      size={18}
                      strokeWidth={1.8}
                      className={isDark ? 'text-white/70' : 'text-[#4B5563]'}
                    />
                    {hasNotifications && (
                      <span
                        aria-label="New notifications"
                        className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#E20C04]"
                        style={{ boxShadow: '0 0 0 2px ' + (isDark ? '#010C35' : '#fff') }}
                      />
                    )}
                  </Link>
                )
              })()}
              <div className="relative" ref={accountRef}>
                <button
                  onClick={() => setAccountOpen(o => !o)}
                  className="flex items-center gap-2.5 py-1.5 px-2 rounded-xl transition-colors hover:bg-black/[0.04] cursor-pointer"
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  aria-label={`${firstName}'s account menu`}
                >
                  <UserAvatar name={user.name} imageUrl={user.profileImageUrl} size={34} />
                  <span className={`text-[14px] font-medium transition-colors hidden lg:block ${
                    isDark ? 'text-white/85 hover:text-white' : 'text-[#4B5563]'
                  }`}>
                    {firstName}
                  </span>
                  <ChevronDown
                    size={13}
                    strokeWidth={2.5}
                    className={`transition-transform duration-200 hidden lg:block ${
                      accountOpen ? 'rotate-180' : ''
                    } ${isDark ? 'text-white/50' : 'text-[#9CA3AF]'}`}
                  />
                </button>

                <AnimatePresence>
                  {accountOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.96 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      role="menu"
                      className="absolute right-0 top-[calc(100%+10px)] w-[220px] rounded-2xl overflow-hidden"
                      style={{
                        background: '#010C35',
                        border: '1px solid rgba(255,255,255,0.10)',
                        boxShadow: '0 24px 60px rgba(1,12,53,0.32), 0 4px 16px rgba(0,0,0,0.16)',
                      }}
                    >
                      {/* User info header */}
                      <div className="px-4 py-4 border-b border-white/[0.07]">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={user.name} imageUrl={user.profileImageUrl} size={38} />
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold text-white leading-tight truncate">
                              {user.name}
                            </p>
                            <p className="text-[11px] text-white/40 truncate mt-0.5">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Nav items */}
                      <div className="py-1.5">
                        {ACCOUNT_ITEMS.map((item, i) => {
                          const Icon = item.icon
                          return (
                            <motion.div
                              key={item.href}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.04 + 0.06 }}
                            >
                              <Link
                                href={item.href}
                                role="menuitem"
                                onClick={() => setAccountOpen(false)}
                                className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-white/65 hover:text-white hover:bg-white/[0.06] transition-colors no-underline"
                              >
                                <Icon size={14} strokeWidth={1.8} className="flex-shrink-0 opacity-70" />
                                {item.label}
                              </Link>
                            </motion.div>
                          )
                        })}

                        <div className="mx-3 my-1.5 border-t border-white/[0.07]" />

                        <button
                          role="menuitem"
                          onClick={async () => { await logout(); setAccountOpen(false); router.push('/login?signedOut=true') }}
                          className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-[13px] text-white/35 hover:text-red hover:bg-white/[0.04] transition-colors bg-transparent border-none cursor-pointer"
                        >
                          <LogOut size={14} strokeWidth={1.8} className="flex-shrink-0" />
                          Log out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              </>
            ) : (
              /* ── Logged-out: Log in + Get the app + Join free ── */
              <>
                <Link
                  href="/login"
                  className={`text-[14px] font-medium no-underline transition-colors ${
                    isDark ? 'text-white/80 hover:text-white' : 'text-[#4B5563] hover:text-[#010C35]'
                  }`}
                >
                  Log in
                </Link>
                <a
                  href={getAppHref}
                  {...getAppExternalProps}
                  className="text-[14px] font-medium text-white px-4 py-2 rounded-lg no-underline hover:opacity-80 transition-opacity"
                  style={{
                    background: '#010C35',
                    boxShadow: isDark ? 'inset 0 0 0 1px rgba(255,255,255,0.20)' : '0 1px 3px rgba(1,12,53,0.18)',
                  }}
                >
                  Get the app
                </a>
                <Link
                  href={primaryCtaHref}
                  className="text-[14px] font-bold text-[#BE0A03] bg-white px-4 py-2 rounded-lg no-underline hover:opacity-90 transition-opacity"
                >
                  {primaryCtaLabel}
                </Link>
              </>
            )
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          className={`md:hidden ml-auto p-1.5 rounded-md transition-colors ${
            isDark ? 'text-white/70 hover:text-white' : 'text-[#4B5563] hover:text-[#010C35]'
          }`}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
        >
          {menuOpen
            ? <X size={22} strokeWidth={1.8} />
            : <Menu size={22} strokeWidth={1.8} />
          }
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="md:hidden overflow-hidden border-t border-white/[0.14]"
            style={{ background: '#BE0A03 radial-gradient(120% 300% at 70% 0%, #F24E2C 0%, #BE0A03 100%)' }}
          >
            <div className="px-6 py-4 flex flex-col gap-1">

              {/* User info in mobile menu */}
              {!isLoading && user && (
                <div className="flex items-center gap-3 px-3 py-3 mb-2 rounded-xl bg-white/[0.06]">
                  <UserAvatar name={user.name} imageUrl={user.profileImageUrl} size={36} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-white truncate">{user.name}</p>
                    <p className="text-[11px] text-white/40 truncate">{user.email}</p>
                  </div>
                </div>
              )}

              {navLinks.map((link, i) => {
                const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    ref={i === 0 ? firstMobileLinkRef : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={`px-3 py-3 rounded-lg text-[14px] font-medium transition-colors no-underline ${
                      isActive ? 'text-white bg-white/[0.08]' : 'text-white/65 hover:text-white'
                    }`}
                  >
                    {link.label}
                  </Link>
                )
              })}

              {!isLoading && (
                <div className="mt-3 pt-3 border-t border-white/[0.08] flex flex-col gap-2">
                  {user ? (
                    <>
                      {ACCOUNT_ITEMS.map(item => {
                        const Icon = item.icon
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMenuOpen(false)}
                            className="flex items-center gap-3 px-3 py-3 text-[14px] font-medium text-white/80 no-underline hover:text-white transition-colors"
                          >
                            <Icon size={15} strokeWidth={1.7} className="opacity-60" />
                            {item.label}
                          </Link>
                        )
                      })}
                      <button
                        onClick={async () => { await logout(); setMenuOpen(false); router.push('/login?signedOut=true') }}
                        className="flex items-center gap-3 text-left px-3 py-3 text-[14px] font-medium text-white/35 bg-transparent border-none cursor-pointer hover:text-red transition-colors"
                      >
                        <LogOut size={15} strokeWidth={1.7} className="flex-shrink-0" />
                        Log out
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        onClick={() => setMenuOpen(false)}
                        className="px-3 py-3 text-[14px] font-medium text-white/80 no-underline hover:text-white transition-colors"
                      >
                        Log in
                      </Link>
                      <a
                        href={getAppHref}
                        {...getAppExternalProps}
                        onClick={() => setMenuOpen(false)}
                        className="px-3 py-3 text-[14px] font-medium text-white text-center rounded-lg no-underline hover:opacity-80 transition-opacity"
                        style={{ background: '#010C35', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)' }}
                      >
                        Get the app
                      </a>
                      <Link
                        href={primaryCtaHref}
                        onClick={() => setMenuOpen(false)}
                        className="px-3 py-3 text-[14px] font-bold text-[#BE0A03] bg-white text-center rounded-lg no-underline hover:opacity-90 transition-opacity"
                      >
                        {primaryCtaLabel}
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>

    {/* Glass quick-nav: slides in when scrolling UP mid-page; neutral so it
        never fights whatever section background is behind it */}
    <AnimatePresence>
      {floatVisible && (
        <motion.div
          initial={{ y: -76, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -76, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="fixed top-3 inset-x-3 md:inset-x-6 z-50"
        >
          <nav
            aria-label="Quick navigation"
            className="max-w-6xl mx-auto flex items-center gap-5 px-4 md:px-6 h-[58px] rounded-2xl"
            style={{
              background: 'rgba(255,249,245,0.90)',
              backdropFilter: 'blur(16px) saturate(1.5)',
              WebkitBackdropFilter: 'blur(16px) saturate(1.5)',
              border: '1px solid rgba(1,12,53,0.08)',
              boxShadow: '0 12px 40px rgba(1,12,53,0.14)',
            }}
          >
            <Link href="/" className="flex-shrink-0 no-underline">
              <Image src="/logo-horizontal.svg" alt="Redeemo" width={180} height={50} className="h-[44px] w-auto" />
            </Link>

            <div className="hidden md:flex gap-0.5 flex-1">
              {navLinks.map(link => {
                const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-1.5 rounded-md text-[13.5px] font-medium transition-colors duration-150 no-underline ${
                      isActive ? 'text-[#E20C04]' : 'text-[#4B5563] hover:text-[#010C35]'
                    }`}
                  >
                    {link.label}
                  </Link>
                )
              })}
            </div>

            <div className="flex items-center gap-3 ml-auto">
              {!isLoading && (
                user ? (
                  <Link href="/account" aria-label="Your account" className="no-underline">
                    <UserAvatar name={user.name} imageUrl={user.profileImageUrl} size={32} />
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="hidden md:block text-[13.5px] font-medium text-[#4B5563] hover:text-[#010C35] no-underline transition-colors"
                    >
                      Log in
                    </Link>
                    <Link
                      href={primaryCtaHref}
                      className="text-[13.5px] font-bold text-white px-4 py-2 rounded-lg no-underline hover:opacity-90 transition-opacity"
                      style={{ background: 'var(--brand-gradient)' }}
                    >
                      {primaryCtaLabel}
                    </Link>
                  </>
                )
              )}
            </div>
          </nav>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}
