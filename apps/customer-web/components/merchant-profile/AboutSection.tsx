'use client'
import { motion } from 'framer-motion'

type Amenity = { id: string; name: string; iconUrl: string | null }

type Props = {
  about: string | null
  websiteUrl: string | null
  amenities: Amenity[]
  openingHours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[]
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function AboutSection({ about, websiteUrl, amenities, openingHours }: Props) {
  const hasContent = about || websiteUrl || amenities.length > 0 || openingHours.length > 0
  if (!hasContent) return null

  return (
    <motion.section
      id="about"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="bg-[#F4F2EF] px-6 py-10 border-t border-navy/[0.06]"
    >
      <h2 className="font-display text-[22px] text-navy mb-6">About</h2>

      <div className="max-w-2xl flex flex-col gap-6">
        {about && (
          <p className="text-[15px] leading-[1.8] text-navy/65">{about}</p>
        )}

        {websiteUrl && (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[14px] text-red hover:underline font-medium"
          >
            <span aria-hidden="true">🌐</span>
            Visit website
          </a>
        )}

        {amenities.length > 0 && (
          <div>
            <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/40 mb-3">Amenities</p>
            <div className="flex flex-wrap gap-2">
              {amenities.map(a => (
                <span
                  key={a.id}
                  className="text-[13px] text-navy/65 bg-white border border-navy/[0.08] rounded-full px-3 py-1"
                >
                  {a.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {openingHours.length > 0 && (
          <div>
            <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/40 mb-3">Opening hours</p>
            <div className="flex flex-col gap-1.5">
              {openingHours.map(h => (
                <div key={h.dayOfWeek} className="flex justify-between text-[13px]">
                  <span className="text-navy/60">{DAY_NAMES[h.dayOfWeek]}</span>
                  <span className="font-mono text-navy/45">
                    {h.isClosed ? 'Closed' : `${h.openTime} – ${h.closeTime}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.section>
  )
}
