import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Insider',
  description: 'Local guides, member picks, and staff recommendations from the Redeemo community.',
}

const CATEGORIES = ['All', 'Food & Drink', 'Health & Fitness', 'Beauty', 'Wellness', 'Local Guides', "Members' Picks"]

export default function InsiderPage() {
  return (
    <>
      {/* Header */}
      <section className="bg-white py-16 px-6 border-b border-[#EDE8E8]">
        <div className="max-w-7xl mx-auto">
          <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#E20C04] mb-4">
            Insider
          </p>
          <h1
            className="font-display text-[#010C35] leading-[1.1] mb-4"
            style={{ fontSize: 'clamp(32px, 4vw, 52px)', letterSpacing: '-0.3px' }}
          >
            Guides, picks, and hidden gems.
          </h1>
          <p className="text-[15px] text-[#4B5563] max-w-[480px]">
            Written by Redeemo members and our local editors. Real places, real experiences.
          </p>
        </div>
      </section>

      {/* Category filter pills — non-functional placeholder until CMS is wired */}
      <section className="bg-white border-b border-[#EDE8E8] sticky top-[60px] z-40" aria-label="Category filters">
        <div className="max-w-7xl mx-auto px-6 py-3 flex gap-2 overflow-x-auto">
          {CATEGORIES.map((cat, i) => (
            <span
              key={cat}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[13px] font-medium ${
                i === 0
                  ? 'text-white'
                  : 'bg-white border border-[#EDE8E8] text-[#4B5563]'
              }`}
              style={i === 0 ? { background: 'var(--brand-gradient)' } : undefined}
            >
              {cat}
            </span>
          ))}
        </div>
      </section>

      {/* Empty state — placeholder until CMS is wired */}
      <section className="bg-[#F8F9FA] py-24 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center text-white text-[24px] font-display"
            style={{ background: 'var(--brand-gradient)' }}
            aria-hidden="true"
          >
            i
          </div>
          <h2 className="font-display text-[#010C35] text-[24px] mb-3">Content coming soon</h2>
          <p className="text-[14px] text-[#9CA3AF] max-w-[360px] mx-auto mb-8">
            The Insider is being curated. Check back soon for local guides, member picks, and staff recommendations.
          </p>
          <Link
            href="/discover"
            className="inline-block text-white font-semibold text-[14px] px-6 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
            style={{ background: 'var(--brand-gradient)' }}
          >
            Discover merchants instead
          </Link>
        </div>
      </section>
    </>
  )
}
