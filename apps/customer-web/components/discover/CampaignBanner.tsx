'use client'
import Image from 'next/image'
import { motion } from 'framer-motion'
import Link from 'next/link'

type Campaign = {
  id: string
  name: string
  description: string | null
  bannerImageUrl: string | null
}

export function CampaignBanner({ campaigns }: { campaigns: Campaign[] }) {
  if (campaigns.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="w-full overflow-x-auto scrollbar-none"
      style={{ scrollSnapType: 'x mandatory' }}
    >
      <div className="flex gap-4 px-6 pb-2" style={{ width: 'max-content' }}>
        {campaigns.map((campaign, i) => (
          <motion.div
            key={campaign.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className="relative flex-shrink-0 rounded-2xl overflow-hidden cursor-pointer"
            style={{ width: 'clamp(280px, 55vw, 480px)', height: 160, scrollSnapAlign: 'start' }}
          >
            <Link href={`/discover?campaign=${campaign.id}`} className="block w-full h-full">
              {campaign.bannerImageUrl ? (
                <Image
                  src={campaign.bannerImageUrl}
                  alt={campaign.name}
                  fill
                  className="object-cover"
                  sizes="480px"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-navy to-deep-navy" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/60 mb-1">
                  Campaign
                </p>
                <h3 className="font-display text-[20px] text-white leading-snug line-clamp-2">
                  {campaign.name}
                </h3>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
