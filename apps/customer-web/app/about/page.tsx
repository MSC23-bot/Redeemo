import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About Redeemo',
  description: 'Redeemo is a UK-based local voucher membership connecting consumers with local businesses.',
}

const STATS = [
  { value: 'UK', label: 'Based and focused' },
  { value: '£0', label: 'Commission to merchants' },
  { value: 'Free', label: 'To list as a merchant' },
  { value: 'One price', label: 'One subscription' },
]

const VALUES = [
  {
    title: 'For members',
    body: 'A subscription that earns its keep. Every month, you unlock vouchers at local merchants you actually want to visit. The saving is the receipt. The experience comes first.',
  },
  {
    title: 'For merchants',
    body: 'No commission. No performance fees. Merchants set their own offers, receive digital verification on every redemption, and own their customer relationships. Redeemo is a platform, not a partner extracting margin.',
  },
  {
    title: 'For local communities',
    body: 'Money spent locally stays local. Redeemo exists to make it easier for people to discover and return to independent businesses in their neighbourhood, not to drive footfall to chains.',
  },
  {
    title: 'Our commitment',
    body: 'No dark patterns. No auto-renewing without notice. No data sold. Redeemo operates on trust: with members, with merchants, and with the communities it serves.',
  },
]

export default function AboutPage() {
  return (
    <>
      {/* Stat bar */}
      <section className="bg-[#010C35] py-10 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-0 md:divide-x md:divide-white/[0.08]">
            {STATS.map(stat => (
              <div key={stat.value} className="flex flex-col items-center text-center md:px-8">
                <span className="font-display text-white text-[28px] leading-none mb-1">{stat.value}</span>
                <span className="text-[11px] text-white/40 font-medium tracking-wide">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-[640px] mx-auto">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#E20C04] mb-6">
            Our story
          </p>
          <h1
            className="font-display text-[#010C35] leading-[1.1] mb-8"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            Built for the places that make a neighbourhood worth living in.
          </h1>
          <div className="flex flex-col gap-5 text-[15px] text-[#4B5563] leading-[1.75]">
            <p>
              Redeemo started from a simple frustration: the best local restaurants, gyms, and shops rarely have any way to reward loyal customers, while big chains run endless promotions. The tools that exist for independent businesses, like Tastecard and Groupon, take a cut of every transaction and offer merchants no control over their own offers.
            </p>
            <p>
              We built Redeemo differently. Merchants set their own vouchers. Redeemo takes no commission, ever. Members pay a modest monthly subscription to unlock those offers. One redemption per merchant per cycle means the economics work for everyone: the member saves money on a real visit, the merchant acquires a new customer at full price the next time.
            </p>
            <p>
              We are UK-based and UK-focused. Every design decision, every policy, every feature exists to serve local businesses and the people who live near them.
            </p>
          </div>
        </div>
      </section>

      {/* Four value cards */}
      <section className="bg-[#FEF6F5] py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-10"
            style={{ fontSize: 'clamp(22px, 3vw, 36px)' }}
          >
            What we stand for
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {VALUES.map(v => (
              <div key={v.title} className="bg-white rounded-xl border border-[#EDE8E8] p-8">
                <h3 className="font-body text-[16px] font-bold text-[#010C35] mb-3">{v.title}</h3>
                <p className="text-[14px] text-[#4B5563] leading-[1.75]">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Press placeholder */}
      <section className="bg-white py-16 px-6 border-t border-[#EDE8E8]">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#9CA3AF] mb-6">
            Press
          </p>
          <p className="text-[14px] text-[#9CA3AF]">
            Media coverage and press assets coming soon.{' '}
            <Link href="/contact" className="text-[#E20C04] no-underline hover:underline">
              Contact us
            </Link>{' '}
            for press enquiries.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section className="bg-[#F8F9FA] py-16 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-4"
            style={{ fontSize: 'clamp(22px, 3vw, 36px)' }}
          >
            Get in touch
          </h2>
          <p className="text-[14px] text-[#4B5563] mb-6">
            Questions, feedback, or just want to say hello.
          </p>
          <Link
            href="/contact"
            className="inline-block text-white font-semibold text-[14px] px-7 py-3.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
            style={{ background: 'var(--brand-gradient)' }}
          >
            Contact us
          </Link>
        </div>
      </section>
    </>
  )
}
