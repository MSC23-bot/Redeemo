'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'

const NAV_LINKS = [
  { href: '/discover', label: 'Discover' },
  { href: '/merchants', label: 'For Merchants' },
]

export function Navbar() {
  const { user, isLoading, logout } = useAuth()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-navy/95 backdrop-blur-md border-b border-white/5">
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-8">
        {/* Logo */}
        <Link href="/" className="flex-shrink-0">
          <Image
            src="/logo-horizontal.svg"
            alt="Redeemo"
            width={140}
            height={36}
            priority
          />
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex gap-1 flex-1">
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                pathname === link.href
                  ? 'text-white'
                  : 'text-white/60 hover:text-white/90'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop auth actions */}
        <div className="hidden md:flex items-center gap-3">
          {!isLoading && (
            <>
              {user ? (
                <>
                  <Link
                    href="/account"
                    className="text-sm font-medium text-white/80 hover:text-white transition-colors"
                  >
                    Account
                  </Link>
                  <button
                    onClick={() => void logout()}
                    className="text-sm font-medium text-white/45 hover:text-white/70 bg-transparent border-none cursor-pointer transition-colors py-1.5"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-sm font-medium text-white/80 hover:text-white transition-colors"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/subscribe"
                    className="text-sm font-semibold text-white px-5 py-2 rounded-lg bg-gradient-to-r from-red to-orange-red hover:opacity-90 transition-opacity"
                  >
                    Subscribe
                  </Link>
                </>
              )}
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="md:hidden ml-auto p-2 text-white/70 hover:text-white"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            {menuOpen ? (
              <>
                <line x1="4" y1="4" x2="18" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="18" y1="4" x2="4" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </>
            ) : (
              <>
                <line x1="3" y1="7" x2="19" y2="7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="3" y1="11" x2="19" y2="11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="3" y1="15" x2="19" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="md:hidden overflow-hidden bg-navy border-t border-white/5"
          >
            <div className="px-6 py-4 flex flex-col gap-2">
              {NAV_LINKS.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname === link.href ? 'text-white bg-white/[0.08]' : 'text-white/65 hover:text-white'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              {!isLoading && (
                <div className="mt-2 pt-3 border-t border-white/[0.08] flex flex-col gap-2">
                  {user ? (
                    <>
                      <Link href="/account" onClick={() => setMenuOpen(false)} className="px-3 py-2.5 text-sm font-medium text-white/80 hover:text-white">
                        Account
                      </Link>
                      <button
                        onClick={() => { void logout(); setMenuOpen(false) }}
                        className="text-left px-3 py-2.5 text-sm font-medium text-white/45 hover:text-white/70 bg-transparent border-none cursor-pointer"
                      >
                        Sign out
                      </button>
                    </>
                  ) : (
                    <>
                      <Link href="/login" onClick={() => setMenuOpen(false)} className="px-3 py-2.5 text-sm font-medium text-white/80">
                        Log in
                      </Link>
                      <Link
                        href="/subscribe"
                        onClick={() => setMenuOpen(false)}
                        className="px-3 py-2.5 text-sm font-semibold text-white text-center rounded-lg bg-gradient-to-r from-red to-orange-red"
                      >
                        Subscribe
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
