'use client'
import Image from 'next/image'
import Link from 'next/link'

type Campaign = {
  id: string
  name: string
  description: string | null
  bannerImageUrl: string | null
}

export function CampaignBanner({ campaigns }: { campaigns: Campaign[] }) {
  if (campaigns.length === 0) return null

  // Single campaign: full-width hero treatment
  if (campaigns.length === 1) {
    const campaign = campaigns[0]
    return (
      <div className="px-6">
        <div className="max-w-7xl mx-auto">
          <CampaignCard campaign={campaign} variant="hero" />
        </div>
      </div>
    )
  }

  // Multiple: horizontal scroll strip
  return (
    <div className="max-w-7xl mx-auto">
      <div
        className="overflow-x-auto scrollbar-none px-6"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        <div className="flex gap-4 pb-1" style={{ width: 'max-content' }}>
          {campaigns.map(campaign => (
            <div key={campaign.id} style={{ scrollSnapAlign: 'start' }}>
              <CampaignCard campaign={campaign} variant="strip" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CampaignCard({
  campaign,
  variant,
}: {
  campaign: Campaign
  variant: 'hero' | 'strip'
}) {
  const width = variant === 'hero' ? 'w-full' : 'w-[320px] md:w-[400px]'
  const height = variant === 'hero' ? 'h-[200px] md:h-[240px]' : 'h-[180px]'

  return (
    <Link
      href={`/discover?campaign=${campaign.id}`}
      className={`relative block rounded-2xl overflow-hidden bg-[#010C35] ${width} ${height} no-underline group`}
    >
      {/* Banner image if provided */}
      {campaign.bannerImageUrl && (
        <Image
          src={campaign.bannerImageUrl}
          alt=""
          fill
          className="object-cover opacity-70 group-hover:opacity-80 transition-opacity"
          sizes={variant === 'hero' ? '(max-width: 1280px) 100vw, 1280px' : '400px'}
        />
      )}

      {/* Atmosphere overlay — coral glow top-right */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(600px circle at 85% 0%, rgba(226,12,4,0.35), transparent 55%), radial-gradient(400px circle at 15% 100%, rgba(232,74,0,0.18), transparent 55%)',
        }}
      />
      {/* Dark gradient for text contrast */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(1,12,53,0.2) 40%, rgba(1,12,53,0.85) 100%)',
        }}
      />

      <div className="relative h-full flex flex-col justify-end p-6 md:p-7">
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.15em] uppercase text-white px-2.5 py-1 rounded-full mb-3 self-start"
          style={{ background: 'var(--brand-gradient)' }}
        >
          <span className="w-1 h-1 rounded-full bg-white" aria-hidden="true" />
          Campaign
        </span>
        <h3
          className="font-display text-white leading-[1.15] mb-1.5"
          style={{
            fontSize: variant === 'hero' ? 'clamp(22px, 2.8vw, 32px)' : '20px',
            letterSpacing: '-0.2px',
          }}
        >
          {campaign.name}
        </h3>
        {campaign.description && (
          <p className="text-[13.5px] md:text-[14px] text-white/80 leading-[1.6] line-clamp-2 max-w-[540px]">
            {campaign.description}
          </p>
        )}
        <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-white no-underline group-hover:gap-2 transition-all self-start">
          Explore deals <span aria-hidden="true">&rarr;</span>
        </span>
      </div>
    </Link>
  )
}
