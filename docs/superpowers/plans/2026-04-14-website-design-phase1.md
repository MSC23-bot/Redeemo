# Redeemo Customer Website — Design System & Core Reskin (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved design system to the existing customer website — correct colour tokens, redesigned Navbar and Footer, home page reskin, MerchantTile fix, and AccountNav Subscription tab.

**Architecture:** All changes are confined to `apps/customer-web/` inside the git worktree at `.worktrees/customer-web/`. Token changes in `globals.css` cascade through all components via CSS custom properties. No API or data model changes.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS v4 (`@theme` tokens), Framer Motion, TypeScript, lucide-react

**Working directory for all commands:** `/Users/shebinchaliyath/Desktop/Claude Code/Redeemo/.worktrees/customer-web/`

**App root:** `apps/customer-web/` (relative to working directory above)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/customer-web/app/globals.css` | Modify | Design tokens: brand gradient (2-stop), surface colours, text tokens, utilities |
| `apps/customer-web/components/layout/Navbar.tsx` | Modify | White at rest, navy on scroll, correct nav links, lucide icons |
| `apps/customer-web/components/layout/Footer.tsx` | Modify | Correct link columns (Company / Support), gradient CTA button, white wordmark |
| `apps/customer-web/components/landing/HeroSection.tsx` | Modify | Warm-light background, navy text, gradient headline accent, stats card |
| `apps/customer-web/components/landing/FinalCtaSection.tsx` | Modify | Navy bg → brand gradient bg |
| `apps/customer-web/components/landing/HowItWorksSection.tsx` | Modify | Neutral gray bg, gradient step circles, correct 2-stop |
| `apps/customer-web/components/landing/CategorySection.tsx` | Modify | Fix `#EE6904` dot colours to `#E84A00` |
| `apps/customer-web/components/ui/MerchantTile.tsx` | Modify | Thumbnail placeholder `#EFEFEF`, SVG heart icon, 2-stop gradient badge |
| `apps/customer-web/components/account/AccountNav.tsx` | Modify | Add Subscription nav item between Profile and Savings |

---

## Task 1: Install lucide-react and fix design tokens

**Files:**
- Modify: `apps/customer-web/app/globals.css`
- Modify: `apps/customer-web/package.json` (via npm install)

- [ ] **Step 1: Install lucide-react**

Run from the worktree root:

```bash
npm install lucide-react --workspace=@redeemo/customer-web
```

Expected: `apps/customer-web/package.json` now lists `"lucide-react"` in dependencies.

- [ ] **Step 2: Replace globals.css**

Replace the entire contents of `apps/customer-web/app/globals.css` with:

```css
@import "tailwindcss";

/* ── Self-hosted fonts ─────────────────────────────────────────────────── */

@font-face {
  font-family: 'Mustica Pro';
  src: url('/fonts/MusticaPro-SemiBold.otf') format('opentype');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Lato';
  src: url('/fonts/Lato-Light.ttf') format('truetype');
  font-weight: 300;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Lato';
  src: url('/fonts/Lato-Regular.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Lato';
  src: url('/fonts/Lato-Medium.ttf') format('truetype');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Lato';
  src: url('/fonts/Lato-Semibold.ttf') format('truetype');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Lato';
  src: url('/fonts/Lato-Bold.ttf') format('truetype');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

/* ── Tailwind theme tokens ─────────────────────────────────────────────── */

@theme {
  --color-brand-rose:  #E20C04;
  --color-brand-coral: #E84A00;
  --color-navy:        #010C35;
  --color-surface:     #FFFFFF;
  --color-bg-tint:     #FEF6F5;
  --color-bg-neutral:  #F8F9FA;

  --font-display: 'Mustica Pro', serif;
  --font-body:    'Lato', sans-serif;
  --font-mono:    'Lato', sans-serif;
}

/* ── CSS custom property tokens ────────────────────────────────────────── */

:root {
  /* Brand */
  --brand-rose:     #E20C04;
  --brand-coral:    #E84A00;
  --brand-gradient: linear-gradient(135deg, #E20C04 0%, #E84A00 100%);
  --on-brand:       #FFFFFF;

  /* Navy — primary text AND footer background */
  --navy:           #010C35;
  --navy-border:    rgba(1,12,53,0.12);

  /* Page surfaces */
  --bg-page:        #FFFFFF;
  --bg-tint:        #FEF6F5;
  --bg-tint-deep:   #FEF0EE;
  --bg-neutral:     #F8F9FA;

  /* Text */
  --text-primary:   #010C35;
  --text-secondary: #4B5563;
  --text-muted:     #9CA3AF;

  /* UI chrome */
  --border:         #EDE8E8;
  --border-subtle:  #F5F0F0;
  --ring:           #E20C04;

  /* Functional */
  --savings:        #16A34A;
  --savings-bg:     #F0FDF4;
  --featured:       #D97706;
  --featured-bg:    #FFFBEB;
  --trending:       #DB2777;
  --trending-bg:    #FCE7F3;
  --success:        #16A34A;
  --success-bg:     #F0FDF4;
  --destructive:    #B91C1C;
  --destructive-bg: #FEF2F2;
}

/* ── Global base styles ────────────────────────────────────────────────── */

* {
  box-sizing: border-box;
}

html {
  color: #010C35;
  background: #FFFFFF;
  -webkit-font-smoothing: antialiased;
}

body {
  font-family: 'Lato', sans-serif;
}

/* Gradient text utility */
.gradient-text {
  background: linear-gradient(135deg, #E20C04 0%, #E84A00 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Legacy alias — keeps existing usages working while migration completes */
.gradient-brand-text {
  background: linear-gradient(135deg, #E20C04 0%, #E84A00 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Focus ring */
:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: zero errors (CSS changes do not affect TypeScript).

- [ ] **Step 4: Commit**

```bash
git add apps/customer-web/app/globals.css apps/customer-web/package.json package-lock.json
git commit -m "style: update design tokens — 2-stop gradient, correct surface and text tokens"
```

---

## Task 2: Rebuild Navbar

**Files:**
- Modify: `apps/customer-web/components/layout/Navbar.tsx`

The existing navbar is solid navy sticky. The new navbar is white at rest (with subtle border) and transitions to navy when the user scrolls past 80px. Nav links change to: Discover, How it works, Pricing, For businesses. Right side: "Log in" ghost + "Join free" gradient button.

- [ ] **Step 1: Rewrite Navbar.tsx**

Replace the entire contents of `apps/customer-web/components/layout/Navbar.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
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

  const isDark = scrolled || menuOpen
  const navBg = isDark
    ? 'bg-[#010C35] border-transparent'
    : 'bg-white border-[#EDE8E8]'

  return (
    <header className={`sticky top-0 z-50 border-b transition-colors duration-300 ${navBg}`}>
      <nav className="max-w-7xl mx-auto px-6 h-[60px] flex items-center gap-6">

        {/* Logo: gradient R icon + wordmark */}
        <Link href="/" className="flex-shrink-0 flex items-center gap-2 no-underline">
          <span
            aria-hidden
            className="w-7 h-7 rounded-[6px] flex items-center justify-center text-white font-display font-semibold text-[15px] flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
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
                    style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
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
                  style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
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
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="md:hidden overflow-hidden bg-[#010C35] border-t border-white/[0.06]"
          >
            <div className="px-6 py-4 flex flex-col gap-1">
              {NAV_LINKS.map(link => {
                const isActive = pathname === link.href
                return (
                  <Link
                    key={link.href}
                    href={link.href}
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
                        style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
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
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: zero errors. If lucide-react types are missing, verify Task 1 Step 1 ran successfully.

- [ ] **Step 3: Visual check**

Start dev server (`npm run dev` in `apps/customer-web/`). Open http://localhost:3001. Confirm:
- Navbar is white with navy text and warm border at page top
- Scrolling past ~80px transitions navbar to navy with white text
- "Join free" button has gradient background
- Active page link shows gradient underline indicator

- [ ] **Step 4: Commit**

```bash
git add apps/customer-web/components/layout/Navbar.tsx
git commit -m "feat: redesign Navbar — white at rest, navy on scroll, correct nav links and CTAs"
```

---

## Task 3: Rebuild Footer

**Files:**
- Modify: `apps/customer-web/components/layout/Footer.tsx`

The existing footer uses the wrong link columns and has gradient text on the wordmark (should be white). Update to use correct Company / Support columns per spec, white wordmark, and a gradient CTA button in the bottom row.

- [ ] **Step 1: Rewrite Footer.tsx**

Replace the entire contents of `apps/customer-web/components/layout/Footer.tsx`:

```tsx
import Link from 'next/link'

const COMPANY_LINKS = [
  { href: '/about',          label: 'About' },
  { href: '/how-it-works',   label: 'How it works' },
  { href: '/for-businesses', label: 'For businesses' },
  { href: '/pricing',        label: 'Pricing' },
  { href: '/insider',        label: 'Insider' },
]

const SUPPORT_LINKS = [
  { href: '/faq',      label: 'FAQ' },
  { href: '/privacy',  label: 'Privacy policy' },
  { href: '/terms',    label: 'Terms' },
  { href: '/contact',  label: 'Contact' },
]

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-[#010C35] text-white pt-16 pb-10">
      <div className="max-w-7xl mx-auto px-6">

        {/* Top row: brand + columns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 mb-14">

          {/* Brand */}
          <div className="sm:col-span-1">
            {/* White wordmark: gradient R icon + white text */}
            <div className="flex items-center gap-2 mb-4">
              <span
                aria-hidden
                className="w-7 h-7 rounded-[6px] flex items-center justify-center text-white font-display font-semibold text-[15px] flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
              >
                R
              </span>
              <span className="font-display text-[18px] font-semibold text-white leading-none">
                Redeemo
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-white/45 max-w-[200px]">
              Exclusive vouchers from local businesses. Subscribe and save every month.
            </p>
          </div>

          {/* Company links */}
          <div>
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/30 mb-4">
              Company
            </p>
            <ul className="flex flex-col gap-3">
              {COMPANY_LINKS.map(item => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-[13px] text-white/55 hover:text-white/90 transition-colors no-underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support links */}
          <div>
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/30 mb-4">
              Support
            </p>
            <ul className="flex flex-col gap-3">
              {SUPPORT_LINKS.map(item => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-[13px] text-white/55 hover:text-white/90 transition-colors no-underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom row: copyright + gradient CTA */}
        <div className="border-t border-white/[0.08] pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[12px] text-white/30">
            &copy; {year} Redeemo Ltd. All rights reserved. UK registered company.
          </p>
          <Link
            href="/register"
            className="text-[13px] font-semibold text-white px-5 py-2.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
          >
            Join free today
          </Link>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Visual check**

Open http://localhost:3001, scroll to footer. Confirm: navy background, white "R" icon with gradient fill, white wordmark, two link columns (Company / Support), gradient CTA button in bottom row.

- [ ] **Step 4: Commit**

```bash
git add apps/customer-web/components/layout/Footer.tsx
git commit -m "feat: rebuild Footer — correct link columns, white wordmark, gradient CTA"
```

---

## Task 4: Reskin HeroSection (home page)

**Files:**
- Modify: `apps/customer-web/components/landing/HeroSection.tsx`

The existing hero has a deep navy background with white text. The new hero has a warm-light gradient background with navy text, gradient text for the headline accent, and a white stats card below the CTAs.

- [ ] **Step 1: Rewrite HeroSection.tsx**

Replace the entire contents of `apps/customer-web/components/landing/HeroSection.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

export function HeroSection() {
  return (
    <section
      className="relative overflow-hidden py-24 md:py-32 px-6"
      style={{ background: 'linear-gradient(160deg, #FFF8F7 0%, #FFFFFF 60%)' }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="max-w-[680px]">

          {/* Eyebrow */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#E20C04] mb-5"
          >
            UK&apos;s local voucher membership
          </motion.p>

          {/* H1 */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="font-display text-[#010C35] leading-[1.08] mb-6"
            style={{ fontSize: 'clamp(40px, 5.5vw, 68px)', letterSpacing: '-1px' }}
          >
            The membership that{' '}
            <span
              className="gradient-text"
              style={{ WebkitTextFillColor: 'transparent' }}
            >
              rewards you locally.
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.22 }}
            className="text-[15px] leading-[1.65] text-[#4B5563] max-w-[440px] mb-10"
          >
            One subscription unlocks exclusive vouchers from restaurants, cafes, gyms, salons, and more — all within your neighbourhood.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.34 }}
            className="flex flex-wrap items-center gap-4 mb-10"
          >
            <Link
              href="/subscribe"
              className="inline-block text-white font-semibold text-[15px] px-7 py-3.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
            >
              Get started — from £6.99/mo
            </Link>
            <Link
              href="/how-it-works"
              className="text-[15px] font-medium text-[#4B5563] no-underline hover:text-[#010C35] transition-colors"
            >
              See how it works &rarr;
            </Link>
          </motion.div>

          {/* Stats card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.46 }}
            className="inline-flex items-center gap-8 bg-white border border-[#EDE8E8] rounded-xl px-7 py-4 shadow-sm"
          >
            {[
              { value: '500+', label: 'merchants' },
              { value: '£6.99', label: 'per month' },
              { value: '1x', label: 'per merchant/cycle' },
            ].map((stat, i) => (
              <div key={stat.label} className={`flex flex-col items-center gap-0.5 ${i > 0 ? 'border-l border-[#EDE8E8] pl-8' : ''}`}>
                <span
                  className="font-display font-semibold text-[22px] leading-none gradient-text"
                  style={{ WebkitTextFillColor: 'transparent' }}
                >
                  {stat.value}
                </span>
                <span className="text-[11px] text-[#9CA3AF] font-medium tracking-wide">
                  {stat.label}
                </span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Visual check**

Open http://localhost:3001. Confirm:
- Hero background is warm-light (off-white with a very faint warm tint), not dark navy
- "The membership that" is navy text, "rewards you locally." renders in rose-to-coral gradient
- Stats card is a white bordered card below the CTAs with gradient numbers
- Primary CTA button is gradient red-to-coral

- [ ] **Step 4: Commit**

```bash
git add apps/customer-web/components/landing/HeroSection.tsx
git commit -m "feat: reskin HeroSection — warm-light bg, navy text, gradient headline, stats card"
```

---

## Task 5: Fix FinalCtaSection and HowItWorksSection

**Files:**
- Modify: `apps/customer-web/components/landing/FinalCtaSection.tsx`
- Modify: `apps/customer-web/components/landing/HowItWorksSection.tsx`
- Modify: `apps/customer-web/components/landing/CategorySection.tsx`

Three quick fixes: (1) FinalCtaSection background changes from navy to brand gradient. (2) HowItWorksSection uses neutral gray bg and 2-stop gradient circles. (3) CategorySection dot colours updated.

- [ ] **Step 1: Fix FinalCtaSection.tsx**

Replace the entire contents of `apps/customer-web/components/landing/FinalCtaSection.tsx`:

```tsx
import Link from 'next/link'

export function FinalCtaSection() {
  return (
    <section
      className="py-24 px-6 text-center"
      style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
    >
      <div className="max-w-[640px] mx-auto">
        <h2
          className="font-display text-white leading-[1.1] mb-5"
          style={{ fontSize: 'clamp(32px, 4.5vw, 56px)' }}
        >
          Less than one coffee a week.
        </h2>
        <p className="text-[15px] text-white/75 mb-10 leading-[1.65]">
          Start saving at restaurants, cafes, gyms, and more near you. One subscription, unlimited local discovery.
        </p>
        <Link
          href="/subscribe"
          className="inline-block bg-white text-[#E20C04] font-bold text-[15px] px-8 py-3.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
        >
          Get started — from £6.99/mo
        </Link>
        <p className="mt-4 text-[12px] text-white/50">No commitment. Cancel any time.</p>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Fix HowItWorksSection.tsx**

In `apps/customer-web/components/landing/HowItWorksSection.tsx`:
- Change the section background from `bg-surface-muted` to `bg-[#F8F9FA]`
- Change the gradient on step circles from `linear-gradient(135deg, #E2000C, #EE6904)` to `linear-gradient(135deg, #E20C04, #E84A00)`

Find and replace:

```tsx
// Find:
<section className="bg-surface-muted py-24 px-6 overflow-hidden">
// Replace with:
<section className="bg-[#F8F9FA] py-24 px-6 overflow-hidden">
```

```tsx
// Find (step circle gradient):
style={{ background: 'linear-gradient(135deg, #E2000C, #EE6904)' }}
// Replace with:
style={{ background: 'linear-gradient(135deg, #E20C04, #E84A00)' }}
```

- [ ] **Step 3: Fix CategorySection.tsx**

In `apps/customer-web/components/landing/CategorySection.tsx`, update the CATEGORIES array — remove the `#EE6904` entries, cycle only through rose and coral:

```tsx
// Find and replace the entire CATEGORIES array:
const CATEGORIES = [
  { label: 'Restaurants',       dot: '#E20C04' },
  { label: 'Cafes',             dot: '#E84A00' },
  { label: 'Gyms & Fitness',    dot: '#E20C04' },
  { label: 'Salons & Beauty',   dot: '#E84A00' },
  { label: 'Retail',            dot: '#E20C04' },
  { label: 'Entertainment',     dot: '#E84A00' },
  { label: 'Wellness',          dot: '#E20C04' },
  { label: 'Food & Drink',      dot: '#E84A00' },
]
```

Also update the section background from `bg-[#FAF8F5]` to `bg-[#FEF6F5]` (correct warm tint token):

```tsx
// Find:
<section className="bg-[#FAF8F5] py-20 px-6">
// Replace with:
<section className="bg-[#FEF6F5] py-20 px-6">
```

- [ ] **Step 4: Run typecheck**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 5: Visual check**

Open http://localhost:3001. Confirm:
- The "Start saving at your favourite local spots" CTA section is now rose-to-coral gradient, not navy
- The How it Works section has a light neutral gray background
- Category section has the correct warm tint background

- [ ] **Step 6: Commit**

```bash
git add apps/customer-web/components/landing/FinalCtaSection.tsx \
        apps/customer-web/components/landing/HowItWorksSection.tsx \
        apps/customer-web/components/landing/CategorySection.tsx
git commit -m "style: fix CTA section (gradient not navy), HowItWorks bg, category dot colours"
```

---

## Task 6: Fix MerchantTile

**Files:**
- Modify: `apps/customer-web/components/ui/MerchantTile.tsx`

Three fixes: (1) Thumbnail placeholder changes from `bg-navy/10` (blue-grey) to `bg-[#EFEFEF]` (neutral gray). (2) Emoji hearts (❤️ / 🤍) replaced with SVG icons. (3) Gradient uses updated to 2-stop.

- [ ] **Step 1: Rewrite MerchantTile.tsx**

Replace the entire contents of `apps/customer-web/components/ui/MerchantTile.tsx`:

```tsx
'use client'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Heart } from 'lucide-react'
import type { MerchantTileData } from '@/lib/api'

export type MerchantTile = MerchantTileData

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1000).toFixed(1)}km`
}

type Props = {
  merchant: MerchantTile
  onFavouriteToggle?: (id: string) => void
  index?: number
  variant?: 'rail' | 'grid'
}

export function MerchantTile({ merchant, onFavouriteToggle, index = 0, variant = 'rail' }: Props) {
  const displayName = merchant.tradingName ?? merchant.businessName
  const dist = formatDistance(merchant.distance ?? null)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.07 }}
      className={`group relative flex flex-col bg-white rounded-xl overflow-hidden border border-[#EDE8E8] shadow-sm hover:shadow-md transition-shadow ${
        variant === 'grid' ? 'w-full' : 'flex-shrink-0 w-[220px] sm:w-[240px]'
      }`}
    >
      {/* Thumbnail — neutral gray placeholder, never warm tint */}
      <Link
        href={`/merchants/${merchant.id}`}
        className="relative block flex-shrink-0"
        style={{ paddingTop: '66.67%' /* 3:2 ratio */ }}
      >
        <div className="absolute inset-0 bg-[#EFEFEF]">
          {merchant.bannerUrl && (
            <Image
              src={merchant.bannerUrl}
              alt={displayName}
              fill
              className="object-cover"
              sizes={variant === 'grid' ? '(max-width: 768px) 100vw, 33vw' : '240px'}
            />
          )}
        </div>

        {/* Logo circle */}
        {merchant.logoUrl && (
          <div className="absolute bottom-0 left-3 translate-y-1/2 w-10 h-10 rounded-full border-2 border-white shadow overflow-hidden bg-white z-10">
            <Image src={merchant.logoUrl} alt="" fill className="object-cover" sizes="40px" />
          </div>
        )}
      </Link>

      {/* Favourite button — top right of thumbnail */}
      {onFavouriteToggle && (
        <button
          onClick={e => { e.preventDefault(); onFavouriteToggle(merchant.id) }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-white transition-colors z-10"
          aria-label={merchant.isFavourited ? 'Remove from favourites' : 'Add to favourites'}
        >
          <Heart
            size={15}
            strokeWidth={1.8}
            className={merchant.isFavourited ? 'text-[#E20C04] fill-[#E20C04]' : 'text-[#9CA3AF]'}
          />
        </button>
      )}

      {/* Info area */}
      <Link href={`/merchants/${merchant.id}`} className="flex flex-col gap-2 p-4 pt-6 flex-1 no-underline">
        {merchant.primaryCategory && (
          <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#E20C04]">
            {merchant.primaryCategory.name}
          </span>
        )}

        <h3 className="font-body text-[16px] font-bold text-[#010C35] leading-snug line-clamp-2">
          {displayName}
        </h3>

        <div className="flex items-center gap-2 flex-wrap">
          {merchant.voucherCount > 0 && (
            <span className="text-[12px] text-[#4B5563]">
              {merchant.voucherCount} {merchant.voucherCount === 1 ? 'voucher' : 'vouchers'}
            </span>
          )}
          {merchant.maxEstimatedSaving !== null && (
            <span
              className="text-[11px] font-semibold text-white px-2 py-0.5 rounded-full"
              style={{ background: 'linear-gradient(135deg, #E20C04 0%, #E84A00 100%)' }}
            >
              Save up to £{merchant.maxEstimatedSaving.toFixed(0)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between mt-auto pt-2 border-t border-[#EDE8E8]">
          {merchant.avgRating !== null ? (
            <span className="text-[12px] text-[#4B5563]">
              &#9733; {merchant.avgRating.toFixed(1)}
              <span className="text-[#9CA3AF] ml-1">({merchant.reviewCount})</span>
            </span>
          ) : (
            <span className="text-[11px] text-[#9CA3AF] font-bold tracking-wide uppercase">New</span>
          )}
          {dist && (
            <span className="text-[11px] text-[#9CA3AF]">{dist}</span>
          )}
        </div>
      </Link>
    </motion.div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Visual check**

Open http://localhost:3001 and navigate to /discover. Confirm:
- Merchant card thumbnails show neutral gray (`#EFEFEF`) placeholder, not a blue-grey tint
- Heart icon renders as a proper SVG (no emoji rendering variance between platforms)
- "Save up to £X" badge uses gradient, not a flat colour

- [ ] **Step 4: Commit**

```bash
git add apps/customer-web/components/ui/MerchantTile.tsx
git commit -m "fix: MerchantTile — neutral gray thumbnail, SVG heart, 2-stop gradient badge"
```

---

## Task 7: Add Subscription tab to AccountNav

**Files:**
- Modify: `apps/customer-web/components/account/AccountNav.tsx`

The spec requires: Overview, Profile, **Subscription**, Savings, Favourites. Subscription is currently missing and the page `/account/subscription` will be built in Phase 2.

- [ ] **Step 1: Add Subscription to NAV_ITEMS in AccountNav.tsx**

In `apps/customer-web/components/account/AccountNav.tsx`, find the `NAV_ITEMS` array and add the Subscription entry between Profile and Savings:

```tsx
// Find the existing NAV_ITEMS array and replace it entirely:
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
```

- [ ] **Step 2: Run typecheck**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: zero errors. The `/account/subscription` route does not yet exist but that does not cause a TypeScript error — it is just a Link href string.

- [ ] **Step 3: Visual check**

Log in as `customer@redeemo.com` / `Customer1234!` and navigate to http://localhost:3001/account. Confirm the sidebar now shows: Overview, Profile, Subscription, Savings, Favourites in that order.

- [ ] **Step 4: Commit**

```bash
git add apps/customer-web/components/account/AccountNav.tsx
git commit -m "feat: add Subscription tab to AccountNav"
```

---

## Phase 1 Complete

All seven tasks done. The design system is correct, shared layout components are rebuilt, the home page hero is reskinned, and the account nav reflects the full spec.

**Next:** Proceed to `docs/superpowers/plans/2026-04-14-website-design-phase2.md` to build the nine new pages.
