'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const NAV_LINKS = [
  { href: '/discover',       label: 'Discover' },
  { href: '/how-it-works',   label: 'How it works' },
  { href: '/pricing',        label: 'Pricing' },
  { href: '/for-businesses', label: 'For businesses' },
]

export function Navbar() {
  const { user, isLoading, logout } = useAuth()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setMenuOpen(false) }, [pathname])

  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    if (menuOpen) firstMobileLinkRef.current?.focus()
  }, [menuOpen])

  const isDark = scrolled || menuOpen
  const navBg = isDark
    ? 'bg-[#010C35] border-transparent'
    : 'bg-white border-[#EDE8E8]'

  return (
    <header className={`sticky top-0 z-50 border-b transition-colors duration-300 ${navBg}`}>
      <nav aria-label="Main" className="max-w-7xl mx-auto px-6 h-[60px] flex items-center gap-6">

        {/* Logo: gradient R icon + wordmark */}
        <Link href="/" className="flex-shrink-0 flex items-center gap-2 no-underline">
          <span
            aria-hidden
            className="w-7 h-7 rounded-[6px] flex items-center justify-center text-white font-display font-semibold text-[15px] flex-shrink-0"
            style={{ background: 'var(--brand-gradient)' }}
          >
            R
          </span>
          <span
            className={`font-display text-[18px] font-semibold leading-none transition-colors duration-300 ${
              isDark ? 'text-white' : 'text-[#010C35]'
            }`}
          >
            Redeemo
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex gap-0.5 flex-1">
          {NAV_LINKS.map(link => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
            const activeColour = isDark ? 'text-white' : 'text-[#E20C04]'
            const mutedColour = isDark ? 'text-white/65 hover:text-white' : 'text-[#4B5563] hover:text-[#010C35]'
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3 py-1.5 rounded-md text-[14px] font-medium transition-colors duration-150 no-underline ${
                  isActive ? activeColour : mutedColour
                }`}
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

        {/* Desktop auth */}
        <div className="hidden md:flex items-center gap-3 ml-auto">
          {!isLoading && (
            user ? (
              <>
                <Link
                  href="/account"
                  className={`text-[14px] font-medium no-underline transition-colors ${
                    isDark ? 'text-white/80 hover:text-white' : 'text-[#4B5563] hover:text-[#010C35]'
                  }`}
                >
                  Account
                </Link>
                <button
                  onClick={() => void logout()}
                  className={`text-[13px] font-medium bg-transparent border-none cursor-pointer transition-colors ${
                    isDark ? 'text-white/35 hover:text-white/65' : 'text-[#9CA3AF] hover:text-[#4B5563]'
                  }`}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className={`text-[14px] font-medium no-underline transition-colors ${
                    isDark ? 'text-white/80 hover:text-white' : 'text-[#4B5563] hover:text-[#010C35]'
                  }`}
                >
                  Log in
                </Link>
                <Link
                  href="/register"
                  className="text-[14px] font-semibold text-white px-4 py-2 rounded-lg no-underline hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--brand-gradient)' }}
                >
                  Join free
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

      {/* Mobile menu — navy overlay */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="md:hidden overflow-hidden bg-[#010C35] border-t border-white/[0.06]"
          >
            <div className="px-6 py-4 flex flex-col gap-1">
              {NAV_LINKS.map((link, i) => {
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
                      <Link
                        href="/account"
                        onClick={() => setMenuOpen(false)}
                        className="px-3 py-3 text-[14px] font-medium text-white/80 no-underline"
                      >
                        Account
                      </Link>
                      <button
                        onClick={() => { void logout(); setMenuOpen(false) }}
                        className="text-left px-3 py-3 text-[14px] font-medium text-white/35 bg-transparent border-none cursor-pointer"
                      >
                        Sign out
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        onClick={() => setMenuOpen(false)}
                        className="px-3 py-3 text-[14px] font-medium text-white/80 no-underline"
                      >
                        Log in
                      </Link>
                      <Link
                        href="/register"
                        onClick={() => setMenuOpen(false)}
                        className="px-3 py-3 text-[14px] font-semibold text-white text-center rounded-lg no-underline"
                        style={{ background: 'var(--brand-gradient)' }}
                      >
                        Join free
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
  )
}
