import Link from 'next/link'
import Image from 'next/image'

const CURRENT_YEAR = new Date().getFullYear()

const COMPANY_LINKS = [
  { href: '/about',          label: 'About' },
  { href: '/how-it-works',   label: 'How it works' },
  { href: '/for-businesses', label: 'For businesses' },
  { href: '/pricing',        label: 'Pricing' },
  { href: '/insider',        label: 'Insider' },
]

// "Contact" removed until a real contact destination exists: it pointed at
// /contact, which has never been a route (it returned a 404). The merchant
// path is /for-businesses, which routes into portal registration.
const SUPPORT_LINKS = [
  { href: '/faq',      label: 'FAQ' },
  { href: '/privacy',  label: 'Privacy policy' },
  { href: '/terms',    label: 'Terms' },
]

// Compact by design (owner 2026-07-13: the footer ran a full screen on
// mobile): brand row on top, the two link columns side by side beneath it,
// no closing CTA (the page is already saturated with them).
export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#010C35] text-white pt-10 md:pt-14 pb-7">

      {/* Rose-red glow — top-left strong + bottom-right accent */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(580px circle at -6% 2%, rgba(226,12,4,0.32), transparent 54%), radial-gradient(420px circle at 106% 108%, rgba(226,12,4,0.22), transparent 54%)',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6">

        {/* The business invitation lives here now (owner 2026-07-13: the
            standalone bridge card was one card too many at the page's
            foot): the same brand-red band, compact, at home on the navy */}
        <div
          className="relative overflow-hidden rounded-2xl px-5 py-5 md:px-8 md:py-6 mb-9 md:mb-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          style={{
            background: 'linear-gradient(135deg, #C40902 0%, #E20C04 45%, #E8500A 100%)',
            boxShadow: '0 16px 44px rgba(226,12,4,0.24), inset 0 1px 0 rgba(255,255,255,0.18)',
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(420px circle at 108% -30%, rgba(255,255,255,0.12), transparent 55%)' }}
          />
          <div className="relative">
            <p className="font-display text-white text-[17px] md:text-[20px] leading-[1.25] mb-1" style={{ letterSpacing: '-0.2px' }}>
              Got a business? List it on Redeemo.
            </p>
            <p className="text-[12.5px] md:text-[13px] text-white/75 leading-[1.55] max-w-[520px]">
              Free listing. No commission. You design the vouchers.
            </p>
          </div>
          <Link
            href="/for-businesses"
            className="relative inline-flex items-center justify-center flex-shrink-0 font-semibold text-[13.5px] px-5 py-2.5 rounded-lg bg-white no-underline hover:bg-white/90 transition-colors"
            style={{ color: '#010C35', boxShadow: '0 4px 14px rgba(0,0,0,0.16)' }}
          >
            Find out more
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-7 md:gap-12 mb-8 md:mb-12">

          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="inline-block mb-2 md:mb-4 no-underline" aria-label="Redeemo home">
              <Image
                src="/logo-dark.png"
                alt="Redeemo"
                width={340}
                height={96}
                className="h-[52px] md:h-[80px] w-auto"
              />
            </Link>
            <p className="text-[12.5px] md:text-[13px] leading-relaxed text-white/45 max-w-[250px]">
              Member-only offers from the businesses around you, with new
              vouchers every&nbsp;month.
            </p>
          </div>

          {/* Company links */}
          <nav aria-label="Company">
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/30 mb-3 md:mb-4">
              Company
            </p>
            <ul className="flex flex-col gap-2 md:gap-3">
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
          </nav>

          {/* Support links */}
          <nav aria-label="Support">
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/30 mb-3 md:mb-4">
              Support
            </p>
            <ul className="flex flex-col gap-2 md:gap-3">
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
          </nav>
        </div>

        <div className="border-t border-white/[0.08] pt-6">
          <p className="text-[11.5px] md:text-[12px] text-white/30 text-center sm:text-left">
            &copy; {CURRENT_YEAR} Redeemo Ltd. All rights reserved. UK registered company.
          </p>
        </div>
      </div>
    </footer>
  )
}
