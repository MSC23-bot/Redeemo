type LocationContext = {
  city: string | null
  source: 'coordinates' | 'profile' | 'none'
}

export function DiscoverHero({ locationContext }: { locationContext: LocationContext }) {
  const locationLabel =
    locationContext.source === 'coordinates' ? 'Near your location' :
    locationContext.city ? `Near ${locationContext.city}` :
    null

  return (
    <div className="bg-[#FAF8F5] px-6 pt-14 pb-10">
      <div className="max-w-screen-xl mx-auto">
        {locationLabel && (
          <div className="inline-flex items-center gap-2 bg-white border border-navy/[0.08] rounded-full px-4 py-1.5 mb-5 shadow-sm">
            <span className="text-[10px]" aria-hidden>📍</span>
            <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-navy/55">
              {locationLabel}
            </span>
          </div>
        )}

        <h1 className="font-display text-[clamp(32px,4.5vw,56px)] text-navy leading-[1.08] max-w-2xl">
          {locationContext.source === 'none'
            ? 'Discover local businesses'
            : 'What\'s near you'}
        </h1>

        <p className="mt-3 text-[16px] leading-relaxed text-navy/55 max-w-lg">
          Exclusive vouchers from local businesses — redeemable in-store with your Redeemo subscription.
        </p>
      </div>
    </div>
  )
}
