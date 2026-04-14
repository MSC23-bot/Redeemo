'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

const FAQ_SECTIONS = [
  {
    id: 'getting-started',
    title: 'Getting started',
    items: [
      { q: 'Is Redeemo free to join?', a: 'Yes. Creating an account and browsing merchants is completely free. To redeem vouchers in-store, you need a paid subscription (from £6.99/month).' },
      { q: 'Do I need to download an app?', a: 'You can browse merchants and vouchers on this website for free. Redemption requires the Redeemo mobile app, which is available on iOS and Android.' },
      { q: 'Where is Redeemo available?', a: 'Redeemo is available across the UK. Merchant density varies by location. Enter your postcode to see what is near you.' },
      { q: 'How do I create an account?', a: 'Click "Join free" and complete the registration form. You will receive a verification code to confirm your email address.' },
    ],
  },
  {
    id: 'subscription',
    title: 'Subscription and billing',
    items: [
      { q: 'What plans are available?', a: 'Free (browse only), Monthly (£6.99/month), and Annual (£69.99/year, approximately 2 months free).' },
      { q: 'Can I cancel at any time?', a: 'Yes. Cancel from your account page at any time. You keep access until the end of your current billing period. No partial refunds.' },
      { q: 'Is there a free trial?', a: 'No open free trials. Paid trials are occasionally available via promo codes issued through specific promotions.' },
      { q: 'Can I share my account?', a: 'No. Subscriptions are personal and non-transferable. One account per person.' },
      { q: 'What payment methods do you accept?', a: 'All major credit and debit cards via Stripe. No PayPal or bank transfer at this time.' },
    ],
  },
  {
    id: 'vouchers',
    title: 'Vouchers and redemption',
    items: [
      { q: 'How many times can I use a voucher per month?', a: 'Once per merchant per subscription cycle. Your cycle starts on your subscription date, not the calendar month. Unused vouchers do not carry over.' },
      { q: 'What is a branch PIN?', a: 'Each merchant branch has a unique PIN displayed in-venue. You enter it in the app to confirm you are physically present before a redemption code is generated.' },
      { q: 'Can I redeem vouchers on the website?', a: 'No. Redemption is mobile-app only. The website is for browsing, account management, and subscription purchase.' },
      { q: 'What if a merchant refuses my valid voucher?', a: 'Contact Redeemo support, not the merchant. All merchants sign a contract committing to honour valid redemptions. We will resolve it.' },
      { q: 'Do vouchers expire?', a: 'Redemption codes generated in-app are valid until the end of your current subscription cycle. The voucher itself is available as long as the merchant keeps it active.' },
    ],
  },
  {
    id: 'merchants',
    title: 'Merchants',
    items: [
      { q: 'How do merchants join?', a: 'Merchants apply via the For Businesses page. Listing is free. A 12-month contract is required, and merchants must offer two standard vouchers to be approved.' },
      { q: 'Do merchants pay a commission?', a: 'No. Redeemo charges no commission, no performance fees, and no listing fee. The only cost to merchants is the discount offered in their vouchers.' },
      { q: 'How do I suggest a merchant?', a: 'Use the "Suggest a merchant" option in the app or contact us via the website. We review all suggestions and reach out to suitable businesses.' },
    ],
  },
  {
    id: 'account',
    title: 'Account',
    items: [
      { q: 'How do I change my password?', a: 'Go to Account, then Profile, and use the "Change password" option at the bottom of the form.' },
      { q: 'How do I delete my account?', a: 'Go to Account, then Profile, scroll to the Danger zone at the bottom of the page, and follow the deletion steps. Account deletion is permanent and cannot be undone.' },
      { q: 'What data does Redeemo store about me?', a: 'Your name, email, subscription status, and redemption history. We do not share personal data with merchants. See our Privacy Policy for full details.' },
    ],
  },
  {
    id: 'technical',
    title: 'Technical',
    items: [
      { q: 'The app is not working. What do I do?', a: 'Force-close and reopen the app. If the issue persists, check for an app update in the App Store or Google Play. Contact support if the problem continues.' },
      { q: 'I am not receiving verification emails.', a: 'Check your spam folder. If the email is not there within a few minutes, contact support with your registered email address.' },
    ],
  },
]

export default function FaqPage() {
  const [query, setQuery] = useState('')
  const [activeSection, setActiveSection] = useState(FAQ_SECTIONS[0].id)

  const filtered = useMemo(() => {
    if (!query.trim()) return FAQ_SECTIONS
    const q = query.toLowerCase()
    return FAQ_SECTIONS.map(section => ({
      ...section,
      items: section.items.filter(
        item => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
      ),
    })).filter(section => section.items.length > 0)
  }, [query])

  return (
    <>
      {/* Search hero */}
      <section className="bg-white py-14 px-6 border-b border-[#EDE8E8]">
        <div className="max-w-[560px] mx-auto text-center">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#E20C04] mb-4">Help centre</p>
          <h1
            className="font-display text-[#010C35] leading-[1.1] mb-6"
            style={{ fontSize: 'clamp(28px, 4vw, 48px)', letterSpacing: '-0.3px' }}
          >
            How can we help?
          </h1>
          <input
            type="search"
            placeholder="Search questions..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search FAQ"
            className="w-full h-12 px-5 rounded-lg border border-[#EDE8E8] text-[15px] text-[#010C35] placeholder:text-[#9CA3AF] outline-none focus:border-[#E20C04] transition-colors"
          />
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-6 py-12 lg:flex lg:gap-12">

        {/* Sidebar nav — desktop only */}
        <nav aria-label="FAQ sections" className="hidden lg:flex flex-col gap-1 w-52 flex-shrink-0 sticky top-24 self-start">
          {FAQ_SECTIONS.map(section => (
            <button
              key={section.id}
              onClick={() => {
                setActiveSection(section.id)
                document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className={`text-left px-4 py-2.5 rounded-lg text-[14px] transition-colors ${
                activeSection === section.id
                  ? 'bg-white text-[#010C35] font-semibold shadow-sm border border-[#EDE8E8]'
                  : 'text-[#4B5563] hover:text-[#010C35] hover:bg-[#F8F9FA]'
              }`}
            >
              {section.title}
            </button>
          ))}
        </nav>

        {/* Accordion content */}
        <main className="flex-1">
          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-[15px] text-[#9CA3AF] mb-4">No results for &ldquo;{query}&rdquo;</p>
              <button onClick={() => setQuery('')} className="text-[14px] text-[#E20C04] font-medium hover:underline">
                Clear search
              </button>
            </div>
          )}

          {filtered.map(section => (
            <div key={section.id} id={section.id} className="mb-12 scroll-mt-24">
              <h2
                className="font-display text-[#010C35] mb-6"
                style={{ fontSize: 'clamp(18px, 2.5vw, 26px)' }}
              >
                {section.title}
              </h2>
              <div className="flex flex-col divide-y divide-[#EDE8E8] border border-[#EDE8E8] rounded-xl overflow-hidden">
                {section.items.map(item => (
                  <details key={item.q} className="group bg-white">
                    <summary className="flex justify-between items-start gap-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden px-6 py-5">
                      <span className="text-[15px] font-medium text-[#010C35] leading-snug">{item.q}</span>
                      <span className="text-[#9CA3AF] flex-shrink-0 mt-0.5 transition-transform group-open:rotate-45 text-[20px] leading-none" aria-hidden="true">+</span>
                    </summary>
                    <div className="px-6 pb-5">
                      <p className="text-[14px] text-[#4B5563] leading-[1.65]">{item.a}</p>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))}

          {/* Support CTA */}
          <div className="mt-4 bg-[#F8F9FA] rounded-xl p-8 text-center">
              <h3 className="font-display text-[#010C35] text-[20px] mb-3">Still have questions?</h3>
              <p className="text-[14px] text-[#4B5563] mb-5">Our support team is here to help.</p>
              <Link
                href="/contact"
                className="inline-block text-white font-semibold text-[14px] px-6 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
                style={{ background: 'var(--brand-gradient)' }}
              >
                Contact support
              </Link>
          </div>
        </main>
      </div>
    </>
  )
}
