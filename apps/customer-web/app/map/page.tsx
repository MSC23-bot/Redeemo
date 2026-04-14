import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Map',
  description: 'Find Redeemo merchants on a map near you.',
}

export default function MapPage() {
  return (
    <div className="relative h-[calc(100dvh-60px)] flex flex-col">

      {/* Filter bar — pinned top */}
      <div className="bg-white border-b border-[#EDE8E8] px-6 py-3 flex items-center gap-3 z-10">
        <div className="flex gap-2 overflow-x-auto flex-1">
          {['All', 'Food & Drink', 'Gyms', 'Salons', 'Wellness', 'Retail'].map((cat, i) => (
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
        <div
          className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#EDE8E8] text-[13px] font-medium text-[#4B5563]"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 4h10M4 7h6M5.5 10h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          Filters
        </div>
      </div>

      {/* Map placeholder */}
      <div className="flex-1 bg-[#F8F9FA] flex items-center justify-center">
        <div className="text-center px-6">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center text-white"
            style={{ background: 'var(--brand-gradient)' }}
            aria-hidden="true"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              <circle cx="12" cy="9" r="2.5"/>
            </svg>
          </div>
          <h2 className="font-display text-[#010C35] text-[24px] mb-3">Map coming soon</h2>
          <p className="text-[14px] text-[#9CA3AF] max-w-[320px] mx-auto mb-8">
            The map view is being integrated. In the meantime, use the Discover page to find merchants near you.
          </p>
          <Link
            href="/discover"
            className="inline-block text-white font-semibold text-[14px] px-6 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
            style={{ background: 'var(--brand-gradient)' }}
          >
            Browse merchants instead
          </Link>
        </div>
      </div>
    </div>
  )
}
