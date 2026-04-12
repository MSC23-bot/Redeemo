import Link from 'next/link'

export function FinalCtaSection() {
  return (
    <section
      className="py-28 px-6 text-center"
      style={{ background: 'linear-gradient(160deg, #010C35 0%, #00041E 100%)' }}
    >
      <div className="max-w-[720px] mx-auto">
        <h2 className="font-display text-white leading-[1.1] mb-6" style={{ fontSize: 'clamp(36px, 5vw, 64px)' }}>
          Start saving at your favourite{' '}
          <span className="gradient-brand-text">local spots</span>
        </h2>
        <p className="text-lg text-white/55 mb-12 leading-[1.65]">
          Join thousands of subscribers saving money every month across the UK.
        </p>
        <Link
          href="/subscribe"
          className="inline-block text-white font-bold text-[17px] px-10 py-4 rounded-xl no-underline hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(135deg, #E2000C 0%, #E84A00 100%)' }}
        >
          Get started — from £6.99/mo
        </Link>
        <p className="mt-5 text-xs text-white/30">No commitment. Cancel any time.</p>
      </div>
    </section>
  )
}
