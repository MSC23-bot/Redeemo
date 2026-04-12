import Link from 'next/link'

const FOOTER_LINKS = {
  Discover: [
    { href: '/discover', label: 'Browse Merchants' },
    { href: '/search', label: 'Search' },
    { href: '/subscribe', label: 'Pricing' },
  ],
  Business: [
    { href: '/merchants', label: 'For Merchants' },
    { href: '/merchants#how-it-works', label: 'How It Works' },
    { href: '/merchants#pricing', label: 'Merchant Pricing' },
  ],
  Account: [
    { href: '/login', label: 'Log In' },
    { href: '/register', label: 'Sign Up' },
    { href: '/account', label: 'My Account' },
  ],
}

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-deep-navy text-white/70 pt-16 pb-10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          {/* Brand column */}
          <div>
            <span className="font-display text-[28px] gradient-brand-text block mb-4">
              Redeemo
            </span>
            <p className="text-sm leading-relaxed text-white/50 max-w-[220px]">
              Exclusive vouchers from local businesses. Subscribe and save every month.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([section, items]) => (
            <div key={section}>
              <p className="text-xs font-semibold tracking-widest uppercase text-white/30 mb-4">
                {section}
              </p>
              <ul className="flex flex-col gap-2.5">
                {items.map(item => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-white/60 hover:text-white/90 transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.08] pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-white/30">
            © {year} Redeemo Ltd. All rights reserved. UK registered company.
          </p>
          <div className="flex gap-6">
            {[
              { href: '/privacy', label: 'Privacy' },
              { href: '/terms', label: 'Terms' },
              { href: '/cookies', label: 'Cookies' },
            ].map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
