import Link from 'next/link'

export function FinalCtaSection() {
  return (
    <section
      className="py-24 px-6 text-center"
      style={{ background: 'var(--brand-gradient)' }}
    >
      <div className="max-w-[640px] mx-auto">
        <h2
          className="font-display text-white leading-[1.1] mb-5"
          style={{ fontSize: 'clamp(32px, 4.5vw, 56px)' }}
        >
          Less than one coffee a week.
        </h2>
        <p className="text-[15px] text-white/75 mb-10 leading-[1.65]">
          Start saving at restaurants, cafes, gyms, and more near you. One subscription, unlimited local discovery.
        </p>
        <Link
          href="/subscribe"
          className="inline-block bg-white text-[#E20C04] font-bold text-[15px] px-8 py-3.5 rounded-lg no-underline hover:opacity-90 transition-opacity"
        >
          Get started, from £6.99/mo
        </Link>
        <p className="mt-4 text-[12px] text-white/50">No commitment. Cancel any time.</p>
      </div>
    </section>
  )
}
