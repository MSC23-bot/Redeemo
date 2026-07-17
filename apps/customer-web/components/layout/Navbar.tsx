'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ChevronDown, LayoutDashboard, PiggyBank, Heart, CreditCard, User, LogOut, Bell } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { isMarketplaceLive, merchantPortalLoginUrl, merchantPortalRegisterUrl } from '@/lib/prelaunch'

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

// /for-businesses is its own front door (owner 2026-07-17): section anchors,
// merchant portal auth, and the FOR BUSINESS lockup.
type NavLink = { href: string; label: string; children?: Array<{ href: string; label: string }> }

const NAV_LINKS_BUSINESS: NavLink[] = [
  { href: '#how-it-works', label: 'How it works' },
  {
    href: '#why-redeemo',
    label: 'Why Redeemo',
    children: [
      { href: '#grow',     label: 'Grow' },
      { href: '#promote',  label: 'Promote' },
      { href: '#vouchers', label: 'Your vouchers' },
    ],
  },
  { href: '#portal',      label: 'Merchant portal' },
  { href: '#your-margin', label: 'Pricing' },
]

// The lockup: the real brand asset (tight-cropped so it renders at true
// size), with FOR BUSINESS seated directly beneath the wordmark. The caps
// line starts where the wordmark starts (23.2% of the asset's width,
// measured from the SVG) and tracks out to finish with it.
function BusinessLogo({ tone }: { tone: 'light' | 'dark' }) {
  const light = tone === 'light'
  return (
    <span className="flex flex-col" style={{ lineHeight: 1 }}>
      <Image
        src={light ? '/logo-white-tight.svg' : '/logo-horizontal-tight.svg'}
        alt=""
        width={116}
        height={32}
        className="h-[31px] w-auto"
        priority
      />
      <span
        className={`text-[8.5px] font-bold uppercase ${light ? 'text-white/65' : 'text-[#6B7280]'}`}
        style={{ letterSpacing: '0.215em', marginTop: 4, marginLeft: '23.2%' }}
      >
        For business
      </span>
    </span>
  )
}

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
  // Owner direction 2026-07-13 (round 2): "collapsed" means collapsed INTO
  // a compact control, not gone. On mobile, once past the hero, a small
  // glass pill (logo mark + hamburger) floats top-right and expands into a
  // full menu on tap: it never covers pinned content. Desktop keeps the
  // full glass bar, revealed on scroll-up with a 6px direction deadband.
  const [floatVisible, setFloatVisible] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [floatMenuOpen, setFloatMenuOpen] = useState(false)
  const lastScrollY = useRef(0)
  const accountRef = useRef<HTMLDivElement>(null)
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 420)
      const dy = y - lastScrollY.current
      if (Math.abs(dy) < 6) return
      lastScrollY.current = y
      setFloatVisible(y > 420 && dy < 0)
      setFloatMenuOpen(false)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setMenuOpen(false) }, [floatVisible])

  useEffect(() => { setFloatMenuOpen(false) }, [pathname])

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
  // Revised 2026-07-08: not "one long stripe": the brand colour rides a
  // floating island with voucher die-cut notches at its ends, the same shape
  // language as the glass quick-nav and the voucher cards.
  const isDark = true

  const isBusiness = pathname === '/for-businesses' || pathname.startsWith('/for-businesses/')
  const navLinks: NavLink[] = isBusiness ? NAV_LINKS_BUSINESS : user ? NAV_LINKS_MEMBER : NAV_LINKS_PUBLIC

  // Scroll spy: the tab of whichever section owns the viewport wears the
  // indicator. Sub-anchors (grow/promote/vouchers) roll up to Why Redeemo.
  const [activeAnchor, setActiveAnchor] = useState('')
  const [dropOpen, setDropOpen] = useState<string | null>(null)
  useEffect(() => {
    if (!isBusiness) return
    const SPY: Array<[string, string]> = [
      ['how-it-works', '#how-it-works'],
      ['why-redeemo', '#why-redeemo'],
      ['grow', '#why-redeemo'],
      ['promote', '#why-redeemo'],
      ['vouchers', '#why-redeemo'],
      ['your-margin', '#your-margin'],
      ['portal', '#portal'],
    ]
    let raf = 0
    const onSpy = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        let current = ''
        for (const [id, tab] of SPY) {
          const el = document.getElementById(id)
          if (el && el.getBoundingClientRect().top <= 280) current = tab
        }
        setActiveAnchor(current)
      })
    }
    onSpy()
    window.addEventListener('scroll', onSpy, { passive: true })
    return () => {
      window.removeEventListener('scroll', onSpy)
      cancelAnimationFrame(raf)
    }
  }, [isBusiness])

  const linkColour = (isActive: boolean) =>
    isActive
      ? isDark ? 'text-white' : 'text-[#E20C04]'
      : isDark ? 'text-white/65 hover:text-white' : 'text-[#4B5563] hover:text-[#010C35]'

  const firstName = user?.name ? getFirstName(user.name) : ''

  // Pre-launch there is no app to point at, so the secondary slot carries the
  // merchant funnel instead (owner 2026-07-08); it returns to "Get the app"
  // when the marketplace goes live.
  const marketplaceLive = isMarketplaceLive()
  // Creating an account IS the waitlist (owner 2026-07-08): registration is
  // live pre-launch and founding members claim the launch incentive.
  const primaryCtaHref = isBusiness ? merchantPortalRegisterUrl() : '/register'
  const primaryCtaLabel = isBusiness ? 'List your business' : marketplaceLive ? 'Join free' : 'Get early access'
  const loginHref = isBusiness ? merchantPortalLoginUrl() : '/login'

  return (
    <>
    <header className="relative z-40 px-3 md:px-6 pt-3">
      <div className="relative max-w-6xl mx-auto">
        {/* The voucher band: brand gradient with a die-cut notch carved into
            each end, drop-shadow on a wrapper so the notches read in the
            silhouette. Background only: the notch mask must never clip the
            account dropdown or the light sweep of content above it. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{ filter: 'drop-shadow(0 14px 30px rgba(190,10,3,0.22))' }}
        >
          <div
            className="h-full w-full rounded-2xl"
            style={{
              background: '#BE0A03 radial-gradient(140% 380% at 72% 10%, #F24E2C 0%, #BE0A03 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
              maskImage:
                'radial-gradient(circle at 0 50%, transparent 8.5px, black 9px), radial-gradient(circle at 100% 50%, transparent 8.5px, black 9px)',
              WebkitMaskImage:
                'radial-gradient(circle at 0 50%, transparent 8.5px, black 9px), radial-gradient(circle at 100% 50%, transparent 8.5px, black 9px)',
              maskComposite: 'intersect',
              WebkitMaskComposite: 'source-in',
            }}
          />
        </div>

        <nav aria-label="Main" className="relative px-5 md:px-7 h-[68px] flex items-center gap-6">

        {/* Logo */}
        <Link href={isBusiness ? '/for-businesses' : '/'} aria-label={isBusiness ? 'Redeemo for business' : 'Redeemo'} className="flex-shrink-0 no-underline">
          {isBusiness ? (
            <BusinessLogo tone="light" />
          ) : (
            <Image
              src="/logo-white.svg"
              alt="Redeemo"
              width={220}
              height={60}
              className="h-[50px] w-auto transition-opacity duration-300"
              priority
            />
          )}
        </Link>

        {/* Desktop nav links, centred so the island reads balanced:
            logo · links · actions rather than everything left-stacked */}
        <div className="hidden md:flex gap-1 flex-1 justify-center">
          {navLinks.map(link => {
            const isActive = isBusiness ? activeAnchor === link.href : pathname === link.href || pathname.startsWith(link.href + '/')
            const children = link.children
            return (
              <span
                key={link.href}
                className="relative"
                onMouseEnter={children ? () => setDropOpen(link.href) : undefined}
                onMouseLeave={children ? () => setDropOpen(null) : undefined}
                onFocus={children ? () => setDropOpen(link.href) : undefined}
                onBlur={children ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOpen(null) } : undefined}
              >
                <Link
                  href={link.href}
                  aria-haspopup={children ? 'menu' : undefined}
                  aria-expanded={children ? dropOpen === link.href : undefined}
                  className={`relative inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[14px] font-medium transition-colors duration-150 no-underline ${linkColour(isActive)}`}
                >
                  {link.label}
                  {children && (
                    <ChevronDown
                      size={12}
                      strokeWidth={2.4}
                      className={`transition-transform duration-200 ${dropOpen === link.href ? 'rotate-180' : ''}`}
                    />
                  )}
                  {isActive && (
                    <motion.span
                      layoutId="nav-indicator"
                      className="absolute inset-x-3 -bottom-[8px] h-[2px] rounded-full"
                      style={{ background: 'rgba(255,255,255,0.9)' }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </Link>
                <AnimatePresence>
                  {children && dropOpen === link.href && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.97 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      role="menu"
                      className="absolute left-1/2 top-[calc(100%+12px)] w-[176px] -translate-x-1/2 overflow-hidden rounded-xl p-1.5"
                      style={{
                        background: '#010C35',
                        border: '1px solid rgba(255,255,255,0.10)',
                        boxShadow: '0 20px 48px rgba(1,12,53,0.35), 0 4px 14px rgba(0,0,0,0.18)',
                      }}
                    >
                      {children.map((child, ci) => (
                        <motion.div key={child.href} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: ci * 0.05 + 0.05 }}>
                          <Link
                            href={child.href}
                            role="menuitem"
                            onClick={() => setDropOpen(null)}
                            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-white/70 no-underline transition-colors hover:bg-white/[0.07] hover:text-white"
                          >
                            <span className="h-[11px] w-[2.5px] rounded-full" style={{ background: 'var(--brand-gradient)' }} aria-hidden="true" />
                            {child.label}
                          </Link>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </span>
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
                  href={loginHref}
                  className={`text-[14px] font-medium no-underline transition-colors ${
                    isDark ? 'text-white/80 hover:text-white' : 'text-[#4B5563] hover:text-[#010C35]'
                  }`}
                >
                  Log in
                </Link>
                {isBusiness ? (
                  <Link
                    href="/"
                    className="text-[14px] font-medium text-white px-4 py-2 rounded-lg no-underline hover:opacity-80 transition-opacity"
                    style={{ background: '#010C35', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.20)' }}
                  >
                    For customers
                  </Link>
                ) : marketplaceLive ? (
                  <a
                    href="https://apps.apple.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[14px] font-medium text-white px-4 py-2 rounded-lg no-underline hover:opacity-80 transition-opacity"
                    style={{ background: '#010C35', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.20)' }}
                  >
                    Get the app
                  </a>
                ) : (
                  <Link
                    href="/for-businesses"
                    className="text-[14px] font-medium text-white px-4 py-2 rounded-lg no-underline hover:opacity-80 transition-opacity"
                    style={{ background: '#010C35', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.20)' }}
                  >
                    Got a business?
                  </Link>
                )}
                <Link
                  href={primaryCtaHref}
                  className="group relative overflow-hidden text-[14px] font-bold text-[#BE0A03] bg-white px-4 py-2 rounded-lg no-underline transition-transform duration-300 hover:-translate-y-0.5"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 -left-[60%] w-[45%] transition-transform duration-700 ease-out group-hover:translate-x-[340%] motion-reduce:hidden"
                    style={{ background: 'linear-gradient(105deg, transparent, rgba(226,12,4,0.12), transparent)', transform: 'skewX(-16deg)' }}
                  />
                  {primaryCtaLabel}
                </Link>
              </>
            )
          )}
        </div>

        {/* Mobile: primary CTA rides in the island (owner 2026-07-13) */}
        {!user && (
          <Link
            href={primaryCtaHref}
            className="md:hidden ml-auto text-[13px] font-bold text-[#BE0A03] bg-white px-3.5 py-2 rounded-lg no-underline"
          >
            {primaryCtaLabel}
          </Link>
        )}

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          className={`md:hidden ${user ? 'ml-auto' : ''} p-1.5 rounded-md transition-colors ${
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
            className="md:hidden overflow-hidden border-t border-white/[0.14] relative"
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
                        href={loginHref}
                        onClick={() => setMenuOpen(false)}
                        className="px-3 py-3 text-[14px] font-medium text-white/80 no-underline hover:text-white transition-colors"
                      >
                        Log in
                      </Link>
                      <Link
                        href={isBusiness ? '/' : marketplaceLive ? 'https://apps.apple.com' : '/for-businesses'}
                        onClick={() => setMenuOpen(false)}
                        className="px-3 py-3 text-[14px] font-medium text-white text-center rounded-lg no-underline hover:opacity-80 transition-opacity"
                        style={{ background: '#010C35', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)' }}
                      >
                        {isBusiness ? 'For customers' : marketplaceLive ? 'Get the app' : 'Got a business?'}
                      </Link>
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
      </div>
    </header>

    {/* Mobile: the collapsed state is a compact glass pill (logo mark +
        hamburger) that expands into a full menu on tap: premium, and it
        never covers pinned content (owner 2026-07-13) */}
    <AnimatePresence>
      {scrolled && (
        <motion.div
          key="pill"
          initial={{ y: -18, opacity: 0, scale: 0.94 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -18, opacity: 0, scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="md:hidden fixed top-3 right-3 z-50"
        >
          <button
            onClick={() => setFloatMenuOpen(o => !o)}
            aria-label={floatMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={floatMenuOpen}
            aria-controls="float-menu"
            className="flex items-center gap-2.5 pl-3 pr-3.5 h-[46px] rounded-full border-none cursor-pointer"
            style={{
              background: 'rgba(255,249,245,0.92)',
              backdropFilter: 'blur(16px) saturate(1.5)',
              WebkitBackdropFilter: 'blur(16px) saturate(1.5)',
              boxShadow: '0 10px 32px rgba(1,12,53,0.16), inset 0 0 0 1px rgba(1,12,53,0.08)',
            }}
          >
            <Image src="/logo-icon.svg" alt="" width={24} height={24} className="h-[22px] w-auto" />
            <span className="w-px h-[18px] bg-[#010C35]/12" aria-hidden="true" />
            {floatMenuOpen
              ? <X size={19} strokeWidth={2} className="text-[#010C35]/80" />
              : <Menu size={19} strokeWidth={2} className="text-[#010C35]/80" />}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
    <AnimatePresence>
      {scrolled && floatMenuOpen && (
        <motion.div
          key="float-menu"
          id="float-menu"
          initial={{ opacity: 0, y: -10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="md:hidden fixed top-[62px] inset-x-3 z-50 origin-top-right"
          style={{ filter: 'drop-shadow(0 20px 44px rgba(190,10,3,0.32))' }}
        >
          {/* The coupon (owner 2026-07-13): the expanded menu wears the same
              voucher band as the top island: brand gradient with die-cut
              notches at its sides */}
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: '#BE0A03 radial-gradient(140% 380% at 72% 10%, #F24E2C 0%, #BE0A03 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
              maskImage:
                'radial-gradient(circle at 0 50%, transparent 8.5px, black 9px), radial-gradient(circle at 100% 50%, transparent 8.5px, black 9px)',
              WebkitMaskImage:
                'radial-gradient(circle at 0 50%, transparent 8.5px, black 9px), radial-gradient(circle at 100% 50%, transparent 8.5px, black 9px)',
              maskComposite: 'intersect',
              WebkitMaskComposite: 'source-in',
            }}
          >
            <div className="p-4 flex flex-col gap-0.5">
              {navLinks.map(link => {
                const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setFloatMenuOpen(false)}
                    className={`px-3 py-2.5 rounded-lg text-[15px] font-semibold no-underline transition-colors ${
                      isActive ? 'text-white bg-white/[0.14]' : 'text-white/80 hover:text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    {link.label}
                  </Link>
                )
              })}
              <div className="my-2 border-t border-dashed border-white/25" />
              <div className="flex items-center gap-3 px-1 pb-0.5">
                {user ? (
                  <Link
                    href="/account"
                    onClick={() => setFloatMenuOpen(false)}
                    className="flex-1 text-center text-[14px] font-bold text-[#BE0A03] bg-white px-4 py-2.5 rounded-xl no-underline"
                  >
                    Your account
                  </Link>
                ) : (
                  <>
                    <Link
                      href={loginHref}
                      onClick={() => setFloatMenuOpen(false)}
                      className="text-[14px] font-semibold text-white/85 no-underline px-2"
                    >
                      Log in
                    </Link>
                    <Link
                      href={primaryCtaHref}
                      onClick={() => setFloatMenuOpen(false)}
                      className="flex-1 text-center text-[14px] font-bold text-[#BE0A03] bg-white px-4 py-2.5 rounded-xl no-underline"
                    >
                      {primaryCtaLabel}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Desktop glass quick-nav: slides in on scroll-UP mid-page and
        collapses away while scrolling down; neutral so it never fights
        whatever section background is behind it */}
    <AnimatePresence>
      {floatVisible && (
        <motion.div
          initial={{ y: -84, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -84, opacity: 0, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          className="hidden md:block fixed top-3 inset-x-3 md:inset-x-6 z-50"
        >
          <nav
            aria-label="Quick navigation"
            className="max-w-6xl mx-auto flex items-center gap-5 px-5 md:px-7 h-[70px] rounded-2xl"
            style={{
              background: 'rgba(255,249,245,0.90)',
              backdropFilter: 'blur(16px) saturate(1.5)',
              WebkitBackdropFilter: 'blur(16px) saturate(1.5)',
              border: '1px solid rgba(1,12,53,0.08)',
              boxShadow: '0 12px 40px rgba(1,12,53,0.14)',
            }}
          >
            <Link href={isBusiness ? '/for-businesses' : '/'} aria-label={isBusiness ? 'Redeemo for business' : 'Redeemo'} className="flex-shrink-0 no-underline">
              {isBusiness ? (
                <BusinessLogo tone="dark" />
              ) : (
                <Image src="/logo-horizontal.svg" alt="Redeemo" width={180} height={50} className="h-[52px] w-auto" />
              )}
            </Link>

            <div className="hidden md:flex gap-1 flex-1 justify-center">
              {navLinks.map(link => {
                const isActive = isBusiness ? activeAnchor === link.href : pathname === link.href || pathname.startsWith(link.href + '/')
                const children = link.children
                return (
                  <span
                    key={link.href}
                    className="relative"
                    onMouseEnter={children ? () => setDropOpen('float' + link.href) : undefined}
                    onMouseLeave={children ? () => setDropOpen(null) : undefined}
                    onFocus={children ? () => setDropOpen('float' + link.href) : undefined}
                    onBlur={children ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOpen(null) } : undefined}
                  >
                    <Link
                      href={link.href}
                      aria-haspopup={children ? 'menu' : undefined}
                      aria-expanded={children ? dropOpen === 'float' + link.href : undefined}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[14px] font-medium transition-colors duration-150 no-underline ${
                        isActive ? 'text-[#E20C04]' : 'text-[#4B5563] hover:text-[#010C35]'
                      }`}
                    >
                      {link.label}
                      {children && (
                        <ChevronDown size={12} strokeWidth={2.4} className={`transition-transform duration-200 ${dropOpen === 'float' + link.href ? 'rotate-180' : ''}`} />
                      )}
                    </Link>
                    <AnimatePresence>
                      {children && dropOpen === 'float' + link.href && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.97 }}
                          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                          role="menu"
                          className="absolute left-1/2 top-[calc(100%+12px)] w-[176px] -translate-x-1/2 overflow-hidden rounded-xl p-1.5"
                          style={{
                            background: 'rgba(255,255,255,0.98)',
                            border: '1px solid rgba(1,12,53,0.08)',
                            boxShadow: '0 20px 48px rgba(1,12,53,0.16), 0 4px 14px rgba(1,12,53,0.08)',
                          }}
                        >
                          {children.map((child, ci) => (
                            <motion.div key={child.href} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: ci * 0.05 + 0.05 }}>
                              <Link
                                href={child.href}
                                role="menuitem"
                                onClick={() => setDropOpen(null)}
                                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[#4B5563] no-underline transition-colors hover:bg-[#FFF3EC] hover:text-[#010C35]"
                              >
                                <span className="h-[11px] w-[2.5px] rounded-full" style={{ background: 'var(--brand-gradient)' }} aria-hidden="true" />
                                {child.label}
                              </Link>
                            </motion.div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </span>
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
                      href={loginHref}
                      className="hidden md:block text-[14px] font-medium text-[#4B5563] hover:text-[#010C35] no-underline transition-colors"
                    >
                      Log in
                    </Link>
                    <Link
                      href={primaryCtaHref}
                      className="text-[14px] font-bold text-white px-4 py-2 rounded-lg no-underline hover:opacity-90 transition-opacity"
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
