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

const SUPPORT_LINKS = [
  { href: '/faq',      label: 'FAQ' },
  { href: '/privacy',  label: 'Privacy policy' },
  { href: '/terms',    label: 'Terms' },
  { href: '/contact',  label: 'Contact' },
]

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#010C35] text-white pt-16 pb-10">

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

        {/* Top row: brand + columns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 mb-14">

          {/* Brand */}
          <div className="sm:col-span-1">
            <Link href="/" className="inline-block mb-4 no-underline" aria-label="Redeemo home">
              <Image
                src="/logo-dark.png"
                alt="Redeemo"
                width={340}
                height={96}
                className="h-[96px] w-auto"
              />
            </Link>
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
