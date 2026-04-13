import Link from 'next/link'

const CURRENT_YEAR = new Date().getFullYear()

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
                aria-hidden={true}
                className="w-7 h-7 rounded-[6px] flex items-center justify-center text-white font-display font-semibold text-[15px] flex-shrink-0"
                style={{ background: 'var(--brand-gradient)' }}
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
          <nav aria-label="Company">
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
          </nav>

          {/* Support links */}
          <nav aria-label="Support">
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
          </nav>
        </div>

        {/* Bottom row: copyright + gradient CTA */}
        <div className="border-t border-white/[0.08] pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[12px] text-white/30">
            &copy; {CURRENT_YEAR} Redeemo Ltd. All rights reserved. UK registered company.
          </p>
          <Link
            href="/register"
            className="text-[13px] font-semibold text-white px-5 py-2.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
            style={{ background: 'var(--brand-gradient)' }}
          >
            Join free today
          </Link>
        </div>
      </div>
    </footer>
  )
}
