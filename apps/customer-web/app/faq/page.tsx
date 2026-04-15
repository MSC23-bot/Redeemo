'use client'

import { useState, useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

type FaqItem = { q: string; a: ReactNode }
type FaqSection = { id: string; title: string; items: FaqItem[] }

const ease = [0.22, 1, 0.36, 1] as [number, number, number, number]

const FAQ_SECTIONS: FaqSection[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    items: [
      {
        q: 'What is Redeemo?',
        a: 'Redeemo is a membership platform that gives you access to exclusive vouchers at independent local businesses. Browse for free. Subscribe from £6.99 a month to start redeeming vouchers at restaurants, gyms, cafés, salons, and more.',
      },
      {
        q: 'Do I need to download the app?',
        a: (
          <>
            You can browse merchants and vouchers on this website without downloading anything. Redeeming a voucher requires the Redeemo app. That is where you generate your unique redemption code at the venue. Full walkthrough on the{' '}
            <Link href="/how-it-works" className="text-[#E20C04] no-underline hover:underline font-medium">How it works</Link>{' '}
            page.
          </>
        ),
      },
      {
        q: 'Can I use Redeemo without creating an account?',
        a: 'You can browse merchants and vouchers on the website without an account. To save favourites, write reviews, subscribe, or redeem, you need a free account.',
      },
      {
        q: 'Where is Redeemo available?',
        a: 'Redeemo is UK-based and UK-focused. Merchant density varies by area. Enter your postcode or city on the discover page to see what is near you.',
      },
    ],
  },
  {
    id: 'membership-billing',
    title: 'Membership and billing',
    items: [
      {
        q: 'What does my subscription get me?',
        a: 'One active subscription gives you access to every voucher at every merchant on Redeemo. You can redeem one voucher per merchant per subscription cycle. There are no additional costs per redemption.',
      },
      {
        q: 'What is a subscription cycle?',
        a: 'Your cycle starts on the date you subscribe and renews on the same date each month (or each year for annual). It is not a calendar month. Voucher entitlements reset at the start of each new cycle.',
      },
      {
        q: 'Can I cancel anytime?',
        a: 'Yes. Cancel from your account settings at any time. You keep full access until the end of your current billing period. No questions, no hoops.',
      },
      {
        q: 'Is there a free trial?',
        a: 'We occasionally offer free trial periods via promo codes. These are not listed publicly but may be available through promotions and partnerships. The free plan lets you browse everything, so you can see what is available near you before subscribing.',
      },
      {
        q: 'What payment methods do you accept?',
        a: 'All major credit and debit cards, handled through Stripe. We do not currently support PayPal or bank transfer.',
      },
      {
        q: "What's the difference between monthly and annual?",
        a: 'Same features. Annual costs £69.99 for the year, equivalent to roughly £5.83 a month, about two months free compared to paying monthly. Annual subscribers also get priority customer support.',
      },
    ],
  },
  {
    id: 'redeeming',
    title: 'Redeeming vouchers',
    items: [
      {
        q: 'How do I redeem a voucher?',
        a: (
          <>
            Open the Redeemo app at the venue, find the voucher, and tap Redeem. Enter the branch PIN (a short code held by the merchant). The app generates a unique code. Show it to a member of staff. They scan or enter it. Done. Full details on the{' '}
            <Link href="/how-it-works" className="text-[#E20C04] no-underline hover:underline font-medium">How it works</Link>{' '}
            page.
          </>
        ),
      },
      {
        q: 'Can I redeem at the same merchant more than once a month?',
        a: 'You can redeem one voucher per merchant per subscription cycle. Additional visits are at full price. The voucher does not apply to every visit. It applies once per cycle.',
      },
      {
        q: 'What happens to my vouchers if I cancel?',
        a: 'You can continue to redeem until your billing period ends. After that, your account switches to the free plan and redemption is paused. Your history and favourites are saved. Resubscribe anytime to restore full access.',
      },
      {
        q: 'What if a merchant refuses my valid voucher?',
        a: 'Contact Redeemo support, not the merchant. Use the in-app support chat or email us. Merchants who join Redeemo sign an agreement committing to honour valid redemptions. We will investigate and resolve it.',
      },
      {
        q: 'Can I redeem on the website?',
        a: 'No. Redemption requires the Redeemo app. This is a security measure. The app verifies you are physically present at the venue via the branch PIN before generating a code.',
      },
      {
        q: 'Do vouchers expire?',
        a: 'Vouchers are available for as long as the merchant keeps them active. They do not expire on a fixed date unless the merchant specifies one. Your redemption entitlement resets each subscription cycle.',
      },
    ],
  },
  {
    id: 'the-app',
    title: 'The app',
    items: [
      {
        q: 'Which platforms do you support?',
        a: 'iOS and Android. The Redeemo app is free to download on the App Store and Google Play. Sign in with the same account you use on the website.',
      },
      {
        q: 'The app is not working. What do I do?',
        a: 'Force-close and reopen the app. If the issue persists, check for an app update in the App Store or Google Play. If the problem continues, contact support with a short description of what happened.',
      },
      {
        q: 'Do I need an internet connection to redeem?',
        a: 'Yes. Redemption generates a unique server-side code tied to your visit, which requires a live connection. Most venues have Wi-Fi you can use if mobile reception is weak.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Your account',
    items: [
      {
        q: 'Can I share my membership with someone else?',
        a: 'No. Subscriptions are personal and non-transferable. One account per person. Redemption codes are tied to your account and logged.',
      },
      {
        q: 'How do I change my password?',
        a: 'Go to Account, then Profile, and use the Change password option at the bottom of the form.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Go to Account, then Profile, scroll to the Danger zone at the bottom, and follow the deletion steps. Account deletion is permanent and cannot be undone.',
      },
      {
        q: 'What data does Redeemo store about me?',
        a: 'Your name, email, subscription status, and redemption history. Merchants see anonymised redemption counts only, not your personal data. See our Privacy Policy for full details.',
      },
    ],
  },
  {
    id: 'for-businesses',
    title: 'For businesses',
    items: [
      {
        q: 'How do I list my business on Redeemo?',
        a: (
          <>
            Visit our{' '}
            <Link href="/for-businesses" className="text-[#E20C04] no-underline hover:underline font-medium">For businesses</Link>{' '}
            page for an overview, or go directly to the Redeemo Merchant Portal to create an account. Listing is free. No commission per redemption.
          </>
        ),
      },
      {
        q: 'Do merchants pay a commission?',
        a: 'No. Redeemo charges no commission, no performance fees, and no listing fee. The only cost to a merchant is the value of the offer they design, and only when a member actually visits.',
      },
      {
        q: 'How do I suggest a merchant?',
        a: 'Use the Suggest a merchant option in the app or email us. We review every suggestion and reach out to suitable businesses directly.',
      },
    ],
  },
  {
    id: 'support',
    title: 'Contact and support',
    items: [
      {
        q: 'How do I contact support?',
        a: (
          <>
            The fastest way is in-app chat. You can also email us at{' '}
            <a href="mailto:info@redeemo.co.uk" className="text-[#E20C04] no-underline hover:underline font-medium">info@redeemo.co.uk</a>.
            We aim to respond within one working day.
          </>
        ),
      },
      {
        q: 'I am not receiving verification emails.',
        a: 'Check your spam and promotions folders. If the email has not arrived within a few minutes, contact support with your registered email address and we will resend it.',
      },
      {
        q: 'Something is wrong with a voucher or merchant listing.',
        a: 'Email us with the merchant name, the voucher, and a short description of the issue. We investigate directly with the merchant.',
      },
    ],
  },
]

function AccordionItem({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-[#EDE8E8] last:border-none">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full justify-between items-start gap-6 px-6 md:px-7 py-5 text-left hover:bg-[#FAFAFA] transition-colors"
      >
        <span className="text-[15px] md:text-[15.5px] font-semibold text-[#010C35] leading-snug">
          {item.q}
        </span>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2, ease }}
          className="text-[#9CA3AF] flex-shrink-0 mt-0.5 text-[22px] leading-none"
          aria-hidden="true"
        >
          +
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease }}
            className="overflow-hidden"
          >
            <div className="px-6 md:px-7 pb-6 pt-1">
              <div className="text-[14.5px] text-[#4B5563] leading-[1.78] max-w-[62ch]">
                {item.a}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function FaqPage() {
  const [query, setQuery] = useState('')
  const [activeSection, setActiveSection] = useState(FAQ_SECTIONS[0].id)

  const filtered = useMemo(() => {
    if (!query.trim()) return FAQ_SECTIONS
    const q = query.toLowerCase()
    return FAQ_SECTIONS.map(section => ({
      ...section,
      items: section.items.filter(item => {
        const aText = typeof item.a === 'string' ? item.a : ''
        return item.q.toLowerCase().includes(q) || aText.toLowerCase().includes(q)
      }),
    })).filter(section => section.items.length > 0)
  }, [query])

  return (
    <>
      {/* ── Search hero — navy with glow ── */}
      <section className="relative overflow-hidden py-20 md:py-24 px-6 bg-[#010C35]">
        {/* Glow */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(520px circle at 90% -10%, rgba(226,12,4,0.26), transparent 55%), radial-gradient(380px circle at 6% 110%, rgba(200,50,0,0.18), transparent 55%)',
          }}
        />

        <div className="relative max-w-[640px] mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease }}
            className="flex items-center justify-center gap-2 mb-6"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#E20C04] flex-shrink-0" aria-hidden="true" />
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/32">
              Help centre
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease }}
            className="font-display text-white leading-[1.08] mb-8"
            style={{ fontSize: 'clamp(32px, 4.5vw, 52px)', letterSpacing: '-0.5px' }}
          >
            Frequently asked{' '}
            <span
              style={{
                background: 'var(--brand-gradient)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              questions.
            </span>
          </motion.h1>

          {/* Search */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18, ease }}
            className="relative"
          >
            <span
              aria-hidden="true"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="search"
              placeholder="Search the FAQ..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search FAQ"
              className="w-full h-[52px] pl-11 pr-5 rounded-xl text-[15px] text-[#010C35] placeholder:text-[#9CA3AF] outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.96)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
              }}
              onFocus={e => { e.currentTarget.style.boxShadow = '0 4px 24px rgba(226,12,4,0.22), 0 0 0 2px rgba(226,12,4,0.12)' }}
              onBlur={e => { e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.18)' }}
            />
          </motion.div>
        </div>
      </section>

      {/* ── Sidebar + accordion ── */}
      <div className="max-w-7xl mx-auto px-6 py-16 lg:flex lg:gap-14">

        {/* Sidebar nav — desktop */}
        <nav aria-label="FAQ sections" className="hidden lg:flex flex-col gap-1 w-56 flex-shrink-0 sticky top-28 self-start">
          <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#9CA3AF] px-4 mb-3">
            Topics
          </p>
          {FAQ_SECTIONS.map(section => (
            <button
              key={section.id}
              onClick={() => {
                setActiveSection(section.id)
                document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className={`text-left px-4 py-2.5 rounded-lg text-[13.5px] transition-colors ${
                activeSection === section.id
                  ? 'bg-[#FEF6F5] text-[#010C35] font-semibold border-l-2 border-[#E20C04] rounded-l-none'
                  : 'text-[#4B5563] hover:text-[#010C35] hover:bg-[#F8F9FA]'
              }`}
            >
              {section.title}
            </button>
          ))}
        </nav>

        {/* Accordion content */}
        <main className="flex-1 min-w-0">
          {filtered.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-16 text-center"
            >
              <p className="text-[15px] text-[#9CA3AF] mb-4">
                No results for &ldquo;{query}&rdquo;
              </p>
              <button
                onClick={() => setQuery('')}
                className="text-[14px] text-[#E20C04] font-medium hover:underline"
              >
                Clear search
              </button>
            </motion.div>
          )}

          {filtered.map((section, si) => (
            <motion.div
              key={section.id}
              id={section.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: si * 0.06, ease }}
              className="mb-12 scroll-mt-32"
            >
              <h2
                className="font-display text-[#010C35] mb-5 leading-[1.15]"
                style={{ fontSize: 'clamp(20px, 2.6vw, 28px)', letterSpacing: '-0.2px' }}
              >
                {section.title}
              </h2>
              <div className="flex flex-col border border-[#EDE8E8] rounded-2xl overflow-hidden bg-white">
                {section.items.map(item => (
                  <AccordionItem key={item.q} item={item} />
                ))}
              </div>
            </motion.div>
          ))}

          {/* Support CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease }}
            className="mt-4 rounded-2xl overflow-hidden relative"
            style={{
              background: '#010C35',
              boxShadow: '0 20px 60px rgba(1,12,53,0.14)',
            }}
          >
            {/* Glow inside CTA */}
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(480px circle at 110% -20%, rgba(226,12,4,0.22), transparent 55%)',
              }}
            />
            <div className="relative p-8 md:p-10 text-center">
              <h3
                className="font-display text-white leading-[1.15] mb-3"
                style={{ fontSize: 'clamp(20px, 2.6vw, 28px)', letterSpacing: '-0.2px' }}
              >
                Still have a question?
              </h3>
              <p className="text-[14.5px] text-white/45 leading-[1.65] mb-7 max-w-[400px] mx-auto">
                Our support team is available via in-app chat and email. We aim to respond within one working day.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <a
                  href="mailto:info@redeemo.co.uk"
                  className="inline-block text-white font-semibold text-[14px] px-7 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--brand-gradient)' }}
                >
                  Email support
                </a>
                <Link
                  href="/how-it-works"
                  className="inline-block text-white/80 font-semibold text-[14px] px-7 py-3 rounded-lg no-underline hover:text-white transition-colors"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.10)',
                  }}
                >
                  How it works
                </Link>
              </div>
            </div>
          </motion.div>
        </main>
      </div>
    </>
  )
}
