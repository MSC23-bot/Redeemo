'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { merchantPortalLoginUrl, merchantPortalRegisterUrl } from '@/lib/prelaunch'

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

// Owner decision D-F: merchant contact address (deploy-security runbook §6).
const MERCHANT_EMAIL = 'merchants@redeemo.co.uk'

// /for-businesses variant: this page is its own front door (owner 2026-07-17),
// so its footer speaks to businesses and offers the road BACK to the customer
// site, instead of pitching the page the visitor is already on.
const BUSINESS_SECTION_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#why-redeemo',  label: 'Why Redeemo' },
  { href: '#portal',       label: 'Merchant portal' },
  { href: '#your-margin',  label: 'Pricing' },
]

const CUSTOMER_LINKS_FOR_BUSINESS_PAGE = [
  { href: '/',             label: 'Explore Redeemo' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing',      label: 'Membership pricing' },
  { href: '/insider',      label: 'Insider' },
  { href: '/faq',          label: 'FAQ' },
]

function FooterColumn({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <nav aria-label={heading}>
      <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/30 mb-3 md:mb-4">
        {heading}
      </p>
      <ul className="flex flex-col gap-2 md:gap-3">{children}</ul>
    </nav>
  )
}

function FooterLink({ href, label, external }: { href: string; label: string; external?: boolean }) {
  const cls = 'text-[13px] text-white/55 hover:text-white/90 transition-colors no-underline'
  return (
    <li>
      {external ? (
        <a href={href} className={cls}>{label}</a>
      ) : (
        <Link href={href} className={cls}>{label}</Link>
      )}
    </li>
  )
}

export function Footer() {
  const pathname = usePathname()
  const isBusiness = pathname === '/for-businesses' || pathname.startsWith('/for-businesses/')

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

        {/* The bridge band: on customer pages it invites businesses in; on the
            business page it points the other way, to the customer app */}
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
              {isBusiness ? 'Here for the savings instead?' : 'Got a business? List it on Redeemo.'}
            </p>
            <p className="text-[12.5px] md:text-[13px] text-white/75 leading-[1.55] max-w-[520px]">
              {isBusiness
                ? 'Redeemo members use vouchers at quality local places, with new offers every month.'
                : 'Free listing. No commission. You design the vouchers.'}
            </p>
          </div>
          <Link
            href={isBusiness ? '/' : '/for-businesses'}
            className="relative inline-flex items-center justify-center flex-shrink-0 font-semibold text-[13.5px] px-5 py-2.5 rounded-lg bg-white no-underline hover:bg-white/90 transition-colors"
            style={{ color: '#010C35', boxShadow: '0 4px 14px rgba(0,0,0,0.16)' }}
          >
            {isBusiness ? 'Explore Redeemo' : 'Find out more'}
          </Link>
        </div>

        <div className={`grid grid-cols-2 gap-x-6 gap-y-7 md:gap-12 mb-8 md:mb-12 ${isBusiness ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>

          {/* Brand */}
          <div className={isBusiness ? 'col-span-2 sm:col-span-1' : 'col-span-2 sm:col-span-1'}>
            <Link href={isBusiness ? '/for-businesses' : '/'} className="inline-block mb-2 md:mb-4 no-underline" aria-label={isBusiness ? 'Redeemo for business' : 'Redeemo home'}>
              <Image
                src="/logo-dark.png"
                alt="Redeemo"
                width={340}
                height={96}
                className="h-[52px] md:h-[80px] w-auto"
              />
            </Link>
            <p className="text-[12.5px] md:text-[13px] leading-relaxed text-white/45 max-w-[250px]">
              {isBusiness
                ? 'Customers find your business on Redeemo and walk in with a voucher. Free to list, no commission, your own terms.'
                : <>Member-only offers from the businesses around you, with new vouchers every&nbsp;month.</>}
            </p>
          </div>

          {isBusiness ? (
            <>
              <FooterColumn heading="Your business">
                {BUSINESS_SECTION_LINKS.map(item => (
                  <FooterLink key={item.href} href={item.href} label={item.label} external />
                ))}
              </FooterColumn>
              <FooterColumn heading="Get started">
                <FooterLink href={merchantPortalRegisterUrl()} label="List your business" external />
                <FooterLink href={merchantPortalLoginUrl()} label="Portal log in" external />
                <FooterLink href={`mailto:${MERCHANT_EMAIL}`} label={MERCHANT_EMAIL} external />
              </FooterColumn>
              <FooterColumn heading="For customers">
                {CUSTOMER_LINKS_FOR_BUSINESS_PAGE.map(item => (
                  <FooterLink key={item.href} href={item.href} label={item.label} />
                ))}
              </FooterColumn>
            </>
          ) : (
            <>
              <FooterColumn heading="Company">
                {COMPANY_LINKS.map(item => (
                  <FooterLink key={item.href} href={item.href} label={item.label} />
                ))}
              </FooterColumn>
              <FooterColumn heading="Support">
                {SUPPORT_LINKS.map(item => (
                  <FooterLink key={item.href} href={item.href} label={item.label} />
                ))}
              </FooterColumn>
            </>
          )}
        </div>

        <div className="border-t border-white/[0.08] pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-[11.5px] md:text-[12px] text-white/30 text-center sm:text-left">
            &copy; {CURRENT_YEAR} Redeemo Ltd. All rights reserved. UK registered company.
          </p>
          {isBusiness && (
            <p className="flex items-center justify-center gap-4 text-[11.5px] md:text-[12px]">
              <Link href="/privacy" className="text-white/30 hover:text-white/60 transition-colors no-underline">Privacy policy</Link>
              <Link href="/terms" className="text-white/30 hover:text-white/60 transition-colors no-underline">Terms</Link>
            </p>
          )}
        </div>
      </div>
    </footer>
  )
}
