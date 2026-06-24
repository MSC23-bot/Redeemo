'use client'
import { motion } from 'framer-motion'
import {
  type OpeningHour,
  DAY_NAMES,
  UK_DAY_ORDER,
  getLondonDayIndex,
  groupHoursByDay,
  formatDayLabel,
  isDayClosed,
} from '@/lib/openingHours'

export function OpeningHoursSection({ hours }: { hours: OpeningHour[] }) {
  if (hours.length === 0) return null

  const todayIndex = getLondonDayIndex()
  const hoursByDay = groupHoursByDay(hours)

  return (
    <motion.section
      id="opening-hours"
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
        Opening hours
      </h2>

      <div className="max-w-sm rounded-2xl border border-[#EDE8E8] overflow-hidden bg-white shadow-sm">
        {UK_DAY_ORDER.map(dayIndex => {
          const entries = hoursByDay.get(dayIndex)
          const isToday = dayIndex === todayIndex
          const closed = isDayClosed(entries)
          const label = formatDayLabel(entries)

          return (
            <div
              key={dayIndex}
              className={`flex items-center justify-between gap-4 px-5 py-3 text-[14px] border-b last:border-b-0 border-[#EDE8E8] ${
                isToday ? 'bg-[#FEF6F5]' : 'bg-white'
              }`}
            >
              <span className={`flex items-center gap-2 ${isToday ? 'font-semibold text-[#010C35]' : 'text-[#4B5563]'}`}>
                {DAY_NAMES[dayIndex]}
                {isToday && (
                  <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#E20C04]">
                    Today
                  </span>
                )}
              </span>
              <span
                className={`tabular-nums text-[13.5px] text-right ${
                  isToday
                    ? 'font-semibold text-[#010C35]'
                    : closed
                    ? 'text-[#9CA3AF]'
                    : 'text-[#4B5563]'
                }`}
              >
                {label}
              </span>
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-[12.5px] text-[#9CA3AF] max-w-sm leading-[1.6]">
        Voucher hours may differ from opening hours. Check each voucher&apos;s terms for any time restrictions.
      </p>
    </motion.section>
  )
}
