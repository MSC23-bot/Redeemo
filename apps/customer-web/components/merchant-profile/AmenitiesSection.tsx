'use client'
import Image from 'next/image'
import { motion } from 'framer-motion'

type Amenity = { id: string; name: string; iconUrl: string | null }

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: 'easeOut' as const } },
}

export function AmenitiesSection({ amenities }: { amenities: Amenity[] }) {
  if (amenities.length === 0) return null

  return (
    <motion.section
      id="amenities"
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
        Amenities
      </h2>

      <motion.ul
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl list-none m-0 p-0"
      >
        {amenities.map(a => (
          <motion.li
            key={a.id}
            variants={itemVariants}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#EDE8E8] bg-white hover:border-[#010C35]/15 transition-colors"
          >
            {a.iconUrl ? (
              <Image src={a.iconUrl} alt="" width={20} height={20} className="flex-shrink-0" />
            ) : (
              <span
                aria-hidden="true"
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #FEF0EE 0%, #FFE4DF 100%)' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#E20C04" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            )}
            <span className="text-[13.5px] text-[#010C35] font-medium">{a.name}</span>
          </motion.li>
        ))}
      </motion.ul>
    </motion.section>
  )
}
