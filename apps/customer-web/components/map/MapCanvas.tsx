'use client'

/**
 * Styled placeholder for the live Mapbox view.
 *
 * The brainstorm spec shows Mapbox GL JS with clustered pins keyed by merchant
 * lat/lng — but the customer-facing search / home feed APIs don't return branch
 * coordinates in the merchant tile payload yet. Faking pins here would mislead
 * the user about which merchants are nearby, so we render an honest branded
 * placeholder while the sidebar stays fully functional for browsing.
 *
 * When branch coordinates are wired into the tile payload and Mapbox is
 * installed, swap this component for a client-only Mapbox GL JS mount.
 */
export function MapCanvas() {
  return (
    <div
      className="relative flex-1 overflow-hidden bg-[#010C35]"
      role="img"
      aria-label="Map view — coming soon"
    >
      {/* Topographic line pattern as atmospheric backdrop */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 w-full h-full opacity-[0.12]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="topo"
            x="0"
            y="0"
            width="140"
            height="140"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="70" cy="70" r="18" fill="none" stroke="#FFFFFF" strokeWidth="0.7" />
            <circle cx="70" cy="70" r="36" fill="none" stroke="#FFFFFF" strokeWidth="0.7" />
            <circle cx="70" cy="70" r="54" fill="none" stroke="#FFFFFF" strokeWidth="0.7" />
            <circle cx="70" cy="70" r="72" fill="none" stroke="#FFFFFF" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#topo)" />
      </svg>

      {/* Coral atmosphere — same signature used on CampaignBanner */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(700px circle at 80% 15%, rgba(226,12,4,0.28), transparent 60%), radial-gradient(500px circle at 20% 85%, rgba(232,74,0,0.18), transparent 55%)',
        }}
      />

      {/* Decorative pins — purely illustrative, no merchant data */}
      <DecorativePin className="absolute top-[22%] left-[28%]" variant="featured" />
      <DecorativePin className="absolute top-[38%] left-[62%]" variant="default" />
      <DecorativePin className="absolute top-[56%] left-[40%]" variant="trending" />
      <DecorativePin className="absolute top-[70%] left-[70%]" variant="default" />
      <DecorativePin className="absolute top-[28%] left-[78%]" variant="default" />

      {/* Centre message */}
      <div className="relative h-full flex items-center justify-center p-8">
        <div className="max-w-[420px] text-center">
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] uppercase text-white/80 px-3 py-1 rounded-full border border-white/20 backdrop-blur-sm mb-5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#E20C04]" aria-hidden="true" />
            In development
          </span>
          <h2
            className="font-display text-white leading-[1.15] mb-3"
            style={{ fontSize: 'clamp(24px, 3vw, 32px)', letterSpacing: '-0.3px' }}
          >
            Live map view is on the way.
          </h2>
          <p className="text-[14.5px] text-white/70 leading-[1.65] max-w-[360px] mx-auto">
            We&rsquo;re wiring up interactive pins, clustering, and venue previews.
            Use the list on the right to browse nearby merchants in the meantime.
          </p>
        </div>
      </div>
    </div>
  )
}

function DecorativePin({
  className,
  variant,
}: {
  className?: string
  variant: 'featured' | 'trending' | 'default'
}) {
  const colour =
    variant === 'featured'
      ? '#D97706'
      : variant === 'trending'
      ? '#E20C04'
      : '#FFFFFF'
  const size = variant === 'default' ? 10 : 14
  const ringOpacity = variant === 'default' ? 0.35 : 0.5

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-0 rounded-full animate-ping"
        style={{ background: colour, opacity: ringOpacity }}
      />
      <div
        className="relative rounded-full border-2 border-white"
        style={{ width: size, height: size, background: colour }}
      />
    </div>
  )
}
