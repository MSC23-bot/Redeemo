'use client'
import Image from 'next/image'
import { motion } from 'framer-motion'

type OpeningHour = { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }
type Amenity = { id: string; name: string; iconUrl: string | null }

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const UK_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

type Props = {
  hours: OpeningHour[]
  amenities: Amenity[]
  isOpenNow: boolean
}

export function HoursAndAmenitiesSection({ hours, amenities, isOpenNow }: Props) {
  if (hours.length === 0 && amenities.length === 0) return null

  const todayIndex = new Date().getDay()
  const hoursByDay = new Map(hours.map(h => [h.dayOfWeek, h]))
  const todayEntry = hoursByDay.get(todayIndex)
  const todayLabel = todayEntry
    ? todayEntry.isClosed ? 'Closed today' : `Open today ${todayEntry.openTime} – ${todayEntry.closeTime}`
    : 'Hours unavailable'

  return (
    <motion.section
      id="opening-hours"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-7xl mx-auto px-6 py-10 md:py-12 border-b border-[#EDE8E8]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">

        {/* ── Left: Opening Hours ── */}
        {hours.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2
                className="font-display text-[#010C35] leading-tight"
                style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', letterSpacing: '-0.2px' }}
              >
                Opening hours
              </h2>
              {/* Open/Closed status badge */}
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] uppercase px-3 py-1.5 rounded-full ${
                  isOpenNow
                    ? 'bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]'
                    : 'bg-[#F8F9FA] text-[#6B7280] border border-[#E5E7EB]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOpenNow ? 'bg-[#16A34A]' : 'bg-[#9CA3AF]'}`} aria-hidden="true" />
                {isOpenNow ? 'Open now' : 'Closed now'}
              </span>
            </div>

            {/* Today's hours summary */}
            <p className="text-[13px] text-[#6B7280] mb-4">{todayLabel}</p>

            {/* Hours table */}
            <div className="rounded-2xl border border-[#E5E3DF] overflow-hidden shadow-[0_1px_6px_rgba(1,12,53,0.06)]" style={{ background: '#F9F8F6' }}>
              {UK_DAY_ORDER.map(dayIndex => {
                const entry = hoursByDay.get(dayIndex)
                const isToday = dayIndex === todayIndex
                const isClosed = entry ? entry.isClosed : true
                const label = isClosed ? 'Closed' : `${entry!.openTime} – ${entry!.closeTime}`

                return (
                  <div
                    key={dayIndex}
                    className={`flex items-center justify-between px-5 py-3 text-[13.5px] border-b last:border-b-0 border-[#EDEAE6] ${
                      isToday ? 'bg-white' : ''
                    }`}
                  >
                    <span className={`flex items-center gap-2 ${isToday ? 'font-semibold text-[#010C35]' : 'text-[#4B5563]'}`}>
                      {DAY_NAMES[dayIndex]}
                      {isToday && (
                        <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#E20C04]">Today</span>
                      )}
                    </span>
                    <span className={`tabular-nums text-[13px] ${isToday ? 'font-semibold text-[#010C35]' : isClosed ? 'text-[#9CA3AF]' : 'text-[#4B5563]'}`}>
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-[12px] text-[#9CA3AF] leading-[1.6]">
              Voucher terms may restrict hours. Check each voucher for time conditions.
            </p>
          </div>
        )}

        {/* ── Right: Amenities ── */}
        {amenities.length > 0 && (
          <div>
            <h2
              className="font-display text-[#010C35] leading-tight mb-4"
              style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', letterSpacing: '-0.2px' }}
            >
              Amenities
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 list-none m-0 p-0">
              {amenities.map(a => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#E5E3DF] hover:border-[#010C35]/20 transition-colors"
                  style={{ background: '#F9F8F6' }}
                >
                  {a.iconUrl ? (
                    <Image src={a.iconUrl} alt="" width={18} height={18} className="flex-shrink-0 opacity-80" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#C4BDB5] mt-0.5"
                    />
                  )}
                  <span className="text-[13.5px] text-[#010C35] font-medium">{a.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* If only hours and no amenities, show nothing on right (grid naturally collapses) */}
      </div>
    </motion.section>
  )
}
