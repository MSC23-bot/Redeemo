'use client'
import { motion } from 'framer-motion'

type Branch = {
  id: string
  name: string
  isOpenNow: boolean
  addressLine1: string
  addressLine2: string | null
  city: string
  postcode: string
  phone: string | null
  distance: number | null
  avgRating: number | null
  reviewCount: number
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1000).toFixed(1)}km`
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
}

export function BranchesSection({ branches }: { branches: Branch[] }) {
  if (branches.length === 0) return null

  return (
    <motion.section
      id="branches"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-7xl mx-auto px-6 py-10 md:py-12 border-b border-[#EDE8E8]"
    >
      <h2
        className="font-display text-[#010C35] leading-tight mb-5"
        style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', letterSpacing: '-0.2px' }}
      >
        {branches.length === 1 ? 'Find Us' : 'Our Branches'}
      </h2>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl"
      >
        {branches.map(branch => {
          const dist = formatDistance(branch.distance)
          const addressParts = [
            branch.addressLine1,
            branch.addressLine2,
            branch.city,
            branch.postcode,
          ].filter(Boolean) as string[]
          const directionsQuery = encodeURIComponent(addressParts.join(', '))

          return (
            <motion.div
              key={branch.id}
              variants={cardVariants}
              className="rounded-2xl border border-[#E5E3DF] p-5 flex flex-col gap-3 hover:border-[#010C35]/20 transition-colors"
              style={{ background: '#F9F8F6' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-display text-[#010C35] text-[17px] leading-tight">
                      {branch.name}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold tracking-[0.14em] uppercase px-2 py-0.5 rounded-full ${
                        branch.isOpenNow
                          ? 'text-[#16A34A] bg-[#F0FDF4] border border-[#BBF7D0]'
                          : 'text-[#9CA3AF] bg-[#F8F9FA] border border-[#EDE8E8]'
                      }`}
                    >
                      <span
                        className={`w-1 h-1 rounded-full ${
                          branch.isOpenNow ? 'bg-[#16A34A]' : 'bg-[#9CA3AF]'
                        }`}
                        aria-hidden="true"
                      />
                      {branch.isOpenNow ? 'Open' : 'Closed'}
                    </span>
                  </div>
                  <p className="text-[13.5px] text-[#4B5563] leading-[1.55]">
                    {addressParts.join(', ')}
                  </p>
                </div>
                {dist && (
                  <span className="text-[12px] font-semibold text-[#9CA3AF] tabular-nums flex-shrink-0">
                    {dist}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[#9CA3AF] pt-2 border-t border-[#F3F4F6]">
                {branch.avgRating !== null && (
                  <span className="inline-flex items-center gap-1">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#FBBF24" aria-hidden="true">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span className="font-semibold text-[#010C35]">{branch.avgRating.toFixed(1)}</span>
                    <span>({branch.reviewCount})</span>
                  </span>
                )}
                {branch.phone && (
                  <a
                    href={`tel:${branch.phone}`}
                    className="text-[#4B5563] no-underline hover:text-[#010C35] transition-colors"
                  >
                    {branch.phone}
                  </a>
                )}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${directionsQuery}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#E20C04] font-semibold no-underline hover:underline ml-auto"
                >
                  Get directions &rarr;
                </a>
              </div>
            </motion.div>
          )
        })}
      </motion.div>
    </motion.section>
  )
}
