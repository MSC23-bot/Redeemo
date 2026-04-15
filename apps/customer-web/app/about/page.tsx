import type { Metadata } from 'next'
import Link from 'next/link'
import { NavyAtmosphereSection } from '@/components/shared/NavyAtmosphereSection'

export const metadata: Metadata = {
  title: 'About Redeemo',
  description:
    'We built a better way to discover local. No commission on merchants. No card-show schemes. UK-based and UK-focused.',
}

const STATS: { value: string; label: string }[] = [
  { value: 'UK', label: 'Based and focused' },
  { value: '£0', label: 'Commission to merchants' },
  { value: 'Free', label: 'To list as a merchant' },
  { value: 'One price', label: 'One subscription' },
]

const VALUES: { title: string; body: string }[] = [
  {
    title: 'Fair to merchants',
    body: 'Redeemo takes no commission on any redemption. Merchants design their own offers. We do not run card-show schemes, chase margins, or pretend restaurants can absorb permanent 50% discounts.',
  },
  {
    title: 'Honest with consumers',
    body: 'No dark patterns. No auto-renewal without notice. No selling data. No fake scarcity. You can cancel any time, from your account, with one tap. Your history stays. Your favourites stay.',
  },
  {
    title: 'Local first',
    body: 'We exist to help independent restaurants, cafes, gyms, salons, and studios compete with the chains that dominate every high street. Every feature is built with that purpose.',
  },
  {
    title: 'Technology that actually works',
    body: 'Unique digital codes. Verified redemptions. A real reconciliation trail. No paper cards, no physical fobs, no staff confusion. Members and merchants both deserve tools that make the moment simple.',
  },
]

export default function AboutPage() {
  return (
    <>
      {/* 1 · Hero (navy atmosphere) */}
      <NavyAtmosphereSection>
        <div className="max-w-5xl mx-auto px-6 py-20 md:py-28 text-center">
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#E20C04] mb-6">
            About Redeemo
          </p>
          <h1
            className="font-display text-white leading-[1.08] mb-6 max-w-[820px] mx-auto"
            style={{ fontSize: 'clamp(36px, 5vw, 60px)', letterSpacing: '-0.7px' }}
          >
            We built a better way to<br />
            <span className="gradient-text">discover local.</span>
          </h1>
          <p className="text-[16px] md:text-[17px] text-white/70 leading-[1.65] max-w-[620px] mx-auto">
            No commission on merchants. No card-show schemes. No deal-chasing. Just a clean platform that pays local businesses properly and gives members a reason to visit somewhere new.
          </p>
        </div>
      </NavyAtmosphereSection>

      {/* 2 · Stats strip (warm tint) */}
      <section className="bg-[#FEF6F5] py-14 md:py-16 px-6 border-b border-[#EDE8E8]" aria-label="Key facts about Redeemo">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {STATS.map(stat => (
              <div
                key={stat.label}
                className="bg-white rounded-2xl border border-[#EDE8E8] px-6 py-8 text-center"
              >
                <span
                  className="font-display text-[#010C35] block leading-none mb-2"
                  style={{ fontSize: 'clamp(28px, 3.2vw, 40px)', letterSpacing: '-0.3px' }}
                >
                  {stat.value}
                </span>
                <span className="text-[12px] text-[#9CA3AF] font-medium tracking-wide uppercase">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 · Our story (white) */}
      <section className="bg-white py-20 md:py-24 px-6">
        <div className="max-w-[680px] mx-auto">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#E20C04] mb-5">
            Our story
          </p>
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-10"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            Built for the places that make a neighbourhood worth living in.
          </h2>
          <div className="flex flex-col gap-6 text-[15.5px] md:text-[16px] text-[#4B5563] leading-[1.8]">
            <p>
              Redeemo started from a simple frustration. The best local restaurants, gyms, and shops rarely have a way to reward loyal customers, while big chains run endless promotions. The tools that exist for independent businesses, like Tastecard and Groupon, take a cut of every transaction and offer merchants no control over their own offers.
            </p>
            <p>
              We built Redeemo differently. Merchants set their own vouchers. Redeemo takes no commission, ever. Members pay a modest monthly subscription to unlock those offers. One redemption per merchant per cycle means the economics work for everyone. The member saves money on a real visit. The merchant acquires a new customer at full price the next time.
            </p>
            <p>
              We are UK-based and UK-focused. Every design decision, every policy, every feature exists to serve local businesses and the people who live near them.
            </p>
          </div>
        </div>
      </section>

      {/* 4 · Values (warm tint) */}
      <section className="bg-[#FEF6F5] py-20 md:py-24 px-6 border-y border-[#EDE8E8]">
        <div className="max-w-6xl mx-auto">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-12 max-w-[520px]"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            What we stand for
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
            {VALUES.map(v => (
              <div
                key={v.title}
                className="bg-white rounded-2xl border border-[#EDE8E8] p-8"
              >
                <h3 className="font-body text-[17px] md:text-[18px] font-bold text-[#010C35] mb-3 leading-snug">
                  {v.title}
                </h3>
                <p className="text-[14.5px] md:text-[15px] text-[#4B5563] leading-[1.75]">
                  {v.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5 · Press */}
      <section className="bg-white py-20 md:py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#9CA3AF] mb-5">
            Press
          </p>
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-6"
            style={{ fontSize: 'clamp(26px, 3.2vw, 40px)', letterSpacing: '-0.3px' }}
          >
            Media coverage and press assets.
          </h2>
          <div className="rounded-2xl border border-dashed border-[#EDE8E8] bg-[#FAFAFA] px-8 py-12 text-center">
            <p className="text-[14.5px] text-[#4B5563] leading-[1.7] max-w-[480px] mx-auto mb-2">
              Coverage, logos, and founder bios coming soon.
            </p>
            <p className="text-[13.5px] text-[#9CA3AF] leading-[1.6]">
              For press enquiries, email{' '}
              <a
                href="mailto:info@redeemo.co.uk"
                className="text-[#E20C04] font-medium no-underline hover:underline"
              >
                info@redeemo.co.uk
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      {/* 6 · Contact (navy atmosphere) */}
      <NavyAtmosphereSection>
        <div className="max-w-4xl mx-auto px-6 py-20 md:py-24 text-center">
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#E20C04] mb-6">
            Contact
          </p>
          <h2
            className="font-display text-white leading-[1.1] mb-6"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            Get in touch.
          </h2>
          <p className="text-[15px] md:text-[16px] text-white/70 leading-[1.7] max-w-[520px] mx-auto mb-10">
            Questions, feedback, partnership enquiries, or suggesting a merchant. We read every message.
          </p>

          <div className="flex flex-wrap justify-center gap-3 mb-12">
            <ContactPill
              href="mailto:info@redeemo.co.uk"
              label="info@redeemo.co.uk"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              }
            />
            <ContactPill
              href="https://twitter.com/redeemo-uk"
              label="redeemo-uk on Twitter"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              }
            />
            <ContactPill
              href="https://instagram.com/redeemo-uk"
              label="redeemo-uk on Instagram"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              }
            />
            <ContactPill
              href="https://linkedin.com/company/redeemo-uk"
              label="redeemo-uk on LinkedIn"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              }
            />
          </div>

          <div className="inline-flex items-center justify-center">
            <Link
              href="/suggest-merchant"
              className="inline-block text-white font-semibold text-[14px] px-7 py-3.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'var(--brand-gradient)' }}
            >
              Suggest a merchant
            </Link>
          </div>

          <p className="mt-12 text-[12.5px] text-white/40 leading-[1.6]">
            Registered in England and Wales. Company number: [TBC]
          </p>
        </div>
      </NavyAtmosphereSection>
    </>
  )
}

function ContactPill({
  href,
  label,
  icon,
}: {
  href: string
  label: string
  icon: React.ReactNode
}) {
  const external = href.startsWith('http')
  const className =
    'inline-flex items-center gap-2.5 text-[13.5px] font-medium text-white/90 px-4 py-2.5 rounded-full border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/25 no-underline transition-colors'
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        <span className="text-white/70">{icon}</span>
        <span>{label}</span>
      </a>
    )
  }
  return (
    <a href={href} className={className}>
      <span className="text-white/70">{icon}</span>
      <span>{label}</span>
    </a>
  )
}
