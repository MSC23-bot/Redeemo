import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'For Businesses',
  description: 'List your business on Redeemo. No commission, no performance fees, full digital verification.',
}

const COMMERCIAL_FACTS = [
  {
    title: 'No double margin hit',
    body: 'Tastecard merchants pay a performance fee on every visit on top of the discount they absorb. Redeemo takes nothing. Your only cost is the offer you designed.',
  },
  {
    title: 'One redemption per cycle converts regulars, not subsidises them',
    body: 'A Tastecard regular who visits twice a week gets 50% off every visit, forever. A Redeemo member who visits four times a month gets the offer once. The other three visits are at full price. Redeemo acquires customers for you.',
  },
  {
    title: 'Digital verification and full reconciliation data',
    body: 'Tastecard has no audit trail. Redeemo generates a unique code per redemption, validates it at point of use, and logs everything. You can see every Redeemo redemption, when it happened, and through which offer.',
  },
]

const HOW_IT_WORKS_STEPS = [
  { n: '01', title: 'Apply online', body: 'Complete your business profile and submit documents. Takes under 10 minutes.' },
  { n: '02', title: 'Submit your two standard vouchers', body: 'Every merchant on Redeemo offers two standard vouchers (typically BOGO). You control the terms.' },
  { n: '03', title: 'Get approved', body: 'A Redeemo team member reviews your profile and approves your listing. Usually within 48 hours.' },
  { n: '04', title: 'Start receiving members', body: 'Your listing goes live. Redeemo subscribers near you can discover, save, and visit your venue.' },
]

const WHAT_YOU_GET = [
  { category: 'Merchant portal (web)', items: ['Voucher creation and management', 'Business profile and branch management', 'Redemption history and analytics', 'Campaign management'] },
  { category: 'Merchant app (mobile)', items: ['QR code scanning for in-store validation', 'Manual code entry', 'Real-time redemption tracking', 'Branch-level reporting'] },
]

const COMPARISON = [
  { dimension: 'Commission per visit', redeemo: 'None. Ever.', tastecard: 'Performance fee + discount absorbed' },
  { dimension: 'Offer structure', redeemo: 'You design your own', tastecard: 'Imposed: 50% off or BOGO only' },
  { dimension: 'Redemption limit per member', redeemo: 'One per cycle. Converts new customers.', tastecard: 'Unlimited. Permanently subsidises regulars.' },
  { dimension: 'Verification method', redeemo: 'QR code or unique digital code', tastecard: 'Card shown to staff, no audit trail' },
  { dimension: 'Reconciliation data', redeemo: 'Full per-redemption history', tastecard: 'None' },
  { dimension: 'Fraud protection', redeemo: 'Code tied to account, system-enforced', tastecard: 'None. Card sharing undetectable.' },
  { dimension: 'Merchant quality control', redeemo: 'Admin approval required', tastecard: 'Open listing. Known accuracy issues.' },
]

export default function ForBusinessesPage() {
  return (
    <>
      {/* Hero — navy, the one exception to the warm-light rule */}
      <section className="bg-[#010C35] py-20 px-6">
        <div className="max-w-[680px] mx-auto">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/40 mb-5">
            For businesses
          </p>
          <h1
            className="font-display text-white leading-[1.08] mb-6"
            style={{ fontSize: 'clamp(32px, 4.5vw, 58px)', letterSpacing: '-0.5px' }}
          >
            No commission. No performance fees. No margin cuts.
          </h1>
          <p className="text-[15px] text-white/60 leading-[1.65] max-w-[520px] mb-10">
            Redeemo connects your venue with local subscribers who pay a membership to find places like yours. You sign a 12-month contract and offer two standard vouchers. That is the entire commercial arrangement.
          </p>
          <div className="flex gap-4 flex-wrap">
            <Link
              href="/contact"
              className="inline-block text-white font-semibold text-[14px] px-7 py-3.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
              style={{ background: 'var(--brand-gradient)' }}
            >
              Get listed free
            </Link>
            <Link
              href="/how-it-works"
              className="inline-block text-white/70 font-medium text-[14px] px-7 py-3.5 rounded-lg border border-white/20 no-underline hover:text-white hover:border-white/40 transition-colors"
            >
              How it works for members
            </Link>
          </div>
        </div>
      </section>

      {/* Three commercial facts */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#9CA3AF] mb-10">
            Three facts to know before deciding
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {COMMERCIAL_FACTS.map((fact, i) => (
              <div key={fact.title} className="border-l-[3px] border-[#010C35] pl-6">
                <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#9CA3AF] mb-3" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <h3 className="font-body text-[16px] font-bold text-[#010C35] mb-3 leading-snug">
                  {fact.title}
                </h3>
                <p className="text-[14px] text-[#4B5563] leading-[1.65]">{fact.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works for merchants */}
      <section className="bg-[#FEF6F5] py-16 px-6">
        <div className="max-w-[640px] mx-auto">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-10"
            style={{ fontSize: 'clamp(22px, 3vw, 36px)' }}
          >
            How to get listed
          </h2>
          <div className="flex flex-col gap-8">
            {HOW_IT_WORKS_STEPS.map(step => (
              <div key={step.n} className="flex gap-5 items-start">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0"
                  style={{ background: 'var(--brand-gradient)' }}
                  aria-hidden="true"
                >
                  {step.n}
                </div>
                <div className="pt-2">
                  <h3 className="font-body text-[15px] font-bold text-[#010C35] mb-1">{step.title}</h3>
                  <p className="text-[14px] text-[#4B5563] leading-[1.65]">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="bg-white py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-10"
            style={{ fontSize: 'clamp(22px, 3vw, 36px)' }}
          >
            What merchants get
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {WHAT_YOU_GET.map(section => (
              <div key={section.category} className="bg-[#F8F9FA] rounded-xl p-8">
                <h3 className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#9CA3AF] mb-5">
                  {section.category}
                </h3>
                <ul className="flex flex-col gap-3">
                  {section.items.map(item => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="text-[#E20C04] font-bold text-[13px] flex-shrink-0 mt-0.5" aria-hidden="true">✓</span>
                      <span className="text-[14px] text-[#4B5563]">
                        <span className="sr-only">Included: </span>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="bg-[#F8F9FA] py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <h2
            className="font-display text-[#010C35] leading-[1.1] mb-8"
            style={{ fontSize: 'clamp(22px, 3vw, 36px)' }}
          >
            Redeemo vs Tastecard
          </h2>
          <div className="overflow-x-auto rounded-xl border border-[#EDE8E8] bg-white">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#EDE8E8]">
                  <th scope="col" className="px-6 py-4 text-[11px] font-bold tracking-[0.12em] uppercase text-[#9CA3AF] w-[35%]">Dimension</th>
                  <th scope="col" className="px-6 py-4 text-[11px] font-bold tracking-[0.12em] uppercase text-[#E20C04]">Redeemo</th>
                  <th scope="col" className="px-6 py-4 text-[11px] font-bold tracking-[0.12em] uppercase text-[#9CA3AF]">Tastecard</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDE8E8]">
                {COMPARISON.map(row => (
                  <tr key={row.dimension}>
                    <td className="px-6 py-4 text-[13px] font-medium text-[#010C35]">{row.dimension}</td>
                    <td className="px-6 py-4 text-[13px] text-[#4B5563]">{row.redeemo}</td>
                    <td className="px-6 py-4 text-[13px] text-[#9CA3AF]">{row.tastecard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Social proof placeholder */}
      <section className="bg-[#FEF6F5] py-16 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-[13px] text-[#9CA3AF]">Merchant testimonials coming soon.</p>
        </div>
      </section>

      {/* Apply CTA */}
      <section
        className="py-20 px-6 text-center"
        style={{ background: 'var(--brand-gradient)' }}
      >
        <div className="max-w-[520px] mx-auto">
          <h2 className="font-display text-white text-[32px] leading-[1.1] mb-4">
            Apply for free. Takes under 10 minutes.
          </h2>
          <p className="text-[14px] text-white/70 mb-8">
            No fees to list. No commission on redemptions. Sign a 12-month commitment to your members and start growing.
          </p>
          <Link
            href="/contact"
            className="inline-block bg-white text-[#E20C04] font-bold text-[15px] px-8 py-3.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
          >
            Get listed free
          </Link>
        </div>
      </section>
    </>
  )
}
